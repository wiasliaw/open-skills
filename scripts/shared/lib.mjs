// lib.mjs - shared mechanics for the plugin-root scripts: the failure type,
// the stdout-JSON/stderr-diagnostics reporting contract, flag parsing, and
// the worktree-setup schema validation used by both its producer (init.mjs)
// and its consumer (worktree.mjs).
// Syntax is kept conservative so every consumer stays parseable on older
// Node versions up to its own version check.

import path from 'node:path';

// A failure with a stable machine-readable error code; `extra` fields are
// merged into the failure JSON.
export class Fail extends Error {
  constructor(error, message, extra) {
    super(message);
    this.error = error;
    this.extra = extra || {};
  }
}

// Builds the per-script reporting helpers around its name and EXIT table.
// Every script prints exactly one JSON object on stdout and diagnostics on
// stderr; the exit code is the coarse signal beside the "error" code.
export function makeReporter(scriptName, exitTable) {
  function note(text) {
    process.stderr.write(scriptName + ': ' + text + '\n');
  }
  function emit(obj, code) {
    process.stdout.write(JSON.stringify(obj) + '\n');
    process.exitCode = code;
  }
  function reportFailure(e) {
    note(e.error + ': ' + e.message);
    const body = Object.assign({ ok: false, error: e.error, message: e.message }, e.extra);
    emit(body, exitTable[e.error] === undefined ? exitTable.internal : exitTable[e.error]);
  }
  return { note: note, emit: emit, reportFailure: reportFailure };
}

export function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Strict --flag value pairs; every flag at most once, only allowed names.
export function parseFlags(args, allowed) {
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

// The worktree-setup schema, shared verbatim between producer and consumer:
// {"version": 1, "setup": [<string>...], "copy": [{"path", "readonly"?}...]}.
// Throws Fail('config', ...) with `label` prefixed to every message, and
// returns the normalized {setup, copy} form.
export function validateWorktreeSetup(cfg, label) {
  const prefix = label ? label + ': ' : '';
  function bad(message) {
    return new Fail('config', prefix + message);
  }
  if (!isPlainObject(cfg)) throw bad('top level must be an object');
  for (const key of Object.keys(cfg)) {
    if (['version', 'setup', 'copy'].indexOf(key) === -1) throw bad('unknown key "' + key + '"');
  }
  if ('version' in cfg && cfg.version !== 1) {
    throw bad('unsupported version ' + JSON.stringify(cfg.version) + ' (supported: 1)');
  }
  const setup = 'setup' in cfg ? cfg.setup : [];
  if (!Array.isArray(setup) || !setup.every(function (c) { return typeof c === 'string'; })) {
    throw bad('"setup" must be an array of strings');
  }
  const copy = 'copy' in cfg ? cfg.copy : [];
  if (!Array.isArray(copy)) throw bad('"copy" must be an array');
  const entries = copy.map(function (item, i) {
    if (!isPlainObject(item)) throw bad('copy[' + i + '] must be an object');
    for (const key of Object.keys(item)) {
      if (['path', 'readonly'].indexOf(key) === -1) throw bad('copy[' + i + '] has unknown key "' + key + '"');
    }
    if (typeof item.path !== 'string' || item.path === '') {
      throw bad('copy[' + i + '].path must be a non-empty string');
    }
    if ('readonly' in item && typeof item.readonly !== 'boolean') {
      throw bad('copy[' + i + '].readonly must be a boolean');
    }
    if (path.isAbsolute(item.path) || item.path.startsWith('/') || /^[A-Za-z]:/.test(item.path)) {
      throw bad('copy[' + i + '].path must be relative: ' + item.path);
    }
    if (item.path.split(/[\\/]/).indexOf('..') !== -1) {
      throw bad('copy[' + i + '].path must not contain "..": ' + item.path);
    }
    return { path: item.path, readonly: item.readonly === true };
  });
  return { setup: setup, copy: entries };
}

// Startup Node version gate; returns true when the version is acceptable,
// otherwise reports the failure and returns false.
export function checkNodeVersion(minMajor, reportFailure) {
  const major = parseInt(process.versions.node.split('.')[0], 10);
  if (major < minMajor) {
    reportFailure(new Fail('node_version', 'Node.js >= ' + minMajor + ' is required, found ' + process.versions.node));
    return false;
  }
  return true;
}
