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
// Only Node.js built-in modules and the sibling scripts/shared/ modules are
// used.
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
import { MIN_NODE_MAJOR, BASE_EXIT, HARNESS_DIR, WORKTREE_SETUP_FILE, PROJECT_CONFIG_FILE } from './shared/definitions.mjs';
import { Fail, makeReporter, parseFlags, isPlainObject, validateWorktreeSetup, checkNodeVersion } from './shared/lib.mjs';

const EXIT = Object.assign({}, BASE_EXIT, {
  config: 3,
  write_failed: 4,
});

const KINDS = {
  'worktree-setup': { file: WORKTREE_SETUP_FILE, validate: validateWorktreeSetup },
  'config': { file: PROJECT_CONFIG_FILE, validate: validateProjectConfig },
};

const { note, emit, reportFailure } = makeReporter('init.mjs', EXIT);

// ---------------------------------------------------------------------------
// schema validation (the worktree-setup schema is shared/lib.mjs's, the same
// validation the consumer worktree.mjs runs)

function checkKeys(obj, allowed, where) {
  for (const key of Object.keys(obj)) {
    if (allowed.indexOf(key) === -1) throw new Fail('config', where + ' has unknown key "' + key + '"');
  }
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
// dispatch

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
  const target = path.join(resolveRoot(), HARNESS_DIR, KINDS[kind].file);
  atomicWrite(target, draft);
  return { ok: true, action: 'written', kind: kind, path: target };
}

function main() {
  if (!checkNodeVersion(MIN_NODE_MAJOR, reportFailure)) return;
  try {
    emit(run(process.argv.slice(2)), 0);
  } catch (e) {
    if (e instanceof Fail) reportFailure(e);
    else reportFailure(new Fail('internal', e && e.stack ? e.stack : String(e)));
  }
}

main();
