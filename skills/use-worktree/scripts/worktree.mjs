// worktree.mjs - owns the dangerous git worktree mechanics for the Build node
// (via the use-worktree skill) and for the codewalk skill (detach mode).
//
// Usage (always run through node, with the consumer project as the cwd):
//   node worktree.mjs ensure --branch wu/<id>
//   node worktree.mjs ensure --detach <full-sha>
//   node worktree.mjs setup --worktree <path>
//
// Requirements: Node.js >= 20, git, macOS or Linux (Windows is unverified).
// Only Node.js built-in modules are used; the only external programs are git,
// cp (setup copies), and the shell that runs user-declared setup commands.
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "...", ...result fields}
//   failure: {"ok": false, "error": "<code>", "message": "..."} (detach mode
//            adds "pin": "unknown" to probe_failure / not_a_git_repository)
//
// Exit codes (consumers branch on the "error" code; the exit code is the
// coarse signal):
//   0  ok
//   1  internal              unexpected exception inside the script
//   2  usage | config        usage error, or invalid .harness/worktree-setup.json
//   3  collision             path or branch occupied by something else
//   4  stale_with_directory  registration unusable but its directory exists
//   5  probe_failure         detach worktree unusable / cannot be created
//   6  not_a_git_repository  no repository, bare repository, or no commits
//   7  node_version          Node.js older than 20
//   8  setup_failed          a setup command or copy failed
//   9  git_failed            any other git failure in branch mode
//
// There is deliberately no remove subcommand. The only removals are the
// exact-path stale-registration recoveries; registrations are never cleaned
// up globally.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MIN_NODE_MAJOR = 20;

const EXIT = {
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
};

const EXCLUDE_LINE = '.codewalk/worktree/';
const CONFIG_REL = path.join('.harness', 'worktree-setup.json');

class Fail extends Error {
  constructor(error, message, extra) {
    super(message);
    this.error = error;
    this.extra = extra || {};
  }
}

function note(text) {
  process.stderr.write('worktree.mjs: ' + text + '\n');
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exitCode = code;
}

function reportFailure(e) {
  note(e.error + ': ' + e.message);
  const body = Object.assign({ ok: false, error: e.error, message: e.message }, e.extra);
  emit(body, EXIT[e.error] === undefined ? EXIT.internal : EXIT[e.error]);
}

// ---------------------------------------------------------------------------
// git and filesystem helpers

function runGit(args, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }, opts.env || {});
  const r = spawnSync('git', args, {
    cwd: opts.cwd,
    env: env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) {
    throw new Fail('git_failed', 'cannot run git: ' + r.error.message);
  }
  return {
    ok: r.status === 0,
    out: (r.stdout || '').replace(/\n$/, ''),
    raw: r.stdout || '',
    err: (r.stderr || '').trim(),
  };
}

// Realpath for paths that may not exist yet: resolve the deepest existing
// ancestor and re-append the missing tail.
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
  const tokens = text.split(nul ? '\0' : '\n');
  const list = [];
  let cur = null;
  for (const tok of tokens) {
    if (tok === '') continue;
    if (tok.startsWith('worktree ')) {
      cur = { path: tok.slice('worktree '.length), branch: null, detached: false, prunable: false, bare: false };
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

// A registration whose directory exists but cannot be used as a worktree.
function unusable(w) {
  return w.prunable || !pathExists(path.join(w.path, '.git'));
}

// Resolve the main checkout from the cwd through --git-common-dir. Never
// --show-toplevel: from inside a linked worktree that returns the worktree.
function resolveMain() {
  const r = runGit(['rev-parse', '--git-common-dir'], { cwd: process.cwd() });
  if (!r.ok) {
    throw new Fail('not_a_git_repository', 'not inside a git repository: ' + r.err);
  }
  const common = canon(path.resolve(process.cwd(), r.out));
  const bare = runGit(['--git-dir=' + common, 'config', '--bool', 'core.bare']);
  if (bare.ok && bare.out === 'true') {
    throw new Fail('not_a_git_repository', 'bare repository has no main checkout');
  }
  return { common: common, main: path.dirname(common) };
}

// Hooks disabled and LFS smudge off: creating a worktree never executes
// project code.
function addWorktree(main, args) {
  return runGit(['-c', 'core.hooksPath=/dev/null', 'worktree', 'add'].concat(args), {
    cwd: main,
    env: { GIT_LFS_SKIP_SMUDGE: '1' },
  });
}

// Removes exactly one registration, and only when its directory is absent.
function removeStaleRegistration(main, registeredPath) {
  if (pathExists(registeredPath)) {
    throw new Fail('stale_with_directory', 'refusing to remove registration whose directory exists: ' + registeredPath);
  }
  note('removing stale registration ' + registeredPath);
  const r = runGit(['worktree', 'remove', '--force', registeredPath], { cwd: main });
  if (!r.ok) {
    throw new Fail('git_failed', 'cannot remove stale registration ' + registeredPath + ': ' + r.err);
  }
}

function ok(fields) {
  return Object.assign({ ok: true }, fields);
}

// ---------------------------------------------------------------------------
// ensure --branch

function ensureBranch(branch) {
  const m = /^wu\/([a-z0-9][a-z0-9-]*)$/.exec(branch);
  if (!m) {
    throw new Fail('usage', '--branch must be wu/<id> with <id> matching ^[a-z0-9][a-z0-9-]*$, got: ' + branch);
  }
  const id = m[1];
  const found = resolveMain();
  const main = found.main;
  const target = path.join(path.dirname(main), path.basename(main) + '.worktrees', 'wu', id);
  const targetCanon = canon(target);
  const ref = 'refs/heads/' + branch;

  const branchExists = runGit(['show-ref', '--verify', '--quiet', ref], { cwd: main }).ok;
  let headSha = null;
  if (!branchExists) {
    const h = runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: main });
    if (!h.ok) throw new Fail('not_a_git_repository', 'main checkout has no commits: ' + main);
    headSha = h.out;
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
      return ok({ action: 'reused', mode: 'branch', branch: branch, path: target });
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

  for (const p of staleRemovals) removeStaleRegistration(main, p);

  const args = branchExists ? [target, branch] : ['-b', branch, target, headSha];
  const r = addWorktree(main, args);
  if (!r.ok) {
    throw new Fail('git_failed', 'git worktree add failed: ' + r.err);
  }
  const action = staleRemovals.length > 0 ? 'recovered-stale' : branchExists ? 'reopened' : 'created';
  return ok({ action: action, mode: 'branch', branch: branch, path: target });
}

// ---------------------------------------------------------------------------
// ensure --detach

function appendExclude(toplevel) {
  const r = runGit(['rev-parse', '--git-path', 'info/exclude'], { cwd: toplevel });
  if (!r.ok) throw new Fail('probe_failure', 'cannot locate info/exclude: ' + r.err);
  const file = path.resolve(toplevel, r.out);
  let content = '';
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (content.split('\n').indexOf(EXCLUDE_LINE) !== -1) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const prefix = content !== '' && !content.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(file, prefix + EXCLUDE_LINE + '\n');
}

// Reads the first byte of one tracked regular file inside the worktree.
function probeRead(worktree) {
  const r = runGit(['ls-files', '-s', '-z'], { cwd: worktree });
  if (!r.ok) return 'git ls-files failed: ' + r.err;
  const entries = r.raw.split('\0');
  for (const entry of entries) {
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
  if (!/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) {
    throw new Fail('usage', '--detach requires a full lowercase commit SHA, got: ' + sha);
  }
  const top = runGit(['rev-parse', '--show-toplevel'], { cwd: process.cwd() });
  if (!top.ok) {
    throw new Fail('not_a_git_repository', 'not inside a git work tree: ' + top.err);
  }
  const toplevel = top.out;
  if (!runGit(['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], { cwd: toplevel }).ok) {
    throw new Fail('not_a_git_repository', 'repository has no commits');
  }

  const short = runGit(['rev-parse', '--short', sha], { cwd: toplevel });
  const shortSha = short.ok && short.out ? short.out : sha.slice(0, 7);
  const target = path.join(toplevel, '.codewalk', 'worktree', 'codewalk-' + shortSha);
  const targetCanon = canon(target);

  const list = listWorktrees(toplevel);
  const entry = list.find(function (w) { return canon(w.path) === targetCanon; });
  let action = 'created';

  if (pathExists(target)) {
    if (!entry) {
      throw new Fail('probe_failure', target + ' exists but is not a registered worktree; not touching it');
    }
    if (unusable(entry)) {
      throw new Fail('probe_failure', target + ' is registered but unusable; not touching it');
    }
    const head = runGit(['rev-parse', 'HEAD'], { cwd: target });
    if (!head.ok || head.out !== sha) {
      throw new Fail('probe_failure', target + ' has HEAD ' + (head.out || 'unknown') + ', expected ' + sha + '; not touching it');
    }
    action = 'reused';
  } else {
    if (entry) {
      removeStaleRegistrationForDetach(toplevel, entry.path);
      action = 'recovered-stale';
    }
    const r = addWorktree(toplevel, ['--detach', target, sha]);
    if (!r.ok) {
      throw new Fail('probe_failure', 'git worktree add failed: ' + r.err);
    }
  }

  try {
    appendExclude(toplevel);
  } catch (e) {
    if (e instanceof Fail) throw e;
    throw new Fail('probe_failure', 'cannot update info/exclude: ' + e.message);
  }

  const problem = probeRead(target);
  if (problem) throw new Fail('probe_failure', problem);

  return ok({ action: action, mode: 'detach', path: target, pin: sha });
}

function removeStaleRegistrationForDetach(toplevel, registeredPath) {
  try {
    removeStaleRegistration(toplevel, registeredPath);
  } catch (e) {
    if (e instanceof Fail) throw new Fail('probe_failure', e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// setup

const ALLOWED_TOP = ['version', 'setup', 'copy'];
const ALLOWED_COPY = ['path', 'readonly'];

function configError(message) {
  return new Fail('config', CONFIG_REL + ': ' + message);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validateConfig(text) {
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch (e) {
    throw configError('invalid JSON: ' + e.message);
  }
  if (!isPlainObject(cfg)) throw configError('top level must be an object');
  for (const key of Object.keys(cfg)) {
    if (ALLOWED_TOP.indexOf(key) === -1) throw configError('unknown key "' + key + '"');
  }
  if ('version' in cfg && cfg.version !== 1) {
    throw configError('unsupported version ' + JSON.stringify(cfg.version) + ' (supported: 1)');
  }
  const setup = 'setup' in cfg ? cfg.setup : [];
  if (!Array.isArray(setup) || !setup.every(function (c) { return typeof c === 'string'; })) {
    throw configError('"setup" must be an array of strings');
  }
  const copy = 'copy' in cfg ? cfg.copy : [];
  if (!Array.isArray(copy)) throw configError('"copy" must be an array');
  const entries = copy.map(function (item, i) {
    if (!isPlainObject(item)) throw configError('copy[' + i + '] must be an object');
    for (const key of Object.keys(item)) {
      if (ALLOWED_COPY.indexOf(key) === -1) throw configError('copy[' + i + '] has unknown key "' + key + '"');
    }
    if (typeof item.path !== 'string' || item.path === '') {
      throw configError('copy[' + i + '].path must be a non-empty string');
    }
    if ('readonly' in item && typeof item.readonly !== 'boolean') {
      throw configError('copy[' + i + '].readonly must be a boolean');
    }
    if (path.isAbsolute(item.path) || item.path.startsWith('/') || /^[A-Za-z]:/.test(item.path)) {
      throw configError('copy[' + i + '].path must be relative: ' + item.path);
    }
    if (item.path.split(/[\\/]/).indexOf('..') !== -1) {
      throw configError('copy[' + i + '].path must not contain "..": ' + item.path);
    }
    return { path: item.path, readonly: item.readonly === true };
  });
  return { setup: setup, copy: entries };
}

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

function runSetup(worktreeArg) {
  if (typeof worktreeArg !== 'string' || worktreeArg === '') {
    throw new Fail('usage', 'setup requires --worktree <path>');
  }
  const found = resolveMain();
  const main = found.main;
  const wtPath = canon(path.resolve(process.cwd(), worktreeArg));

  const marker = path.sep + '.codewalk' + path.sep + 'worktree' + path.sep;
  if ((wtPath + path.sep).indexOf(marker) !== -1) {
    throw new Fail('usage', 'setup refuses detach-mode worktrees under .codewalk/worktree/: ' + wtPath);
  }
  if (wtPath === canon(main)) {
    throw new Fail('usage', 'setup refuses the main checkout: ' + wtPath);
  }
  const entry = listWorktrees(main).find(function (w) { return canon(w.path) === wtPath; });
  if (!entry) {
    throw new Fail('usage', wtPath + ' is not a registered worktree of this repository');
  }
  if (entry.detached || !entry.branch) {
    throw new Fail('usage', 'setup refuses detached-HEAD worktrees: ' + wtPath);
  }
  if (!pathExists(wtPath) || unusable(entry)) {
    throw new Fail('usage', wtPath + ' is not a usable worktree directory');
  }

  const configPath = path.join(main, CONFIG_REL);
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return ok({ action: 'noop', mode: 'setup', path: wtPath, ran: 0, copied: [], symlinked: [] });
    }
    throw configError('cannot read: ' + e.message);
  }
  const cfg = validateConfig(text);

  let ran = 0;
  for (let i = 0; i < cfg.setup.length; i++) {
    const cmd = cfg.setup[i];
    note('setup[' + i + ']: ' + cmd);
    const r = spawnSync('sh', ['-c', cmd], {
      cwd: wtPath,
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }),
      stdio: ['ignore', 2, 2],
    });
    if (r.error || r.status !== 0) {
      const why = r.error ? r.error.message : r.signal ? 'killed by ' + r.signal : 'exit code ' + r.status;
      throw new Fail('setup_failed', 'setup[' + i + '] failed (' + why + '): ' + cmd);
    }
    ran++;
  }

  const copied = [];
  const symlinked = [];
  for (const item of cfg.copy) {
    const src = path.join(main, item.path);
    const dst = path.join(wtPath, item.path);
    let st;
    try {
      st = fs.lstatSync(src);
    } catch (e) {
      throw new Fail('setup_failed', 'copy source missing in main checkout: ' + item.path);
    }
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
    } catch (e) {
      throw new Fail('setup_failed', 'copy ' + item.path + ': cannot create destination directory: ' + e.message);
    }
    if (item.readonly) {
      let dstStat = null;
      try {
        dstStat = fs.lstatSync(dst);
      } catch (e) {
        dstStat = null;
      }
      if (dstStat) {
        if (!dstStat.isSymbolicLink()) {
          throw new Fail('setup_failed', 'symlink ' + item.path + ': destination exists and is not a symlink');
        }
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
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    if (allowed.indexOf(name) === -1) throw new Fail('usage', 'unknown argument: ' + name);
    if (i + 1 >= args.length) throw new Fail('usage', name + ' requires a value');
    if (name in flags) throw new Fail('usage', name + ' given more than once');
    flags[name] = args[i + 1];
  }
  return flags;
}

function run(argv) {
  const sub = argv[0];
  if (sub === 'ensure') {
    const flags = parseFlags(argv.slice(1), ['--branch', '--detach']);
    const hasBranch = '--branch' in flags;
    const hasDetach = '--detach' in flags;
    if (hasBranch === hasDetach) {
      throw new Fail('usage', 'ensure requires exactly one of --branch wu/<id> or --detach <sha>');
    }
    return hasBranch ? ensureBranch(flags['--branch']) : detachWithPin(flags['--detach']);
  }
  if (sub === 'setup') {
    const flags = parseFlags(argv.slice(1), ['--worktree']);
    return runSetup(flags['--worktree']);
  }
  throw new Fail('usage', 'worktree.mjs ensure --branch wu/<id> | ensure --detach <sha> | setup --worktree <path>' +
    (sub ? ' (unknown subcommand: ' + sub + ')' : ''));
}

function detachWithPin(sha) {
  try {
    return ensureDetach(sha);
  } catch (e) {
    if (e instanceof Fail && (e.error === 'probe_failure' || e.error === 'not_a_git_repository')) {
      e.extra = Object.assign({ pin: 'unknown' }, e.extra);
    }
    throw e;
  }
}

function main() {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < MIN_NODE_MAJOR) {
    reportFailure(new Fail('node_version', 'Node.js >= ' + MIN_NODE_MAJOR + ' is required, found ' + process.versions.node));
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
