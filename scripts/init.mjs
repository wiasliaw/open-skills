// init.mjs - owns the config mechanics for the init skill: schema validation
// and atomic writing of .harness/worktree-setup.json and .harness/config.json.
// The agent drafts the JSON; this script is the only writer of the canonical
// files.
//
// Usage (always run through node, with the consumer project as the cwd):
//   node init.mjs validate --kind <worktree-setup|config> --from <draft.json>
//   node init.mjs write    --kind <worktree-setup|config> --from <draft.json>
//
// Requirements: Node.js >= 20; git is used only to resolve the repository
// root, with the working directory as the fallback when git is unavailable.
// Only Node.js built-in modules are used.
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "valid" | "written", ...result fields}
//   failure: {"ok": false, "error": "<code>", "message": "..."}
//
// Exit codes (consumers branch on the "error" code; the exit code is the
// coarse signal):
//   0  ok
//   1  internal      unexpected exception inside the script
//   2  usage         unknown subcommand, kind, or missing/duplicate flags
//   3  config        draft missing, unreadable, invalid JSON, or schema-invalid
//   4  write_failed  the canonical file could not be written
//   7  node_version  Node.js older than 20

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MIN_NODE_MAJOR = 20;

const EXIT = {
  internal: 1,
  usage: 2,
  config: 3,
  write_failed: 4,
  node_version: 7,
};

const KINDS = {
  'worktree-setup': { file: 'worktree-setup.json', validate: validateWorktreeSetup },
  'config': { file: 'config.json', validate: validateProjectConfig },
};

class Fail extends Error {
  constructor(error, message) {
    super(message);
    this.error = error;
  }
}

function note(text) {
  process.stderr.write('init.mjs: ' + text + '\n');
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exitCode = code;
}

function reportFailure(e) {
  note(e.error + ': ' + e.message);
  emit({ ok: false, error: e.error, message: e.message }, EXIT[e.error] === undefined ? EXIT.internal : EXIT[e.error]);
}

// ---------------------------------------------------------------------------
// schema validation

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkKeys(obj, allowed, where) {
  for (const key of Object.keys(obj)) {
    if (allowed.indexOf(key) === -1) throw new Fail('config', where + ' has unknown key "' + key + '"');
  }
}

// Identical rules to the consumer side in worktree.mjs runSetup/validateConfig.
function validateWorktreeSetup(cfg) {
  if (!isPlainObject(cfg)) throw new Fail('config', 'top level must be an object');
  checkKeys(cfg, ['version', 'setup', 'copy'], 'top level');
  if (cfg.version !== 1) {
    throw new Fail('config', 'unsupported version ' + JSON.stringify(cfg.version) + ' (supported: 1)');
  }
  const setup = 'setup' in cfg ? cfg.setup : [];
  if (!Array.isArray(setup) || !setup.every(function (c) { return typeof c === 'string' && c !== ''; })) {
    throw new Fail('config', '"setup" must be an array of non-empty strings');
  }
  const copy = 'copy' in cfg ? cfg.copy : [];
  if (!Array.isArray(copy)) throw new Fail('config', '"copy" must be an array');
  copy.forEach(function (item, i) {
    if (!isPlainObject(item)) throw new Fail('config', 'copy[' + i + '] must be an object');
    checkKeys(item, ['path', 'readonly'], 'copy[' + i + ']');
    if (typeof item.path !== 'string' || item.path === '') {
      throw new Fail('config', 'copy[' + i + '].path must be a non-empty string');
    }
    if ('readonly' in item && typeof item.readonly !== 'boolean') {
      throw new Fail('config', 'copy[' + i + '].readonly must be a boolean');
    }
    if (path.isAbsolute(item.path) || item.path.startsWith('/') || /^[A-Za-z]:/.test(item.path)) {
      throw new Fail('config', 'copy[' + i + '].path must be relative: ' + item.path);
    }
    if (item.path.split(/[\\/]/).indexOf('..') !== -1) {
      throw new Fail('config', 'copy[' + i + '].path must not contain "..": ' + item.path);
    }
  });
}

function validateProjectConfig(cfg) {
  if (!isPlainObject(cfg)) throw new Fail('config', 'top level must be an object');
  checkKeys(cfg, ['version', 'vcs', 'workflow'], 'top level');
  if (cfg.version !== 1) {
    throw new Fail('config', 'unsupported version ' + JSON.stringify(cfg.version) + ' (supported: 1)');
  }
  if (typeof cfg.vcs !== 'string' || cfg.vcs.trim() === '') {
    throw new Fail('config', '"vcs" must be a non-empty string');
  }
  if (!Array.isArray(cfg.workflow) || cfg.workflow.length === 0) {
    throw new Fail('config', '"workflow" must be a non-empty array');
  }
  cfg.workflow.forEach(function (row, i) {
    if (!isPlainObject(row)) throw new Fail('config', 'workflow[' + i + '] must be an object');
    checkKeys(row, ['phase', 'how', 'kind'], 'workflow[' + i + ']');
    for (const field of ['phase', 'how']) {
      if (typeof row[field] !== 'string' || row[field].trim() === '') {
        throw new Fail('config', 'workflow[' + i + '].' + field + ' must be a non-empty string');
      }
    }
    if (['command', 'manual', 'tbd'].indexOf(row.kind) === -1) {
      throw new Fail('config', 'workflow[' + i + '].kind must be "command", "manual", or "tbd"');
    }
  });
}

// ---------------------------------------------------------------------------
// repo root and filesystem

function resolveRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!r.error && r.status === 0) {
    const top = (r.stdout || '').replace(/\n$/, '');
    if (top !== '') return top;
  }
  note('no git repository detected; using the working directory as the root');
  return process.cwd();
}

function readDraft(from) {
  let text;
  try {
    text = fs.readFileSync(from, 'utf8');
  } catch (e) {
    throw new Fail('config', 'cannot read draft ' + from + ': ' + e.message);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Fail('config', from + ': invalid JSON: ' + e.message);
  }
}

function atomicWrite(target, draft) {
  const tmp = target + '.tmp-' + process.pid;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(draft, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw new Fail('write_failed', 'cannot write ' + target + ': ' + e.message);
  }
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
  if (sub !== 'validate' && sub !== 'write') {
    throw new Fail('usage', 'init.mjs validate|write --kind <worktree-setup|config> --from <draft.json>' +
      (sub ? ' (unknown subcommand: ' + sub + ')' : ''));
  }
  const flags = parseFlags(argv.slice(1), ['--kind', '--from']);
  const kind = flags['--kind'];
  const from = flags['--from'];
  if (!kind || !(kind in KINDS)) {
    throw new Fail('usage', '--kind must be one of: ' + Object.keys(KINDS).join(', ') + (kind ? ' (got: ' + kind + ')' : ''));
  }
  if (!from) throw new Fail('usage', '--from <draft.json> is required');

  const draft = readDraft(from);
  KINDS[kind].validate(draft);
  if (sub === 'validate') {
    return { ok: true, action: 'valid', kind: kind };
  }
  const target = path.join(resolveRoot(), '.harness', KINDS[kind].file);
  atomicWrite(target, draft);
  return { ok: true, action: 'written', kind: kind, path: target };
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
