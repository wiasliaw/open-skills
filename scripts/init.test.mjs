// Tests for init.mjs. Run with: node --test scripts/
import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'init.mjs');

function tmpdir() {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'init-test-'));
}

function makeRepo() {
  const dir = tmpdir();
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function draftFile(dir, obj) {
  const p = path.join(dir, 'draft.json');
  fs.writeFileSync(p, typeof obj === 'string' ? obj : JSON.stringify(obj));
  return p;
}

function run(args, opts) {
  opts = opts || {};
  const r = spawnSync('node', [SCRIPT].concat(args), {
    cwd: opts.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch (e) { /* asserted by callers */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json: json };
}

const GOOD_WS = { version: 1, setup: ['npm install'], copy: [{ path: '.env' }, { path: 'data', readonly: true }] };
const GOOD_CFG = {
  version: 1,
  vcs: 'No formal process.',
  workflow: [
    { phase: 'edit', how: 'Edit src/ directly', kind: 'manual' },
    { phase: 'verify', how: 'npm test', kind: 'command' },
  ],
};

test('validate: valid worktree-setup draft', () => {
  const repo = makeRepo();
  const r = run(['validate', '--kind', 'worktree-setup', '--from', draftFile(repo, GOOD_WS)], { cwd: repo });
  assert.equal(r.status, 0);
  assert.deepEqual(r.json, { ok: true, action: 'valid', kind: 'worktree-setup' });
  assert.ok(!fs.existsSync(path.join(repo, '.harness')), 'validate must not write');
});

test('validate: valid config draft', () => {
  const repo = makeRepo();
  const r = run(['validate', '--kind', 'config', '--from', draftFile(repo, GOOD_CFG)], { cwd: repo });
  assert.equal(r.status, 0);
  assert.equal(r.json.action, 'valid');
});

test('write: creates .harness and the worktree-setup file', () => {
  const repo = makeRepo();
  const r = run(['write', '--kind', 'worktree-setup', '--from', draftFile(repo, GOOD_WS)], { cwd: repo });
  assert.equal(r.status, 0);
  assert.equal(r.json.action, 'written');
  const target = path.join(repo, '.harness', 'worktree-setup.json');
  assert.equal(r.json.path, target);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, 'utf8')), GOOD_WS);
});

test('write: creates the config file and overwrites on a second write', () => {
  const repo = makeRepo();
  assert.equal(run(['write', '--kind', 'config', '--from', draftFile(repo, GOOD_CFG)], { cwd: repo }).status, 0);
  const updated = Object.assign({}, GOOD_CFG, { vcs: 'trunk-based development' });
  const r = run(['write', '--kind', 'config', '--from', draftFile(repo, updated)], { cwd: repo });
  assert.equal(r.status, 0);
  const target = path.join(repo, '.harness', 'config.json');
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).vcs, 'trunk-based development');
});

test('write: subdirectory invocation still writes at the repo root', () => {
  const repo = makeRepo();
  const sub = path.join(repo, 'nested');
  fs.mkdirSync(sub);
  const r = run(['write', '--kind', 'config', '--from', draftFile(sub, GOOD_CFG)], { cwd: sub });
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(repo, '.harness', 'config.json')));
  assert.ok(!fs.existsSync(path.join(sub, '.harness')));
});

test('write: no git repository falls back to the working directory', () => {
  const dir = tmpdir();
  const r = run(['write', '--kind', 'worktree-setup', '--from', draftFile(dir, { version: 1, setup: [], copy: [] })], { cwd: dir });
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(dir, '.harness', 'worktree-setup.json')));
});

function rejects(kind, obj, repo) {
  const r = run(['write', '--kind', kind, '--from', draftFile(repo, obj)], { cwd: repo });
  assert.equal(r.status, 3, 'expected config exit code, got ' + r.status + ': ' + r.stdout);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.error, 'config');
  assert.ok(!fs.existsSync(path.join(repo, '.harness')), 'rejection must not write');
}

test('schema: worktree-setup rejections', () => {
  const repo = makeRepo();
  rejects('worktree-setup', { version: 2, setup: [], copy: [] }, repo);
  rejects('worktree-setup', { version: 1, setup: 'npm install', copy: [] }, repo);
  rejects('worktree-setup', { version: 1, setup: [], copy: [{ path: '/etc/passwd' }] }, repo);
  rejects('worktree-setup', { version: 1, setup: [], copy: [{ path: '../out' }] }, repo);
  rejects('worktree-setup', { version: 1, setup: [], copy: [], extra: true }, repo);
  rejects('worktree-setup', { version: 1, setup: [], copy: [{ path: 'a', readonly: 'yes' }] }, repo);
});

test('schema: config rejections', () => {
  const repo = makeRepo();
  rejects('config', { version: 1, vcs: '', workflow: GOOD_CFG.workflow }, repo);
  rejects('config', { version: 1, vcs: 'x', workflow: [] }, repo);
  rejects('config', { version: 1, vcs: 'x', workflow: [{ phase: 'edit', how: 'x', kind: 'auto' }] }, repo);
  rejects('config', { version: 1, vcs: 'x', workflow: [{ phase: 'edit', how: 'x', kind: 'manual', extra: 1 }] }, repo);
  rejects('config', { version: 2, vcs: 'x', workflow: GOOD_CFG.workflow }, repo);
  rejects('config', { version: 1, vcs: 'x', workflow: GOOD_CFG.workflow, extra: true }, repo);
});

test('config errors: missing and malformed drafts', () => {
  const repo = makeRepo();
  const missing = run(['validate', '--kind', 'config', '--from', path.join(repo, 'absent.json')], { cwd: repo });
  assert.equal(missing.status, 3);
  assert.equal(missing.json.error, 'config');
  const malformed = run(['validate', '--kind', 'config', '--from', draftFile(repo, '{not json')], { cwd: repo });
  assert.equal(malformed.status, 3);
});

test('usage errors: unknown subcommand, kind, and missing flags', () => {
  const repo = makeRepo();
  for (const args of [
    ['frobnicate'],
    ['write', '--kind', 'other', '--from', 'x.json'],
    ['write', '--from', 'x.json'],
    ['write', '--kind', 'config'],
    ['write', '--kind', 'config', '--from', 'x.json', '--bogus', '1'],
  ]) {
    const r = run(args, { cwd: repo });
    assert.equal(r.status, 2, 'expected usage exit for: ' + args.join(' '));
    assert.equal(r.json.error, 'usage');
  }
});

test('stdout carries exactly one JSON object on success and failure', () => {
  const repo = makeRepo();
  const ok = run(['validate', '--kind', 'config', '--from', draftFile(repo, GOOD_CFG)], { cwd: repo });
  assert.doesNotThrow(() => JSON.parse(ok.stdout));
  const bad = run(['bogus'], { cwd: repo });
  assert.doesNotThrow(() => JSON.parse(bad.stdout));
});
