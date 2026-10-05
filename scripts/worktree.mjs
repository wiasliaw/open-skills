// worktree.mjs - owns the dangerous git worktree mechanics for the
// use-worktree skill: create, reuse, reopen, recover, pin, and set up.
//
// Usage (always run through node, with the consumer project as the cwd):
//   node worktree.mjs ensure --branch <branch> [--id <id>]
//   node worktree.mjs ensure --detach <full-sha>
//   node worktree.mjs setup --worktree <path>
//   node worktree.mjs --help
//
// Requirements: Node.js >= 20, git, macOS or Linux. Only Node.js built-in
// modules are used; external programs are git, cp (setup copies), and the
// shell that runs project-declared setup commands.
//
// Configuration: .harness/config.json in the main checkout (optional for
// ensure; sections used: vcs.default_branch | vcs.remote,
// locations.worktrees default ".project/worktrees", and worktree_setup for
// setup). schema_version must have major version 1.
//
// Paths: branch worktrees live at <main>/<worktrees-location>/<id>; detach
// pins at <main>/<worktrees-location>/pin-<short-sha>. <id> is derived from
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
//   2   usage | config        usage error, or invalid .harness/config.json
//   3   collision             path or branch occupied by something else
//   4   stale_with_directory  registration unusable but its directory exists
//   5   probe_failure         detach worktree unusable / cannot be created
//   6   not_a_git_repository  no repository, bare repository, or no commits
//   7   node_version          Node.js older than 20
//   8   setup_failed          a setup command or copy failed
//   9   git_failed            any other git failure
//   10  branch_not_found      non-wu branch named by ensure does not exist
//   11  base_ref_missing      the configured base ref cannot be resolved
//
// Subcommands are idempotent. There is deliberately NO remove subcommand and
// the script never runs global `git worktree prune`; the only removals are
// exact-path stale-registration recoveries (directory already absent).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MIN_NODE_MAJOR = 20;
const CONFIG_REL = path.join('.harness', 'config.json');
const DEFAULT_LOCATION = '.project/worktrees';
const SUPPORTED_SCHEMA_MAJOR = 1;
const SCRIPT = 'worktree.mjs';

const EXIT = {
  ok: 0,
  internal: 1,
  usage: 2,
  config: 2,
  collision: 3,
  stale_with_directory: 4,
  probe_failure: 5,
  not_a_git_repository: 6,
  node_version: 7,
  setup_failed: 8,
  git_failed: 9,
  branch_not_found: 10,
  base_ref_missing: 11,
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
// config

function configError(message) {
  return new Fail('config', CONFIG_REL + ': ' + message);
}

// Returns the parsed config object or null when the file does not exist.
function readConfig(main) {
  let text;
  try {
    text = fs.readFileSync(path.join(main, CONFIG_REL), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw configError('cannot read: ' + e.message);
  }
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch (e) {
    throw configError('invalid JSON: ' + e.message);
  }
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) throw configError('top level must be an object');
  const v = cfg.schema_version;
  const m = typeof v === 'string' ? /^(\d+)\.(\d+)\.(\d+)$/.exec(v) : null;
  if (!m) throw configError('schema_version must be a semver string');
  if (Number(m[1]) !== SUPPORTED_SCHEMA_MAJOR) {
    throw configError('unsupported schema_version ' + v + ' (this script supports major ' + SUPPORTED_SCHEMA_MAJOR + ')');
  }
  return cfg;
}

// A repo-relative path with no traversal, no absolute form, no .git target.
function safeRelPath(p, what) {
  if (typeof p !== 'string' || p === '') throw configError(what + ' must be a non-empty string');
  if (p.indexOf('\0') !== -1) throw configError(what + ' contains a NUL byte');
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) throw configError(what + ' must be relative: ' + p);
  const parts = p.split(/[\\/]+/).filter(function (s) { return s !== '' && s !== '.'; });
  if (parts.length === 0) throw configError(what + ' resolves to the project root: ' + p);
  if (parts.indexOf('..') !== -1) throw configError(what + ' must not contain traversal: ' + p);
  if (parts[0] === '.git') throw configError(what + ' must not target .git: ' + p);
  return parts.join('/');
}

function worktreesLocation(cfg) {
  const loc = cfg && cfg.locations ? cfg.locations.worktrees : undefined;
  if (loc === undefined) return DEFAULT_LOCATION;
  return safeRelPath(loc, 'locations.worktrees');
}

function validateWorktreeSetup(cfg) {
  const s = cfg.worktree_setup;
  if (s === null || typeof s !== 'object' || Array.isArray(s)) {
    throw configError('worktree_setup section is required (write {"setup": [], "copy": []} when empty)');
  }
  if (!Array.isArray(s.setup) || s.setup.some(function (c) { return typeof c !== 'string' || c.trim() === ''; })) {
    throw configError('worktree_setup.setup must be an array of non-empty command strings');
  }
  if (!Array.isArray(s.copy)) throw configError('worktree_setup.copy must be an array');
  const copy = s.copy.map(function (item, i) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) throw configError('worktree_setup.copy[' + i + '] must be an object');
    if (typeof item.readonly !== 'boolean') throw configError('worktree_setup.copy[' + i + '].readonly must be a boolean');
    return { path: safeRelPath(item.path, 'worktree_setup.copy[' + i + '].path'), readonly: item.readonly };
  });
  return { setup: s.setup, copy: copy };
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

// Resolves the start point for a brand-new branch from the config's vcs section.
function resolveBase(main, cfg) {
  const vcs = (cfg && cfg.vcs) || {};
  const declared = typeof vcs.default_branch === 'string' && vcs.default_branch !== '' ? vcs.default_branch : null;
  if (declared === null) {
    const h = runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: main });
    if (!h.ok) throw new Fail('not_a_git_repository', 'main checkout has no commits: ' + main);
    return { sha: h.out, ref: 'HEAD' };
  }
  const remote = typeof vcs.remote === 'string' && vcs.remote !== '' ? vcs.remote : 'origin';
  const candidates = [declared, 'refs/heads/' + declared, 'refs/remotes/' + remote + '/' + declared];
  for (const c of candidates) {
    const r = runGit(['rev-parse', '--verify', '--quiet', c + '^{commit}'], { cwd: main });
    if (r.ok) return { sha: r.out, ref: declared };
  }
  throw new Fail('base_ref_missing', 'base ref "' + declared + '" declared in config vcs section cannot be resolved');
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
  const cfg = readConfig(main);
  const location = worktreesLocation(cfg);
  const target = path.join(main, location, id);
  const targetCanon = canon(target);
  const ref = 'refs/heads/' + branch;

  const existsLocal = branchExistsLocal(main, branch);
  let startPoint = null;
  if (!existsLocal) {
    if (wu) {
      startPoint = resolveBase(main, cfg).sha;
    } else {
      const remote = cfg && cfg.vcs && typeof cfg.vcs.remote === 'string' && cfg.vcs.remote ? cfg.vcs.remote : 'origin';
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
  const cfg = readConfig(main);
  const location = worktreesLocation(cfg);

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
// setup

function copyTree(src, dst, isDir) {
  const base = isDir ? ['-R'] : [];
  const from = isDir ? src + path.sep + '.' : src;
  const to = isDir ? dst + path.sep : dst;
  const attempts = [];
  if (process.platform === 'darwin') attempts.push(['-c'].concat(base));
  else if (process.platform === 'linux') attempts.push(['--reflink=auto'].concat(base));
  attempts.push(base);
  let last = '';
  for (const flags of attempts) {
    const r = spawnSync('cp', flags.concat([from, to]), { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (r.error) {
      last = r.error.message;
      continue;
    }
    if (r.status === 0) return null;
    last = (r.stderr || '').trim() || 'cp exited with ' + r.status;
  }
  return last;
}

function within(root, p) {
  const rel = path.relative(root, p);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function runSetup(worktreeArg) {
  if (typeof worktreeArg !== 'string' || worktreeArg === '') throw new Fail('usage', 'setup requires --worktree <path>');
  const found = resolveMain();
  const main = found.main;
  const mainCanon = canon(main);
  const wtPath = canon(path.resolve(process.cwd(), worktreeArg));

  if (wtPath === mainCanon) throw new Fail('usage', 'setup refuses the main checkout: ' + wtPath);
  const entry = listWorktrees(main).find(function (w) { return canon(w.path) === wtPath; });
  if (!entry) throw new Fail('usage', wtPath + ' is not a registered worktree of this repository');
  if (entry.detached || !entry.branch) throw new Fail('usage', 'setup refuses detached-HEAD worktrees (read-only pins never run project code): ' + wtPath);
  if (!pathExists(wtPath) || unusable(entry)) throw new Fail('usage', wtPath + ' is not a usable worktree directory');

  const cfg = readConfig(main);
  if (cfg === null) return ok({ action: 'noop', mode: 'setup', path: wtPath, ran: 0, copied: [], symlinked: [] });
  const decl = validateWorktreeSetup(cfg);

  // Validate and resolve every copy entry before running anything.
  for (const item of decl.copy) {
    let real;
    try {
      real = fs.realpathSync(path.join(main, item.path));
    } catch (e) {
      throw new Fail('setup_failed', 'copy source missing in main checkout: ' + item.path);
    }
    if (!within(mainCanon, real)) throw new Fail('setup_failed', 'copy source resolves outside the main checkout: ' + item.path);
  }

  let ran = 0;
  for (let i = 0; i < decl.setup.length; i++) {
    note('setup[' + i + ']: ' + decl.setup[i]);
    const r = spawnSync('sh', ['-c', decl.setup[i]], {
      cwd: wtPath,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }),
      stdio: ['ignore', 2, 2],
    });
    if (r.error || r.status !== 0) {
      const why = r.error ? r.error.message : r.signal ? 'killed by ' + r.signal : 'exit code ' + r.status;
      throw new Fail('setup_failed', 'setup[' + i + '] failed (' + why + '): ' + decl.setup[i]);
    }
    ran++;
  }

  const copied = [];
  const symlinked = [];
  for (const item of decl.copy) {
    const src = path.join(main, item.path);
    const dst = path.join(wtPath, item.path);
    const st = fs.lstatSync(src);
    // Guard the destination against escaping the worktree through a symlinked parent.
    const parentCanon = canon(path.dirname(dst));
    if (parentCanon !== wtPath && !within(wtPath, parentCanon)) {
      throw new Fail('setup_failed', 'copy ' + item.path + ': destination escapes the worktree');
    }
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
    } catch (e) {
      throw new Fail('setup_failed', 'copy ' + item.path + ': cannot create destination directory: ' + e.message);
    }
    if (item.readonly) {
      let dstStat = null;
      try { dstStat = fs.lstatSync(dst); } catch (e) { dstStat = null; }
      if (dstStat) {
        if (!dstStat.isSymbolicLink()) throw new Fail('setup_failed', 'symlink ' + item.path + ': destination exists and is not a symlink');
        fs.unlinkSync(dst);
      }
      try {
        fs.symlinkSync(src, dst);
      } catch (e) {
        throw new Fail('setup_failed', 'symlink ' + item.path + ' failed: ' + e.message);
      }
      symlinked.push(item.path);
      continue;
    }
    // Mutable entry: always a real copy, never a symlink.
    let dstStat = null;
    try { dstStat = fs.lstatSync(dst); } catch (e) { dstStat = null; }
    if (dstStat && dstStat.isSymbolicLink()) fs.unlinkSync(dst);
    const isDir = st.isDirectory();
    if (isDir) fs.mkdirSync(dst, { recursive: true });
    const problem = copyTree(src, dst, isDir);
    if (problem) throw new Fail('setup_failed', 'copy ' + item.path + ' failed: ' + problem);
    copied.push(item.path);
  }
  return ok({ action: 'configured', mode: 'setup', path: wtPath, ran: ran, copied: copied, symlinked: symlinked });
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

const USAGE = 'worktree.mjs ensure --branch <branch> [--id <id>] | ensure --detach <sha> | setup --worktree <path>';

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
  if (sub === 'setup') {
    const flags = parseFlags(argv.slice(1), ['--worktree']);
    return runSetup(flags['--worktree']);
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
