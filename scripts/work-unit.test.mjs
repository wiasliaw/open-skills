// Tests for work-unit.mjs. Run with: node --test scripts/
// Every fixture is a fresh temp directory; nothing touches the network.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'work-unit.mjs');

const EXIT = {
  internal: 1,
  usage: 2,
  state: 3,
  write_failed: 4,
  not_found: 5,
  already_exists: 6,
  node_version: 7,
};

let ROOT;
let counter = 0;

before(() => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'work-unit-test-')));
});

after(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// helpers

function runScript(args, cwd) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // leave null; callers assert on it
  }
  return { status: r.status, json, stderr: r.stderr };
}

function fixture() {
  counter += 1;
  const dir = path.join(ROOT, `case-${counter}`);
  fs.mkdirSync(dir);
  return dir;
}

// Creates a unit and returns { units, unit, state, lastLine }.
function createUnit(id = 'wu-test') {
  const units = fixture();
  const r = runScript(['create', '--units', units, '--id', id, '--source', 'prompt', '--request', 'do the thing']);
  assert.equal(r.status, 0, r.stderr);
  const unit = path.join(units, id);
  return { units, unit, ...readUnit(unit) };
}

function readUnit(unit) {
  const state = JSON.parse(fs.readFileSync(path.join(unit, 'state.json'), 'utf8'));
  const lines = fs.readFileSync(path.join(unit, 'log.ndjson'), 'utf8')
    .split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  return { state, lines, lastLine: lines[lines.length - 1] };
}

function draftFiles(unit, state, log) {
  const stateFile = path.join(path.dirname(unit), `state-draft-${++counter}.json`);
  const logFile = path.join(path.dirname(unit), `log-draft-${counter}.json`);
  fs.writeFileSync(stateFile, JSON.stringify(state));
  fs.writeFileSync(logFile, JSON.stringify(log));
  return { stateFile, logFile };
}

function logLine(seq, ts, overrides = {}) {
  return {
    id: `L-${String(seq).padStart(4, '0')}`,
    timestamp: ts,
    source: 'orchestrator',
    actor: null,
    node: 'trigger',
    event_type: 'route',
    description: 'Routed.',
    source_ref: null,
    ...overrides,
  };
}

function writeUnit(unit, state, log) {
  const { stateFile, logFile } = draftFiles(unit, state, log);
  return runScript(['write', '--unit', unit, '--state', stateFile, '--log', logFile]);
}

// Fixed timestamps for drafts; kept later than any run's created_at so the
// monotonicity checks compare against them, not the wall clock.
const T2 = '2099-01-01T10:00:00Z';
const T3 = '2099-01-01T11:00:00Z';

// ---------------------------------------------------------------------------
// create

test('create builds a valid folder with initial state and a create log line', () => {
  const { unit, state, lines } = createUnit();
  assert.equal(state.current_node, 'trigger');
  assert.equal(state.grading, null);
  assert.deepEqual(state.tickets, []);
  assert.deepEqual(state.fail_counters, {});
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, 'L-0001');
  assert.equal(lines[0].event_type, 'create');
  const v = runScript(['validate', '--unit', unit]);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.json.action, 'valid');
  assert.equal(v.json.log_lines, 1);
});

test('create refuses an existing work-unit folder', () => {
  const { units } = createUnit('wu-dup');
  const r = runScript(['create', '--units', units, '--id', 'wu-dup', '--source', 'prompt', '--request', 'again']);
  assert.equal(r.status, EXIT.already_exists);
  assert.equal(r.json.error, 'already_exists');
});

test('create rejects a bad source and a bad id as usage errors', () => {
  const units = fixture();
  const r1 = runScript(['create', '--units', units, '--id', 'wu-x', '--source', 'webhook', '--request', 'x']);
  assert.equal(r1.json.error, 'usage');
  const r2 = runScript(['create', '--units', units, '--id', 'Bad_Id', '--source', 'prompt', '--request', 'x']);
  assert.equal(r2.json.error, 'usage');
});

// ---------------------------------------------------------------------------
// validate

test('validate reports not_found for a missing folder', () => {
  const r = runScript(['validate', '--unit', path.join(ROOT, 'nowhere')]);
  assert.equal(r.status, EXIT.not_found);
  assert.equal(r.json.error, 'not_found');
});

// ---------------------------------------------------------------------------
// write

test('write routes to the next node with a new log line', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2, { description: 'Routed trigger to research-explore.' }));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.action, 'written');
  const { lines } = readUnit(unit);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].id, 'L-0001');
});

test('write accepts an array of log lines and appends them all', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  state.updated_at = T3;
  const r = writeUnit(unit, state, [logLine(2, T2), logLine(3, T3)]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.appended, 2);
});

test('write rejects an empty log draft: every state change needs a log line', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  const r = writeUnit(unit, state, []);
  assert.equal(r.status, EXIT.state);
  assert.equal(r.json.error, 'state');
});

test('write rejects updated_at that is not the newest log timestamp', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  state.updated_at = state.created_at; // stale
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.equal(r.json.error, 'state');
  assert.match(r.json.message, /invariant 4/);
});

test('write rejects a non-increasing log id and a decreasing timestamp', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  state.updated_at = T2;
  const r1 = writeUnit(unit, state, logLine(1, T2));
  assert.match(r1.json.message, /strictly increase/);
  const r2 = writeUnit(unit, state, [logLine(2, T3), logLine(3, T2)]);
  assert.match(r2.json.message, /must not decrease/);
});

test('write rejects changes to immutable identity fields', () => {
  const { unit, state } = createUnit();
  state.id = 'wu-other';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.equal(r.json.error, 'state');
  assert.match(r.json.message, /id must not change|must match/);
});

test('write rejects an unknown top-level state field', () => {
  const { unit, state } = createUnit();
  state.custom = true;
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /unknown key "custom"/);
});

// ---------------------------------------------------------------------------
// invariants

test('invariant 1: fast_path without trivial grading is rejected', () => {
  const { unit, state } = createUnit();
  state.fast_path = true;
  state.grading = 'full';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /invariant 1/);
});

test('invariant 2: blocked_at without an open problem is rejected', () => {
  const { unit, state } = createUnit();
  state.blocked_at = 'build';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /invariant 2/);
});

test('invariant 5: outcome on a non-terminal node is rejected', () => {
  const { unit, state } = createUnit();
  state.outcome = 'shipped';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /invariant 5/);
});

test('invariant 6: consult count differing from advice length is rejected', () => {
  const { unit, state } = createUnit();
  state.advisor_consults = [{
    problem_key: 'node:spec#1', blocked_node: 'spec', count: 1, advice: [], status: 'open',
  }];
  state.blocked_at = 'spec';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /count must equal/);
});

test('invariant 7: two in-progress tickets are rejected', () => {
  const { unit, state } = createUnit();
  const ticket = (id) => ({
    id, title: 't', description: 'd', status: 'in-progress',
    verification_command: 'true', evidence_refs: [],
  });
  state.tickets = [ticket('T-1'), ticket('T-2')];
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /invariant 7/);
});

test('invariant 9: a fail counter for a missing ticket is rejected', () => {
  const { unit, state } = createUnit();
  state.fail_counters = { 'ticket:T-9': 1 };
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /refers to no existing ticket/);
});

test('the fast-path scope node:build is a valid fail counter without tickets', () => {
  const { unit, state } = createUnit();
  state.fail_counters = { 'node:build': 1 };
  state.grading = 'full'; // post-upgrade state
  state.current_node = 'spec';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2, { node: 'review', description: 'Fast-path fail: upgraded to full, routed to spec.' }));
  assert.equal(r.status, 0, r.stderr);
});

test('invariant 10: a dangling review file pointer is rejected, a real one accepted', () => {
  const { unit, state } = createUnit();
  const review = {
    id: 'R-1', node: 'spec', target: { type: 'stage', id: 'spec' },
    verdict: 'pass',
    dimensions: [{ name: 'correctness', result: 'pass' }],
    evidence_refs: [{ kind: 'log', ref: 'L-0002' }],
    file: 'spec/review-1.md', date: T2,
  };
  state.reviews = [review];
  state.current_node = 'spec';
  state.updated_at = T2;
  const line = logLine(2, T2, {
    source: 'actor-report', actor: 'reviewer', node: 'spec',
    event_type: 'verdict', source_ref: 'spec/review-1.md',
  });
  const r1 = writeUnit(unit, state, line);
  assert.match(r1.json.message, /invariant 10/);

  fs.mkdirSync(path.join(unit, 'spec'));
  fs.writeFileSync(path.join(unit, 'spec', 'review-1.md'), '# review\n');
  const r2 = writeUnit(unit, state, line);
  assert.equal(r2.status, 0, r2.stderr);
});

test('a review with no evidence references is rejected', () => {
  const { unit, state } = createUnit();
  state.reviews = [{
    id: 'R-1', node: 'spec', target: { type: 'stage', id: 'spec' },
    verdict: 'pass', dimensions: [], evidence_refs: [],
    file: 'spec/review-1.md', date: T2,
  }];
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /at least one evidence reference/);
});

test('a pass verdict with a failing dimension is rejected', () => {
  const { unit, state } = createUnit();
  state.reviews = [{
    id: 'R-1', node: 'spec', target: { type: 'stage', id: 'spec' },
    verdict: 'pass',
    dimensions: [{ name: 'correctness', result: 'fail' }],
    evidence_refs: [{ kind: 'log', ref: 'L-0002' }],
    file: 'spec/review-1.md', date: T2,
  }];
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2));
  assert.match(r.json.message, /pass verdict must have no failing dimension/);
});

test('log source must match event_type', () => {
  const { unit, state } = createUnit();
  state.current_node = 'research-explore';
  state.updated_at = T2;
  const r = writeUnit(unit, state, logLine(2, T2, { event_type: 'verdict' }));
  assert.match(r.json.message, /source must be "actor-report"/);
});

// ---------------------------------------------------------------------------
// archive

test('archive moves a terminal unit and refuses a live one', () => {
  const { units, unit, state } = createUnit('wu-arch');
  const live = runScript(['archive', '--unit', unit, '--to', path.join(units, 'archive')]);
  assert.equal(live.json.error, 'state');
  assert.match(live.json.message, /outcome/);

  state.current_node = 'end';
  state.outcome = 'ended';
  state.outcome_reason = 'grading no-op: already exists';
  state.updated_at = T2;
  const w = writeUnit(unit, state, logLine(2, T2, {
    node: 'end', event_type: 'archive', description: 'Archived at End.',
  }));
  assert.equal(w.status, 0, w.stderr);

  const r = runScript(['archive', '--unit', unit, '--to', path.join(units, 'archive')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.action, 'archived');
  assert.ok(!fs.existsSync(unit));
  const moved = runScript(['validate', '--unit', r.json.path]);
  assert.equal(moved.status, 0, moved.stderr);
});

test('archive requires a final archive log line', () => {
  const { units, unit, state } = createUnit('wu-noarch');
  state.current_node = 'end';
  state.outcome = 'ended';
  state.outcome_reason = 'cancelled';
  state.updated_at = T2;
  const w = writeUnit(unit, state, logLine(2, T2, { node: 'end', description: 'Routed to end.' }));
  assert.equal(w.status, 0, w.stderr);
  const r = runScript(['archive', '--unit', unit, '--to', path.join(units, 'archive')]);
  assert.match(r.json.message, /final log line/);
});

// ---------------------------------------------------------------------------
// normative example (graph-plugin-work-unit-state)

test('the spec mid-flight shape validates: blocked build with one open consult', () => {
  const { unit, state } = createUnit('wu-midflight');
  fs.mkdirSync(path.join(unit, 'build'));
  fs.writeFileSync(path.join(unit, 'build', 'advice-1.md'), '# advice\n');
  fs.mkdirSync(path.join(unit, 'review'));
  fs.writeFileSync(path.join(unit, 'review', 'review-1.md'), '# review\n');

  state.current_node = 'build';
  state.grading = 'full';
  state.blocked_at = 'build';
  state.spec_ref = { kind: 'openspec-change', ref: 'example-change' };
  state.current_ticket = 'T-2';
  state.tickets = [
    {
      id: 'T-2', title: 'Validate invariants', description: 'Reject bad writes.',
      status: 'in-progress', verification_command: 'node --test',
      evidence_refs: [{ kind: 'path', ref: 'review/review-1.md' }],
    },
  ];
  state.fail_counters = { 'ticket:T-2': 2 };
  state.advisor_consults = [{
    problem_key: 'ticket:T-2#1', blocked_node: 'build', count: 1,
    advice: [{ file: 'build/advice-1.md', date: T2, log_ref: 'L-0002' }],
    status: 'open',
  }];
  state.reviews = [{
    id: 'R-1', node: 'review', target: { type: 'ticket', id: 'T-2' },
    verdict: 'fail',
    dimensions: [{ name: 'correctness', result: 'fail' }],
    evidence_refs: [{ kind: 'path', ref: 'review/review-1.md' }],
    file: 'review/review-1.md', date: T2,
  }];
  state.updated_at = T3;
  const r = writeUnit(unit, state, [
    logLine(2, T2, {
      source: 'actor-report', actor: 'advisor', node: 'advisor',
      event_type: 'advisor-consultation', source_ref: 'build/advice-1.md',
    }),
    logLine(3, T3, { node: 'advisor', description: 'Routed advisor to build with advice.' }),
  ]);
  assert.equal(r.status, 0, r.stderr);
  const v = runScript(['validate', '--unit', unit]);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.json.current_node, 'build');
});
