#!/usr/bin/env node
// memory.mjs - deterministic mechanics of the long-term memory layer.
//
// Zero-dependency Node.js (>= 20), built-in modules only. Self-contained.
//
// Usage:
//   node memory.mjs index    [--all] [--root <dir>]
//   node memory.mjs validate [--drafts <unit-folder>] [--root <dir>]
//   node memory.mjs check    [--root <dir>]
//   node memory.mjs --help
//
// Commands:
//   index     Generate the index from delta-entry frontmatter (id, title, date,
//             type, status, relations). Default view: current-truth documents
//             plus pending deltas; --all adds applied and rejected entries.
//             The index is returned in the JSON result (field "markdown") and
//             is never written to disk by this script.
//   validate  Validate delta-entry frontmatter shape (required fields, id
//             grammar <unit-id>.<node-id>.<n>, status values, relation fields
//             referencing existing entries) and report current-truth budget
//             breaches. With --drafts <unit-folder>, the unit's draft deltas
//             (<unit-folder>/<stage>/delta-<n>.md) are validated too, and
//             relations may reference sibling drafts.
//   check     Evaluate maintenance thresholds (pending-delta count, budget
//             pressure) and report whether a maintenance unit is due. This
//             never fails the caller because maintenance is due.
//
// Inputs: <root>/.harness/config.json ("memory" section: pending_delta_threshold,
// budgets {document: max lines}), <root>/.harness/<document> for current truth,
// <root>/.harness/deltas/*.md for the ledger. <root> defaults to the cwd.
//
// Output: exactly one JSON object on stdout.
//   success: { "ok": true, "command": "...", ... }
//   failure: { "ok": false, "command": "...", "error": { "code": "...", "message": "..." } }
//
// Exit codes:
//   0  success (including "maintenance due" and budget breaches, which are reports only)
//   1  validation failed (delta entries are malformed) - validate only
//   2  usage, config, or I/O error
//
// Error codes: USAGE, CONFIG_NOT_FOUND, CONFIG_INVALID, IO_ERROR, VALIDATION_FAILED.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const STATUSES = ['pending', 'applied', 'rejected'];
const RELATION_FIELDS = ['supersedes', 'depends-on', 'decided-by', 'verified-by'];
const REQUIRED_FIELDS = ['id', 'target', 'date', 'title', 'type', 'status'];
const ID_RE = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)\.([1-9][0-9]*)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const TYPE_RE = /^[a-z0-9][a-z0-9-]*$/;

class CliError extends Error {
  constructor(code, message, exit = 2) {
    super(message);
    this.code = code;
    this.exit = exit;
  }
}

// ---------- frontmatter parsing (small YAML subset) ----------

function unquote(s) {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function splitInline(s) {
  const out = [];
  let cur = '';
  let q = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      cur += ch;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map(unquote).filter((x) => x !== '');
}

// Returns { data } or { error }. Supports `key: scalar`, `key: [a, b]`,
// and block lists (`key:` followed by `- item` lines).
function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return { error: 'missing frontmatter opening ---' };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { error: 'missing frontmatter closing ---' };
  const data = {};
  let listKey = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item) {
      if (!listKey) return { error: `line ${i + 1}: list item without a key` };
      data[listKey].push(unquote(item[1]));
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!m) return { error: `line ${i + 1}: cannot parse "${line.trim()}"` };
    const [, key, rest] = m;
    const val = rest.trim();
    listKey = null;
    if (val === '') {
      data[key] = [];
      listKey = key;
    } else if (val.startsWith('[')) {
      if (!val.endsWith(']')) return { error: `line ${i + 1}: unterminated inline list` };
      data[key] = splitInline(val.slice(1, -1));
    } else data[key] = unquote(val);
  }
  return { data };
}

// ---------- config ----------

function loadMemoryConfig(root) {
  const path = join(root, '.harness', 'config.json');
  if (!existsSync(path)) throw new CliError('CONFIG_NOT_FOUND', `config not found: ${path}`);
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new CliError('CONFIG_INVALID', `config is not valid JSON: ${e.message}`);
  }
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    throw new CliError('CONFIG_INVALID', 'config must be a JSON object');
  }
  if (typeof cfg.schema_version !== 'string' || !cfg.schema_version) {
    throw new CliError('CONFIG_INVALID', 'config.schema_version must be a non-empty string');
  }
  const mem = cfg.memory ?? {};
  if (typeof mem !== 'object' || mem === null || Array.isArray(mem)) {
    throw new CliError('CONFIG_INVALID', 'config.memory must be an object');
  }
  const threshold = mem.pending_delta_threshold ?? null;
  if (threshold !== null && !(Number.isInteger(threshold) && threshold >= 0)) {
    throw new CliError('CONFIG_INVALID', 'memory.pending_delta_threshold must be a non-negative integer');
  }
  const budgets = mem.budgets ?? {};
  if (typeof budgets !== 'object' || budgets === null || Array.isArray(budgets)) {
    throw new CliError('CONFIG_INVALID', 'memory.budgets must be an object');
  }
  for (const [doc, n] of Object.entries(budgets)) {
    if (doc.includes('/') || doc.includes('\\') || doc.startsWith('.')) {
      throw new CliError('CONFIG_INVALID', `memory.budgets key must be a bare file name: ${doc}`);
    }
    if (!(Number.isInteger(n) && n > 0)) {
      throw new CliError('CONFIG_INVALID', `memory.budgets["${doc}"] must be a positive integer (lines)`);
    }
  }
  return { threshold, budgets };
}

// ---------- reading memory ----------

function countLines(text) {
  if (text === '') return 0;
  const parts = text.split('\n');
  if (parts.at(-1) === '') parts.pop();
  return parts.length;
}

function currentTruth(root, budgets) {
  return Object.entries(budgets).map(([doc, budget]) => {
    const path = join(root, '.harness', doc);
    let lines = 0;
    let exists = false;
    if (existsSync(path)) {
      try {
        lines = countLines(readFileSync(path, 'utf8'));
        exists = true;
      } catch (e) {
        throw new CliError('IO_ERROR', `cannot read ${path}: ${e.message}`);
      }
    }
    return { document: doc, exists, lines, budget, over_budget: lines > budget };
  });
}

function toStringList(v) {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function readEntryFile(path, label) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new CliError('IO_ERROR', `cannot read ${path}: ${e.message}`);
  }
  const fm = parseFrontmatter(text);
  return { file: label, ...(fm.error ? { parse_error: fm.error } : { fm: fm.data }) };
}

function readLedger(root) {
  const dir = join(root, '.harness', 'deltas');
  if (!existsSync(dir)) return [];
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch (e) {
    throw new CliError('IO_ERROR', `cannot read ${dir}: ${e.message}`);
  }
  return names.map((n) => ({ ...readEntryFile(join(dir, n), `.harness/deltas/${n}`), origin: 'ledger' }));
}

function readDrafts(unitFolder) {
  const folder = resolve(unitFolder);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) {
    throw new CliError('IO_ERROR', `drafts folder not found: ${folder}`);
  }
  const out = [];
  for (const stage of readdirSync(folder).sort()) {
    const sdir = join(folder, stage);
    if (!statSync(sdir).isDirectory()) continue;
    for (const n of readdirSync(sdir).sort()) {
      if (/^delta-[1-9][0-9]*\.md$/.test(n)) {
        out.push({ ...readEntryFile(join(sdir, n), `${stage}/${n}`), origin: 'draft', stage });
      }
    }
  }
  return out;
}

// ---------- validation ----------

function validateEntries(entries) {
  const problems = [];
  const add = (file, code, message) => problems.push({ file, code, message });
  const ids = new Map();
  for (const e of entries) {
    if (e.fm && typeof e.fm.id === 'string' && e.fm.id) {
      if (ids.has(e.fm.id)) add(e.file, 'DUPLICATE_ID', `id ${e.fm.id} also used by ${ids.get(e.fm.id)}`);
      else ids.set(e.fm.id, e.file);
    }
  }
  for (const e of entries) {
    if (e.parse_error) {
      add(e.file, 'FRONTMATTER_PARSE', e.parse_error);
      continue;
    }
    const fm = e.fm;
    for (const f of REQUIRED_FIELDS) {
      if (typeof fm[f] !== 'string' || fm[f].trim() === '') {
        add(e.file, 'MISSING_FIELD', `required field "${f}" is missing or empty`);
      }
    }
    if (typeof fm.id === 'string' && fm.id) {
      const m = ID_RE.exec(fm.id);
      if (!m) add(e.file, 'BAD_ID', `id "${fm.id}" does not match <unit-id>.<node-id>.<n>`);
      else if (e.origin === 'draft' && m[2] !== e.stage) {
        add(e.file, 'BAD_ID', `draft id node segment "${m[2]}" must equal its stage directory "${e.stage}"`);
      }
    }
    if (typeof fm.date === 'string' && fm.date && !DATE_RE.test(fm.date)) {
      add(e.file, 'BAD_DATE', `date "${fm.date}" is not ISO-8601 UTC (YYYY-MM-DDTHH:MM:SSZ)`);
    }
    if (typeof fm.type === 'string' && fm.type && !TYPE_RE.test(fm.type)) {
      add(e.file, 'BAD_TYPE', `type "${fm.type}" must be lowercase kebab-case`);
    }
    if (typeof fm.status === 'string' && fm.status && !STATUSES.includes(fm.status)) {
      add(e.file, 'BAD_STATUS', `status "${fm.status}" must be one of ${STATUSES.join(', ')}`);
    }
    if (e.origin === 'draft' && fm.status && fm.status !== 'pending') {
      add(e.file, 'BAD_STATUS', 'a draft delta must have status pending');
    }
    for (const rel of RELATION_FIELDS) {
      if (fm[rel] === undefined) continue;
      if (typeof fm[rel] === 'string' && fm[rel] !== '') {
        add(e.file, 'BAD_RELATION', `relation "${rel}" must be a list of entry ids`);
        continue;
      }
      for (const ref of toStringList(fm[rel])) {
        if (!ids.has(ref)) add(e.file, 'DANGLING_RELATION', `${rel} references unknown entry "${ref}"`);
        else if (ref === fm.id) add(e.file, 'BAD_RELATION', `${rel} references the entry itself`);
      }
    }
  }
  return problems;
}

// ---------- commands ----------

function summarize(e) {
  const fm = e.fm;
  const relations = {};
  for (const r of RELATION_FIELDS) {
    const l = toStringList(fm[r]);
    if (l.length) relations[r] = l;
  }
  return {
    id: fm.id ?? null,
    title: fm.title ?? null,
    date: fm.date ?? null,
    type: fm.type ?? null,
    status: fm.status ?? null,
    target: fm.target ?? null,
    relations,
    file: e.file,
  };
}

function cmdIndex(root, opts) {
  const { budgets } = loadMemoryConfig(root);
  const truth = currentTruth(root, budgets);
  const ledger = readLedger(root);
  const invalid = ledger.filter((e) => e.parse_error).map((e) => ({ file: e.file, error: e.parse_error }));
  const all = ledger.filter((e) => e.fm).map(summarize);
  all.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  const shown = opts.all ? all : all.filter((e) => e.status === 'pending');
  const counts = { pending: 0, applied: 0, rejected: 0, other: 0 };
  for (const e of all) counts[STATUSES.includes(e.status) ? e.status : 'other']++;

  const md = ['# Memory index', '', '_Generated by memory.mjs; never hand-edit, never commit._', ''];
  md.push('## Current truth', '');
  if (truth.length === 0) md.push('_No current-truth documents declared._');
  for (const t of truth) {
    md.push(`- .harness/${t.document} (${t.exists ? `${t.lines}/${t.budget} lines` : `not created, budget ${t.budget}`})`);
  }
  md.push('', opts.all ? '## All deltas' : '## Pending deltas', '');
  if (shown.length === 0) md.push('_None._');
  for (const e of shown) {
    const rel = Object.entries(e.relations).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ');
    md.push(`- ${e.id} | ${e.date} | ${e.type} | ${e.status} | ${e.title} -> ${e.target}${rel ? ` | ${rel}` : ''}`);
  }
  return {
    view: opts.all ? 'all' : 'default',
    current_truth: truth,
    deltas: shown,
    counts,
    invalid,
    markdown: md.join('\n') + '\n',
  };
}

function cmdValidate(root, opts) {
  const { budgets } = loadMemoryConfig(root);
  const truth = currentTruth(root, budgets);
  const entries = readLedger(root);
  if (opts.drafts) entries.push(...readDrafts(opts.drafts));
  const problems = validateEntries(entries);
  const result = {
    entries_checked: entries.length,
    problems,
    budget_breaches: truth.filter((t) => t.over_budget),
    note: 'budget breaches are reports of due maintenance, not validation failures',
  };
  if (problems.length > 0) {
    throw Object.assign(new CliError('VALIDATION_FAILED', `${problems.length} problem(s) found`, 1), { extra: result });
  }
  return result;
}

function cmdCheck(root) {
  const { threshold, budgets } = loadMemoryConfig(root);
  const truth = currentTruth(root, budgets);
  const ledger = readLedger(root);
  const pending = ledger.filter((e) => e.fm && e.fm.status === 'pending').length;
  const reasons = [];
  if (threshold !== null && pending > threshold) {
    reasons.push({ kind: 'pending-delta-threshold', pending, threshold });
  }
  for (const t of truth.filter((x) => x.over_budget)) {
    reasons.push({ kind: 'budget-pressure', document: t.document, lines: t.lines, budget: t.budget });
  }
  return {
    maintenance_due: reasons.length > 0,
    trigger_source: reasons.length > 0 ? 'maintenance-due' : null,
    pending_deltas: pending,
    reasons,
    current_truth: truth,
  };
}

// ---------- CLI ----------

const HELP = `Usage: memory.mjs <index|validate|check> [options]
  index    [--all] [--root <dir>]
  validate [--drafts <unit-folder>] [--root <dir>]
  check    [--root <dir>]
See the header comment of this file for output and exit codes.`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = { all: false, drafts: null, root: process.cwd() };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--all') opts.all = true;
    else if (a === '--root' || a === '--drafts') {
      const v = rest[++i];
      if (v === undefined) throw new CliError('USAGE', `${a} requires a value`);
      if (a === '--root') opts.root = resolve(v);
      else opts.drafts = v;
    } else throw new CliError('USAGE', `unknown argument: ${a}`);
  }
  if (opts.all && command !== 'index') throw new CliError('USAGE', '--all is only valid for index');
  if (opts.drafts && command !== 'validate') throw new CliError('USAGE', '--drafts is only valid for validate');
  return { command, opts };
}

function emit(obj, exit) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exitCode = exit;
}

function main(argv) {
  let command = argv[0] ?? null;
  try {
    if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
      emit({ ok: true, command: 'help', usage: HELP }, 0);
      return;
    }
    const parsed = parseArgs(argv);
    command = parsed.command;
    const { opts } = parsed;
    let result;
    if (command === 'index') result = cmdIndex(opts.root, opts);
    else if (command === 'validate') result = cmdValidate(opts.root, opts);
    else if (command === 'check') result = cmdCheck(opts.root);
    else throw new CliError('USAGE', `unknown command: ${command}`);
    emit({ ok: true, command, ...result }, 0);
  } catch (e) {
    if (e instanceof CliError) {
      emit({ ok: false, command, error: { code: e.code, message: e.message }, ...(e.extra ?? {}) }, e.exit);
    } else {
      emit({ ok: false, command, error: { code: 'IO_ERROR', message: String(e?.message ?? e) } }, 2);
    }
  }
}

main(process.argv.slice(2));
