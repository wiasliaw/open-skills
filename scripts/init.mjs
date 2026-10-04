#!/usr/bin/env node
// init.mjs - sole writer of the project config .harness/config.json.
// The bootstrap drafts the JSON; this script validates it against its declared
// schema version and writes it atomically. A hand-written config is a violation.
//
// Usage (run with the consumer project as the cwd, or pass --root):
//   node init.mjs validate --from <draft.json>
//   node init.mjs write    --from <draft.json> [--root <dir>]
//   node init.mjs read     [--section <name>] [--root <dir>]
//   node init.mjs --help
//
// Subcommands:
//   validate  check a draft against its schema version; writes nothing
//   write     validate, then atomically write <root>/.harness/config.json
//   read      validate the written config and print it (or one section)
//
// Requirements: Node.js >= 20, built-in modules only; git is used only to
// resolve the repository root (cwd is the fallback).
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "valid" | "written" | "read", ...}
//   failure: {"ok": false, "error": "<code>", "message": "..."}
//
// Exit codes (consumers branch on the "error" code):
//   0  ok
//   1  internal      unexpected exception inside the script
//   2  usage         unknown subcommand or missing/duplicate/unknown flags
//   3  config        draft/config missing, unreadable, invalid JSON, or schema-invalid
//   4  write_failed  the config file could not be written
//   7  node_version  Node.js older than 20

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SUPPORTED_VERSIONS = ['1.0.0'];
const CONFIG_REL = path.join('.harness', 'config.json');
const EXIT = { ok: 0, internal: 1, usage: 2, config: 3, write_failed: 4, node_version: 7 };
const SECTIONS = ['vcs', 'locations', 'graph', 'worktree_setup', 'memory'];

class Fail extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isCount = (v) => Number.isInteger(v) && v >= 0;

function checkKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new Fail('config', `${where} has unknown key "${k}"`);
  }
}

// A repo-relative path: non-empty, not absolute, no ".." segment.
function checkRelPath(v, where) {
  if (!isStr(v)) throw new Fail('config', `${where} must be a non-empty string`);
  if (path.isAbsolute(v) || /^[A-Za-z]:/.test(v)) throw new Fail('config', `${where} must be a relative path`);
  if (v.split(/[\\/]/).includes('..')) throw new Fail('config', `${where} must not contain ".." segments`);
}

function checkStringList(v, where) {
  if (!Array.isArray(v)) throw new Fail('config', `${where} must be an array`);
  v.forEach((s, i) => {
    if (!isStr(s)) throw new Fail('config', `${where}[${i}] must be a non-empty string`);
  });
}

// ---------------------------------------------------------------------------
// schema validation (schema_version 1.0.0)

function validateConfig(cfg) {
  if (!isObj(cfg)) throw new Fail('config', 'top level must be an object');
  if (!isStr(cfg.schema_version)) throw new Fail('config', '"schema_version" must be a non-empty string');
  if (!SUPPORTED_VERSIONS.includes(cfg.schema_version)) {
    throw new Fail('config', `unsupported schema_version ${JSON.stringify(cfg.schema_version)} (supported: ${SUPPORTED_VERSIONS.join(', ')})`);
  }
  checkKeys(cfg, ['schema_version', ...SECTIONS], 'top level');

  // vcs
  if (!isObj(cfg.vcs)) throw new Fail('config', '"vcs" section is required and must be an object');
  checkKeys(cfg.vcs, ['strategy', 'default_branch', 'remote'], 'vcs');
  if (!isStr(cfg.vcs.strategy)) throw new Fail('config', 'vcs.strategy must be a non-empty string');
  if (!isStr(cfg.vcs.default_branch)) throw new Fail('config', 'vcs.default_branch must be a non-empty string');
  if (cfg.vcs.remote !== undefined && !isStr(cfg.vcs.remote)) throw new Fail('config', 'vcs.remote must be a non-empty string');

  // locations
  if (!isObj(cfg.locations)) throw new Fail('config', '"locations" section is required and must be an object');
  checkKeys(cfg.locations, ['work_units', 'archive', 'worktrees'], 'locations');
  for (const k of ['work_units', 'archive', 'worktrees']) {
    if (cfg.locations[k] === undefined) throw new Fail('config', `locations.${k} is required`);
    checkRelPath(cfg.locations[k], `locations.${k}`);
  }

  // graph (optional: omitted means no graph, so no run)
  if (cfg.graph !== undefined) checkRelPath(cfg.graph, 'graph');

  // worktree_setup (required, explicit empty lists when nothing is needed)
  const ws = cfg.worktree_setup;
  if (!isObj(ws)) throw new Fail('config', '"worktree_setup" section is required (use empty lists when nothing is needed)');
  checkKeys(ws, ['setup', 'copy'], 'worktree_setup');
  if (ws.setup === undefined) throw new Fail('config', 'worktree_setup.setup is required (use [] when empty)');
  if (ws.copy === undefined) throw new Fail('config', 'worktree_setup.copy is required (use [] when empty)');
  checkStringList(ws.setup, 'worktree_setup.setup');
  if (!Array.isArray(ws.copy)) throw new Fail('config', 'worktree_setup.copy must be an array');
  ws.copy.forEach((e, i) => {
    const where = `worktree_setup.copy[${i}]`;
    if (!isObj(e)) throw new Fail('config', `${where} must be an object`);
    checkKeys(e, ['path', 'readonly'], where);
    checkRelPath(e.path, `${where}.path`);
    if (typeof e.readonly !== 'boolean') throw new Fail('config', `${where}.readonly must be a boolean`);
  });

  // memory (optional section)
  if (cfg.memory !== undefined) {
    const m = cfg.memory;
    if (!isObj(m)) throw new Fail('config', '"memory" must be an object');
    checkKeys(m, ['budgets', 'ledger', 'pending_delta_threshold', 'budget_pressure_threshold'], 'memory');
    if (!isObj(m.budgets)) throw new Fail('config', 'memory.budgets must be an object mapping document path to line budget');
    for (const [doc, n] of Object.entries(m.budgets)) {
      checkRelPath(doc, `memory.budgets key "${doc}"`);
      if (!Number.isInteger(n) || n <= 0) throw new Fail('config', `memory.budgets["${doc}"] must be a positive integer`);
    }
    if (m.ledger === undefined) throw new Fail('config', 'memory.ledger (ledger location) is required when the memory section is present');
    checkRelPath(m.ledger, 'memory.ledger');
    if (m.pending_delta_threshold !== undefined && !isCount(m.pending_delta_threshold)) {
      throw new Fail('config', 'memory.pending_delta_threshold must be a non-negative integer');
    }
    if (m.budget_pressure_threshold !== undefined) {
      const b = m.budget_pressure_threshold;
      if (typeof b !== 'number' || !(b > 0 && b <= 1)) {
        throw new Fail('config', 'memory.budget_pressure_threshold must be a number in (0, 1]');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// io

function parseFlags(args, allowed) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!allowed.includes(a)) throw new Fail('usage', `unknown or unexpected argument: ${a}`);
    if (a in out) throw new Fail('usage', `duplicate flag: ${a}`);
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Fail('usage', `${a} requires a value`);
    out[a] = v;
    i++;
  }
  return out;
}

function resolveRoot(flag) {
  if (flag) return path.resolve(flag);
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!r.error && r.status === 0) {
    const top = (r.stdout || '').replace(/\n$/, '');
    if (top !== '') return top;
  }
  process.stderr.write('init.mjs: no git repository detected; using the working directory as the root\n');
  return process.cwd();
}

function readJson(file, label) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { throw new Fail('config', `cannot read ${label} ${file}: ${e.message}`); }
  try { return JSON.parse(text); }
  catch (e) { throw new Fail('config', `${file}: invalid JSON: ${e.message}`); }
}

function atomicWrite(target, data) {
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw new Fail('write_failed', `cannot write ${target}: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------

const HELP = 'usage: init.mjs validate --from <draft.json> | write --from <draft.json> [--root <dir>] | read [--section <name>] [--root <dir>]';

function run(argv) {
  const sub = argv[0];
  if (sub === '--help' || sub === '-h' || sub === 'help') return { ok: true, action: 'help', usage: HELP, sections: SECTIONS };
  if (!['validate', 'write', 'read'].includes(sub)) {
    throw new Fail('usage', HELP + (sub ? ` (unknown subcommand: ${sub})` : ''));
  }
  const rest = argv.slice(1);
  if (sub === 'read') {
    const f = parseFlags(rest, ['--section', '--root']);
    const file = path.join(resolveRoot(f['--root']), CONFIG_REL);
    const cfg = readJson(file, 'config');
    validateConfig(cfg);
    const section = f['--section'];
    if (section === undefined) return { ok: true, action: 'read', path: file, config: cfg };
    if (!SECTIONS.includes(section)) throw new Fail('usage', `--section must be one of: ${SECTIONS.join(', ')}`);
    return { ok: true, action: 'read', path: file, schema_version: cfg.schema_version, section, value: cfg[section] === undefined ? null : cfg[section] };
  }
  const f = parseFlags(rest, sub === 'write' ? ['--from', '--root'] : ['--from']);
  if (!f['--from']) throw new Fail('usage', '--from <draft.json> is required');
  const draft = readJson(f['--from'], 'draft');
  validateConfig(draft);
  if (sub === 'validate') return { ok: true, action: 'valid', schema_version: draft.schema_version };
  const target = path.join(resolveRoot(f['--root']), CONFIG_REL);
  atomicWrite(target, draft);
  return { ok: true, action: 'written', path: target, schema_version: draft.schema_version };
}

function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    emit({ ok: false, error: 'node_version', message: `Node.js >= 20 required (found ${process.versions.node})` });
    process.exit(EXIT.node_version);
  }
  try {
    const result = run(process.argv.slice(2));
    emit(result);
    process.exit(EXIT.ok);
  } catch (e) {
    if (e instanceof Fail) {
      emit({ ok: false, error: e.code, message: e.message });
      process.exit(EXIT[e.code]);
    }
    emit({ ok: false, error: 'internal', message: String(e && e.message || e) });
    process.exit(EXIT.internal);
  }
}

main();
