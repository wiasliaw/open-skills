// worktree.mjs - owns the dangerous git worktree mechanics for the
// use-worktree skill: create, reuse, reopen, recover, and pin.
//
// Usage (always run through node, with the consumer project as the cwd):
//   node worktree.mjs ensure --branch <branch> [--id <id>]
//   node worktree.mjs ensure --detach <full-sha>
//   node worktree.mjs --help
//
// Requirements: Node.js >= 20, git, macOS or Linux. Only Node.js built-in
// modules are used; the only external program is git. No configuration file
// is read.
//
// Paths: branch worktrees live at <main>/.project/worktrees/<id>; detach
// pins at <main>/.project/worktrees/pin-<short-sha>. A new wu/<id> branch
// starts at the main checkout's HEAD. <id> is derived from
// a wu/<id> branch; a fix unit that passes an existing non-wu branch must also
// pass --id (the path is always derived from the unit's own id).
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "...", ...result fields}
//   failure: {"ok": false, "error": "<code>", "message": "..."} (detach mode
//            adds "pin": "unknown" to probe_failure / not_a_git_repository)
//
// Exit codes (consumers branch on the "error" code; the exit code is the
// coarse signal):
//   0   ok
//   1   internal              unexpected exception inside the script
//   2   usage                 usage error
//   3   collision             path or branch occupied by something else
//   4   stale_with_directory  registration unusable but its directory exists
//   5   probe_failure         detach worktree unusable / cannot be created
//   6   not_a_git_repository  no repository, bare repository, or no commits
//   7   node_version          Node.js older than 20
//   9   git_failed            any other git failure
//   10  branch_not_found      non-wu branch named by ensure does not exist
//
// Subcommands are idempotent. There is deliberately NO remove subcommand and
// the script never runs global `git worktree prune`; the only removals are
// exact-path stale-registration recoveries (directory already absent).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MIN_NODE_MAJOR = 20;
const DEFAULT_LOCATION = '.project/worktrees';
const SCRIPT = 'worktree.mjs';

const EXIT = {
  ok: 0,
  internal: 1,
  usage: 2,
  collision: 3,
  stale_with_directory: 4,
  probe_failure: 5,
  not_a_git_repository: 6,
  node_version: 7,
  git_failed: 9,
  branch_not_found: 10,
};

class Fail extends Error {
  constructor(error, message, extra) {
    super(message);
    this.error = error;
    this.extra = extra || {};
  }
}

function note(msg) {
  process.stderr.write(SCRIPT + ': ' + msg + '\n');
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exitCode = code;
}

function reportFailure(e) {
  note(e.error + ': ' + e.message);
  emit(Object.assign({ ok: false, error: e.error, message: e.message }, e.extra), EXIT[e.error] === undefined ? 1 : EXIT[e.error]);
}

// ---------------------------------------------------------------------------
// git and filesystem helpers

function runGit(args, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }, opts.env || {});
  const r = spawnSync('git', args, { cwd: opts.cwd, env: env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.error) throw new Fail('git_failed', 'cannot run git: ' + r.error.message);
  return { ok: r.status === 0, out: (r.stdout || '').replace(/\n$/, ''), raw: r.stdout || '', err: (r.stderr || '').trim() };
}

// Realpath for paths that may not exist yet.
function canon(p) {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch (e) {
    const parent = path.dirname(abs);
    if (parent === abs) return abs;
    return path.join(canon(parent), path.basename(abs));
  }
}

function pathExists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function parseWorktrees(text, nul) {
  const list = [];
  let cur = null;
  for (const tok of text.split(nul ? '\0' : '\n')) {
    if (tok === '') continue;
    if (tok.startsWith('worktree ')) {
      cur = { path: tok.slice(9), branch: null, detached: false, prunable: false, bare: false };
      list.push(cur);
    } else if (cur) {
      if (tok.startsWith('HEAD ')) cur.head = tok.slice(5);
      else if (tok.startsWith('branch ')) cur.branch = tok.slice(7);
      else if (tok === 'detached') cur.detached = true;
      else if (tok === 'bare') cur.bare = true;
      else if (tok === 'prunable' || tok.startsWith('prunable ')) cur.prunable = true;
    }
  }
  return list;
}

function listWorktrees(cwd) {
  let r = runGit(['worktree', 'list', '--porcelain', '-z'], { cwd: cwd });
  let nul = true;
  if (!r.ok) {
    r = runGit(['worktree', 'list', '--porcelain'], { cwd: cwd });
    nul = false;
  }
  if (!r.ok) throw new Fail('git_failed', 'git worktree list failed: ' + r.err);
  return parseWorktrees(r.raw, nul);
}

function unusable(w) {
  return w.prunable || !pathExists(path.join(w.path, '.git'));
}

// Main checkout via --git-common-dir (never --show-toplevel, which returns the
// linked worktree when run from inside one).
function resolveMain() {
  const r = runGit(['rev-parse', '--git-common-dir'], { cwd: process.cwd() });
  if (!r.ok) throw new Fail('not_a_git_repository', 'not inside a git repository: ' + r.err);
  const common = canon(path.resolve(process.cwd(), r.out));
  const bare = runGit(['--git-dir=' + common, 'config', '--bool', 'core.bare']);
  if (bare.ok && bare.out === 'true') throw new Fail('not_a_git_repository', 'bare repository has no main checkout');
  return { common: common, main: path.dirname(common) };
}

// Hooks disabled and LFS smudge off: creating a worktree never runs project code.
function addWorktree(main, args) {
  return runGit(['-c', 'core.hooksPath=/dev/null', 'worktree', 'add'].concat(args), { cwd: main, env: { GIT_LFS_SKIP_SMUDGE: '1' } });
}

// Removes exactly one registration, and only when its directory is absent.
function removeStaleRegistration(main, registeredPath) {
  if (pathExists(registeredPath)) {
    throw new Fail('stale_with_directory', 'refusing to remove registration whose directory exists: ' + registeredPath);
  }
  note('removing stale registration ' + registeredPath);
  const r = runGit(['worktree', 'remove', '--force', registeredPath], { cwd: main });
  if (!r.ok) throw new Fail('git_failed', 'cannot remove stale registration ' + registeredPath + ': ' + r.err);
}

function ok(fields) {
  return Object.assign({ ok: true }, fields);
}

// ---------------------------------------------------------------------------
// info/exclude

// Appends "/<location>/" to the repository's info/exclude once. Creates parent
// directories and guarantees a trailing newline. Never touches a tracked file.
function ensureExclude(main, location) {
  const line = '/' + location + '/';
  const r = runGit(['rev-parse', '--git-path', 'info/exclude'], { cwd: main });
  if (!r.ok) throw new Fail('git_failed', 'cannot locate info/exclude: ' + r.err);
  const file = path.resolve(main, r.out);
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw new Fail('git_failed', 'cannot read info/exclude: ' + e.message);
  }
  if (content.split('\n').indexOf(line) !== -1) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, (content !== '' && !content.endsWith('\n') ? '\n' : '') + line + '\n');
  } catch (e) {
    throw new Fail('git_failed', 'cannot update info/exclude: ' + e.message);
  }
  return true;
}

// ---------------------------------------------------------------------------
// ensure --branch

function branchExistsLocal(main, branch) {
  return runGit(['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], { cwd: main }).ok;
}

// Start point for a brand-new wu/<id> branch: the main checkout's HEAD.
function resolveBase(main) {
  const h = runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: main });
  if (!h.ok) throw new Fail('not_a_git_repository', 'main checkout has no commits: ' + main);
  return h.out;
}

function ensureBranch(branch, idFlag) {
  const wu = /^wu\/([a-z0-9][a-z0-9-]*)$/.exec(branch);
  let id = idFlag;
  if (id === undefined) {
    if (!wu) throw new Fail('usage', '--id <id> is required when --branch is not wu/<id>');
    id = wu[1];
  } else if (wu && wu[1] !== id) {
    throw new Fail('usage', '--id ' + id + ' does not match branch ' + branch);
  }
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw new Fail('usage', '<id> must match ^[a-z0-9][a-z0-9-]*$, got: ' + String(id));
  }
  if (!wu && /^(pin-)/.test(id)) throw new Fail('usage', 'id must not start with pin-: reserved for detach pins');
  if (branch.startsWith('-')) throw new Fail('usage', 'invalid branch name: ' + branch);
  // LC_ALL=C pins git's message so the stderr match below stays stable across locales.
  const refCheck = runGit(['check-ref-format', '--branch', branch], { env: { LC_ALL: 'C' } });
  if (!refCheck.ok) {
    if (/not a valid branch name/.test(refCheck.err)) throw new Fail('usage', 'invalid branch name: ' + branch);
    throw new Fail('git_failed', 'check-ref-format failed: ' + refCheck.err);
  }

  const found = resolveMain();
  const main = found.main;
  const location = DEFAULT_LOCATION;
  const target = path.join(main, location, id);
  const targetCanon = canon(target);
  const ref = 'refs/heads/' + branch;

  const existsLocal = branchExistsLocal(main, branch);
  let startPoint = null;
  if (!existsLocal) {
    if (wu) {
      startPoint = resolveBase(main);
    } else {
      const remote = 'origin';
      const rr = runGit(['rev-parse', '--verify', '--quiet', 'refs/remotes/' + remote + '/' + branch + '^{commit}'], { cwd: main });
      if (!rr.ok) throw new Fail('branch_not_found', 'branch does not exist locally or on ' + remote + ': ' + branch);
      startPoint = rr.out;
    }
  }

  const list = listWorktrees(main);
  const byPath = list.find(function (w) { return canon(w.path) === targetCanon; });
  const byBranch = list.find(function (w) { return w.branch === ref; });
  const staleRemovals = [];

  if (byPath) {
    if (pathExists(byPath.path)) {
      if (byPath.branch !== ref) {
        throw new Fail('collision', targetCanon + ' is a worktree on ' + (byPath.branch || 'a detached HEAD') + ', not ' + branch);
      }
      if (unusable(byPath)) {
        throw new Fail('stale_with_directory', 'registration for ' + targetCanon + ' is unusable but the directory exists');
      }
      ensureExclude(main, location);
      return ok({ action: 'reused', mode: 'branch', branch: branch, id: id, path: target });
    }
    staleRemovals.push(byPath.path);
  } else if (pathExists(target)) {
    throw new Fail('collision', target + ' exists but is not a registered worktree of this repository');
  }

  if (byBranch && byBranch !== byPath) {
    if (pathExists(byBranch.path)) {
      if (unusable(byBranch)) {
        throw new Fail('stale_with_directory', 'registration for ' + branch + ' at ' + byBranch.path + ' is unusable but the directory exists');
      }
      throw new Fail('collision', branch + ' is already checked out in ' + byBranch.path);
    }
    staleRemovals.push(byBranch.path);
  }

  ensureExclude(main, location);
  for (const p of staleRemovals) removeStaleRegistration(main, p);

  const args = existsLocal ? [target, branch] : ['-b', branch, target, startPoint];
  const r = addWorktree(main, args);
  if (!r.ok) throw new Fail('git_failed', 'git worktree add failed: ' + r.err);
  const action = staleRemovals.length > 0 ? 'recovered-stale' : existsLocal ? 'reopened' : 'created';
  return ok({ action: action, mode: 'branch', branch: branch, id: id, path: target });
}

// ---------------------------------------------------------------------------
// ensure --detach

// Reads the first byte of one tracked regular file inside the worktree.
function probeRead(worktree) {
  const r = runGit(['ls-files', '-s', '-z'], { cwd: worktree });
  if (!r.ok) return 'git ls-files failed: ' + r.err;
  for (const entry of r.raw.split('\0')) {
    const m = /^(100644|100755) [0-9a-f]+ \d\t([\s\S]+)$/.exec(entry);
    if (!m) continue;
    let fd = null;
    try {
      fd = fs.openSync(path.join(worktree, m[2]), 'r');
      fs.readSync(fd, Buffer.alloc(1), 0, 1, 0);
    } catch (e) {
      return 'cannot read tracked file ' + m[2] + ': ' + e.message;
    } finally {
      if (fd !== null) fs.closeSync(fd);
    }
    return null;
  }
  return null;
}

function ensureDetach(sha) {
  if (typeof sha !== 'string' || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) {
    throw new Fail('usage', '--detach requires a full lowercase commit SHA, got: ' + String(sha));
  }
  const found = resolveMain();
  const main = found.main;
  if (!runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: main }).ok) {
    throw new Fail('not_a_git_repository', 'repository has no commits');
  }
  if (!runGit(['cat-file', '-e', sha + '^{commit}'], { cwd: main }).ok) {
    throw new Fail('probe_failure', 'commit not found in repository: ' + sha);
  }
  const location = DEFAULT_LOCATION;

  const short = runGit(['rev-parse', '--short', sha], { cwd: main });
  const shortSha = short.ok && short.out ? short.out : sha.slice(0, 7);
  const target = path.join(main, location, 'pin-' + shortSha);
  const targetCanon = canon(target);

  const entry = listWorktrees(main).find(function (w) { return canon(w.path) === targetCanon; });
  let action = 'created';

  if (pathExists(target)) {
    if (!entry) throw new Fail('probe_failure', target + ' exists but is not a registered worktree; not touching it');
    if (unusable(entry)) throw new Fail('probe_failure', target + ' is registered but unusable; not touching it');
    const head = runGit(['rev-parse', 'HEAD'], { cwd: target });
    if (!head.ok || head.out !== sha) {
      throw new Fail('probe_failure', target + ' has HEAD ' + (head.out || 'unknown') + ', expected ' + sha + '; not touching it');
    }
    ensureExclude(main, location);
    action = 'reused';
  } else {
    ensureExclude(main, location);
    if (entry) {
      try {
        removeStaleRegistration(main, entry.path);
      } catch (e) {
        if (e instanceof Fail) throw new Fail('probe_failure', e.message);
        throw e;
      }
      action = 'recovered-stale';
    }
    const r = addWorktree(main, ['--detach', target, sha]);
    if (!r.ok) throw new Fail('probe_failure', 'git worktree add failed: ' + r.err);
  }

  const problem = probeRead(target);
  if (problem) throw new Fail('probe_failure', problem);
  return ok({ action: action, mode: 'detach', path: target, pin: sha });
}

// ---------------------------------------------------------------------------
// argument parsing and dispatch

function parseFlags(args, allowed) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (allowed.indexOf(a) === -1) throw new Fail('usage', 'unknown argument: ' + a);
    if (a in flags) throw new Fail('usage', 'duplicate flag: ' + a);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Fail('usage', a + ' requires a value');
    flags[a] = v;
    i++;
  }
  return flags;
}

const USAGE = 'worktree.mjs ensure --branch <branch> [--id <id>] | ensure --detach <sha>';

function run(argv) {
  const sub = argv[0];
  if (sub === '--help' || sub === '-h') return ok({ action: 'help', usage: USAGE });
  if (sub === 'ensure') {
    const flags = parseFlags(argv.slice(1), ['--branch', '--detach', '--id']);
    const hasBranch = '--branch' in flags;
    const hasDetach = '--detach' in flags;
    if (hasBranch === hasDetach) throw new Fail('usage', 'ensure requires exactly one of --branch <branch> or --detach <sha>');
    if (hasDetach) {
      if ('--id' in flags) throw new Fail('usage', '--id applies only to --branch');
      try {
        return ensureDetach(flags['--detach']);
      } catch (e) {
        if (e instanceof Fail && (e.error === 'probe_failure' || e.error === 'not_a_git_repository')) {
          e.extra = Object.assign({ pin: 'unknown' }, e.extra);
        }
        throw e;
      }
    }
    return ensureBranch(flags['--branch'], flags['--id']);
  }
  throw new Fail('usage', USAGE + (sub ? ' (unknown subcommand: ' + sub + ')' : ''));
}

function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    reportFailure(new Fail('node_version', 'Node.js >= ' + MIN_NODE_MAJOR + ' required, found ' + process.versions.node));
    return;
  }
  try {
    emit(run(process.argv.slice(2)), 0);
  } catch (e) {
    if (e instanceof Fail) reportFailure(e);
    else reportFailure(new Fail('internal', e && e.stack ? e.stack : String(e)));
  }
}

main();
