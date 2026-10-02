// Tests for worktree.mjs. Run with: node --test scripts/
// Every fixture is a fresh temp directory; nothing touches the network.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'worktree.mjs');

const EXIT = {
  usage: 2,
  config: 2,
  collision: 3,
  stale_with_directory: 4,
  probe_failure: 5,
  not_a_git_repository: 6,
  node_version: 7,
  setup_failed: 8,
  git_failed: 9,
};

let ROOT;
let HOME;
let counter = 0;

before(() => {
  ROOT = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-test-')));
  HOME = path.join(ROOT, 'home');
  fs.mkdirSync(HOME);
});

after(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// helpers

function baseEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('GIT_')) continue;
    env[k] = v;
  }
  Object.assign(env, {
    HOME,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  }, extra || {});
  return env;
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, env: baseEnv(), encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.replace(/\n$/, '');
}

function tmpdir() {
  counter += 1;
  const dir = path.join(ROOT, `t${counter}`);
  fs.mkdirSync(dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// Creates a repository named `name` (default "proj") with one commit.
function makeRepo(opts) {
  opts = opts || {};
  const dir = path.join(tmpdir(), opts.name || 'proj');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  const files = opts.files || { 'a.txt': 'hello\n' };
  for (const [name, content] of Object.entries(files)) write(path.join(dir, name), content);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'initial');
  return dir;
}

function run(args, o) {
  o = o || {};
  const r = spawnSync(process.execPath, [...(o.nodeArgs || []), o.script || SCRIPT, ...args], {
    cwd: o.cwd,
    env: o.env || baseEnv(),
    encoding: 'utf8',
  });
  assert.equal(r.error, undefined);
  const lines = r.stdout.split('\n');
  assert.equal(lines.length, 2, `stdout must be exactly one JSON line, got: ${JSON.stringify(r.stdout)}`);
  assert.equal(lines[1], '');
  return { code: r.status, json: JSON.parse(lines[0]), stderr: r.stderr, stdout: r.stdout };
}

function assertOk(res, action) {
  assert.equal(res.code, 0, `expected success, got ${res.stdout} / ${res.stderr}`);
  assert.equal(res.json.ok, true);
  if (action) assert.equal(res.json.action, action);
}

function assertFail(res, error) {
  assert.equal(res.json.ok, false, `expected failure, got ${res.stdout}`);
  assert.equal(res.json.error, error);
  assert.equal(typeof res.json.message, 'string');
  assert.ok(res.json.message.length > 0);
  assert.equal(res.code, EXIT[error]);
  assert.ok(res.stderr.length > 0, 'diagnostics must go to stderr');
}

function wtPath(repo, id) {
  return path.join(path.dirname(repo), `${path.basename(repo)}.worktrees`, 'wu', id);
}

function listWorktrees(repo) {
  return git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice(9));
}

function branches(repo) {
  return git(repo, 'for-each-ref', '--format=%(refname)', 'refs/heads');
}

function snapshot(dir) {
  const out = [];
  (function walk(d) {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const st = fs.lstatSync(p);
      out.push(`${path.relative(dir, p)}|${st.isDirectory() ? 'd' : st.isSymbolicLink() ? 'l' : 'f'}|${st.size}|${st.mtimeMs}`);
      if (st.isDirectory()) walk(p);
    }
  })(dir);
  return out;
}

function sha(repo, rev) {
  return git(repo, 'rev-parse', rev || 'HEAD');
}

// ---------------------------------------------------------------------------
// Script location, invocation, runtime

test('script is parseable and runs through node without a shebang or executable bit', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  assert.ok(!src.startsWith('#!'));
  assert.equal(fs.statSync(SCRIPT).mode & 0o111, 0);
  const res = run(['bogus'], { cwd: ROOT });
  assertFail(res, 'usage');
});

test('only node: built-in modules are imported and no global registration cleanup exists', () => {
  const src = fs.readFileSync(SCRIPT, 'utf8');
  const specifiers = [...src.matchAll(/^import\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.ok(specifiers.length > 0);
  for (const s of specifiers) assert.ok(s.startsWith('node:'), `non-builtin import: ${s}`);
  assert.ok(!/\brequire\s*\(/.test(src));
  assert.ok(!/import\s*\(/.test(src));
  assert.ok(!/prune/i.test(src), 'source must not contain any prune invocation');
});

test('Node older than 20 fails with the node-version error before touching git', () => {
  const dir = tmpdir();
  const log = path.join(dir, 'git.log');
  const bin = shimDir(dir, log);
  const preload = path.join(dir, 'old-node.cjs');
  fs.writeFileSync(preload, "Object.defineProperty(process.versions, 'node', { value: '18.19.0' });\n");
  const repo = makeRepo();
  const res = run(['ensure', '--branch', 'wu/x'], {
    cwd: repo,
    nodeArgs: ['--require', preload],
    env: baseEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}`, SHIM_LOG: log }),
  });
  assertFail(res, 'node_version');
  assert.equal(fs.existsSync(log), false, 'git must not have been invoked');
  assert.equal(fs.existsSync(wtPath(repo, 'x')), false);
});

// ---------------------------------------------------------------------------
// Output and exit-code contract

test('failure classes have distinct exit codes (usage and config share one class)', () => {
  const codes = Object.entries(EXIT).filter(([k]) => k !== 'config').map(([, v]) => v);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(EXIT.usage, EXIT.config);
  assert.ok(codes.every((c) => c > 0));
});

test('non-git directory: not_a_git_repository for both modes, detach carries pin unknown', () => {
  const dir = tmpdir();
  const b = run(['ensure', '--branch', 'wu/x'], { cwd: dir });
  assertFail(b, 'not_a_git_repository');
  const d = run(['ensure', '--detach', 'a'.repeat(40)], { cwd: dir });
  assertFail(d, 'not_a_git_repository');
  assert.equal(d.json.pin, 'unknown');
  assert.deepEqual(fs.readdirSync(dir), []);
});

test('repository with no commits: detach reports not_a_git_repository with pin unknown', () => {
  const dir = path.join(tmpdir(), 'empty');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  const res = run(['ensure', '--detach', 'a'.repeat(40)], { cwd: dir });
  assertFail(res, 'not_a_git_repository');
  assert.equal(res.json.pin, 'unknown');
  assert.equal(fs.existsSync(path.join(dir, '.codewalk')), false);
});

test('bare repository has no main checkout: branch mode fails as not_a_git_repository', () => {
  const dir = path.join(tmpdir(), 'bare.git');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '--bare');
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: dir });
  assertFail(res, 'not_a_git_repository');
});

test('every git invocation has GIT_TERMINAL_PROMPT=0, and nothing ever invokes a prune', () => {
  const dir = tmpdir();
  const log = path.join(dir, 'git.log');
  const bin = shimDir(dir, log);
  const env = baseEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}`, SHIM_LOG: log, GIT_TERMINAL_PROMPT: '1' });
  const repo = makeRepo();
  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo, env }), 'created');
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo, env }), 'created');
  fs.rmSync(wtPath(repo, 'x'), { recursive: true });
  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo, env }), 'recovered-stale');
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(lines.length > 5);
  for (const line of lines) {
    const [prompt, argv] = line.split('\t');
    assert.equal(prompt, '0', `GIT_TERMINAL_PROMPT not 0 for: ${argv}`);
    assert.ok(!/\bprune\b/.test(argv), `prune invoked: ${argv}`);
  }
});

function shimDir(dir, log) {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const shim = path.join(bin, 'git');
  fs.writeFileSync(shim, `#!/bin/sh\nprintf '%s\\t%s\\n' "$GIT_TERMINAL_PROMPT" "$*" >> "${log}"\nexec "${real}" "$@"\n`);
  fs.chmodSync(shim, 0o755);
  return bin;
}

test('running from a script copy in a read-only plugin directory writes nothing into it', () => {
  const dir = tmpdir();
  const plugin = path.join(dir, 'plugin');
  const scripts = path.join(plugin, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(scripts, 'worktree.mjs'));
  const before = snapshot(plugin);
  const chmodTree = (mode) => {
    for (const d of [scripts, plugin]) fs.chmodSync(d, mode);
  };
  chmodTree(0o555);
  try {
    const repo = makeRepo();
    const script = path.join(scripts, 'worktree.mjs');
    assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo, script }), 'created');
    assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo, script }), 'created');
    assertOk(run(['setup', '--worktree', wtPath(repo, 'x')], { cwd: repo, script }));
    assert.equal(fs.existsSync(wtPath(repo, 'x')), true);
    assert.equal(fs.existsSync(path.join(repo, '.codewalk', 'worktree')), true);
  } finally {
    chmodTree(0o755);
  }
  assert.deepEqual(snapshot(plugin), before);
});

// ---------------------------------------------------------------------------
// Usage errors and omitted operations

test('invalid --branch values are usage errors before any git command runs', () => {
  const dir = tmpdir(); // not a git repository: a git call would give not_a_git_repository instead
  for (const bad of ['foo', 'wu/', 'wu/-x', 'wu/Bad', 'wu/a_b', 'wu/a/b', 'x/wu/a', 'wu/a b']) {
    const res = run(['ensure', '--branch', bad], { cwd: dir });
    assertFail(res, 'usage');
  }
  assertFail(run(['ensure'], { cwd: dir }), 'usage');
  assertFail(run(['ensure', '--branch'], { cwd: dir }), 'usage');
  assertFail(run(['ensure', '--branch', 'wu/a', '--detach', 'b'.repeat(40)], { cwd: dir }), 'usage');
  assertFail(run(['ensure', '--detach', 'abc'], { cwd: dir }), 'usage');
  assertFail(run(['ensure', '--bogus', 'x'], { cwd: dir }), 'usage');
  assertFail(run(['setup'], { cwd: dir }), 'usage');
  assertFail(run([], { cwd: dir }), 'usage');
});

test('remove and unknown subcommands are usage errors and change nothing', () => {
  const repo = makeRepo();
  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo }));
  const worktrees = listWorktrees(repo);
  const snap = snapshot(path.dirname(repo));
  for (const sub of ['remove', 'rm', 'prune', 'delete', 'frobnicate']) {
    assertFail(run([sub, '--worktree', wtPath(repo, 'x')], { cwd: repo }), 'usage');
    assertFail(run([sub], { cwd: repo }), 'usage');
  }
  assert.deepEqual(listWorktrees(repo), worktrees);
  assert.deepEqual(snapshot(path.dirname(repo)), snap);
});

// ---------------------------------------------------------------------------
// Branch mode

test('first open creates branch wu/<id> from main HEAD at the deterministic sibling path', () => {
  const repo = makeRepo();
  const res = run(['ensure', '--branch', 'wu/2026-10-01-wor-37'], { cwd: repo });
  assertOk(res, 'created');
  const expected = wtPath(repo, '2026-10-01-wor-37');
  assert.equal(res.json.path, expected);
  assert.equal(res.json.branch, 'wu/2026-10-01-wor-37');
  assert.ok(fs.existsSync(path.join(expected, 'a.txt')));
  assert.equal(git(expected, 'rev-parse', '--abbrev-ref', 'HEAD'), 'wu/2026-10-01-wor-37');
  assert.equal(sha(expected), sha(repo));
  assert.equal(path.relative(repo, expected).startsWith('..'), true, 'worktree must not nest in the main checkout');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('path is project-scoped: two projects with the same id get different paths', () => {
  const a = makeRepo({ name: 'alpha' });
  const b = makeRepo({ name: 'beta' });
  const ra = run(['ensure', '--branch', 'wu/same'], { cwd: a });
  const rb = run(['ensure', '--branch', 'wu/same'], { cwd: b });
  assertOk(ra, 'created');
  assertOk(rb, 'created');
  assert.notEqual(ra.json.path, rb.json.path);
  assert.equal(ra.json.path, wtPath(a, 'same'));
  assert.equal(rb.json.path, wtPath(b, 'same'));
});

test('path containing spaces works end to end', () => {
  const repo = makeRepo({ name: 'my project' });
  write(path.join(repo, '.harness', 'worktree-setup.json'), JSON.stringify({ version: 1, setup: ['touch ran.txt'], copy: [] }));
  const res = run(['ensure', '--branch', 'wu/sp'], { cwd: repo });
  assertOk(res, 'created');
  assert.equal(res.json.path, path.join(path.dirname(repo), 'my project.worktrees', 'wu', 'sp'));
  assertOk(run(['setup', '--worktree', res.json.path], { cwd: repo }));
  assert.ok(fs.existsSync(path.join(res.json.path, 'ran.txt')));
  const d = run(['ensure', '--detach', sha(repo)], { cwd: repo });
  assertOk(d, 'created');
  assert.ok(d.json.path.includes('my project'));
});

test('resolution from a subdirectory and from inside a linked worktree gives the same path', () => {
  const repo = makeRepo({ files: { 'a.txt': 'x\n', 'sub/deep/b.txt': 'y\n' } });
  const first = run(['ensure', '--branch', 'wu/one'], { cwd: repo });
  assertOk(first, 'created');
  const fromSub = run(['ensure', '--branch', 'wu/two'], { cwd: path.join(repo, 'sub', 'deep') });
  assertOk(fromSub, 'created');
  assert.equal(fromSub.json.path, wtPath(repo, 'two'));
  const fromLinked = run(['ensure', '--branch', 'wu/three'], { cwd: path.join(first.json.path) });
  assertOk(fromLinked, 'created');
  assert.equal(fromLinked.json.path, wtPath(repo, 'three'));
  const fromLinkedSub = run(['ensure', '--branch', 'wu/one'], { cwd: first.json.path });
  assertOk(fromLinkedSub, 'reused');
  assert.equal(fromLinkedSub.json.path, first.json.path);
  assert.equal(fs.existsSync(path.join(first.json.path + '.worktrees')), false);
});

test('new branch starts from the main checkout HEAD even when run from a linked worktree', () => {
  const repo = makeRepo();
  const other = run(['ensure', '--branch', 'wu/other'], { cwd: repo });
  git(other.json.path, 'commit', '-q', '--allow-empty', '-m', 'ahead');
  assert.notEqual(sha(other.json.path), sha(repo));
  const res = run(['ensure', '--branch', 'wu/fresh'], { cwd: other.json.path });
  assertOk(res, 'created');
  assert.equal(sha(res.json.path), sha(repo));
});

test('second ensure is idempotent: same path, no extra worktree', () => {
  const repo = makeRepo();
  const one = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  const worktrees = listWorktrees(repo);
  const two = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertOk(one, 'created');
  assertOk(two, 'reused');
  assert.equal(two.json.path, one.json.path);
  assert.deepEqual(listWorktrees(repo), worktrees);
  assert.equal(worktrees.length, 2);
  assert.equal(branches(repo), 'refs/heads/main\nrefs/heads/wu/x');
});

test('CI-red reopen: existing branch without a worktree is reopened, not recreated or reset', () => {
  const repo = makeRepo();
  const first = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  git(first.json.path, 'commit', '-q', '--allow-empty', '-m', 'work');
  const tip = sha(repo, 'wu/x');
  git(repo, 'worktree', 'remove', first.json.path);
  const branchesBefore = branches(repo);
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertOk(res, 'reopened');
  assert.equal(res.json.path, first.json.path);
  assert.equal(sha(repo, 'wu/x'), tip);
  assert.equal(sha(res.json.path), tip);
  assert.equal(branches(repo), branchesBefore);
});

test('stale registration with the directory deleted is recovered by exact-path removal only', () => {
  const repo = makeRepo();
  const first = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  git(first.json.path, 'commit', '-q', '--allow-empty', '-m', 'work');
  const tip = sha(repo, 'wu/x');
  const unrelated = path.join(path.dirname(repo), 'unrelated-stale');
  git(repo, 'worktree', 'add', '-q', '-b', 'unrelated', unrelated);
  fs.rmSync(unrelated, { recursive: true });
  fs.rmSync(first.json.path, { recursive: true });

  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertOk(res, 'recovered-stale');
  assert.equal(res.json.path, first.json.path);
  assert.ok(fs.existsSync(path.join(first.json.path, 'a.txt')));
  assert.equal(sha(res.json.path), tip);
  const list = git(repo, 'worktree', 'list', '--porcelain');
  assert.equal(list.split('\n').filter((l) => l.startsWith('worktree ')).length, 3);
  assert.ok(list.includes(unrelated), 'unrelated stale registration must survive (no global prune)');
});

test('stale registration of the branch at another deleted path is recovered', () => {
  const repo = makeRepo();
  const elsewhere = path.join(path.dirname(repo), 'elsewhere');
  git(repo, 'worktree', 'add', '-q', '-b', 'wu/x', elsewhere);
  fs.rmSync(elsewhere, { recursive: true });
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertOk(res, 'recovered-stale');
  assert.equal(git(res.json.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'wu/x');
  assert.ok(!git(repo, 'worktree', 'list', '--porcelain').includes(elsewhere));
});

test('registration unusable but directory present fails with stale_with_directory and removes nothing', () => {
  const repo = makeRepo();
  const first = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  fs.rmSync(path.join(first.json.path, '.git'));
  const snap = snapshot(first.json.path);
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertFail(res, 'stale_with_directory');
  assert.deepEqual(snapshot(first.json.path), snap);
  assert.ok(git(repo, 'worktree', 'list', '--porcelain').includes(first.json.path));
});

test('unregistered existing directory is a collision and stays untouched', () => {
  const repo = makeRepo();
  const target = wtPath(repo, 'x');
  write(path.join(target, 'keep.txt'), 'mine\n');
  const snap = snapshot(path.dirname(repo));
  const worktrees = listWorktrees(repo);
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertFail(res, 'collision');
  assert.deepEqual(snapshot(path.dirname(repo)), snap);
  assert.deepEqual(listWorktrees(repo), worktrees);
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'mine\n');
  assert.equal(branches(repo), 'refs/heads/main');
});

test('a plain file at the computed path is also a collision', () => {
  const repo = makeRepo();
  const target = wtPath(repo, 'x');
  write(target, 'i am a file\n');
  assertFail(run(['ensure', '--branch', 'wu/x'], { cwd: repo }), 'collision');
  assert.equal(fs.readFileSync(target, 'utf8'), 'i am a file\n');
});

test('path registered with a different branch is a collision', () => {
  const repo = makeRepo();
  const target = wtPath(repo, 'x');
  git(repo, 'worktree', 'add', '-q', '-b', 'other', target);
  const snap = snapshot(target);
  assertFail(run(['ensure', '--branch', 'wu/x'], { cwd: repo }), 'collision');
  assert.deepEqual(snapshot(target), snap);
  assert.equal(git(target, 'rev-parse', '--abbrev-ref', 'HEAD'), 'other');
  assert.equal(branches(repo), 'refs/heads/main\nrefs/heads/other');
});

test('branch checked out in a different existing worktree is a collision', () => {
  const repo = makeRepo();
  const elsewhere = path.join(path.dirname(repo), 'elsewhere');
  git(repo, 'worktree', 'add', '-q', '-b', 'wu/x', elsewhere);
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: repo });
  assertFail(res, 'collision');
  assert.equal(fs.existsSync(wtPath(repo, 'x')), false);
  assert.ok(fs.existsSync(path.join(elsewhere, 'a.txt')));
});

test('branch mode in a repository with no commits fails as not_a_git_repository', () => {
  const dir = path.join(tmpdir(), 'empty');
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  const res = run(['ensure', '--branch', 'wu/x'], { cwd: dir });
  assertFail(res, 'not_a_git_repository');
  assert.equal(fs.existsSync(wtPath(dir, 'x')), false);
});

test('hooks are not executed when ensure creates a worktree (both modes)', () => {
  const repo = makeRepo();
  const marker = path.join(repo, '..', 'hook-ran');
  const hook = path.join(repo, '.git', 'hooks', 'post-checkout');
  fs.writeFileSync(hook, `#!/bin/sh\necho ran >> "${marker}"\n`);
  fs.chmodSync(hook, 0o755);

  // Control: a plain git worktree add does fire the hook, so the assertion below is not vacuous.
  git(repo, 'worktree', 'add', '-q', '--detach', path.join(path.dirname(repo), 'control'));
  assert.ok(fs.existsSync(marker), 'control worktree add should have run the hook');
  fs.rmSync(marker);

  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo }), 'created');
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo }), 'created');
  assert.equal(fs.existsSync(marker), false, 'post-checkout hook must not run');
});

test('LFS smudge is skipped: GIT_LFS_SKIP_SMUDGE=1 reaches the checkout filter (both modes)', () => {
  const repo = makeRepo({ files: { 'a.txt': 'x\n' } });
  const marker = path.join(path.dirname(repo), 'smudge-env');
  const smudge = path.join(path.dirname(repo), 'smudge.sh');
  fs.writeFileSync(smudge, `#!/bin/sh\nprintf '%s' "$GIT_LFS_SKIP_SMUDGE" > "${marker}"\ncat\n`);
  fs.chmodSync(smudge, 0o755);
  git(repo, 'config', 'filter.lfs.clean', 'cat');
  git(repo, 'config', 'filter.lfs.smudge', `${smudge} %f`);
  git(repo, 'config', 'filter.lfs.required', 'false');
  write(path.join(repo, '.gitattributes'), '*.bin filter=lfs\n');
  write(path.join(repo, 'big.bin'), 'payload\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'lfs-like file');

  // Control: without the script the filter runs with the variable unset.
  git(repo, 'worktree', 'add', '-q', '--detach', path.join(path.dirname(repo), 'control'));
  assert.equal(fs.readFileSync(marker, 'utf8'), '');
  fs.rmSync(marker);

  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo }), 'created');
  assert.equal(fs.readFileSync(marker, 'utf8'), '1');
  fs.rmSync(marker);
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo }), 'created');
  assert.equal(fs.readFileSync(marker, 'utf8'), '1');
});

test('worktree add is issued with core.hooksPath=/dev/null', () => {
  const dir = tmpdir();
  const log = path.join(dir, 'git.log');
  const bin = shimDir(dir, log);
  const repo = makeRepo();
  const env = baseEnv({ PATH: `${bin}${path.delimiter}${process.env.PATH}`, SHIM_LOG: log });
  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo, env }));
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo, env }));
  const adds = fs.readFileSync(log, 'utf8').split('\n').filter((l) => /worktree add/.test(l));
  assert.equal(adds.length, 2);
  for (const l of adds) assert.ok(l.includes('core.hooksPath=/dev/null'), l);
});

// ---------------------------------------------------------------------------
// Detach mode

test('detach creates a pinned worktree inside the toplevel and excludes it', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const res = run(['ensure', '--detach', full], { cwd: repo });
  assertOk(res, 'created');
  assert.equal(res.json.pin, full);
  const short = git(repo, 'rev-parse', '--short', full);
  assert.equal(res.json.path, path.join(repo, '.codewalk', 'worktree', `codewalk-${short}`));
  assert.equal(git(res.json.path, 'rev-parse', 'HEAD'), full);
  assert.equal(git(res.json.path, 'rev-parse', '--abbrev-ref', 'HEAD'), 'HEAD');
  assert.equal(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8').split('\n').filter((l) => l === '.codewalk/worktree/').length, 1);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('detach reuses by SHA without rebuilding and does not duplicate the exclude line', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const one = run(['ensure', '--detach', full], { cwd: repo });
  write(path.join(one.json.path, 'scratch.txt'), 'untracked marker\n');
  const worktrees = listWorktrees(repo);
  const two = run(['ensure', '--detach', full], { cwd: repo });
  assertOk(two, 'reused');
  assert.equal(two.json.path, one.json.path);
  assert.equal(two.json.pin, full);
  assert.ok(fs.existsSync(path.join(one.json.path, 'scratch.txt')), 'reuse must not rebuild');
  assert.deepEqual(listWorktrees(repo), worktrees);
  const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
  assert.equal(exclude.split('\n').filter((l) => l === '.codewalk/worktree/').length, 1);
});

test('detach: HEAD mismatch reports probe_failure with pin unknown and keeps the directory', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const one = run(['ensure', '--detach', full], { cwd: repo });
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'second');
  git(one.json.path, 'checkout', '-q', '--detach', sha(repo));
  const snap = snapshot(one.json.path);
  const res = run(['ensure', '--detach', full], { cwd: repo });
  assertFail(res, 'probe_failure');
  assert.equal(res.json.pin, 'unknown');
  assert.deepEqual(snapshot(one.json.path), snap);
  assert.equal(git(one.json.path, 'rev-parse', 'HEAD'), sha(repo));
});

test('detach: failed probe-read reports probe_failure with pin unknown and keeps the directory', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const one = run(['ensure', '--detach', full], { cwd: repo });
  fs.rmSync(path.join(one.json.path, 'a.txt'));
  const res = run(['ensure', '--detach', full], { cwd: repo });
  assertFail(res, 'probe_failure');
  assert.equal(res.json.pin, 'unknown');
  assert.ok(fs.existsSync(one.json.path));
  assert.ok(listWorktrees(repo).includes(one.json.path));
});

test('detach: an unregistered directory at the path is probe_failure, never reused or deleted', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const short = git(repo, 'rev-parse', '--short', full);
  const target = path.join(repo, '.codewalk', 'worktree', `codewalk-${short}`);
  write(path.join(target, 'keep.txt'), 'mine\n');
  const res = run(['ensure', '--detach', full], { cwd: repo });
  assertFail(res, 'probe_failure');
  assert.equal(res.json.pin, 'unknown');
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'mine\n');
});

test('detach: generic creation failure (unknown commit) reports probe_failure with pin unknown', () => {
  const repo = makeRepo();
  const res = run(['ensure', '--detach', 'f'.repeat(40)], { cwd: repo });
  assertFail(res, 'probe_failure');
  assert.equal(res.json.pin, 'unknown');
  assert.deepEqual(listWorktrees(repo), [repo]);
});

test('detach: stale registration with the directory deleted is recovered, other registrations survive', () => {
  const repo = makeRepo();
  const full = sha(repo);
  const one = run(['ensure', '--detach', full], { cwd: repo });
  const unrelated = path.join(path.dirname(repo), 'unrelated-stale');
  git(repo, 'worktree', 'add', '-q', '-b', 'unrelated', unrelated);
  fs.rmSync(unrelated, { recursive: true });
  fs.rmSync(one.json.path, { recursive: true });
  const res = run(['ensure', '--detach', full], { cwd: repo });
  assertOk(res, 'recovered-stale');
  assert.equal(res.json.pin, full);
  assert.ok(fs.existsSync(path.join(one.json.path, 'a.txt')));
  assert.ok(git(repo, 'worktree', 'list', '--porcelain').includes(unrelated), 'global cleanup must never run');
});

test('detach exclude handling: missing trailing newline, line already present, missing parent directory', () => {
  const exclude = (repo) => path.join(repo, '.git', 'info', 'exclude');

  const noNewline = makeRepo();
  fs.writeFileSync(exclude(noNewline), 'foo');
  assertOk(run(['ensure', '--detach', sha(noNewline)], { cwd: noNewline }), 'created');
  assert.equal(fs.readFileSync(exclude(noNewline), 'utf8'), 'foo\n.codewalk/worktree/\n');

  const present = makeRepo();
  fs.writeFileSync(exclude(present), 'bar\n.codewalk/worktree/\nbaz');
  assertOk(run(['ensure', '--detach', sha(present)], { cwd: present }), 'created');
  assert.equal(fs.readFileSync(exclude(present), 'utf8'), 'bar\n.codewalk/worktree/\nbaz');

  const noDir = makeRepo();
  fs.rmSync(path.join(noDir, '.git', 'info'), { recursive: true });
  assertOk(run(['ensure', '--detach', sha(noDir)], { cwd: noDir }), 'created');
  assert.equal(fs.readFileSync(exclude(noDir), 'utf8'), '.codewalk/worktree/\n');

  const emptyFile = makeRepo();
  fs.writeFileSync(exclude(emptyFile), '');
  assertOk(run(['ensure', '--detach', sha(emptyFile)], { cwd: emptyFile }), 'created');
  assert.equal(fs.readFileSync(exclude(emptyFile), 'utf8'), '.codewalk/worktree/\n');
});

test('detach launched from a linked worktree stays inside that checkout', () => {
  const repo = makeRepo();
  const linked = run(['ensure', '--branch', 'wu/x'], { cwd: repo }).json.path;
  git(linked, 'commit', '-q', '--allow-empty', '-m', 'linked ahead');
  const full = sha(linked);
  const res = run(['ensure', '--detach', full], { cwd: linked });
  assertOk(res, 'created');
  assert.equal(path.dirname(path.dirname(res.json.path)), path.join(linked, '.codewalk'));
  assert.equal(res.json.pin, full);
  assert.equal(fs.existsSync(path.join(repo, '.codewalk')), false);
});

test('detach never reads or runs the setup config', () => {
  const repo = makeRepo();
  const marker = path.join(path.dirname(repo), 'setup-ran');
  write(path.join(repo, '.harness', 'worktree-setup.json'), JSON.stringify({ version: 1, setup: [`touch "${marker}"`], copy: [] }));
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo }), 'created');
  assert.equal(fs.existsSync(marker), false);
  // An unparseable config must not matter either, because it is never read.
  fs.writeFileSync(path.join(repo, '.harness', 'worktree-setup.json'), '{ not json');
  assertOk(run(['ensure', '--detach', sha(repo)], { cwd: repo }), 'reused');
});

test('branch-mode ensure never runs setup either', () => {
  const repo = makeRepo();
  const marker = path.join(path.dirname(repo), 'setup-ran');
  write(path.join(repo, '.harness', 'worktree-setup.json'), JSON.stringify({ version: 1, setup: [`touch "${marker}"`], copy: [] }));
  assertOk(run(['ensure', '--branch', 'wu/x'], { cwd: repo }), 'created');
  assert.equal(fs.existsSync(marker), false);
});

// ---------------------------------------------------------------------------
// Setup subcommand

function setupFixture(config) {
  const repo = makeRepo();
  const wt = run(['ensure', '--branch', 'wu/x'], { cwd: repo }).json.path;
  if (config !== undefined) {
    write(path.join(repo, '.harness', 'worktree-setup.json'), typeof config === 'string' ? config : JSON.stringify(config));
  }
  return { repo, wt };
}

test('setup runs commands in order inside the worktree, config read from the main checkout only', () => {
  const { repo, wt } = setupFixture({ version: 1, setup: ['echo one > order.txt', 'echo two >> order.txt', 'pwd -P > cwd.txt'], copy: [] });
  assert.equal(fs.existsSync(path.join(wt, '.harness', 'worktree-setup.json')), false);
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertOk(res);
  assert.equal(res.json.ran, 3);
  assert.equal(fs.readFileSync(path.join(wt, 'order.txt'), 'utf8'), 'one\ntwo\n');
  assert.equal(fs.readFileSync(path.join(wt, 'cwd.txt'), 'utf8').trim(), wt);
  assert.equal(fs.existsSync(path.join(repo, 'order.txt')), false);
});

test('setup output of child commands goes to stderr, stdout stays one JSON object', () => {
  const { repo, wt } = setupFixture({ setup: ['echo child-stdout-text'], copy: [] });
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertOk(res);
  assert.ok(!res.stdout.includes('child-stdout-text'));
  assert.ok(res.stderr.includes('child-stdout-text'));
});

test('setup accepts version 1 and works with a relative --worktree and a subdirectory cwd', () => {
  const { repo, wt } = setupFixture({ version: 1, setup: [], copy: [] });
  fs.mkdirSync(path.join(repo, 'sub'));
  const res = run(['setup', '--worktree', path.relative(path.join(repo, 'sub'), wt)], { cwd: path.join(repo, 'sub') });
  assertOk(res);
  assert.equal(res.json.ran, 0);
});

test('setup rejects version 2 (and other wrong versions) and executes nothing', () => {
  for (const version of [2, 0, '1', 1.5, null]) {
    const { repo, wt } = setupFixture({ version, setup: ['touch ran.txt'], copy: [{ path: 'a.txt' }] });
    fs.rmSync(path.join(wt, 'a.txt'));
    const res = run(['setup', '--worktree', wt], { cwd: repo });
    assertFail(res, 'config');
    assert.equal(fs.existsSync(path.join(wt, 'ran.txt')), false);
    assert.equal(fs.existsSync(path.join(wt, 'a.txt')), false);
  }
});

test('setup rejects unknown keys (top level and per copy entry) and executes nothing', () => {
  const cases = [
    { version: 1, setup: ['touch ran.txt'], env: { A: '1' } },
    { setup: ['touch ran.txt'], copy: [{ path: 'a.txt', mode: 'x' }] },
  ];
  for (const config of cases) {
    const { repo, wt } = setupFixture(config);
    assertFail(run(['setup', '--worktree', wt], { cwd: repo }), 'config');
    assert.equal(fs.existsSync(path.join(wt, 'ran.txt')), false);
  }
});

test('setup rejects absolute and parent-traversal copy paths and copies nothing', () => {
  for (const bad of ['/etc/hosts', '../outside.txt', 'a/../../outside.txt', 'a/..']) {
    const { repo, wt } = setupFixture({ setup: ['touch ran.txt'], copy: [{ path: 'a.txt' }, { path: bad }] });
    fs.rmSync(path.join(wt, 'a.txt'));
    const res = run(['setup', '--worktree', wt], { cwd: repo });
    assertFail(res, 'config');
    assert.ok(res.json.message.includes(bad));
    assert.equal(fs.existsSync(path.join(wt, 'ran.txt')), false);
    assert.equal(fs.existsSync(path.join(wt, 'a.txt')), false);
  }
});

test('setup rejects wrong field types and invalid JSON as config errors', () => {
  const bad = [
    '{ not json',
    '[]',
    'null',
    '{"setup": "echo hi"}',
    '{"setup": [1]}',
    '{"copy": {}}',
    '{"copy": ["a.txt"]}',
    '{"copy": [{"path": 3}]}',
    '{"copy": [{}]}',
    '{"copy": [{"path": "a.txt", "readonly": "yes"}]}',
  ];
  for (const text of bad) {
    const { repo, wt } = setupFixture(text);
    assertFail(run(['setup', '--worktree', wt], { cwd: repo }), 'config');
  }
});

test('setup with a missing copy source fails with setup_failed naming the path', () => {
  const { repo, wt } = setupFixture({ copy: [{ path: 'does/not/exist.txt' }] });
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertFail(res, 'setup_failed');
  assert.ok(res.json.message.includes('does/not/exist.txt'));
});

test('setup stops at the first failing command and names the step', () => {
  const { repo, wt } = setupFixture({ setup: ['touch first.txt', 'exit 3', 'touch third.txt'], copy: [{ path: 'a.txt' }] });
  fs.rmSync(path.join(wt, 'a.txt'));
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertFail(res, 'setup_failed');
  assert.ok(res.json.message.includes('setup[1]'));
  assert.ok(fs.existsSync(path.join(wt, 'first.txt')));
  assert.equal(fs.existsSync(path.join(wt, 'third.txt')), false);
  assert.equal(fs.existsSync(path.join(wt, 'a.txt')), false, 'copies must not run after a failed command');
});

test('setup copies files and directories, never symlinks mutable entries, and leaves the source independent', () => {
  const { repo, wt } = setupFixture({ copy: [{ path: '.env' }, { path: 'cache/deps', readonly: false }] });
  write(path.join(repo, '.env'), 'SECRET=1\n');
  write(path.join(repo, 'cache', 'deps', 'x', 'lib.js'), 'lib\n');
  write(path.join(repo, 'cache', 'deps', 'top.txt'), 'top\n');
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertOk(res);
  assert.deepEqual(res.json.copied, ['.env', 'cache/deps']);
  assert.deepEqual(res.json.symlinked, []);
  for (const rel of ['.env', 'cache/deps', 'cache/deps/x/lib.js']) {
    assert.equal(fs.lstatSync(path.join(wt, rel)).isSymbolicLink(), false, rel);
  }
  assert.equal(fs.readFileSync(path.join(wt, '.env'), 'utf8'), 'SECRET=1\n');
  assert.equal(fs.readFileSync(path.join(wt, 'cache', 'deps', 'x', 'lib.js'), 'utf8'), 'lib\n');
  assert.equal(fs.readFileSync(path.join(wt, 'cache', 'deps', 'top.txt'), 'utf8'), 'top\n');
  fs.appendFileSync(path.join(wt, '.env'), 'EXTRA=1\n');
  assert.equal(fs.readFileSync(path.join(repo, '.env'), 'utf8'), 'SECRET=1\n');
});

test('setup symlinks only entries marked readonly', () => {
  const { repo, wt } = setupFixture({ copy: [{ path: 'ro-data', readonly: true }, { path: 'rw-data' }, { path: 'cfg/ro.json', readonly: true }] });
  write(path.join(repo, 'ro-data', 'f.txt'), 'f\n');
  write(path.join(repo, 'rw-data', 'g.txt'), 'g\n');
  write(path.join(repo, 'cfg', 'ro.json'), '{}\n');
  const res = run(['setup', '--worktree', wt], { cwd: repo });
  assertOk(res);
  assert.deepEqual(res.json.symlinked, ['ro-data', 'cfg/ro.json']);
  assert.deepEqual(res.json.copied, ['rw-data']);
  assert.equal(fs.lstatSync(path.join(wt, 'ro-data')).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(path.join(wt, 'ro-data')), path.join(repo, 'ro-data'));
  assert.equal(fs.lstatSync(path.join(wt, 'cfg', 'ro.json')).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(path.join(wt, 'rw-data')).isSymbolicLink(), false);
  assert.equal(fs.lstatSync(path.join(wt, 'rw-data', 'g.txt')).isSymbolicLink(), false);
});

test('setup is idempotent: rerun converges to the same state', () => {
  const { repo, wt } = setupFixture({ setup: ['echo hi > setup-out.txt'], copy: [{ path: 'rw' }, { path: 'ro', readonly: true }, { path: '.env' }] });
  write(path.join(repo, 'rw', 'g.txt'), 'g\n');
  write(path.join(repo, 'ro', 'f.txt'), 'f\n');
  write(path.join(repo, '.env'), 'A=1\n');
  const first = run(['setup', '--worktree', wt], { cwd: repo });
  const state = () => [snapshot(wt).filter((l) => !l.startsWith('.git|')).map((l) => l.split('|').slice(0, 3).join('|')), fs.readlinkSync(path.join(wt, 'ro'))];
  const before = state();
  const second = run(['setup', '--worktree', wt], { cwd: repo });
  assertOk(first);
  assertOk(second);
  assert.deepEqual(second.json, first.json);
  assert.deepEqual(state(), before);
  assert.equal(fs.readFileSync(path.join(wt, 'rw', 'g.txt'), 'utf8'), 'g\n');
});

test('setup does not modify the config file', () => {
  const { repo, wt } = setupFixture({ version: 1, setup: ['echo hi'], copy: [{ path: 'a.txt' }] });
  const file = path.join(repo, '.harness', 'worktree-setup.json');
  const hash = () => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const before = hash();
  assertOk(run(['setup', '--worktree', wt], { cwd: repo }));
  assert.equal(hash(), before);
});

test('setup with a missing config or empty setup and copy is a successful no-op', () => {
  const missing = setupFixture();
  const r1 = run(['setup', '--worktree', missing.wt], { cwd: missing.repo });
  assertOk(r1, 'noop');
  const empty = setupFixture({ version: 1, setup: [], copy: [] });
  const r2 = run(['setup', '--worktree', empty.wt], { cwd: empty.repo });
  assertOk(r2);
  assert.equal(r2.json.ran, 0);
  assert.deepEqual(r2.json.copied, []);
  const bare = setupFixture({});
  assertOk(run(['setup', '--worktree', bare.wt], { cwd: bare.repo }));
});

test('setup refuses the main checkout, unregistered paths, and detached-HEAD worktrees, running nothing', () => {
  const repo = makeRepo();
  const marker = 'ran.txt';
  write(path.join(repo, '.harness', 'worktree-setup.json'), JSON.stringify({ setup: [`touch ${marker}`], copy: [] }));

  assertFail(run(['setup', '--worktree', repo], { cwd: repo }), 'usage');
  assert.equal(fs.existsSync(path.join(repo, marker)), false);

  const plain = path.join(tmpdir(), 'plain');
  fs.mkdirSync(plain);
  assertFail(run(['setup', '--worktree', plain], { cwd: repo }), 'usage');
  assert.equal(fs.existsSync(path.join(plain, marker)), false);

  const detached = path.join(path.dirname(repo), 'detached-wt');
  git(repo, 'worktree', 'add', '-q', '--detach', detached);
  assertFail(run(['setup', '--worktree', detached], { cwd: repo }), 'usage');
  assert.equal(fs.existsSync(path.join(detached, marker)), false);

  assertFail(run(['setup', '--worktree', path.join(path.dirname(repo), 'missing')], { cwd: repo }), 'usage');
});

test('setup refuses a detach-mode worktree under .codewalk/worktree/', () => {
  const repo = makeRepo();
  write(path.join(repo, '.harness', 'worktree-setup.json'), JSON.stringify({ setup: ['touch ran.txt'], copy: [] }));
  const d = run(['ensure', '--detach', sha(repo)], { cwd: repo });
  assertOk(d, 'created');
  const res = run(['setup', '--worktree', d.json.path], { cwd: repo });
  assertFail(res, 'usage');
  assert.equal(fs.existsSync(path.join(d.json.path, 'ran.txt')), false);
  // A branch-checkout worktree placed under .codewalk/worktree/ is refused too.
  const hand = path.join(repo, '.codewalk', 'worktree', 'hand-made');
  git(repo, 'worktree', 'add', '-q', '-b', 'hand', hand);
  assertFail(run(['setup', '--worktree', hand], { cwd: repo }), 'usage');
  assert.equal(fs.existsSync(path.join(hand, 'ran.txt')), false);
});

test('setup outside a git repository is not_a_git_repository', () => {
  const res = run(['setup', '--worktree', tmpdir()], { cwd: tmpdir() });
  assertFail(res, 'not_a_git_repository');
});
