import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worktree.mjs');

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
}

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}

function run(cwd, ...args) {
  return runEnv(cwd, {}, ...args);
}

function runEnv(cwd, env, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', env: Object.assign({}, process.env, env) });
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'exactly one stdout line, got: ' + r.stdout);
  return { code: r.status, json: JSON.parse(lines[0]) };
}

test('help prints one JSON object and exits 0', () => {
  const r = run(os.tmpdir(), '--help');
  assert.equal(r.code, 0);
  assert.equal(r.json.ok, true);
});

test('usage errors', () => {
  const repo = makeRepo();
  assert.equal(run(repo, 'bogus').code, 2);
  assert.equal(run(repo, 'bogus').json.error, 'usage');
  assert.equal(run(repo, 'ensure').json.error, 'usage');
  assert.equal(run(repo, 'ensure', '--branch', 'feature/x').json.error, 'usage');
  assert.equal(run(repo, 'ensure', '--branch', 'wu/Bad').json.error, 'usage');
  assert.equal(run(repo, 'ensure', '--detach', 'abc').json.error, 'usage');
  assert.equal(run(repo, 'setup').json.error, 'usage');
});

test('check-ref-format failures are classified', () => {
  const repo = makeRepo();
  const invalid = run(repo, 'ensure', '--branch', 'bad..name', '--id', 'bad-name');
  assert.equal(invalid.code, 2);
  assert.equal(invalid.json.error, 'usage');
  assert.match(invalid.json.message, /invalid branch name/);

  const brokenCfg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-')), 'gitconfig');
  fs.writeFileSync(brokenCfg, '[[[broken\n');
  const envFail = runEnv(repo, { GIT_CONFIG_GLOBAL: brokenCfg }, 'ensure', '--branch', 'wu/env-fail');
  assert.equal(envFail.code, 9);
  assert.equal(envFail.json.error, 'git_failed');
  assert.match(envFail.json.message, /bad config/);
});

test('not a git repository', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nogit-'));
  const r = run(dir, 'ensure', '--branch', 'wu/x');
  assert.equal(r.code, 6);
  assert.equal(r.json.error, 'not_a_git_repository');
});

test('ensure --branch creates at deterministic path with default location', () => {
  const repo = makeRepo();
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 0);
  assert.equal(r.json.action, 'created');
  assert.equal(r.json.path, path.join(repo, '.project/worktrees/abc'));
  assert.equal(git(r.json.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'wu/abc');
  assert.equal(git(repo, 'status', '--porcelain'), '', 'worktrees area excluded from git');
});

test('ensure ignores .harness/config.json and branches from HEAD', () => {
  const repo = makeRepo();
  git(repo, 'branch', 'trunk');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'second');
  const configFile = path.join(repo, '.harness', 'config.json');
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  for (const body of ['{bad', JSON.stringify({ schema_version: '1.0.0', locations: { worktrees: 'wt/area' }, vcs: { default_branch: 'trunk' } })]) {
    fs.writeFileSync(configFile, body);
    const id = body === '{bad' ? 'one' : 'two';
    const r = run(repo, 'ensure', '--branch', 'wu/' + id);
    assert.equal(r.code, 0);
    assert.equal(r.json.path, path.join(repo, '.project/worktrees', id));
    assert.equal(git(r.json.path, 'rev-parse', 'HEAD'), git(repo, 'rev-parse', 'HEAD'));
    assert.equal(fs.existsSync(path.join(r.json.path, 'b.txt')), true);
  }
});

test('setup is an unknown subcommand', () => {
  const repo = makeRepo();
  const r = run(repo, 'setup', '--worktree', repo);
  assert.equal(r.code, 2);
  assert.equal(r.json.error, 'usage');
  assert.match(r.json.message, /unknown subcommand: setup/);
});

test('ensure is idempotent: second call reuses', () => {
  const repo = makeRepo();
  run(repo, 'ensure', '--branch', 'wu/abc');
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 0);
  assert.equal(r.json.action, 'reused');
  assert.equal(git(repo, 'worktree', 'list').split('\n').length, 2);
});

test('ensure works from inside a linked worktree', () => {
  const repo = makeRepo();
  const a = run(repo, 'ensure', '--branch', 'wu/a').json.path;
  const r = run(a, 'ensure', '--branch', 'wu/b');
  assert.equal(r.json.path, path.join(repo, '.project/worktrees/b'));
});

test('reopen on existing branch after worktree removal', () => {
  const repo = makeRepo();
  const p = run(repo, 'ensure', '--branch', 'wu/abc').json.path;
  git(repo, 'worktree', 'remove', p);
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.json.action, 'reopened');
  assert.equal(git(repo, 'branch', '--list', 'wu/*').split('\n').length, 1);
});

test('recover stale registration whose directory is absent', () => {
  const repo = makeRepo();
  const p = run(repo, 'ensure', '--branch', 'wu/abc').json.path;
  fs.rmSync(p, { recursive: true, force: true });
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 0);
  assert.equal(r.json.action, 'recovered-stale');
  assert.equal(git(p, 'rev-parse', '--abbrev-ref', 'HEAD'), 'wu/abc');
});

test('collision: unregistered directory is never touched', () => {
  const repo = makeRepo();
  const p = path.join(repo, '.project/worktrees/abc');
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'keep.txt'), 'x');
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 3);
  assert.equal(r.json.error, 'collision');
  assert.equal(fs.readFileSync(path.join(p, 'keep.txt'), 'utf8'), 'x');
});

test('collision: path is a worktree on another branch', () => {
  const repo = makeRepo();
  const p = run(repo, 'ensure', '--branch', 'wu/abc').json.path;
  git(repo, 'worktree', 'remove', p);
  git(repo, 'worktree', 'add', '-b', 'other', p);
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 3);
  assert.equal(git(p, 'rev-parse', '--abbrev-ref', 'HEAD'), 'other');
});

test('collision: branch checked out elsewhere', () => {
  const repo = makeRepo();
  const elsewhere = path.join(repo, 'elsewhere');
  git(repo, 'worktree', 'add', '-b', 'wu/abc', elsewhere);
  const r = run(repo, 'ensure', '--branch', 'wu/abc');
  assert.equal(r.code, 3);
  assert.ok(fs.existsSync(elsewhere));
});

test('fix unit: existing branch with --id derives path from id', () => {
  const repo = makeRepo();
  git(repo, 'branch', 'feature/old');
  assert.equal(run(repo, 'ensure', '--branch', 'feature/old').json.error, 'usage');
  const r = run(repo, 'ensure', '--branch', 'feature/old', '--id', 'fix-1');
  assert.equal(r.code, 0);
  assert.equal(r.json.path, path.join(repo, '.project/worktrees/fix-1'));
  assert.equal(git(r.json.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feature/old');
});

test('non-wu branch that does not exist fails distinctly', () => {
  const repo = makeRepo();
  const r = run(repo, 'ensure', '--branch', 'feature/none', '--id', 'x');
  assert.equal(r.code, 10);
  assert.equal(r.json.error, 'branch_not_found');
});

test('info/exclude: appended once, newline-terminated, parents created', () => {
  const repo = makeRepo();
  const ex = path.join(repo, '.git/info/exclude');
  fs.rmSync(path.join(repo, '.git/info'), { recursive: true, force: true });
  run(repo, 'ensure', '--branch', 'wu/a');
  run(repo, 'ensure', '--branch', 'wu/b');
  const lines = fs.readFileSync(ex, 'utf8').split('\n');
  assert.equal(lines.filter((l) => l === '/.project/worktrees/').length, 1);
  assert.equal(lines[lines.length - 1], '');
});

test('info/exclude: adds newline when file lacks trailing one', () => {
  const repo = makeRepo();
  const ex = path.join(repo, '.git/info/exclude');
  fs.writeFileSync(ex, '*.log');
  run(repo, 'ensure', '--branch', 'wu/a');
  assert.equal(fs.readFileSync(ex, 'utf8'), '*.log\n/.project/worktrees/\n');
});

test('ensure --detach creates a pin, coexists, and is idempotent', () => {
  const repo = makeRepo();
  const sha = git(repo, 'rev-parse', 'HEAD');
  run(repo, 'ensure', '--branch', 'wu/a');
  const r = run(repo, 'ensure', '--detach', sha);
  assert.equal(r.code, 0);
  assert.equal(r.json.action, 'created');
  assert.equal(r.json.pin, sha);
  assert.equal(r.json.path, path.join(repo, '.project/worktrees/pin-' + git(repo, 'rev-parse', '--short', sha)));
  assert.equal(git(r.json.path, 'rev-parse', 'HEAD'), sha);
  assert.equal(run(repo, 'ensure', '--detach', sha).json.action, 'reused');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('ensure --detach never runs hooks', () => {
  const repo = makeRepo();
  const marker = path.join(repo, 'hook-ran');
  const hook = path.join(repo, '.git/hooks/post-checkout');
  fs.mkdirSync(path.dirname(hook), { recursive: true });
  fs.writeFileSync(hook, '#!/bin/sh\ntouch "' + marker + '"\n', { mode: 0o755 });
  run(repo, 'ensure', '--detach', git(repo, 'rev-parse', 'HEAD'));
  assert.equal(fs.existsSync(marker), false);
});

test('ensure --detach failures carry pin unknown', () => {
  const repo = makeRepo();
  const r = run(repo, 'ensure', '--detach', 'a'.repeat(40));
  assert.equal(r.code, 5);
  assert.equal(r.json.error, 'probe_failure');
  assert.equal(r.json.pin, 'unknown');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-nogit-'));
  assert.equal(run(dir, 'ensure', '--detach', 'a'.repeat(40)).json.pin, 'unknown');
});

test('ensure --detach recovers stale registration', () => {
  const repo = makeRepo();
  const sha = git(repo, 'rev-parse', 'HEAD');
  const p = run(repo, 'ensure', '--detach', sha).json.path;
  fs.rmSync(p, { recursive: true, force: true });
  assert.equal(run(repo, 'ensure', '--detach', sha).json.action, 'recovered-stale');
});

test('no remove subcommand and prune is never run', () => {
  const repo = makeRepo();
  assert.equal(run(repo, 'remove', '--worktree', 'x').json.error, 'usage');
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.equal(/'prune'/.test(src), false);
  // an unrelated stale registration must survive an ensure call
  const other = path.join(repo, 'other-wt');
  git(repo, 'worktree', 'add', '-b', 'other', other);
  fs.rmSync(other, { recursive: true, force: true });
  run(repo, 'ensure', '--branch', 'wu/a');
  assert.match(git(repo, 'worktree', 'list'), /other-wt/);
});
