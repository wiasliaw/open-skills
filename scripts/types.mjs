#!/usr/bin/env node
// types.mjs - the shared type catalog: loader, in-memory registry merge, field and path
// resolution, parameterized-type instantiation, and the only catalog writer.
//
// Zero-dependency Node.js (>= 20), built-in modules only. Self-contained. Library
// functions are pure (no I/O) except loadCatalog, loadRegistry, writeProjectEntries and
// main; graph.mjs and work-unit.mjs import the pure ones.
//
// Usage:
//   node scripts/types.mjs write --from <draft.json> [--project <path>] [--plugin <path>]
//   node scripts/types.mjs --help           (also printed when no arguments are given)
//
// Flags:
//   --from <path>      Draft: one JSON object {<field name>: <type entry>, ...}.
//   --project <path>   Project catalog to write (default: .harness/types.json under the cwd).
//   --plugin <path>    Plugin catalog to check the draft against (default: the catalog
//                      shipped at <plugin>/skills/graph-init/templates/types.json).
//
// Catalogs: two JSON objects keyed by state field name and nothing else - the plugin
// catalog (read-only for projects) and the project catalog (written only by `write`).
// A type entry holds only the pure keys type, values, nullable, default, items, fields:
//   type      string | integer | number | boolean | object | list | command |
//             evidence-ref | pointer
//   values    non-empty array of values valid for the type, or - in a plugin entry only -
//             one slot placeholder string such as "{{phase_values}}" (parameterized)
//   nullable  boolean
//   default   required on top-level entries only; must conform to type, values, nullable
//   items     an entry; list only
//   fields    { <name>: <entry> }; object only
// A plugin entry carrying any {{slot}} is parameterized: unusable until graph-init fills
// the slots and writes the completed entry under the same key into the project catalog.
// That instantiation is the only legal same-key overlap between the catalogs. The merged
// registry lives in memory only and is never written to any file.
//
// Output: exactly one JSON object on stdout, always. Shape:
//   write success  { ok: true, command: "write", written: [field...], file }
//   failure        { ok: false, command, errors: [{code, message, field?, path?, key?,
//                    sources?, source?, slot?, file?}] }
//   `field` names the type entry, `path` locates the problem inside it (for
//   TYPE_ENTRY_IMPURE the path of the offending key itself), `key` is the colliding or
//   offending key, `sources` the two catalogs of a collision, `source` the catalog a
//   shape or slot error was found in.
// The write is all-or-nothing: any rejected entry means nothing is written. The accepted
// result is the merge of the existing project catalog and the draft (a same-key entry is
// replaced, others are kept), re-checked as a whole, then written atomically (temp file
// in the same directory, then rename; the parent directory is created).
//
// Exit codes:
//   0  ok: the entries were written
//   1  rejected: one or more entries or the would-be catalog violate the rules
//   2  usage error (unknown subcommand or flag, missing argument)
//   3  input error (draft or catalog unreadable, not JSON, or not a JSON object)
//   4  write failed (the catalog could not be written)
//   5  refused: invoked inside a linked worktree (writers run only in the main checkout)
//   70 internal error
//
// Library API (all exported):
//   PRIMITIVES TYPE_KEYS CORE_STATE_FIELDS PLUGIN_CATALOG PROJECT_CATALOG
//   findSlots(value) checkEntryShape(name, entry, {top}) checkEntryPurity(name, entry)
//   loadCatalog(file, {required}) mergeCatalogs(plugin, project, {pluginSource, projectSource})
//   loadRegistry({pluginPath, projectPath}) resolveField(registry, name)
//   resolvePath(registry, 'field.sub.path') instantiate(entry, slotValues)
//   isInstantiationOf(pluginEntry, candidate) checkPhaseEntry(entry)
//   writeProjectEntries({entries, projectPath, pluginPath}) main(argv)
//
// Stable error codes:
//   Catalog load   CATALOG_UNREADABLE CATALOG_INVALID_JSON CATALOG_NOT_OBJECT
//   Entries        TYPE_ENTRY_INVALID (shape) TYPE_ENTRY_IMPURE TYPE_NAME_INVALID
//                  TYPE_CORE_COLLISION
//   Merge          TYPE_COLLISION TYPE_SLOT_IN_PROJECT TYPE_INSTANTIATION_MISMATCH
//   Resolution     TYPE_DANGLING TYPE_PARAMETERIZED_UNFILLED TYPE_PATH_INVALID
//   Instantiation  SLOT_UNFILLED SLOT_VALUE_INVALID
//   Phase          PHASE_MAINTENANCE_MISSING
//   Writer         DRAFT_INVALID WRITE_FAILED
//   Usage/IO       USAGE INPUT_UNREADABLE INPUT_INVALID_JSON INTERNAL

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Linked-worktree guard: the harness writers only ever write in the main
// checkout, so .harness/ cannot diverge between a worktree and the main
// checkout. Returns true when dir is inside a linked git worktree; a directory
// outside any git repository is not a worktree.
export function inLinkedWorktree(dir) {
  dir = path.resolve(dir);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
  const r = spawnSync('git', ['rev-parse', '--git-dir', '--git-common-dir'], {
    cwd: dir,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error || r.status !== 0) return false;
  const lines = (r.stdout || '').trim().split('\n');
  if (lines.length < 2) return false;
  const gitDir = path.resolve(dir, lines[0]);
  const commonDir = path.resolve(dir, lines[1]);
  return gitDir !== commonDir;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRIMITIVES = Object.freeze([
  'string', 'integer', 'number', 'boolean', 'object', 'list', 'command', 'evidence-ref', 'pointer',
]);
export const TYPE_KEYS = Object.freeze(['type', 'values', 'nullable', 'default', 'items', 'fields']);
// The work-unit core contract names; work-unit.mjs imports this list as its single source.
// `phase` is core state but typed by the catalog, so it is the one core name a catalog may define.
export const CORE_STATE_FIELDS = Object.freeze([
  'schema_version', 'id', 'created_at', 'updated_at', 'trigger', 'current_node', 'current_task',
  'phase', 'walked_path', 'blocked_at', 'fail_counters', 'advisor_consults',
  'reviews', 'human_decisions', 'outcome', 'outcome_reason',
]);
export const PLUGIN_CATALOG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'graph-init', 'templates', 'types.json',
);
export const PROJECT_CATALOG = path.join('.harness', 'types.json');

const SLOT_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const SLOT_ONLY_RE = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/;
const NAME_RE = /^[a-z][a-z0-9_]*$/;
const CORE_SET = new Set(CORE_STATE_FIELDS);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.trim() !== '';
const isArr = Array.isArray;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const err = (code, message, ctx = {}) => ({ code, message, ...ctx });
const join = (base, seg) => (base ? `${base}.${seg}` : seg);
const clone = (v) => JSON.parse(JSON.stringify(v));

function deq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const withSource = (errors, source) => errors.map((e) => ({ ...e, source }));

// `{{name}}` placeholders anywhere in a JSON value: [{slot, path}].
export function findSlots(value, where = '') {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(SLOT_RE)) out.push({ slot: m[1], path: p });
    } else if (isArr(v)) {
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (isObj(v)) {
      for (const [k, x] of Object.entries(v)) walk(x, join(p, k));
    }
  };
  walk(value, where);
  return out;
}

const slotNames = (value) => [...new Set(findSlots(value).map((s) => s.slot))];

// ---------------------------------------------------------------------------
// Entry well-formedness (pure: no I/O)
// ---------------------------------------------------------------------------

function typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'object': return isObj(v);
    case 'list': return isArr(v);
    case 'command':
    case 'pointer': return isStr(v);
    case 'evidence-ref': return isObj(v) && isStr(v.kind) && isStr(v.ref);
    default: return false;
  }
}

// A value fits an entry's type and nullability (the values list is checked separately).
const fits = (entry, v) => (v === null ? entry.nullable === true : typeOk(entry.type, v));

// A value conforms to an entry: type, nullability, values membership, and - recursively -
// the list's items and the object's fields. A placeholder `values` is not checked.
function conforms(entry, v) {
  if (!fits(entry, v)) return false;
  if (v === null) return true;
  if (isArr(entry.values) && !entry.values.some((x) => deq(x, v))) return false;
  if (entry.type === 'list' && isObj(entry.items)) return v.every((x) => conforms(entry.items, x));
  if (entry.type === 'object' && isObj(entry.fields)) {
    return Object.entries(v).every(([k, x]) => has(entry.fields, k) && isObj(entry.fields[k]) && conforms(entry.fields[k], x));
  }
  return true;
}

function walkShape(field, entry, where, top, out) {
  const bad = (msg) => out.push(err(
    'TYPE_ENTRY_INVALID',
    `Type entry "${field}"${where ? ` at ${where}` : ''}: ${msg}`,
    where ? { field, path: where } : { field },
  ));
  if (!isObj(entry)) return bad('must be an object.');
  const before = out.length;
  const typeValid = PRIMITIVES.includes(entry.type);
  if (!typeValid) bad(`"type" is ${JSON.stringify(entry.type)}; allowed: ${PRIMITIVES.join(', ')}.`);

  if (has(entry, 'values')) {
    const v = entry.values;
    if (typeof v === 'string') {
      if (!SLOT_ONLY_RE.test(v)) bad('"values" given as a string must be exactly one slot placeholder such as "{{name}}".');
    } else if (!isArr(v) || v.length === 0) {
      bad('"values" must be a non-empty array or exactly one slot placeholder.');
    } else if (typeValid) {
      const off = v.findIndex((x) => !fits(entry, x));
      if (off >= 0) bad(`"values" holds ${JSON.stringify(v[off])}, which is not a valid ${entry.type} value.`);
    }
  }
  if (has(entry, 'nullable') && typeof entry.nullable !== 'boolean') bad('"nullable" must be a boolean.');
  if (typeValid && has(entry, 'items')) {
    if (entry.type !== 'list') bad('"items" is only allowed on a list type.');
    else walkShape(field, entry.items, join(where, 'items'), false, out);
  }
  if (typeValid && has(entry, 'fields')) {
    if (entry.type !== 'object') bad('"fields" is only allowed on an object type.');
    else if (!isObj(entry.fields)) bad('"fields" must be an object of type entries.');
    else {
      for (const [k, sub] of Object.entries(entry.fields)) walkShape(field, sub, join(join(where, 'fields'), k), false, out);
    }
  }
  if (has(entry, 'default')) {
    // Only judged once the rest of this subtree is sound, so one mistake is reported once.
    if (typeValid && out.length === before && !conforms(entry, entry.default)) {
      bad(`"default" ${JSON.stringify(entry.default)} does not conform to its type, values, or nullability.`);
    }
  } else if (top) {
    bad('a top-level entry must declare a "default".');
  }
}

// Well-formedness of the six type fields, recursing into `items` and `fields`. Unknown
// keys are NOT rejected here: purity is enforced only by the writer (checkEntryPurity).
// Returns [] or a list of TYPE_ENTRY_INVALID errors.
export function checkEntryShape(name, entry, { top = true } = {}) {
  const out = [];
  walkShape(name, entry, '', top, out);
  return out;
}

// Any key outside TYPE_KEYS at any depth (the entry itself, `items`, each of `fields`) is a
// mechanism leaking into a type. `path` locates the offending key.
export function checkEntryPurity(name, entry) {
  const out = [];
  const walk = (e, where) => {
    if (!isObj(e)) return;
    for (const key of Object.keys(e)) {
      if (TYPE_KEYS.includes(key)) continue;
      const at = join(where, key);
      out.push(err(
        'TYPE_ENTRY_IMPURE',
        `Type entry "${name}" carries "${key}" at ${at}, which is not a pure type key (allowed: ${TYPE_KEYS.join(', ')}); mechanism semantics belong to tasks and nodes, not to types.`,
        { field: name, path: at, key },
      ));
    }
    walk(e.items, join(where, 'items'));
    if (isObj(e.fields)) {
      for (const [k, sub] of Object.entries(e.fields)) walk(sub, join(join(where, 'fields'), k));
    }
  };
  walk(entry, '');
  return out;
}

// The instantiated phase type must carry the reserved value `maintenance`. An entry whose
// `values` is still a placeholder is not instantiated yet (resolution reports that case).
export function checkPhaseEntry(entry) {
  const v = isObj(entry) ? entry.values : undefined;
  if (typeof v === 'string' && SLOT_ONLY_RE.test(v)) return [];
  if (isArr(v) && v.includes('maintenance')) return [];
  return [err('PHASE_MAINTENANCE_MISSING', 'The phase type\'s values must contain the reserved value "maintenance".', { field: 'phase' })];
}

// ---------------------------------------------------------------------------
// Catalog loading and the in-memory registry
// ---------------------------------------------------------------------------

// Read and parse one catalog. A missing optional file is an empty catalog; a missing
// required file is an error. Returns {catalog, errors}; catalog is null on error.
export function loadCatalog(file, { required = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') {
      if (!required) return { catalog: {}, errors: [] };
      return { catalog: null, errors: [err('CATALOG_UNREADABLE', `Required catalog ${file} does not exist.`, { file })] };
    }
    return { catalog: null, errors: [err('CATALOG_UNREADABLE', `Cannot read catalog ${file}: ${e.message}`, { file })] };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { catalog: null, errors: [err('CATALOG_INVALID_JSON', `${file} is not valid JSON: ${e.message}`, { file })] };
  }
  if (!isObj(parsed)) {
    return { catalog: null, errors: [err('CATALOG_NOT_OBJECT', `${file} must hold one JSON object keyed by state field name.`, { file })] };
  }
  return { catalog: parsed, errors: [] };
}

// Merge the two catalogs in memory. registry: Map name -> {entry, source: 'plugin' | 'project',
// parameterized, slots}. A project key the plugin also defines is legal only over a
// parameterized plugin entry (an instantiation; the project entry wins); any other same-key
// collision is TYPE_COLLISION. A project entry may not carry slots. A parameterized plugin
// entry with no instantiation stays registered, marked parameterized. The registry is
// best-effort when errors is non-empty. Purity is deliberately not checked here.
export function mergeCatalogs(plugin, project, { pluginSource = 'plugin', projectSource = 'project' } = {}) {
  const registry = new Map();
  const errors = [];

  for (const [name, entry] of Object.entries(isObj(plugin) ? plugin : {})) {
    errors.push(...withSource(checkEntryShape(name, entry, { top: true }), pluginSource));
    if (!isObj(entry)) continue;
    const slots = slotNames(entry);
    registry.set(name, { entry, source: 'plugin', parameterized: slots.length > 0, slots });
  }

  for (const [name, entry] of Object.entries(isObj(project) ? project : {})) {
    errors.push(...withSource(checkEntryShape(name, entry, { top: true }), projectSource));
    if (!isObj(entry)) continue;
    const found = findSlots(entry);
    if (found.length) {
      for (const s of found) errors.push(slotInProject(name, s, projectSource));
      continue;
    }
    const prior = registry.get(name);
    if (prior && !prior.parameterized) {
      errors.push(collision(name, pluginSource, projectSource));
      continue;
    }
    registry.set(name, { entry, source: 'project', parameterized: false, slots: [] });
  }
  return { registry, errors };
}

const slotInProject = (name, s, source) => err(
  'TYPE_SLOT_IN_PROJECT',
  `Type entry "${name}" in ${source} carries the unfilled slot {{${s.slot}}} at ${s.path}; a project entry must be completed (slots filled) before it is written.`,
  { field: name, path: s.path, slot: s.slot, source },
);

const collision = (name, pluginSource, projectSource) => err(
  'TYPE_COLLISION',
  `Type "${name}" is defined by both the plugin catalog (${pluginSource}) and the project catalog (${projectSource}); only a plugin entry with {{slot}} parameters may be overridden, by instantiation.`,
  { key: name, sources: [pluginSource, projectSource] },
);

// Load both catalogs and merge them in memory: {registry, errors}. Never writes anything.
export function loadRegistry({ pluginPath = PLUGIN_CATALOG, projectPath = PROJECT_CATALOG } = {}) {
  const plugin = loadCatalog(pluginPath, { required: true });
  const project = loadCatalog(projectPath, { required: false });
  const merged = mergeCatalogs(plugin.catalog ?? {}, project.catalog ?? {}, { pluginSource: pluginPath, projectSource: projectPath });
  return { registry: merged.registry, errors: [...plugin.errors, ...project.errors, ...merged.errors] };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// Resolve one state field by name: {ok: true, entry, source} or {ok: false, code, message}.
export function resolveField(registry, name) {
  const rec = registry.get(name);
  if (!rec) {
    return { ok: false, code: 'TYPE_DANGLING', message: `State field "${name}" is not defined by any catalog (plugin or project).` };
  }
  if (rec.parameterized) {
    return {
      ok: false,
      code: 'TYPE_PARAMETERIZED_UNFILLED',
      message: `State field "${name}" is defined only by a plugin entry that still carries ${rec.slots.map((s) => `{{${s}}}`).join(', ')}; run the graph-init instantiation step (fill the slots from the interview and write the completed entry under "${name}" into the project catalog) before referencing it.`,
    };
  }
  return { ok: true, entry: rec.entry, source: rec.source };
}

// Resolve a dotted path such as 'tickets.verification_command': the first segment is a
// field; each further segment walks `fields[segment]` of an object entry, passing through
// `items` first whenever the current entry is a list. Returns the entry the last segment
// names, as resolveField does, or {ok: false, code, message} with TYPE_DANGLING,
// TYPE_PARAMETERIZED_UNFILLED, or TYPE_PATH_INVALID.
export function resolvePath(registry, fieldPath) {
  const invalid = (message) => ({ ok: false, code: 'TYPE_PATH_INVALID', message });
  if (typeof fieldPath !== 'string' || fieldPath === '') return invalid('A field path must be a non-empty string.');
  const [first, ...rest] = fieldPath.split('.');
  if (first === '' || rest.includes('')) return invalid(`Field path "${fieldPath}" has an empty segment.`);
  const head = resolveField(registry, first);
  if (!head.ok) return head;
  let cur = head.entry;
  let walked = first;
  for (const seg of rest) {
    while (cur.type === 'list') {
      if (!isObj(cur.items)) return invalid(`Field path "${fieldPath}": "${walked}" is a list with no items to walk into.`);
      cur = cur.items;
    }
    if (cur.type !== 'object' || !isObj(cur.fields) || !has(cur.fields, seg) || !isObj(cur.fields[seg])) {
      return invalid(`Field path "${fieldPath}": "${walked}" has no field "${seg}".`);
    }
    cur = cur.fields[seg];
    walked = `${walked}.${seg}`;
  }
  return { ok: true, entry: cur, source: head.source };
}

// ---------------------------------------------------------------------------
// Instantiation of parameterized entries
// ---------------------------------------------------------------------------

// Fill a parameterized entry's slots: {entry, errors}. A string that is exactly one
// placeholder becomes the slot value (any JSON); a placeholder embedded in a longer string is
// substituted textually (the value must be a string). A missing value is SLOT_UNFILLED and the
// placeholder is left in place. The input is never modified.
export function instantiate(entry, slotValues) {
  const errors = [];
  const values = isObj(slotValues) ? slotValues : {};
  const lookup = (slot, where) => {
    if (!has(values, slot) || values[slot] === undefined) {
      errors.push(err('SLOT_UNFILLED', `No value supplied for slot {{${slot}}} at ${where || 'the entry root'}.`, { slot, path: where }));
      return { found: false };
    }
    return { found: true, value: values[slot] };
  };
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const whole = SLOT_ONLY_RE.exec(v);
      if (whole) {
        const r = lookup(whole[1], where);
        return r.found ? clone(r.value) : v;
      }
      return v.replace(SLOT_RE, (m, slot) => {
        const r = lookup(slot, where);
        if (!r.found) return m;
        if (typeof r.value !== 'string') {
          errors.push(err('SLOT_VALUE_INVALID', `Slot {{${slot}}} at ${where || 'the entry root'} is embedded in a longer string, so its value must be a string.`, { slot, path: where }));
          return m;
        }
        return r.value;
      });
    }
    if (isArr(v)) return v.map((x, i) => walk(x, `${where}[${i}]`));
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, join(where, k))]));
    return v;
  };
  return { entry: walk(entry, ''), errors };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// True when `candidate` equals the plugin entry everywhere except at slot-bearing
// positions, where it holds a slot-free value. An embedded placeholder additionally needs a
// string that keeps the literal text around the slot.
export function isInstantiationOf(pluginEntry, candidate) {
  const walk = (tpl, cand) => {
    if (typeof tpl === 'string' && findSlots(tpl).length) {
      if (findSlots(cand).length) return false;
      if (SLOT_ONLY_RE.test(tpl)) return true;
      const pattern = tpl.split(SLOT_RE).map((p, i) => (i % 2 ? '[\\s\\S]*' : escapeRe(p))).join('');
      return typeof cand === 'string' && new RegExp(`^${pattern}$`).test(cand);
    }
    if (isArr(tpl)) return isArr(cand) && cand.length === tpl.length && tpl.every((x, i) => walk(x, cand[i]));
    if (isObj(tpl)) {
      if (!isObj(cand)) return false;
      const keys = Object.keys(tpl);
      return keys.length === Object.keys(cand).length && keys.every((k) => has(cand, k) && walk(tpl[k], cand[k]));
    }
    return tpl === cand;
  };
  return walk(pluginEntry, candidate);
}

// ---------------------------------------------------------------------------
// The catalog writer: the only authoring surface of the project catalog
// ---------------------------------------------------------------------------

// Validate draft entries and merge them into the project catalog. All-or-nothing: any
// rejected entry (or a would-be catalog that fails the merge and shape checks) writes
// nothing. Returns {written: [field...], file} or {errors}.
export function writeProjectEntries({ entries, projectPath = PROJECT_CATALOG, pluginPath = PLUGIN_CATALOG } = {}) {
  if (!isObj(entries) || Object.keys(entries).length === 0) {
    return { errors: [err('DRAFT_INVALID', 'The draft must be a non-empty JSON object {<field name>: <type entry>, ...}.')] };
  }
  const plugin = loadCatalog(pluginPath, { required: true });
  const project = loadCatalog(projectPath, { required: false });
  const loadErrors = [...plugin.errors, ...project.errors];
  if (loadErrors.length) return { errors: loadErrors };

  const errors = [];
  for (const [name, entry] of Object.entries(entries)) {
    if (!NAME_RE.test(name)) {
      errors.push(err('TYPE_NAME_INVALID', `Field name "${name}" must match ^[a-z][a-z0-9_]*$ (lowercase snake_case).`, { field: name }));
    }
    if (CORE_SET.has(name) && name !== 'phase') {
      errors.push(err('TYPE_CORE_COLLISION', `Field "${name}" is part of the work-unit core contract and cannot be typed by a catalog (only "phase" can).`, { field: name }));
    }
    errors.push(...checkEntryPurity(name, entry));
    errors.push(...checkEntryShape(name, entry, { top: true }));
    const slots = findSlots(entry);
    for (const s of slots) errors.push(slotInProject(name, s, projectPath));
    if (has(plugin.catalog, name)) {
      const pluginEntry = plugin.catalog[name];
      if (findSlots(pluginEntry).length === 0) {
        errors.push(collision(name, pluginPath, projectPath));
      } else if (slots.length === 0 && !isInstantiationOf(pluginEntry, entry)) {
        errors.push(err(
          'TYPE_INSTANTIATION_MISMATCH',
          `Type entry "${name}" is not a faithful instantiation of the parameterized plugin entry in ${pluginPath}: it may differ only at the slot positions.`,
          { field: name, key: name, sources: [pluginPath, projectPath] },
        ));
      }
    }
    if (name === 'phase' && slots.length === 0) errors.push(...checkPhaseEntry(entry));
  }
  if (errors.length) return { errors };

  const next = { ...project.catalog, ...entries };
  const merged = mergeCatalogs(plugin.catalog, next, { pluginSource: pluginPath, projectSource: projectPath });
  if (merged.errors.length) return { errors: merged.errors };

  const dir = path.dirname(projectPath);
  const tmp = path.join(dir, `.${path.basename(projectPath)}.${process.pid}-${Date.now()}.tmp`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, projectPath);
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup of the temp file
    }
    return { errors: [err('WRITE_FAILED', `Cannot write ${projectPath}: ${e.message}`, { file: projectPath })] };
  }
  return { written: Object.keys(entries), file: projectPath };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const EXIT = { OK: 0, REJECTED: 1, USAGE: 2, INPUT: 3, WRITE: 4, WORKTREE: 5, INTERNAL: 70 };
const INPUT_CODES = new Set(['CATALOG_UNREADABLE', 'CATALOG_INVALID_JSON', 'CATALOG_NOT_OBJECT', 'DRAFT_INVALID']);
const FLAGS = { '--from': 'from', '--project': 'project', '--plugin': 'plugin' };

const HELP = {
  ok: true,
  command: 'help',
  usage: [
    'node scripts/types.mjs write --from <draft.json> [--project <path>] [--plugin <path>]',
    'node scripts/types.mjs --help',
  ],
  flags: {
    '--from <path>': 'draft: one JSON object {<field name>: <type entry>, ...}',
    '--project <path>': 'project catalog to write (default .harness/types.json under the cwd)',
    '--plugin <path>': 'plugin catalog to check against (default skills/graph-init/templates/types.json in the plugin)',
  },
  exit_codes: {
    0: 'ok: entries written',
    1: 'rejected: entry or catalog violations (nothing written)',
    2: 'usage error',
    3: 'input error (draft or catalog unreadable, invalid JSON, or not an object)',
    4: 'write failed',
    5: 'refused: invoked inside a linked worktree (writers run only in the main checkout)',
    70: 'internal error',
  },
};

function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exitCode = code;
}

function fail(command, code, message, exit, extra = {}) {
  emit({ ok: false, command, errors: [{ code, message, ...extra }] }, exit);
}

export function main(argv) {
  const args = argv.slice();
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return emit(HELP, EXIT.OK);
  }
  const command = args.shift();
  if (command !== 'write') {
    const known = command.startsWith('-') ? null : command;
    return fail(known, 'USAGE', known ? `Unknown subcommand ${command}; expected "write".` : 'A subcommand is required: write.', EXIT.USAGE);
  }
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!has(FLAGS, a)) return fail('write', 'USAGE', a.startsWith('-') ? `Unknown flag ${a}.` : `Unexpected argument ${a}.`, EXIT.USAGE);
    if (has(opts, FLAGS[a])) return fail('write', 'USAGE', `${a} was given more than once.`, EXIT.USAGE);
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) return fail('write', 'USAGE', `${a} needs a path.`, EXIT.USAGE);
    opts[FLAGS[a]] = value;
  }
  if (!has(opts, 'from')) return fail('write', 'USAGE', '--from <draft.json> is required.', EXIT.USAGE);

  const targetDir = path.dirname(path.resolve(opts.project ?? PROJECT_CATALOG));
  if (inLinkedWorktree(targetDir)) {
    return fail('write', 'IN_WORKTREE', 'Refusing to write the project catalog from inside a linked worktree; run from the main checkout so .harness/ cannot diverge.', EXIT.WORKTREE);
  }

  let text;
  try {
    text = fs.readFileSync(opts.from, 'utf8');
  } catch (e) {
    return fail('write', 'INPUT_UNREADABLE', `Cannot read ${opts.from}: ${e.message}`, EXIT.INPUT, { file: opts.from });
  }
  let draft;
  try {
    draft = JSON.parse(text);
  } catch (e) {
    return fail('write', 'INPUT_INVALID_JSON', `${opts.from} is not valid JSON: ${e.message}`, EXIT.INPUT, { file: opts.from });
  }

  const res = writeProjectEntries({ entries: draft, projectPath: opts.project, pluginPath: opts.plugin });
  if (res.errors) {
    const exit = res.errors.some((e) => INPUT_CODES.has(e.code))
      ? EXIT.INPUT
      : res.errors.some((e) => e.code === 'WRITE_FAILED') ? EXIT.WRITE : EXIT.REJECTED;
    return emit({ ok: false, command: 'write', errors: res.errors }, exit);
  }
  return emit({ ok: true, command: 'write', written: res.written, file: res.file }, EXIT.OK);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    emit({ ok: false, command: 'write', errors: [{ code: 'INTERNAL', message: String(e?.stack ?? e) }] }, EXIT.INTERNAL);
  }
}
