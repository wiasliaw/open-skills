// node --test suite for work-unit.mjs: every accept path and each rejection
// class of the work-unit-state contract, driven through the CLI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'work-unit.mjs');

// ---------------------------------------------------------------------------
// fixtures

const GRAPH = {
  schema_version: '1.0.0',
  name: 'test-factory',
  caps: { failure: 2, advisor_consultations: 2, edge_revisit: 2 },
  nodes: [
    { id: 'intake', type: 'entry' },
    { id: 'plan', type: 'llm', human_approval: true },
    { id: 'ticket', type: 'llm' },
    { id: 'build', type: 'llm', mounts: { skills: [], commands: ['npm ci', 'npm test -- <pattern>', { base: 'node --test', args: '<file>' }] } },
    { id: 'wrap', type: 'llm' },
    { id: 'ship', type: 'terminal' },
    { id: 'end', type: 'terminal' },
  ],
  edges: [
    { from: 'intake', to: 'plan', guard: [] },
    { from: 'build', to: 'ticket', guard: [{ field: 'outcome', op: 'eq', value: 'needs-split' }] },
  ],
  phase: {
    feat: { meaning: 'new', path: ['plan', 'ticket', 'build', 'wrap', 'ship'] },
    chore: { meaning: 'small', path: ['plan', 'build', 'wrap', 'ship'] },
    maintenance: { meaning: 'apply deltas', path: ['plan', 'build', 'wrap', 'ship'] },
  },
  state_fields: {
    contract_ref: { type: 'object', nullable: true, phases: ['feat'], default: null },
    maint_notes: { type: 'list', phases: ['maintenance'], default: [] },
    tickets: {
      type: 'list', node: 'ticket', scope_kind: 'ticket', executes: 'build', default: [],
      items: {
        type: 'object',
        fields: {
          id: { type: 'string' },
          status: { type: 'string', values: ['pending', 'in-progress', 'passed'] },
          verification_command: { type: 'string', command: true },
          evidence_refs: { type: 'list', items: { type: 'object', evidence: true } },
        },
      },
    },
    current_ticket: { type: 'string', nullable: true, node: 'ticket', default: null },
  },
};

const T0 = '2099-01-01T00:00:00Z'; // after any real clock, so created_at <= updated_at holds
let counter = 0;

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wu-test-'));
  const graph = path.join(dir, 'graph.json');
  fs.writeFileSync(graph, JSON.stringify(GRAPH));
  return { dir: dir, graph: graph, units: path.join(dir, 'units'), archive: path.join(dir, 'units', 'archive') };
}

function cli(args, opts) {
  const r = spawnSync(process.execPath, [SCRIPT].concat(args), { encoding: 'utf8', cwd: (opts && opts.cwd) || process.cwd() });
  let json;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { code: r.status, json: json, stdout: r.stdout, stderr: r.stderr };
}

function create(sb, id, source, extra) {
  const args = ['create', '--graph', sb.graph, '--units', sb.units, '--id', id, '--source', source || 'prompt', '--request', 'do the thing', '--remote', 'none'];
  return cli(args.concat(extra || []));
}

function readState(sb, id) {
  return JSON.parse(fs.readFileSync(path.join(sb.units, id, 'state.json'), 'utf8'));
}

function unitDir(sb, id) {
  return path.join(sb.units, id);
}

// A log line helper: lines are numbered from the stored log.
function nextLines(sb, id, specs) {
  const text = fs.readFileSync(path.join(unitDir(sb, id), 'log.ndjson'), 'utf8');
  let n = text.split('\n').filter(Boolean).length;
  return specs.map(function (s) {
    n += 1;
    const type = s.event_type || 'route';
    const src = { create: 'orchestrator', dispatch: 'orchestrator', route: 'orchestrator', step: 'orchestrator', archive: 'orchestrator', report: 'actor-report', verdict: 'actor-report', 'advisor-consultation': 'actor-report', 'human-decision': 'human-answer' }[type];
    return Object.assign({
      id: 'L-' + String(n).padStart(4, '0'),
      timestamp: s.timestamp || T0,
      source: src,
      actor: src === 'actor-report' ? 'reviewer' : null,
      node: 'plan',
      event_type: type,
      description: 'event',
      source_ref: src === 'orchestrator' ? null : 'plan/decision-1.md',
    }, s);
  });
}

function put(sb, id, rel, content) {
  const f = path.join(unitDir(sb, id), rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content || 'x\n');
}

function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[p] = fs.readFileSync(p, 'utf8');
    }
  })(dir);
  return out;
}

// write(): draft is built by `mutate(state)`; lines by `specs`.
function write(sb, id, mutate, specs) {
  const state = readState(sb, id);
  mutate(state);
  state.updated_at = (specs && specs.length && specs[specs.length - 1].timestamp) || T0;
  const draft = path.join(sb.dir, 'draft-' + (counter++) + '.json');
  const log = path.join(sb.dir, 'log-' + (counter++) + '.json');
  fs.writeFileSync(draft, JSON.stringify(state));
  fs.writeFileSync(log, JSON.stringify(nextLines(sb, id, specs || [{}])));
  return cli(['write', '--graph', sb.graph, '--unit', unitDir(sb, id), '--state', draft, '--log', log]);
}

function approvePhase(sb, id, phase) {
  put(sb, id, 'plan/decision-1.md', 'approved\n');
  return write(sb, id, function (s) {
    s.current_node = 'plan';
    s.walked_path.push('plan');
    s.phase = phase;
    s.human_decisions.push({ id: 'H-1', kind: 'approval', node: 'plan', decision: 'approved', phase: phase, target: null, file: 'plan/decision-1.md', date: T0 });
  }, [{ event_type: 'human-decision' }]);
}

function rules(r) {
  return ((r.json && r.json.violations) || []).map(function (x) { return x.rule; });
}

function assertRejected(r, rule) {
  assert.equal(r.code, 3, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error, 'state');
  assert.ok(rules(r).indexOf(rule) !== -1, 'expected rule ' + rule + ', got ' + JSON.stringify(rules(r)));
}

// A unit already at the phase-approved point.
function approvedUnit(phase, source) {
  const sb = sandbox();
  const id = 'u' + (counter++);
  assert.equal(create(sb, id, source || 'prompt').code, 0);
  const r = approvePhase(sb, id, phase);
  assert.equal(r.code, 0, r.stdout);
  return { sb: sb, id: id };
}

// ---------------------------------------------------------------------------
// output contract, usage

test('--help prints one JSON object and exits 0', () => {
  const r = cli(['--help']);
  assert.equal(r.code, 0);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.action, 'help');
  assert.equal(r.stdout.trim().split('\n').length, 1);
});

test('unknown subcommand and missing flags exit 2 with a usage error', () => {
  assert.equal(cli(['frobnicate']).json.error, 'usage');
  const r = cli(['validate']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error, 'usage');
  assert.equal(cli(['validate', '--graph', 'g', '--graph', 'h']).code, 2);
});

test('missing graph file exits 5, invalid graph exits 8', () => {
  const sb = sandbox();
  assert.equal(cli(['validate', '--graph', path.join(sb.dir, 'nope.json'), '--unit', sb.dir]).code, 5);
  const bad = path.join(sb.dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ nodes: [] }));
  const r = cli(['validate', '--graph', bad, '--unit', sb.dir]);
  assert.equal(r.code, 8);
  assert.equal(r.json.error, 'graph');
});

// ---------------------------------------------------------------------------
// create

test('create writes a core-only unit at the entry node and validates', () => {
  const sb = sandbox();
  const r = create(sb, 'csv-export');
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.action, 'created');
  const s = readState(sb, 'csv-export');
  assert.equal(s.current_node, 'intake');
  assert.equal(s.phase, null);
  assert.deepEqual(s.walked_path, ['intake']);
  assert.equal('tickets' in s, false);
  assert.equal('contract_ref' in s, false);
  assert.equal(s.trigger.source, 'prompt');
  assert.equal(s.trigger.request, 'do the thing');
  const v = cli(['validate', '--graph', sb.graph, '--unit', unitDir(sb, 'csv-export')]);
  assert.equal(v.code, 0, v.stdout);
  assert.equal(v.json.log_lines, 1);
});

test('create records an optional target branch', () => {
  const sb = sandbox();
  assert.equal(create(sb, 'fix-1', 'ci-failure', ['--branch', 'wu/old']).code, 0);
  assert.equal(readState(sb, 'fix-1').trigger.branch, 'wu/old');
});

test('create rejects an id outside the grammar and an unknown source', () => {
  const sb = sandbox();
  assert.equal(create(sb, 'Bad_Id').code, 2);
  assert.equal(create(sb, '-lead').code, 2);
  assert.equal(create(sb, 'ok', 'analysis-request').code, 2);
});

test('create rejects an id colliding with a live unit', () => {
  const sb = sandbox();
  assert.equal(create(sb, 'dup').code, 0);
  const r = create(sb, 'dup');
  assert.equal(r.code, 9);
  assert.equal(r.json.error, 'id_collision');
  assert.equal(r.json.collision, 'work-units');
});

test('create rejects an id colliding with the archive (dir and md)', () => {
  const sb = sandbox();
  fs.mkdirSync(path.join(sb.archive, 'old-unit'), { recursive: true });
  fs.writeFileSync(path.join(sb.archive, 'legacy.md'), 'x');
  const a = create(sb, 'old-unit');
  assert.equal(a.code, 9);
  assert.equal(a.json.collision, 'archive');
  assert.equal(create(sb, 'legacy').code, 9);
});

test('create rejects an id colliding with a remote wu/<id> branch', () => {
  const sb = sandbox();
  const bare = path.join(sb.dir, 'remote.git');
  const work = path.join(sb.dir, 'work');
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  const g = (cwd, args) => spawnSync('git', args, { cwd: cwd, env: env, encoding: 'utf8' });
  fs.mkdirSync(work);
  g(sb.dir, ['init', '--bare', bare]);
  g(work, ['init']);
  g(work, ['commit', '--allow-empty', '-m', 'init']);
  g(work, ['push', bare, 'HEAD:refs/heads/wu/taken']);
  const hit = create(sb, 'taken', 'prompt', []);
  assert.equal(hit.code, 0, 'remote none by default in helper');
  fs.rmSync(unitDir(sb, 'taken'), { recursive: true });
  const args = ['create', '--graph', sb.graph, '--units', sb.units, '--id', 'taken', '--source', 'prompt', '--request', 'r', '--remote', bare];
  const r = cli(args);
  assert.equal(r.code, 9, r.stdout);
  assert.equal(r.json.collision, 'remote');
  const free = cli(args.map((a) => (a === 'taken' ? 'free' : a)));
  assert.equal(free.code, 0, free.stdout);
  assert.equal(free.json.remote_checked, true);
});

test('create fails closed when the remote cannot be queried', () => {
  const sb = sandbox();
  const r = cli(['create', '--graph', sb.graph, '--units', sb.units, '--id', 'x1', '--source', 'prompt', '--request', 'r', '--remote', path.join(sb.dir, 'missing.git')]);
  assert.equal(r.code, 10);
  assert.equal(r.json.error, 'remote_unreachable');
  assert.equal(fs.existsSync(unitDir(sb, 'x1')), false);
});

// ---------------------------------------------------------------------------
// write: accept paths and materialization

test('write accepts a phase approval and materializes phase-bound fields', () => {
  const sb = sandbox();
  create(sb, 'a1');
  const r = approvePhase(sb, 'a1', 'feat');
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(r.json.materialized, ['contract_ref']);
  const s = readState(sb, 'a1');
  assert.equal(s.contract_ref, null);
  assert.equal('tickets' in s, false, 'node-bound field waits for its owning node');
});

test('node-bound field materializes when the owning node is first reached', () => {
  const { sb, id } = approvedUnit('feat');
  put(sb, id, 'plan/decision-2.md');
  const r = write(sb, id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ event_type: 'route', node: 'ticket' }]);
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(r.json.materialized.sort(), ['current_ticket', 'tickets']);
  const s = readState(sb, id);
  assert.deepEqual(s.tickets, []);
  assert.equal(s.current_ticket, null);
});

test('a path that excludes the ticket node never carries ticket fields', () => {
  const { sb, id } = approvedUnit('chore');
  const ok = write(sb, id, (s) => { s.current_node = 'build'; s.walked_path.push('build'); }, [{ event_type: 'route', node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
  assert.equal('tickets' in readState(sb, id), false);
  const bad = write(sb, id, (s) => { s.tickets = []; }, [{ event_type: 'route', node: 'build' }]);
  assertRejected(bad, 'field-inapplicable');
});

test('phase-bound field is rejected outside its phases', () => {
  const { sb, id } = approvedUnit('feat');
  const r = write(sb, id, (s) => { s.maint_notes = []; });
  assertRejected(r, 'field-inapplicable');
});

test('step is a valid orchestrator log event', () => {
  const sb = sandbox();
  create(sb, 's1');
  const r = write(sb, 's1', (s) => { s.current_node = 'plan'; s.walked_path.push('plan'); },
    [{ event_type: 'step', node: 'plan', description: 'npm test exit 1 | tail: 1 failing' }, { event_type: 'route', node: 'plan' }]);
  assert.equal(r.code, 0, r.stdout);
});

test('write accepts a log-full draft whose prefix is the stored log', () => {
  const sb = sandbox();
  create(sb, 'f1');
  const state = readState(sb, 'f1');
  state.current_node = 'plan';
  state.walked_path.push('plan');
  const stored = fs.readFileSync(path.join(unitDir(sb, 'f1'), 'log.ndjson'), 'utf8');
  const line = nextLines(sb, 'f1', [{ event_type: 'route' }])[0];
  state.updated_at = line.timestamp;
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), stored + JSON.stringify(line) + '\n');
  const r = cli(['write', '--graph', sb.graph, '--unit', unitDir(sb, 'f1'), '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.appended, 1);
});

test('write requires exactly one of --log and --log-full', () => {
  const sb = sandbox();
  create(sb, 'f2');
  const r = cli(['write', '--graph', sb.graph, '--unit', unitDir(sb, 'f2'), '--state', 'x']);
  assert.equal(r.code, 2);
});

// ---------------------------------------------------------------------------
// write: rejection classes (each also proves nothing was written)

function rejectsAtomically(sb, id, mutate, specs, rule) {
  const before = snapshot(unitDir(sb, id));
  const r = write(sb, id, mutate, specs);
  assertRejected(r, rule);
  assert.deepEqual(snapshot(unitDir(sb, id)), before, 'a rejected draft must write nothing');
}

test('log tampering: modified existing line is rejected (byte-prefix)', () => {
  const sb = sandbox();
  create(sb, 't1');
  const dir = unitDir(sb, 't1');
  const stored = fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8');
  const tampered = stored.replace('Created', 'Edited') + JSON.stringify(nextLines(sb, 't1', [{}])[0]) + '\n';
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), tampered);
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(readState(sb, 't1')));
  const before = snapshot(dir);
  const r = cli(['write', '--graph', sb.graph, '--unit', dir, '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]);
  assertRejected(r, 'log-not-prefix');
  assert.deepEqual(snapshot(dir), before);
});

test('log tampering: deleting an existing line is rejected', () => {
  const { sb, id } = approvedUnit('chore');
  const dir = unitDir(sb, id);
  const lines = fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), lines.slice(1).join('\n') + '\n');
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(readState(sb, id)));
  const r = cli(['write', '--graph', sb.graph, '--unit', dir, '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]);
  assertRejected(r, 'log-not-prefix');
});

test('a state change without a new log line is rejected', () => {
  const sb = sandbox();
  create(sb, 'n1');
  const state = readState(sb, 'n1');
  state.current_node = 'plan';
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.json'), '[]');
  const r = cli(['write', '--graph', sb.graph, '--unit', unitDir(sb, 'n1'), '--state', path.join(sb.dir, 's.json'), '--log', path.join(sb.dir, 'l.json')]);
  assertRejected(r, 'no-log-line');
});

test('log ids must strictly increase', () => {
  const sb = sandbox();
  create(sb, 'i1');
  rejectsAtomically(sb, 'i1', (s) => { s.walked_path.push('plan'); s.current_node = 'plan'; }, [{ id: 'L-0001', event_type: 'route' }], 'log-ids-not-increasing');
});

test('log timestamps must not decrease', () => {
  const sb = sandbox();
  create(sb, 'i2');
  rejectsAtomically(sb, 'i2', (s) => { s.walked_path.push('plan'); s.current_node = 'plan'; }, [{ event_type: 'route', timestamp: '2000-01-01T00:00:00Z' }], 'log-timestamps-decrease');
});

test('updated_at must equal the newest log timestamp', () => {
  const sb = sandbox();
  create(sb, 'u1');
  const state = readState(sb, 'u1');
  state.current_node = 'plan';
  state.updated_at = '2030-01-01T00:00:00Z';
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.json'), JSON.stringify(nextLines(sb, 'u1', [{ event_type: 'route' }])));
  const r = cli(['write', '--graph', sb.graph, '--unit', unitDir(sb, 'u1'), '--state', path.join(sb.dir, 's.json'), '--log', path.join(sb.dir, 'l.json')]);
  assertRejected(r, 'updated-at-mismatch');
});

test('log line schema: wrong source for the event type, undeclared node', () => {
  const sb = sandbox();
  create(sb, 'l1');
  rejectsAtomically(sb, 'l1', (s) => { s.current_node = 'plan'; s.walked_path.push('plan'); }, [{ event_type: 'route', source: 'human-answer', source_ref: 'plan/decision-1.md' }], 'log-line-invalid');
  rejectsAtomically(sb, 'l1', (s) => { s.current_node = 'plan'; s.walked_path.push('plan'); }, [{ event_type: 'route', node: 'ghost' }], 'log-line-invalid');
});

test('immutable identity: id, created_at, trigger cannot change', () => {
  const sb = sandbox();
  create(sb, 'm1');
  rejectsAtomically(sb, 'm1', (s) => { s.created_at = '2020-01-01T00:00:00Z'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.trigger.request = 'something else'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.trigger.source = 'issue'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.id = 'other'; }, [{}], 'identity-changed');
});

test('undeclared top-level fields are rejected', () => {
  const sb = sandbox();
  create(sb, 'x2');
  rejectsAtomically(sb, 'x2', (s) => { s.mystery = 1; }, [{}], 'undeclared-field');
});

test('walked_path is append-only and holds declared nodes', () => {
  const { sb, id } = approvedUnit('chore');
  rejectsAtomically(sb, id, (s) => { s.walked_path = ['plan']; }, [{}], 'walked-path-rewritten');
  rejectsAtomically(sb, id, (s) => { s.walked_path.push('ghost'); }, [{}], 'node-undeclared');
});

test('current_node must be declared and on the approved path', () => {
  const { sb, id } = approvedUnit('chore');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ node: 'ticket' }], 'node-off-path');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ghost'; }, [{}], 'node-undeclared');
});

// phase

test('phase must come from the declared vocabulary', () => {
  const sb = sandbox();
  create(sb, 'p1');
  put(sb, 'p1', 'plan/decision-1.md');
  rejectsAtomically(sb, 'p1', (s) => {
    s.current_node = 'plan'; s.walked_path.push('plan'); s.phase = 'docs';
    s.human_decisions.push({ id: 'H-1', kind: 'approval', node: 'plan', decision: 'approved', phase: 'docs', target: null, file: 'plan/decision-1.md', date: T0 });
  }, [{ event_type: 'human-decision' }], 'phase-undeclared');
});

test('phase recorded without its approval decision is rejected', () => {
  const sb = sandbox();
  create(sb, 'p2');
  rejectsAtomically(sb, 'p2', (s) => { s.current_node = 'plan'; s.walked_path.push('plan'); s.phase = 'chore'; }, [{ event_type: 'route' }], 'phase-unrecorded');
});

test('phase is immutable once recorded', () => {
  const { sb, id } = approvedUnit('feat');
  put(sb, id, 'plan/decision-2.md');
  rejectsAtomically(sb, id, (s) => {
    s.phase = 'chore';
    s.human_decisions.push({ id: 'H-2', kind: 'approval', node: 'plan', decision: 'approved', phase: 'chore', target: null, file: 'plan/decision-2.md', date: T0 });
  }, [{ event_type: 'human-decision' }], 'phase-immutable');
  rejectsAtomically(sb, id, (s) => { s.phase = null; }, [{}], 'phase-immutable');
});

test('maintenance phase binds to the maintenance-due trigger, both ways', () => {
  const sb = sandbox();
  create(sb, 'mb1', 'prompt');
  put(sb, 'mb1', 'plan/decision-1.md');
  const mk = (phase) => (s) => {
    s.current_node = 'plan'; s.walked_path.push('plan'); s.phase = phase;
    s.human_decisions.push({ id: 'H-1', kind: 'approval', node: 'plan', decision: 'approved', phase: phase, target: null, file: 'plan/decision-1.md', date: T0 });
  };
  rejectsAtomically(sb, 'mb1', mk('maintenance'), [{ event_type: 'human-decision' }], 'maintenance-binding');
  create(sb, 'mb2', 'maintenance-due');
  put(sb, 'mb2', 'plan/decision-1.md');
  rejectsAtomically(sb, 'mb2', mk('chore'), [{ event_type: 'human-decision' }], 'maintenance-binding');
  const ok = write(sb, 'mb2', mk('maintenance'), [{ event_type: 'human-decision' }]);
  assert.equal(ok.code, 0, ok.stdout);
  assert.deepEqual(ok.json.materialized, ['maint_notes']);
});

// outcome / terminal

test('outcome pairs with a terminal current node', () => {
  const { sb, id } = approvedUnit('chore');
  rejectsAtomically(sb, id, (s) => { s.outcome = 'shipped'; s.current_node = 'build'; s.walked_path.push('build'); }, [{ node: 'build' }], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); }, [{ node: 'ship' }], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.outcome = 'ended'; s.outcome_reason = 'x'; }, [{ node: 'ship' }], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'end'; s.walked_path.push('end'); s.outcome = 'ended'; s.outcome_reason = null; }, [{ node: 'end' }], 'outcome-terminal-pairing');
});

// problems and escalation

function problem(over) {
  return Object.assign({ problem_key: 'node:build#1', scope: 'node:build', signature: 'tests:fail', opened_by: 'signature', blocked_node: 'build', inherited: 0, supersedes: null, count: 0, advice: [], status: 'open' }, over || {});
}

function atBuild() {
  const u = approvedUnit('chore');
  const r = write(u.sb, u.id, (s) => { s.current_node = 'build'; s.walked_path.push('build'); }, [{ event_type: 'route', node: 'build' }]);
  assert.equal(r.code, 0, r.stdout);
  return u;
}

test('blocked node is set if and only if a problem is open', () => {
  const { sb, id } = atBuild();
  rejectsAtomically(sb, id, (s) => { s.advisor_consults.push(problem()); }, [{ node: 'build' }], 'blocked-iff-open');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; }, [{ node: 'build' }], 'blocked-iff-open');
  const ok = write(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem()); s.fail_counters['node:build'] = { signature: 'tests:fail', count: 2, total: 2 }; }, [{ node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
  const closed = write(sb, id, (s) => { s.blocked_at = null; s.advisor_consults[0].status = 'resolved'; }, [{ node: 'build' }]);
  assert.equal(closed.code, 0, closed.stdout);
});

test('consultation count is bounded by the declared cap and matches its advice', () => {
  const { sb, id } = atBuild();
  const advice = (n) => put(sb, id, 'build/advice-' + n + '.md');
  [1, 2, 3].forEach(advice);
  const lines = () => nextLines(sb, id, [{ node: 'build' }]);
  const logId = lines()[0].id;
  const adv = (n) => ({ file: 'build/advice-' + n + '.md', date: T0, log_ref: logId });
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem({ count: 3, advice: [adv(1), adv(2), adv(3)] })); }, [{ node: 'build' }], 'consult-cap');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem({ count: 2, advice: [adv(1)] })); }, [{ node: 'build' }], 'consult-count');
  const ok = write(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem({ count: 2, advice: [adv(1), adv(2)] })); }, [{ node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
});

test('supersession inherits the count; total-cap problems cannot be superseded', () => {
  const { sb, id } = atBuild();
  put(sb, id, 'build/advice-1.md');
  const logId = nextLines(sb, id, [{ node: 'build' }])[0].id;
  const adv = { file: 'build/advice-1.md', date: T0, log_ref: logId };
  const old = (over) => problem(Object.assign({ count: 1, advice: [adv], status: 'superseded' }, over));
  const succ = (over) => problem(Object.assign({ problem_key: 'node:build#2', signature: 'lint:fail', inherited: 1, supersedes: 'node:build#1', count: 1, advice: [] }, over));
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(old({ opened_by: 'total' }), succ()); }, [{ node: 'build' }], 'total-cap-superseded');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(old(), succ({ inherited: 0, count: 0 })); }, [{ node: 'build' }], 'state-invalid');
  const ok = write(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(old(), succ()); }, [{ node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
});

test('advice pointer and log_ref must resolve', () => {
  const { sb, id } = atBuild();
  const logId = nextLines(sb, id, [{ node: 'build' }])[0].id;
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem({ count: 1, advice: [{ file: 'build/advice-9.md', date: T0, log_ref: logId }] })); }, [{ node: 'build' }], 'pointer-dangling');
  put(sb, id, 'build/advice-1.md');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build'; s.advisor_consults.push(problem({ count: 1, advice: [{ file: 'build/advice-1.md', date: T0, log_ref: 'L-9999' }] })); }, [{ node: 'build' }], 'evidence-dangling');
});

// counters and scopes

test('failure counter scopes: node, edge, declared kinds; unknown rejected', () => {
  const { sb, id } = atBuild();
  const c = { signature: 'x', count: 1, total: 1 };
  const ok = write(sb, id, (s) => { s.fail_counters['node:build'] = c; s.fail_counters['edge:build-ticket'] = { signature: null, count: 1, total: 1 }; }, [{ node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
  rejectsAtomically(sb, id, (s) => { s.fail_counters['node:ghost'] = c; }, [{ node: 'build' }], 'scope-invalid');
  rejectsAtomically(sb, id, (s) => { s.fail_counters['edge:build-wrap'] = c; }, [{ node: 'build' }], 'scope-invalid');
  rejectsAtomically(sb, id, (s) => { s.fail_counters['batch:b1'] = c; }, [{ node: 'build' }], 'scope-invalid');
  rejectsAtomically(sb, id, (s) => { s.fail_counters['node:build'] = { signature: 'x', count: 3, total: 1 }; }, [{ node: 'build' }], 'state-invalid');
});

test('ticket: scopes exist only where the ticket concept does', () => {
  const { sb, id } = atBuild();
  const c = { signature: 'x', count: 1, total: 1 };
  rejectsAtomically(sb, id, (s) => { s.fail_counters['ticket:T-1'] = c; }, [{ node: 'build' }], 'scope-invalid');

  const feat = approvedUnit('feat');
  assert.equal(write(feat.sb, feat.id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ node: 'ticket' }]).code, 0);
  const ticket = { id: 'T-1', status: 'pending', verification_command: 'npm test -- csv', evidence_refs: [] };
  const ok = write(feat.sb, feat.id, (s) => { s.tickets = [ticket]; s.current_ticket = 'T-1'; s.fail_counters['ticket:T-1'] = c; }, [{ node: 'ticket' }]);
  assert.equal(ok.code, 0, ok.stdout);
  rejectsAtomically(feat.sb, feat.id, (s) => { s.fail_counters['ticket:T-9'] = c; }, [{ node: 'ticket' }], 'scope-invalid');
});

// graph-declared field typing, commands, evidence

test('declared field shape: type, enum, undeclared item keys, duplicate ids', () => {
  const feat = approvedUnit('feat');
  assert.equal(write(feat.sb, feat.id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ node: 'ticket' }]).code, 0);
  const t = (over) => Object.assign({ id: 'T-1', status: 'pending', verification_command: 'npm test -- a', evidence_refs: [] }, over);
  const rej = (mut, rule) => rejectsAtomically(feat.sb, feat.id, mut, [{ node: 'ticket' }], rule);
  rej((s) => { s.tickets = 'nope'; }, 'type-mismatch');
  rej((s) => { s.tickets = [t({ status: 'weird' })]; }, 'value-not-allowed');
  rej((s) => { s.tickets = [t({ extra: 1 })]; }, 'undeclared-field');
  rej((s) => { s.tickets = [t(), t()]; }, 'scope-id-invalid');
  rej((s) => { s.current_ticket = 5; }, 'type-mismatch');
});

test('run-time invocations must be covered by the executing node mounts', () => {
  const feat = approvedUnit('feat');
  assert.equal(write(feat.sb, feat.id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ node: 'ticket' }]).code, 0);
  const t = (cmd) => ({ id: 'T-1', status: 'pending', verification_command: cmd, evidence_refs: [] });
  const rej = (cmd) => rejectsAtomically(feat.sb, feat.id, (s) => { s.tickets = [t(cmd)]; }, [{ node: 'ticket' }], 'command-not-mounted');
  rej('rm -rf /');
  rej('npm run lint');
  rej('npm');
  rej('npm ci --force'); // plain mounts cover exactly themselves
  ['npm test -- csv', 'npm test', 'node --test scripts/a.test.mjs'].forEach((cmd, i) => {
    const r = write(feat.sb, feat.id, (s) => { s.tickets = [t(cmd)]; }, [{ node: 'ticket' }]);
    assert.equal(r.code, 0, cmd + ' ' + r.stdout);
  });
});

test('evidence references inside declared fields resolve', () => {
  const feat = approvedUnit('feat');
  assert.equal(write(feat.sb, feat.id, (s) => { s.current_node = 'ticket'; s.walked_path.push('ticket'); }, [{ node: 'ticket' }]).code, 0);
  const t = (refs) => ({ id: 'T-1', status: 'pending', verification_command: 'npm test -- a', evidence_refs: refs });
  rejectsAtomically(feat.sb, feat.id, (s) => { s.tickets = [t([{ kind: 'path', ref: 'ticket/missing.md' }])]; }, [{ node: 'ticket' }], 'pointer-dangling');
  rejectsAtomically(feat.sb, feat.id, (s) => { s.tickets = [t([{ kind: 'log', ref: 'L-0999' }])]; }, [{ node: 'ticket' }], 'evidence-dangling');
  put(feat.sb, feat.id, 'ticket/proof.md');
  const ok = write(feat.sb, feat.id, (s) => { s.tickets = [t([{ kind: 'path', ref: 'ticket/proof.md' }, { kind: 'path', ref: 'repo:src/a.js' }, { kind: 'command', ref: 'npm test' }])]; }, [{ node: 'ticket' }]);
  assert.equal(ok.code, 0, ok.stdout);
});

// reviews and decisions

const review = (over) => Object.assign({ id: 'R-1', node: 'build', target: { type: 'stage', id: 'build' }, verdict: 'pass', dimensions: [{ name: 'correctness', result: 'pass' }], evidence_refs: [{ kind: 'path', ref: 'build/review-1.md' }], file: 'build/review-1.md', date: T0 }, over || {});

test('review verdict records evidence and a resolving pointer', () => {
  const { sb, id } = atBuild();
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review()); }, [{ node: 'build' }], 'pointer-dangling');
  put(sb, id, 'build/review-1.md');
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ evidence_refs: [] })); }, [{ node: 'build' }], 'state-invalid');
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ dimensions: [{ name: 'c', result: 'fail' }] })); }, [{ node: 'build' }], 'state-invalid');
  const ok = write(sb, id, (s) => { s.reviews.push(review()); }, [{ node: 'build' }]);
  assert.equal(ok.code, 0, ok.stdout);
  rejectsAtomically(sb, id, (s) => { s.reviews[0].verdict = 'fail'; s.reviews[0].dimensions = [{ name: 'c', result: 'fail' }]; }, [{ node: 'build' }], 'append-only-record');
});

test('pointers must stay inside the folder and under a stage directory', () => {
  const { sb, id } = atBuild();
  put(sb, id, 'build/review-1.md');
  fs.writeFileSync(path.join(sb.dir, 'outside.md'), 'x');
  for (const p of ['../outside.md', '/etc/passwd', 'state.json', 'log.ndjson', 'ghost/review-1.md', 'build/../build/review-1.md']) {
    rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ file: p, evidence_refs: [{ kind: 'command', ref: 'npm test' }] })); }, [{ node: 'build' }], 'pointer-invalid');
  }
});

test('a symlink escaping the folder is rejected', () => {
  const { sb, id } = atBuild();
  fs.writeFileSync(path.join(sb.dir, 'outside.md'), 'x');
  fs.mkdirSync(path.join(unitDir(sb, id), 'build'), { recursive: true });
  fs.symlinkSync(path.join(sb.dir, 'outside.md'), path.join(unitDir(sb, id), 'build', 'review-1.md'));
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review()); }, [{ node: 'build' }], 'pointer-escape');
});

test('human decisions need a resolving file and valid vocabulary', () => {
  const { sb, id } = atBuild();
  const h = (over) => Object.assign({ id: 'H-2', kind: 'escalation', node: 'build', decision: 'retry', phase: null, target: null, file: 'build/decision-1.md', date: T0 }, over);
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h()); }, [{ event_type: 'human-decision', node: 'build', source_ref: 'plan/decision-1.md' }], 'pointer-dangling');
  put(sb, id, 'build/decision-1.md');
  const lineSpec = [{ event_type: 'human-decision', node: 'build', source_ref: 'build/decision-1.md' }];
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h({ decision: 'approved' })); }, lineSpec, 'state-invalid');
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h({ decision: 'move-back', target: null })); }, lineSpec, 'state-invalid');
  const ok = write(sb, id, (s) => { s.human_decisions.push(h({ decision: 'move-back', target: 'plan' })); }, lineSpec);
  assert.equal(ok.code, 0, ok.stdout);
});

// ---------------------------------------------------------------------------
// validate on stored units, lifecycle, archive

test('validate rejects a hand-edited stored state', () => {
  const sb = sandbox();
  create(sb, 'h1');
  const f = path.join(unitDir(sb, 'h1'), 'state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.surprise = true;
  fs.writeFileSync(f, JSON.stringify(s));
  const r = cli(['validate', '--graph', sb.graph, '--unit', unitDir(sb, 'h1')]);
  assertRejected(r, 'undeclared-field');
});

test('validate reports a missing unit as not_found', () => {
  const sb = sandbox();
  const r = cli(['validate', '--graph', sb.graph, '--unit', path.join(sb.dir, 'none')]);
  assert.equal(r.code, 5);
});

function shipUnit() {
  const u = approvedUnit('chore');
  for (const n of ['build', 'wrap']) {
    assert.equal(write(u.sb, u.id, (s) => { s.current_node = n; s.walked_path.push(n); }, [{ node: n }]).code, 0);
  }
  const done = write(u.sb, u.id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.outcome = 'shipped'; }, [{ node: 'ship' }, { node: 'ship', event_type: 'archive' }]);
  assert.equal(done.code, 0, done.stdout);
  return u;
}

test('archive requires handoff.md, then moves the whole frozen folder', () => {
  const { sb, id } = shipUnit();
  const dir = unitDir(sb, id);
  const early = cli(['archive', '--graph', sb.graph, '--unit', dir]);
  assertRejected(early, 'archive-not-ready');
  assert.equal(fs.existsSync(dir), true);
  put(sb, id, 'handoff.md', '# handoff\n');
  const r = cli(['archive', '--graph', sb.graph, '--unit', dir]);
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.action, 'archived');
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.existsSync(path.join(sb.archive, id, 'state.json')), true);
  // an archived id can never be created again
  assert.equal(create(sb, id).code, 9);
});

test('archive refuses a unit without outcome or archive line', () => {
  const { sb, id } = approvedUnit('chore');
  put(sb, id, 'handoff.md');
  assertRejected(cli(['archive', '--graph', sb.graph, '--unit', unitDir(sb, id)]), 'archive-not-ready');
});

test('archive refuses an existing target', () => {
  const { sb, id } = shipUnit();
  put(sb, id, 'handoff.md');
  fs.mkdirSync(path.join(sb.archive, id), { recursive: true });
  assert.equal(cli(['archive', '--graph', sb.graph, '--unit', unitDir(sb, id)]).code, 6);
});

test('after the archive line, no further writes are accepted', () => {
  const { sb, id } = shipUnit();
  const r = write(sb, id, (s) => { s.outcome_reason = null; }, [{ node: 'ship' }]);
  assertRejected(r, 'frozen');
});

test('an abandoned unit ends at the abandonment terminal with a reason', () => {
  const { sb, id } = approvedUnit('feat');
  const r = write(sb, id, (s) => { s.current_node = 'end'; s.walked_path.push('end'); s.outcome = 'ended'; s.outcome_reason = 'human cancelled'; }, [{ node: 'end' }]);
  assert.equal(r.code, 0, r.stdout);
});

test('not-needed at the phase approval ends the unit before any phase is recorded', () => {
  const sb = sandbox();
  create(sb, 'nn');
  put(sb, 'nn', 'plan/decision-1.md');
  const r = write(sb, 'nn', (s) => {
    s.current_node = 'end'; s.walked_path.push('plan', 'end'); s.outcome = 'ended'; s.outcome_reason = 'not needed';
    s.human_decisions.push({ id: 'H-1', kind: 'approval', node: 'plan', decision: 'not-needed', phase: null, target: null, file: 'plan/decision-1.md', date: T0 });
  }, [{ event_type: 'human-decision' }, { node: 'end', event_type: 'route' }]);
  assert.equal(r.code, 0, r.stdout);
});

test('stdout is exactly one JSON object on success and on failure', () => {
  const sb = sandbox();
  const ok = create(sb, 'one');
  assert.equal(ok.stdout.trim().split('\n').length, 1);
  const bad = cli(['validate', '--graph', sb.graph, '--unit', path.join(sb.dir, 'none')]);
  assert.equal(bad.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});
