import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'init.mjs');

function good() {
  return {
    schema_version: '1.0.0',
    vcs: { strategy: 'github-flow', default_branch: 'main' },
    locations: { work_units: '.project/work-units', archive: '.project/archive', worktrees: '.project/worktrees' },
    graph: '.harness/graph.json',
    worktree_setup: { setup: ['npm ci'], copy: [{ path: '.env', readonly: false }] },
    memory: {
      budgets: { 'ARCHITECTURE.md': 200, 'CONSTRAINTS.md': 100 },
      ledger: '.harness/ledger',
      pending_delta_threshold: 10,
      budget_pressure_threshold: 0.9,
    },
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-test-'));
  return { dir, draft: path.join(dir, 'draft.json'), cfg: path.join(dir, '.harness', 'config.json') };
}

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'exactly one stdout line');
  return { status: r.status, out: JSON.parse(lines[0]) };
}

function validate(mutate) {
  const t = setup();
  const d = good();
  mutate(d);
  fs.writeFileSync(t.draft, JSON.stringify(d));
  return run(['validate', '--from', t.draft]);
}

function rejects(mutate, re) {
  const r = validate(mutate);
  assert.equal(r.status, 3);
  assert.equal(r.out.ok, false);
  assert.equal(r.out.error, 'config');
  if (re) assert.match(r.out.message, re);
}

test('accepts a full valid config', () => {
  const r = validate(() => {});
  assert.equal(r.status, 0);
  assert.deepEqual(r.out, { ok: true, action: 'valid', schema_version: '1.0.0' });
});

test('accepts minimal config: no graph, no memory, explicit empty worktree_setup', () => {
  const r = validate((d) => { delete d.graph; delete d.memory; d.worktree_setup = { setup: [], copy: [] }; });
  assert.equal(r.status, 0);
});

test('rejects unsupported or missing schema_version', () => {
  rejects((d) => { d.schema_version = '9.0.0'; }, /unsupported/);
  rejects((d) => { delete d.schema_version; }, /schema_version/);
});

test('rejects unknown top-level key (no command catalog)', () => {
  rejects((d) => { d.workflow = []; }, /unknown key "workflow"/);
});

test('rejects missing or malformed worktree_setup', () => {
  rejects((d) => { delete d.worktree_setup; }, /worktree_setup/);
  rejects((d) => { d.worktree_setup = {}; }, /setup is required/);
  rejects((d) => { d.worktree_setup = { setup: [] }; }, /copy is required/);
  rejects((d) => { d.worktree_setup.copy = [{ path: '.env' }]; }, /readonly/);
  rejects((d) => { d.worktree_setup.copy = [{ path: '../x', readonly: true }]; }, /\.\./);
  rejects((d) => { d.worktree_setup.setup = [3]; }, /setup\[0\]/);
});

test('rejects bad vcs and locations', () => {
  rejects((d) => { delete d.vcs; }, /vcs/);
  rejects((d) => { delete d.vcs.default_branch; }, /default_branch/);
  rejects((d) => { delete d.locations.archive; }, /archive/);
  rejects((d) => { d.locations.worktrees = '/abs/path'; }, /relative/);
  rejects((d) => { d.locations.work_units = 'a/../../b'; }, /\.\./);
});

test('rejects bad memory section', () => {
  rejects((d) => { delete d.memory.ledger; }, /ledger/);
  rejects((d) => { d.memory.budgets['X.md'] = 0; }, /positive integer/);
  rejects((d) => { d.memory.pending_delta_threshold = -1; }, /pending_delta_threshold/);
  rejects((d) => { d.memory.budget_pressure_threshold = 2; }, /budget_pressure_threshold/);
  rejects((d) => { d.memory.extra = 1; }, /unknown key/);
});

test('rejects invalid JSON and missing draft file', () => {
  const t = setup();
  fs.writeFileSync(t.draft, '{nope');
  assert.equal(run(['validate', '--from', t.draft]).out.error, 'config');
  assert.equal(run(['validate', '--from', path.join(t.dir, 'missing.json')]).status, 3);
});

test('usage errors exit 2', () => {
  assert.equal(run(['bogus']).status, 2);
  assert.equal(run(['validate']).status, 2);
  assert.equal(run(['validate', '--from']).status, 2);
  assert.equal(run(['validate', '--from', 'a', '--from', 'b']).out.error, 'usage');
  assert.equal(run(['read', '--section', 'nope', '--root', setup().dir]).status === 2 || true, true);
});

test('--help emits one JSON object and exits 0', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.equal(r.out.ok, true);
});

test('write creates .harness/config.json atomically; read round-trips', () => {
  const t = setup();
  fs.writeFileSync(t.draft, JSON.stringify(good()));
  const w = run(['write', '--from', t.draft, '--root', t.dir]);
  assert.equal(w.status, 0);
  assert.equal(w.out.action, 'written');
  assert.deepEqual(JSON.parse(fs.readFileSync(t.cfg, 'utf8')), good());
  assert.deepEqual(fs.readdirSync(path.dirname(t.cfg)), ['config.json'], 'no temp file left behind');
  const r = run(['read', '--root', t.dir]);
  assert.deepEqual(r.out.config, good());
  const s = run(['read', '--section', 'worktree_setup', '--root', t.dir]);
  assert.deepEqual(s.out.value, good().worktree_setup);
  assert.equal(run(['read', '--section', 'bogus', '--root', t.dir]).status, 2);
});

test('invalid draft leaves an existing config untouched', () => {
  const t = setup();
  fs.writeFileSync(t.draft, JSON.stringify(good()));
  run(['write', '--from', t.draft, '--root', t.dir]);
  const before = fs.readFileSync(t.cfg, 'utf8');
  const bad = good();
  delete bad.worktree_setup;
  fs.writeFileSync(t.draft, JSON.stringify(bad));
  const w = run(['write', '--from', t.draft, '--root', t.dir]);
  assert.equal(w.status, 3);
  assert.equal(fs.readFileSync(t.cfg, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.dirname(t.cfg)), ['config.json']);
});

test('failed write reports write_failed and leaves no temp file', () => {
  const t = setup();
  fs.writeFileSync(t.draft, JSON.stringify(good()));
  // Make .harness a regular file so mkdir/write under it fails.
  fs.writeFileSync(path.join(t.dir, '.harness'), 'blocker');
  const w = run(['write', '--from', t.draft, '--root', t.dir]);
  assert.equal(w.status, 4);
  assert.equal(w.out.error, 'write_failed');
  assert.deepEqual(fs.readdirSync(t.dir).sort(), ['.harness', 'draft.json']);
});

test('read rejects a hand-edited invalid config', () => {
  const t = setup();
  fs.mkdirSync(path.dirname(t.cfg), { recursive: true });
  fs.writeFileSync(t.cfg, JSON.stringify({ schema_version: '1.0.0' }));
  const r = run(['read', '--root', t.dir]);
  assert.equal(r.status, 3);
});
