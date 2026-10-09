// work-unit.mjs - the single write gate for the work-unit folder (Schema 2.0). It creates
// a unit, validates a stored unit, gates every state/log write, archives a unit at a
// terminal, and owns the red-check surface (land-tests, expect-red) the build pipeline's
// script tasks call. The orchestrator drafts state and log lines; this script validates the
// draft against the work-unit-state contract plus the unit's graph and type catalogs and
// applies it atomically. Hand-editing state.json or log.ndjson is forbidden.
//
// Usage (run through node, with the consumer project as the cwd):
//   node work-unit.mjs create   --graph <graph.json> --units <dir> --id <id> --source <source>
//                               --request <text> [--branch <name>] [--archive <dir>] [--remote <name|url|none>]
//   node work-unit.mjs validate --graph <graph.json> --unit <dir>
//   node work-unit.mjs write    --graph <graph.json> --unit <dir> --state <draft.json>
//                               (--log <lines.json> | --log-full <log.ndjson draft>)
//   node work-unit.mjs archive  --graph <graph.json> --unit <dir> [--to <archive dir>]
//   node work-unit.mjs land-tests --graph <graph.json> --unit <dir> --worktree <path> --ticket <id>
//   node work-unit.mjs expect-red --graph <graph.json> --unit <dir> --worktree <path> --ticket <id>
//   node work-unit.mjs --help
//
// Every subcommand that takes --graph also accepts --types <project types.json> (default:
// .harness/types.json under the cwd) and --plugin-types <plugin types.json> (default: the
// catalog shipped with the plugin). The two catalogs are merged in memory by types.mjs, the
// same loader graph.mjs uses; no schema or registry file is stored.
//
// --graph is the project's flattened 2.0 graph definition. The gate never backs a unit with
// a definition graph.mjs `validateDefinition` rejects (nor with a catalog that fails to
// load): any structural or catalog error is a `graph` failure whose violations are the
// validator's error codes. `--log` is a JSON file holding one log-line object or an array of
// them, appended to the existing log. `--log-full` is the complete new log.ndjson content;
// the gate requires the existing bytes to be a byte-prefix of it. `--archive` defaults to
// <units>/archive. `--remote` is the git remote (name or URL) whose `wu/<id>` branches the id
// must not collide with; it defaults to `origin` when that remote exists and is skipped when
// it does not; `none` skips it.
//
// What the gate derives from the definition (nothing else is read):
//   nodes[]{id, kind, pipeline[]{use}, terminal_kind, re_entry}, edges[]{from, to},
//   caps.advisor_consultations (the consultation cap), tasks{<id>{reads, produces,
//   equipment.commands}}, and - through the catalogs - the `phase` vocabulary and the type of
//   every graph-declared field.
// Graph-declared fields: every top-level F named by some task's `produces: "state:F"`, except
//   core names (`phase` is core state, typed by the catalog). F is typed by its catalog entry
//   (types.mjs resolveField) and carries a copy of the entry's default. F is applicable in a
//   unit iff some node whose pipeline references a task producing state:F is in walked_path
//   or is current_node; it is materialized with its default by the write that makes it
//   applicable, present while applicable, and invalid outside its applicability.
// Core state adds `current_task`: null or a task id in the pipeline of current_node (the
//   pipeline position). State schema_version is "2.0.0".
//
// Value checking follows the catalog type: string, integer, number, boolean, object (every
// declared field required - a nullable one may be null - and undeclared keys rejected), list
// (items checked), `command` (non-empty string), `pointer` (folder-relative file pointer),
// `evidence-ref` ({kind, ref}); `values` is a membership list.
//
// Command coverage: every task equipment entry {source: "state:<path>", family: "<base>"}
//   binds the command values found at <path> in the state (lists are walked, so
//   `tickets.verification_command` is each tickets[i].verification_command): the invocation's
//   token prefix must equal the family's tokens, else `command-not-mounted`.
//
// Scopes (fail_counters keys, advisor_consults[].scope and problem_key prefix):
//   <node>.<task>           a declared node and a task of its pipeline
//   <node>.<task>:<item-id> additionally the task reads state:<progress_field> of some re_entry
//                           rule R and <item-id> is the id of a record of state[R.items_field]
//   edge:<from>-<to>        a declared edge
// reviews[].scope takes the first two forms only. The 1.x forms node:<id> and <kind>:<id> are
// rejected.
//
// Write authorization (`write` only; create and validate of a stored unit check none): for
// every graph-declared field F and for `phase`, the baseline is the stored value (or the
// catalog default when the field is new), and F is changed iff the draft value differs. The
// task in flight is the stored pipeline position (the stored current_task, before the write).
// A changed F is authorized when that task's `produces` contains state:F. Otherwise it must be
// re-entry bookkeeping of some re_entry rule: a selection (list_field/progress_field - the
// progress field takes an element of the list field, which loses exactly that element; the
// first one under order "declared") or an update of existing items_field records (same
// number, same ids in the same order, every command-typed record field unchanged).
//
// Red-check surface (design D7/D9): both subcommands find the re_entry rule whose items_field
// holds a record with id = --ticket in the unit's state.
//   land-tests copies every regular file under <unit>/<rule node>/tests/<ticket>/ to the same
//     relative path under --worktree (directories created, existing files overwritten, so a
//     re-run is idempotent). Symlinks and paths escaping the worktree are refused.
//   expect-red runs the record's single command-typed field through the shell in --worktree and
//     expects a failure: exit 0 is `already_green`, exit 126/127, a spawn error, or a signal is
//     `not_runnable`, any other non-zero exit is `red-observed`. Success and failure bodies
//     both carry command, exit_status, signal, and output_tail (last 2000 chars of stdout then
//     stderr) so the orchestrator can transcribe a `step` log line.
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "created" | "valid" | "written" | "archived" |
//             "tests-landed" | "red-observed" | "help", ...}
//   failure: {"ok": false, "error": "<code>", "message": "...", "violations": [{"rule","message"}]}
//
// Exit codes (consumers branch on the "error" code; the exit code is the coarse signal):
//   0  ok
//   1  internal          unexpected exception inside the script
//   2  usage             unknown subcommand or missing/duplicate/invalid flags
//   3  state             draft or stored unit violates the contract or an invariant; also a
//                        land-tests/expect-red ticket the unit does not hold, or a stage
//                        directory holding symlinks or special files
//   4  write_failed      the folder or a file could not be written or moved; also a land-tests
//                        destination that is a symlink or escapes the worktree
//   5  not_found         the work-unit folder, a required file, the graph file, the worktree, or
//                        a ticket's declared test files are missing
//   6  already_exists    create or archive target already exists
//   7  node_version      Node.js older than 20
//   8  graph             the graph definition or a type catalog cannot back a work unit (also an
//                        expect-red ticket record with zero or several command-typed fields)
//   9  id_collision      the id exists in the work-units location, the archive, or as a remote wu/<id> branch
//   10 remote_unreachable the remote could not be queried for wu/<id> branches
//   11 already_green     expect-red: the ticket's command exited 0 (the red-check run line maps
//                        this status to the declared ticket-invalid outcome)
//   12 not_runnable      expect-red: the command could not run (exit 126/127, spawn error, signal)
//
// Violation rules (state failures; every violation is {rule, message}):
//   Identity/log   state-invalid id-grammar identity-changed frozen updated-at-mismatch
//                  log-malformed log-line-invalid log-ids-not-increasing log-timestamps-decrease
//                  log-not-prefix no-log-line
//   Position       node-undeclared task-invalid walked-path-rewritten outcome-invalid
//                  outcome-terminal-pairing blocked-iff-open
//   Phase          phase-undeclared phase-immutable phase-unrecorded maintenance-binding
//   Declared state undeclared-field field-inapplicable field-missing type-mismatch
//                  value-not-allowed scope-id-invalid command-not-mounted write-unauthorized
//   Pointers       pointer-invalid pointer-dangling pointer-escape evidence-invalid
//                  evidence-dangling
//   Records        scope-invalid consult-count consult-cap total-cap-superseded
//                  append-only-record archive-not-ready
//   (a `graph` failure carries graph.mjs error codes - for example DEF_FIELD_MISSING or
//   TYPE_DANGLING - as its violation rules)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { CORE_STATE_FIELDS, PLUGIN_CATALOG, PROJECT_CATALOG, loadRegistry, resolveField } from './types.mjs';
import { validateDefinition } from './graph.mjs';

const MIN_NODE_MAJOR = 20;
const SCHEMA_VERSION = '2.0.0';
const TAIL_CHARS = 2000;

const EXIT = {
  internal: 1,
  usage: 2,
  state: 3,
  write_failed: 4,
  not_found: 5,
  already_exists: 6,
  node_version: 7,
  graph: 8,
  id_collision: 9,
  remote_unreachable: 10,
  already_green: 11,
  not_runnable: 12,
};

class Fail extends Error {
  constructor(error, message, extra) {
    super(message);
    this.error = error;
    this.extra = extra || {};
  }
}

function emit(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  process.exitCode = code;
}

function reportFailure(e) {
  process.stderr.write('work-unit.mjs: ' + e.error + ': ' + e.message + '\n');
  const body = Object.assign({ ok: false, error: e.error, message: e.message }, e.extra);
  emit(body, EXIT[e.error] === undefined ? EXIT.internal : EXIT[e.error]);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clone(v) {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// vocabulary fixed by the work-unit-state contract

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TRIGGER_SOURCES = ['prompt', 'issue', 'ci-failure', 'maintenance-due'];
const OUTCOMES = ['shipped', 'ended'];
const EVIDENCE_KINDS = ['path', 'command', 'log'];
const PROBLEM_STATUSES = ['open', 'escalated', 'resolved', 'abandoned', 'superseded'];
const PROBLEM_OPENERS = ['signature', 'total', 'edge-revisit', 'blocked'];
const EVENT_SOURCE = {
  'create': 'orchestrator',
  'dispatch': 'orchestrator',
  'route': 'orchestrator',
  'step': 'orchestrator',
  'archive': 'orchestrator',
  'report': 'actor-report',
  'verdict': 'actor-report',
  'advisor-consultation': 'actor-report',
  'human-decision': 'human-answer',
};
const ACTORS = ['worker', 'reviewer', 'advisor'];
const APPROVAL_DECISIONS = ['approved', 'send-back', 'not-needed'];
const ESCALATION_DECISIONS = ['retry', 'move-back', 'end'];

// ---------------------------------------------------------------------------
// violation collection

function makeCollector() {
  const list = [];
  const add = function (rule, message) { list.push({ rule: rule, message: message }); };
  add.list = list;
  return add;
}

function failState(violations, what) {
  const first = violations[0];
  const message = what + ' rejected: ' + violations.length + ' violation(s); first: [' + first.rule + '] ' + first.message;
  return new Fail('state', message, { violations: violations });
}

// ---------------------------------------------------------------------------
// graph definition: load, validate, and compile what the gate needs

function tokenize(cmd) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return tokens;
}

// A state-sourced family covers an invocation whose token prefix equals the family tokens.
function familyCovers(familyTokens, invocation) {
  const tokens = tokenize(invocation);
  if (familyTokens.length === 0 || tokens.length < familyTokens.length) return false;
  for (let i = 0; i < familyTokens.length; i++) if (tokens[i] !== familyTokens[i]) return false;
  return true;
}

function stateRefs(list) {
  return (Array.isArray(list) ? list : []).filter(function (e) { return typeof e === 'string' && e.indexOf('state:') === 0; }).map(function (e) { return e.slice(6); });
}

// `def` has already passed validateDefinition, so its structure is well-formed.
function compileGraph(def, registry) {
  const nodesById = {};
  const pipelines = {};
  const terminals = {};
  let entry = null;
  def.nodes.forEach(function (n) {
    nodesById[n.id] = n;
    pipelines[n.id] = Array.isArray(n.pipeline) ? n.pipeline.map(function (p) { return p.use; }) : [];
    if (n.kind === 'entry') entry = n.id;
    if (n.kind === 'terminal') terminals[n.id] = n.terminal_kind === 'success' ? 'shipped' : 'ended';
  });
  const entryEdge = def.edges.find(function (e) { return e.from === entry; });
  const phaseEntry = resolveField(registry, 'phase').entry;
  const tasks = def.tasks;

  const reentry = [];
  def.nodes.forEach(function (n) {
    if (isPlainObject(n.re_entry)) {
      reentry.push({ node: n.id, list_field: n.re_entry.list_field, order: n.re_entry.order, progress_field: n.re_entry.progress_field, items_field: n.re_entry.items_field });
    }
  });

  const sources = [];
  Object.keys(tasks).forEach(function (id) {
    const eq = tasks[id].equipment;
    (isPlainObject(eq) && Array.isArray(eq.commands) ? eq.commands : []).forEach(function (c) {
      if (isPlainObject(c) && typeof c.source === 'string' && c.source.indexOf('state:') === 0) {
        sources.push({ task: id, path: c.source.slice(6), family: c.family, tokens: tokenize(c.family) });
      }
    });
  });

  const fields = [];
  const byName = {};
  Object.keys(tasks).forEach(function (id) {
    stateRefs(tasks[id].produces).forEach(function (name) {
      if (CORE_STATE_FIELDS.indexOf(name) !== -1 || name in byName) return;
      const r = resolveField(registry, name);
      const f = { name: name, entry: r.entry, def: clone(r.entry.default), producers: [] };
      byName[name] = f;
      fields.push(f);
    });
  });
  fields.forEach(function (f) {
    def.nodes.forEach(function (n) {
      if (pipelines[n.id].some(function (t) { return stateRefs(tasks[t].produces).indexOf(f.name) !== -1; })) f.producers.push(n.id);
    });
  });

  return {
    nodesById: nodesById,
    entry: entry,
    terminals: terminals,
    edges: def.edges,
    consultCap: def.caps.advisor_consultations,
    tasks: tasks,
    pipelines: pipelines,
    firstNode: entryEdge.to,
    phases: phaseEntry.values.slice(),
    phaseDefault: phaseEntry.default,
    reentry: reentry,
    sources: sources,
    fields: fields,
    fieldsByName: byName,
  };
}

function loadGraph(flags) {
  const file = flags['--graph'];
  if (!file) throw new Fail('usage', '--graph is required');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Fail('not_found', 'cannot read graph definition ' + file + ': ' + e.message);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Fail('graph', 'graph definition ' + file + ': invalid JSON: ' + e.message);
  }
  const loaded = loadRegistry({ pluginPath: flags['--plugin-types'] || PLUGIN_CATALOG, projectPath: flags['--types'] || PROJECT_CATALOG });
  const res = validateDefinition(raw, { registry: loaded.registry, catalogErrors: loaded.errors });
  if (res.errors.length) {
    const violations = res.errors.map(function (e) { return { rule: e.code, message: e.message }; });
    throw new Fail('graph', 'graph definition ' + file + ' rejected: ' + violations.length + ' error(s); first: [' + violations[0].rule + '] ' + violations[0].message, { violations: violations });
  }
  return compileGraph(raw, loaded.registry);
}

// ---------------------------------------------------------------------------
// applicability: one definition shared by materialization and validation

function isApplicable(G, field, state) {
  const walked = Array.isArray(state.walked_path) ? state.walked_path : [];
  return field.producers.some(function (n) { return walked.indexOf(n) !== -1 || state.current_node === n; });
}

// ---------------------------------------------------------------------------
// value / pointer / evidence checks

function isIso(v) {
  return typeof v === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)
    && !Number.isNaN(Date.parse(v));
}

// ctx: {G, unitDir, logIds} - pointers/evidence need the folder.
function checkPointer(p, where, v, ctx) {
  if (typeof p !== 'string' || p === '') { v('pointer-invalid', where + ' must be a non-empty folder-relative path'); return; }
  if (path.isAbsolute(p) || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.indexOf('\\') !== -1) { v('pointer-invalid', where + ' must be folder-relative: ' + p); return; }
  const segs = p.split('/');
  if (segs.indexOf('..') !== -1 || segs.indexOf('.') !== -1 || segs.indexOf('') !== -1) { v('pointer-invalid', where + ' must be a normalized path inside the folder: ' + p); return; }
  if (!(p === 'handoff.md' || (segs.length >= 2 && segs[0] in ctx.G.nodesById))) {
    v('pointer-invalid', where + ' must name handoff.md or a file under a stage directory (a declared node id): ' + p);
    return;
  }
  const root = path.resolve(ctx.unitDir);
  const resolved = path.resolve(root, p);
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch (_) {
    v('pointer-dangling', where + ' points to a missing file: ' + p);
    return;
  }
  const realRoot = fs.realpathSync(root);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) { v('pointer-escape', where + ' escapes the work-unit folder: ' + p); return; }
  if (!fs.statSync(real).isFile()) v('pointer-dangling', where + ' does not point to a file: ' + p);
}

function checkEvidence(ref, where, v, ctx) {
  if (!isPlainObject(ref)) { v('evidence-invalid', where + ' must be an object {kind, ref}'); return; }
  Object.keys(ref).forEach(function (k) { if (k !== 'kind' && k !== 'ref') v('evidence-invalid', where + ' has unknown key "' + k + '"'); });
  if (EVIDENCE_KINDS.indexOf(ref.kind) === -1) { v('evidence-invalid', where + '.kind must be one of: ' + EVIDENCE_KINDS.join(', ')); return; }
  if (typeof ref.ref !== 'string' || ref.ref === '') { v('evidence-invalid', where + '.ref must be a non-empty string'); return; }
  if (ref.kind === 'path' && !ref.ref.startsWith('repo:')) checkPointer(ref.ref, where + '.ref', v, ctx);
  if (ref.kind === 'log' && !ctx.logIds[ref.ref]) v('evidence-dangling', where + '.ref names no log line: ' + ref.ref);
}

// Validates `value` against a resolved catalog entry (types.mjs shape): the catalog type
// decides the check, `values` is a membership list. A `command` is a non-empty string; its
// execution coverage is checked separately against the consuming tasks' equipment.
function checkEntry(value, entry, where, v, ctx) {
  if (value === null) {
    if (!entry.nullable) v('type-mismatch', where + ' must not be null');
    return;
  }
  const t = entry.type;
  if (t === 'string') {
    if (typeof value !== 'string') { v('type-mismatch', where + ' must be a string'); return; }
  } else if (t === 'integer') {
    if (!Number.isInteger(value)) { v('type-mismatch', where + ' must be an integer'); return; }
  } else if (t === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) { v('type-mismatch', where + ' must be a number'); return; }
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') { v('type-mismatch', where + ' must be a boolean'); return; }
  } else if (t === 'command') {
    if (typeof value !== 'string' || value.trim() === '') { v('type-mismatch', where + ' must be a non-empty command string'); return; }
  } else if (t === 'pointer') {
    if (typeof value !== 'string') { v('type-mismatch', where + ' must be a folder-relative pointer string'); return; }
    checkPointer(value, where, v, ctx);
  } else if (t === 'evidence-ref') {
    checkEvidence(value, where, v, ctx);
  } else if (t === 'object') {
    if (!isPlainObject(value)) { v('type-mismatch', where + ' must be an object'); return; }
    if (isPlainObject(entry.fields)) {
      Object.keys(value).forEach(function (k) { if (!(k in entry.fields)) v('undeclared-field', where + ' has undeclared key "' + k + '"'); });
      Object.keys(entry.fields).forEach(function (k) {
        if (!(k in value)) { v('type-mismatch', where + '.' + k + ' is required'); return; }
        checkEntry(value[k], entry.fields[k], where + '.' + k, v, ctx);
      });
    }
  } else if (t === 'list') {
    if (!Array.isArray(value)) { v('type-mismatch', where + ' must be a list'); return; }
    if (entry.items) value.forEach(function (item, i) { checkEntry(item, entry.items, where + '[' + i + ']', v, ctx); });
  } else {
    v('type-mismatch', where + ' has unsupported catalog type "' + t + '"');
    return;
  }
  if (Array.isArray(entry.values) && !entry.values.some(function (x) { return deepEqual(x, value); })) {
    v('value-not-allowed', where + ' must be one of: ' + entry.values.map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }).join(', '));
  }
}

// The values a state-sourced equipment path reaches in the state: lists are walked, so
// `tickets.verification_command` yields each tickets[i].verification_command.
function valuesAt(state, segments) {
  const out = [];
  (function walk(val, i, where) {
    if (Array.isArray(val)) {
      val.forEach(function (x, j) { walk(x, i, where + '[' + j + ']'); });
    } else if (i === segments.length) {
      out.push({ where: where, value: val });
    } else if (isPlainObject(val) && segments[i] in val) {
      walk(val[segments[i]], i + 1, where + '.' + segments[i]);
    }
  })(state[segments[0]], 1, segments[0]);
  return out;
}

// ---------------------------------------------------------------------------
// log parsing and line schema

function parseLog(buf) {
  const text = buf.toString('utf8');
  const errors = [];
  const lines = [];
  if (text === '') return { lines: lines, errors: errors };
  if (!text.endsWith('\n')) errors.push('log.ndjson must end with a newline');
  const parts = text.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  parts.forEach(function (p, i) {
    if (p.trim() === '') { errors.push('log.ndjson line ' + (i + 1) + ' is blank'); return; }
    try {
      lines.push(JSON.parse(p));
    } catch (e) {
      errors.push('log.ndjson line ' + (i + 1) + ' is not valid JSON: ' + e.message);
    }
  });
  return { lines: lines, errors: errors };
}

function logSeq(id) {
  return parseInt(id.slice(2), 10);
}

function checkLog(G, lines, v, ctx) {
  const LINE_KEYS = ['id', 'timestamp', 'source', 'actor', 'node', 'event_type', 'description', 'source_ref'];
  lines.forEach(function (line, i) {
    const where = 'log line ' + (i + 1);
    if (!isPlainObject(line)) { v('log-line-invalid', where + ' must be an object'); return; }
    Object.keys(line).forEach(function (k) { if (LINE_KEYS.indexOf(k) === -1) v('log-line-invalid', where + ' has unknown key "' + k + '"'); });
    LINE_KEYS.forEach(function (k) { if (!(k in line)) v('log-line-invalid', where + ' is missing "' + k + '"'); });
    if (typeof line.id !== 'string' || !/^L-\d{4,}$/.test(line.id)) v('log-line-invalid', where + '.id must match L-<zero-padded sequence>');
    if (!isIso(line.timestamp)) v('log-line-invalid', where + '.timestamp must be an ISO-8601 UTC date-time');
    if (!(line.event_type in EVENT_SOURCE)) v('log-line-invalid', where + '.event_type must be one of: ' + Object.keys(EVENT_SOURCE).join(', '));
    else if (line.source !== EVENT_SOURCE[line.event_type]) v('log-line-invalid', where + '.source must be "' + EVENT_SOURCE[line.event_type] + '" for event_type "' + line.event_type + '"');
    if (line.source === 'actor-report') {
      if (ACTORS.indexOf(line.actor) === -1) v('log-line-invalid', where + '.actor must be one of: ' + ACTORS.join(', '));
    } else if (line.actor !== null) v('log-line-invalid', where + '.actor must be null unless source is "actor-report"');
    if (!(line.node in G.nodesById)) v('log-line-invalid', where + '.node must be a node id declared by the graph');
    if (typeof line.description !== 'string' || line.description === '') v('log-line-invalid', where + '.description must be a non-empty string');
    if (line.source === 'orchestrator') {
      if (line.source_ref !== null) v('log-line-invalid', where + '.source_ref must be null for orchestrator events');
    } else if (line.source_ref === null || line.source_ref === undefined) v('log-line-invalid', where + '.source_ref is required for ' + line.source + ' events');
    if (typeof line.source_ref === 'string') checkPointer(line.source_ref, where + '.source_ref', v, ctx);
  });
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (isPlainObject(a) && isPlainObject(b) && typeof a.id === 'string' && typeof b.id === 'string' && /^L-\d+$/.test(a.id) && /^L-\d+$/.test(b.id)) {
      if (logSeq(b.id) <= logSeq(a.id)) v('log-ids-not-increasing', 'log ids must strictly increase: ' + a.id + ' then ' + b.id);
      if (isIso(a.timestamp) && isIso(b.timestamp) && Date.parse(b.timestamp) < Date.parse(a.timestamp)) v('log-timestamps-decrease', 'log timestamps must not decrease: ' + b.id + ' is earlier than ' + a.id);
    }
  }
  if (lines.length > 0 && isPlainObject(lines[0]) && lines[0].event_type !== 'create') v('log-line-invalid', 'the first log line must be the create event');
}

// ---------------------------------------------------------------------------
// scopes

// Returns null for a valid scope, else the reason. `edges` allows the edge:<from>-<to> form.
function scopeError(G, state, scope, edges) {
  let m = /^edge:(.+)$/.exec(scope);
  if (m) {
    if (!edges) return 'scope "' + scope + '" must be <node>.<task>[:<item-id>] (an edge scope is not allowed here)';
    const body = m[1];
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '-') continue;
      const from = body.slice(0, i);
      const to = body.slice(i + 1);
      if (G.edges.some(function (e) { return e.from === from && e.to === to; })) return null;
    }
    return 'scope "' + scope + '" names no declared edge';
  }
  m = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)(?::(.+))?$/.exec(scope);
  if (!m) return 'scope "' + scope + '" is not <node>.<task>[:<item-id>]' + (edges ? ' or edge:<from>-<to>' : '');
  const node = m[1];
  const task = m[2];
  const item = m[3];
  if (!(node in G.nodesById)) return 'scope "' + scope + '" names an undeclared node "' + node + '"';
  if (G.pipelines[node].indexOf(task) === -1) return 'scope "' + scope + '": task "' + task + '" is not in the pipeline of node "' + node + '"';
  if (item === undefined) return null;
  const rules = G.reentry.filter(function (R) { return stateRefs(G.tasks[task].reads).indexOf(R.progress_field) !== -1; });
  if (rules.length === 0) return 'scope "' + scope + '" names an item, but task "' + task + '" reads no re-entry progress field (a scope exists only where its concept does)';
  const live = rules.some(function (R) {
    return Array.isArray(state[R.items_field]) && state[R.items_field].some(function (it) { return isPlainObject(it) && it.id === item; });
  });
  if (!live) return 'scope "' + scope + '" names no existing record "' + item + '" (a scope exists only where its concept does)';
  return null;
}

// ---------------------------------------------------------------------------
// the state contract

function checkState(G, state, prev, lines, unitDir, v) {
  if (!isPlainObject(state)) { v('state-invalid', 'state.json top level must be an object'); return; }
  const logIds = {};
  lines.forEach(function (l) { if (isPlainObject(l) && typeof l.id === 'string') logIds[l.id] = true; });
  const ctx = { G: G, unitDir: unitDir, logIds: logIds };

  // top-level fields: core, or declared by the graph and applicable
  Object.keys(state).forEach(function (k) {
    if (CORE_STATE_FIELDS.indexOf(k) !== -1) return;
    if (!(k in G.fieldsByName)) v('undeclared-field', 'top-level field "' + k + '" is neither in the core contract nor declared by the graph');
  });
  CORE_STATE_FIELDS.forEach(function (k) { if (!(k in state)) v('state-invalid', 'state.json is missing core field "' + k + '"'); });

  // identity and timestamps
  if (state.schema_version !== SCHEMA_VERSION) v('state-invalid', 'schema_version must be "' + SCHEMA_VERSION + '"');
  if (typeof state.id !== 'string' || !ID_RE.test(state.id)) v('id-grammar', 'id must match ^[a-z0-9][a-z0-9-]*$');
  if (!isIso(state.created_at)) v('state-invalid', 'created_at must be an ISO-8601 UTC date-time');
  if (!isIso(state.updated_at)) v('state-invalid', 'updated_at must be an ISO-8601 UTC date-time');
  else if (isIso(state.created_at) && Date.parse(state.updated_at) < Date.parse(state.created_at)) v('state-invalid', 'updated_at must not be earlier than created_at');
  if (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (isPlainObject(last) && state.updated_at !== last.timestamp) v('updated-at-mismatch', 'updated_at must equal the newest log line timestamp');
  }

  // trigger
  const trig = state.trigger;
  if (!isPlainObject(trig)) v('state-invalid', 'trigger must be an object');
  else {
    Object.keys(trig).forEach(function (k) { if (['source', 'request', 'branch'].indexOf(k) === -1) v('state-invalid', 'trigger has unknown key "' + k + '"'); });
    if (TRIGGER_SOURCES.indexOf(trig.source) === -1) v('state-invalid', 'trigger.source must be one of: ' + TRIGGER_SOURCES.join(', '));
    if (typeof trig.request !== 'string' || trig.request === '') v('state-invalid', 'trigger.request must be the non-empty original request');
    if ('branch' in trig && trig.branch !== null && (typeof trig.branch !== 'string' || trig.branch === '')) v('state-invalid', 'trigger.branch must be null or a non-empty string');
  }

  // current node, pipeline position, walked path
  if (typeof state.current_node !== 'string' || !(state.current_node in G.nodesById)) v('node-undeclared', 'current_node must be a node id declared by the graph');
  if (state.current_task !== null && state.current_task !== undefined) {
    const pipe = typeof state.current_node === 'string' && state.current_node in G.pipelines ? G.pipelines[state.current_node] : [];
    if (typeof state.current_task !== 'string' || pipe.indexOf(state.current_task) === -1) {
      v('task-invalid', 'current_task must be null or a task in the pipeline of current_node "' + state.current_node + '", got ' + JSON.stringify(state.current_task));
    }
  }
  if (!Array.isArray(state.walked_path)) v('state-invalid', 'walked_path must be a list of node ids');
  else {
    state.walked_path.forEach(function (id, i) { if (!(id in G.nodesById)) v('node-undeclared', 'walked_path[' + i + '] names an undeclared node: ' + id); });
    if (prev && Array.isArray(prev.walked_path)) {
      const ok = prev.walked_path.length <= state.walked_path.length && prev.walked_path.every(function (id, i) { return state.walked_path[i] === id; });
      if (!ok) v('walked-path-rewritten', 'walked_path is append-only: the stored history must be a prefix of the draft');
    }
  }

  // phase
  const phase = state.phase;
  if (phase !== null && (typeof phase !== 'string' || G.phases.indexOf(phase) === -1)) v('phase-undeclared', 'phase must be null or a value of the instantiated phase type: ' + G.phases.join(', '));
  else if (phase === null && prev && prev.phase !== null) v('phase-immutable', 'the recorded phase cannot be cleared');
  if (prev && prev.phase !== null && phase !== prev.phase) v('phase-immutable', 'the phase is immutable once recorded (was "' + prev.phase + '", draft has ' + JSON.stringify(phase) + ')');
  if (isPlainObject(trig)) {
    if (phase === 'maintenance' && trig.source !== 'maintenance-due') v('maintenance-binding', 'the maintenance phase may only be recorded on a unit with trigger source maintenance-due');
    if (trig.source === 'maintenance-due' && phase !== null && phase !== 'maintenance') v('maintenance-binding', 'a maintenance-due unit may record no phase other than maintenance');
  }

  // outcome pairs with a terminal current node
  const terminalNow = typeof state.current_node === 'string' && state.current_node in G.terminals;
  if (state.outcome !== null && OUTCOMES.indexOf(state.outcome) === -1) v('outcome-invalid', 'outcome must be null, "shipped", or "ended"');
  else if ((state.outcome !== null) !== terminalNow) v('outcome-terminal-pairing', 'outcome must be non-null exactly when current_node is a terminal');
  else if (state.outcome !== null) {
    if (G.terminals[state.current_node] !== state.outcome) v('outcome-terminal-pairing', 'outcome "' + state.outcome + '" does not match terminal "' + state.current_node + '"');
    if (state.outcome === 'ended' && (typeof state.outcome_reason !== 'string' || state.outcome_reason === '')) v('outcome-terminal-pairing', 'outcome "ended" requires a non-empty outcome_reason');
  }
  if (state.outcome === null && state.outcome_reason !== null) v('outcome-terminal-pairing', 'outcome_reason must be null while outcome is null');
  if (state.outcome === 'shipped' && state.outcome_reason !== null && typeof state.outcome_reason !== 'string') v('outcome-invalid', 'outcome_reason must be null or a string');

  // graph-declared fields: applicability, materialization, shape, commands
  G.fields.forEach(function (f) {
    const present = f.name in state;
    const applicable = isApplicable(G, f, state);
    if (present && !applicable) v('field-inapplicable', 'field "' + f.name + '" exists outside its applicability (no node producing it is in walked_path or is current_node: ' + f.producers.join(', ') + ')');
    else if (!present && applicable) v('field-missing', 'field "' + f.name + '" is applicable and must be present');
    else if (present) {
      checkEntry(state[f.name], f.entry, f.name, v, ctx);
      if (G.reentry.some(function (R) { return R.items_field === f.name; }) && Array.isArray(state[f.name])) {
        const seen = {};
        state[f.name].forEach(function (it, i) {
          if (!isPlainObject(it) || typeof it.id !== 'string' || it.id === '') { v('scope-id-invalid', f.name + '[' + i + '] needs a non-empty string id'); return; }
          if (it.id in seen) v('scope-id-invalid', f.name + '[' + i + '].id duplicates "' + it.id + '"');
          seen[it.id] = true;
        });
      }
    }
  });
  G.sources.forEach(function (src) {
    valuesAt(state, src.path.split('.')).forEach(function (hit) {
      if (typeof hit.value !== 'string' || hit.value.trim() === '') return;
      if (!familyCovers(src.tokens, hit.value)) {
        v('command-not-mounted', hit.where + ' invocation "' + hit.value + '" is not covered by the family "' + src.family + '" that task "' + src.task + '" mounts for state:' + src.path);
      }
    });
  });

  // fail counters
  if (!isPlainObject(state.fail_counters)) v('state-invalid', 'fail_counters must be an object keyed by scope');
  else {
    Object.keys(state.fail_counters).forEach(function (scope) {
      const bad = scopeError(G, state, scope, true);
      if (bad) v('scope-invalid', 'fail_counters: ' + bad);
      const c = state.fail_counters[scope];
      const where = 'fail_counters["' + scope + '"]';
      if (!isPlainObject(c)) { v('state-invalid', where + ' must be {signature, count, total}'); return; }
      Object.keys(c).forEach(function (k) { if (['signature', 'count', 'total'].indexOf(k) === -1) v('state-invalid', where + ' has unknown key "' + k + '"'); });
      if (c.signature !== null && (typeof c.signature !== 'string' || c.signature === '')) v('state-invalid', where + '.signature must be null or a non-empty string');
      if (!Number.isInteger(c.count) || c.count < 0) v('state-invalid', where + '.count must be a non-negative integer');
      if (!Number.isInteger(c.total) || c.total < 0) v('state-invalid', where + '.total must be a non-negative integer');
      if (Number.isInteger(c.count) && Number.isInteger(c.total) && c.count > c.total) v('state-invalid', where + '.count cannot exceed the signature-independent total');
    });
  }

  // problems and advisor consultations
  const problems = Array.isArray(state.advisor_consults) ? state.advisor_consults : null;
  if (!problems) v('state-invalid', 'advisor_consults must be a list of problem records');
  else {
    const byKey = {};
    problems.forEach(function (p, i) {
      const where = 'advisor_consults[' + i + ']';
      if (!isPlainObject(p)) { v('state-invalid', where + ' must be an object'); return; }
      const KEYS = ['problem_key', 'scope', 'signature', 'opened_by', 'blocked_node', 'inherited', 'supersedes', 'count', 'advice', 'status'];
      Object.keys(p).forEach(function (k) { if (KEYS.indexOf(k) === -1) v('state-invalid', where + ' has unknown key "' + k + '"'); });
      if (typeof p.problem_key !== 'string' || !/^.+#[1-9]\d*$/.test(p.problem_key)) { v('state-invalid', where + '.problem_key must be <scope>#<n>'); return; }
      if (p.problem_key in byKey) v('state-invalid', where + '.problem_key duplicates "' + p.problem_key + '"');
      byKey[p.problem_key] = p;
      if (typeof p.scope !== 'string' || p.problem_key.slice(0, p.problem_key.lastIndexOf('#')) !== p.scope) v('state-invalid', where + '.scope must equal the problem_key prefix');
      else { const bad = scopeError(G, state, p.scope, true); if (bad) v('scope-invalid', where + ': ' + bad); }
      if (typeof p.signature !== 'string' || p.signature === '') v('state-invalid', where + '.signature must be a non-empty failure signature');
      if (PROBLEM_OPENERS.indexOf(p.opened_by) === -1) v('state-invalid', where + '.opened_by must be one of: ' + PROBLEM_OPENERS.join(', '));
      if (typeof p.blocked_node !== 'string' || !(p.blocked_node in G.nodesById)) v('node-undeclared', where + '.blocked_node must be a declared node id');
      if (PROBLEM_STATUSES.indexOf(p.status) === -1) v('state-invalid', where + '.status must be one of: ' + PROBLEM_STATUSES.join(', '));
      if (p.status === 'superseded' && p.opened_by === 'total') v('total-cap-superseded', where + ': a problem opened by the total failure cap cannot be superseded');
      if (!Number.isInteger(p.inherited) || p.inherited < 0) v('state-invalid', where + '.inherited must be a non-negative integer');
      if (!Array.isArray(p.advice)) { v('state-invalid', where + '.advice must be a list'); return; }
      p.advice.forEach(function (a, j) {
        const aw = where + '.advice[' + j + ']';
        if (!isPlainObject(a)) { v('state-invalid', aw + ' must be an object'); return; }
        Object.keys(a).forEach(function (k) { if (['file', 'date', 'log_ref'].indexOf(k) === -1) v('state-invalid', aw + ' has unknown key "' + k + '"'); });
        checkPointer(a.file, aw + '.file', v, ctx);
        if (!isIso(a.date)) v('state-invalid', aw + '.date must be an ISO-8601 UTC date-time');
        if (typeof a.log_ref !== 'string' || !logIds[a.log_ref]) v('evidence-dangling', aw + '.log_ref names no log line');
      });
      if (Number.isInteger(p.inherited) && p.count !== p.inherited + p.advice.length) v('consult-count', where + '.count must equal inherited plus the length of its advice list');
      if (!Number.isInteger(p.count) || p.count < 0) v('state-invalid', where + '.count must be a non-negative integer');
      else if (p.count > G.consultCap) v('consult-cap', where + '.count ' + p.count + ' exceeds the declared consultation cap ' + G.consultCap);
    });
    problems.forEach(function (p, i) {
      if (!isPlainObject(p) || typeof p.problem_key !== 'string') return;
      const where = 'advisor_consults[' + i + ']';
      const sup = p.supersedes;
      if (sup !== null && sup !== undefined) {
        const pred = byKey[sup];
        if (!pred) v('state-invalid', where + '.supersedes names no problem: ' + sup);
        else {
          if (pred.status !== 'superseded') v('state-invalid', where + ' supersedes "' + sup + '" which is not marked superseded');
          if (p.inherited !== pred.count) v('state-invalid', where + '.inherited must equal the superseded problem\'s consultation count (' + pred.count + ')');
        }
      } else if (p.inherited !== 0) v('state-invalid', where + '.inherited must be 0 when it supersedes nothing');
      if (p.status === 'superseded' && !problems.some(function (q) { return isPlainObject(q) && q.supersedes === p.problem_key; })) v('state-invalid', where + ' is superseded but no problem supersedes it');
    });
    const open = problems.filter(function (p) { return isPlainObject(p) && p.status === 'open'; });
    if (open.length > 1) v('blocked-iff-open', 'at most one escalation problem may be open');
    if (open.length === 1) {
      if (state.blocked_at !== open[0].blocked_node) v('blocked-iff-open', 'blocked_at must equal the open problem\'s blocked node "' + open[0].blocked_node + '"');
      else if (state.blocked_at !== state.current_node) v('blocked-iff-open', 'an open problem keeps the unit in place: blocked_at must equal current_node');
      if (terminalNow) v('blocked-iff-open', 'a unit at a terminal cannot have an open problem');
    } else if (state.blocked_at !== null) v('blocked-iff-open', 'blocked_at must be null when no escalation problem is open');
    if (prev && Array.isArray(prev.advisor_consults)) {
      prev.advisor_consults.forEach(function (pp) {
        const now = byKey[pp.problem_key];
        if (!now) v('state-invalid', 'problem "' + pp.problem_key + '" cannot be removed');
        else if (now.count < pp.count || !(pp.advice || []).every(function (a, j) { return deepEqual(now.advice[j], a); })) v('state-invalid', 'problem "' + pp.problem_key + '" consultation history is append-only');
      });
    }
  }
  if (state.blocked_at !== null && (typeof state.blocked_at !== 'string' || !(state.blocked_at in G.nodesById))) v('node-undeclared', 'blocked_at must be null or a declared node id');

  // reviews
  if (!Array.isArray(state.reviews)) v('state-invalid', 'reviews must be a list');
  else {
    const seen = {};
    state.reviews.forEach(function (r, i) {
      const where = 'reviews[' + i + ']';
      if (!isPlainObject(r)) { v('state-invalid', where + ' must be an object'); return; }
      Object.keys(r).forEach(function (k) { if (['id', 'node', 'scope', 'verdict', 'dimensions', 'evidence_refs', 'file', 'date'].indexOf(k) === -1) v('state-invalid', where + ' has unknown key "' + k + '"'); });
      if (typeof r.id !== 'string' || r.id === '') v('state-invalid', where + '.id must be a non-empty string');
      else { if (r.id in seen) v('state-invalid', where + '.id duplicates "' + r.id + '"'); seen[r.id] = true; }
      if (typeof r.node !== 'string' || !(r.node in G.nodesById)) v('node-undeclared', where + '.node must be a declared node id');
      if (typeof r.scope !== 'string' || r.scope === '') v('state-invalid', where + '.scope must be a <node>.<task>[:<item-id>] scope');
      else { const bad = scopeError(G, state, r.scope, false); if (bad) v('scope-invalid', where + '.scope: ' + bad); }
      if (r.verdict !== 'pass' && r.verdict !== 'fail') v('state-invalid', where + '.verdict must be "pass" or "fail"');
      if (!Array.isArray(r.dimensions)) v('state-invalid', where + '.dimensions must be a list');
      else {
        r.dimensions.forEach(function (d, j) {
          if (!isPlainObject(d) || typeof d.name !== 'string' || d.name === '' || (d.result !== 'pass' && d.result !== 'fail')) v('state-invalid', where + '.dimensions[' + j + '] must be {name, result: pass|fail}');
        });
        if (r.verdict === 'pass' && r.dimensions.some(function (d) { return isPlainObject(d) && d.result === 'fail'; })) v('state-invalid', where + ': a pass verdict must have no failing dimension');
      }
      if (!Array.isArray(r.evidence_refs) || r.evidence_refs.length === 0) v('state-invalid', where + '.evidence_refs must hold at least one evidence reference');
      else r.evidence_refs.forEach(function (e, j) { checkEvidence(e, where + '.evidence_refs[' + j + ']', v, ctx); });
      checkPointer(r.file, where + '.file', v, ctx);
      if (!isIso(r.date)) v('state-invalid', where + '.date must be an ISO-8601 UTC date-time');
    });
    if (prev && Array.isArray(prev.reviews)) {
      if (!prev.reviews.every(function (r, i) { return deepEqual(state.reviews[i], r); })) v('append-only-record', 'reviews are append-only: stored entries cannot change or be removed');
    }
  }

  // human decisions
  if (!Array.isArray(state.human_decisions)) v('state-invalid', 'human_decisions must be a list');
  else {
    const seen = {};
    state.human_decisions.forEach(function (h, i) {
      const where = 'human_decisions[' + i + ']';
      if (!isPlainObject(h)) { v('state-invalid', where + ' must be an object'); return; }
      Object.keys(h).forEach(function (k) { if (['id', 'kind', 'node', 'decision', 'phase', 'target', 'file', 'date'].indexOf(k) === -1) v('state-invalid', where + ' has unknown key "' + k + '"'); });
      if (typeof h.id !== 'string' || h.id === '') v('state-invalid', where + '.id must be a non-empty string');
      else { if (h.id in seen) v('state-invalid', where + '.id duplicates "' + h.id + '"'); seen[h.id] = true; }
      if (h.kind !== 'approval' && h.kind !== 'escalation') v('state-invalid', where + '.kind must be "approval" or "escalation"');
      else if ((h.kind === 'approval' ? APPROVAL_DECISIONS : ESCALATION_DECISIONS).indexOf(h.decision) === -1) v('state-invalid', where + '.decision must be one of: ' + (h.kind === 'approval' ? APPROVAL_DECISIONS : ESCALATION_DECISIONS).join(', '));
      if (typeof h.node !== 'string' || !(h.node in G.nodesById)) v('node-undeclared', where + '.node must be a declared node id');
      if (h.phase !== null && h.phase !== undefined) {
        if (h.kind !== 'approval' || h.decision !== 'approved') v('state-invalid', where + '.phase is only allowed on an approved approval');
        else if (typeof h.phase !== 'string' || G.phases.indexOf(h.phase) === -1) v('phase-undeclared', where + '.phase must be a declared phase');
        else if (h.node !== G.firstNode) v('state-invalid', where + ': the phase is recorded at the shared first node "' + G.firstNode + '"');
      }
      if (h.target !== null && h.target !== undefined && (typeof h.target !== 'string' || !(h.target in G.nodesById))) v('node-undeclared', where + '.target must be null or a declared node id');
      if (h.decision === 'move-back' && !h.target) v('state-invalid', where + ': move-back needs a target node');
      checkPointer(h.file, where + '.file', v, ctx);
      if (!isIso(h.date)) v('state-invalid', where + '.date must be an ISO-8601 UTC date-time');
    });
    if (prev && Array.isArray(prev.human_decisions)) {
      if (!prev.human_decisions.every(function (h, i) { return deepEqual(state.human_decisions[i], h); })) v('append-only-record', 'human_decisions are append-only: stored entries cannot change or be removed');
    }
    if (typeof phase === 'string') {
      const rec = state.human_decisions.filter(function (h) { return isPlainObject(h) && h.kind === 'approval' && h.decision === 'approved' && h.phase === phase; });
      if (rec.length === 0) v('phase-unrecorded', 'phase "' + phase + '" must be recorded by an approved approval decision carrying it');
      if (prev && prev.phase === null && Array.isArray(prev.human_decisions)) {
        const added = state.human_decisions.slice(prev.human_decisions.length).filter(function (h) { return isPlainObject(h) && h.phase === phase; });
        if (added.length === 0) v('phase-unrecorded', 'the write that records phase "' + phase + '" must add the approval decision recording it');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// write authorization (design D9): a changed graph-declared field (or `phase`) needs the
// task in flight to produce it, unless it is re-entry bookkeeping

function containsCommand(entry) {
  if (!isPlainObject(entry)) return false;
  if (entry.type === 'command') return true;
  if (entry.type === 'list') return containsCommand(entry.items);
  if (entry.type === 'object' && isPlainObject(entry.fields)) return Object.keys(entry.fields).some(function (k) { return containsCommand(entry.fields[k]); });
  return false;
}

// The stored value of a field, or its catalog default when the field is new (materialization).
function baselineOf(G, prev, name) {
  if (name in prev) return prev[name];
  return name === 'phase' ? G.phaseDefault : clone(G.fieldsByName[name].def);
}

// Selection step of a re_entry rule. Returns null when `draft` is a valid selection, else why not.
function selectionProblem(G, R, prev, draft) {
  const base = baselineOf(G, prev, R.list_field);
  const next = draft[R.list_field];
  const picked = draft[R.progress_field];
  if (!Array.isArray(base) || !Array.isArray(next)) return R.list_field + ' must be a list';
  const at = [];
  base.forEach(function (x, i) { if (deepEqual(x, picked)) at.push(i); });
  if (at.length === 0) return R.progress_field + ' ' + JSON.stringify(picked) + ' is not an element of the stored ' + R.list_field;
  if (R.order === 'declared' && at[0] !== 0) return 'under declared order ' + R.progress_field + ' must take the first element of ' + R.list_field + ' (' + JSON.stringify(base[0]) + ')';
  const candidates = R.order === 'declared' ? [0] : at;
  const ok = candidates.some(function (i) { return deepEqual(base.filter(function (_, j) { return j !== i; }), next); });
  return ok ? null : R.list_field + ' must equal the stored list with exactly the selected element removed';
}

// Update of existing items_field records. Returns null when no record was added, removed, or
// reordered and no id or command-typed field changed, else why not.
function itemsProblem(G, R, prev, draft) {
  const base = baselineOf(G, prev, R.items_field);
  const next = draft[R.items_field];
  if (!Array.isArray(base) || !Array.isArray(next)) return R.items_field + ' must be a list';
  if (base.length !== next.length) return 'a record was added or removed (' + base.length + ' stored, ' + next.length + ' in the draft)';
  const recFields = G.fieldsByName[R.items_field].entry.items.fields;
  const commandKeys = Object.keys(recFields).filter(function (k) { return containsCommand(recFields[k]); });
  for (let i = 0; i < base.length; i++) {
    const a = base[i];
    const b = next[i];
    if (!isPlainObject(a) || !isPlainObject(b)) return R.items_field + '[' + i + '] must be an object';
    if (a.id !== b.id) return R.items_field + '[' + i + '].id changed or the records were reordered (' + JSON.stringify(a.id) + ' became ' + JSON.stringify(b.id) + ')';
    for (let j = 0; j < commandKeys.length; j++) {
      if (!deepEqual(a[commandKeys[j]], b[commandKeys[j]])) return R.items_field + '[' + i + '].' + commandKeys[j] + ' is command-typed and cannot change without a producing task';
    }
  }
  return null;
}

function checkAuthorization(G, prev, draft, v) {
  const inflightId = typeof prev.current_task === 'string' ? prev.current_task : null;
  const inflight = inflightId !== null && isPlainObject(G.tasks[inflightId]) ? G.tasks[inflightId] : null;
  const produced = inflight ? stateRefs(inflight.produces) : [];
  ['phase'].concat(G.fields.map(function (f) { return f.name; })).forEach(function (name) {
    if (!(name in draft) || deepEqual(draft[name], baselineOf(G, prev, name))) return;
    if (produced.indexOf(name) !== -1) return;
    const reasons = [];
    let bookkeeping = false;
    G.reentry.forEach(function (R) {
      let why = null;
      if (name === R.list_field || name === R.progress_field) why = selectionProblem(G, R, prev, draft);
      else if (name === R.items_field) why = itemsProblem(G, R, prev, draft);
      else return;
      if (why === null) bookkeeping = true;
      else reasons.push('not re-entry bookkeeping of node "' + R.node + '": ' + why);
    });
    if (bookkeeping) return;
    v('write-unauthorized', 'field "' + name + '" changed ' + (inflightId === null ? 'with no task in flight' : 'with task "' + inflightId + '" in flight, which does not produce state:' + name) + (reasons.length ? ' (' + reasons.join('; ') + ')' : ''));
  });
}

// ---------------------------------------------------------------------------
// folder I/O

function readFileOr(file, label) {
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw new Fail('not_found', 'cannot read ' + label + ' ' + file + ': ' + e.message);
  }
}

function readJsonFile(file, label, code) {
  const text = readFileOr(file, label).toString('utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Fail(code || 'state', label + ' ' + file + ': invalid JSON: ' + e.message);
  }
}

function readUnit(unitDir) {
  if (!fs.existsSync(unitDir) || !fs.statSync(unitDir).isDirectory()) throw new Fail('not_found', 'work-unit folder not found: ' + unitDir);
  const stateBuf = readFileOr(path.join(unitDir, 'state.json'), 'state.json');
  let state;
  try {
    state = JSON.parse(stateBuf.toString('utf8'));
  } catch (e) {
    throw new Fail('state', 'state.json: invalid JSON: ' + e.message);
  }
  const logBuf = readFileOr(path.join(unitDir, 'log.ndjson'), 'log.ndjson');
  return { state: state, stateBuf: stateBuf, logBuf: logBuf };
}

function serializeState(state) {
  return Buffer.from(JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function serializeLines(lines) {
  return Buffer.from(lines.map(function (l) { return JSON.stringify(l) + '\n'; }).join(''), 'utf8');
}

function validateStored(G, unitDir) {
  const unit = readUnit(unitDir);
  const v = makeCollector();
  const parsed = parseLog(unit.logBuf);
  parsed.errors.forEach(function (m) { v('log-malformed', m); });
  const ctx = { G: G, unitDir: unitDir };
  checkLog(G, parsed.lines, v, ctx);
  checkState(G, unit.state, null, parsed.lines, unitDir, v);
  if (parsed.lines.length === 0) v('log-malformed', 'log.ndjson must hold at least one line');
  if (v.list.length) throw failState(v.list, 'stored unit');
  return { unit: unit, lines: parsed.lines };
}

function writePair(unitDir, files) {
  // files: [{name, content}]. Stage temp files, then rename; roll back on failure.
  const staged = [];
  const originals = [];
  try {
    files.forEach(function (f) {
      const target = path.join(unitDir, f.name);
      const tmp = target + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, f.content);
      staged.push({ tmp: tmp, target: target });
    });
    files.forEach(function (f, i) {
      const target = staged[i].target;
      originals.push({ target: target, data: fs.existsSync(target) ? fs.readFileSync(target) : null });
    });
    const done = [];
    try {
      staged.forEach(function (s) { fs.renameSync(s.tmp, s.target); done.push(s.target); });
    } catch (e) {
      originals.forEach(function (o) { if (done.indexOf(o.target) !== -1 && o.data !== null) { try { fs.writeFileSync(o.target, o.data); } catch (_) { /* best effort */ } } });
      throw e;
    }
  } catch (e) {
    staged.forEach(function (s) { try { fs.unlinkSync(s.tmp); } catch (_) { /* already moved or never written */ } });
    throw new Fail('write_failed', 'cannot write unit files: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// flags

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

function need(flags, names) {
  names.forEach(function (f) { if (!flags[f]) throw new Fail('usage', f + ' is required'); });
}

// ---------------------------------------------------------------------------
// subcommands

function now() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function checkRemote(id, remoteFlag) {
  let remote = remoteFlag;
  if (remote === 'none') return false;
  if (!remote) {
    try {
      git(['remote', 'get-url', 'origin']);
    } catch (_) {
      return false;
    }
    remote = 'origin';
  }
  let out;
  try {
    out = git(['ls-remote', '--heads', remote, 'refs/heads/wu/' + id]);
  } catch (e) {
    throw new Fail('remote_unreachable', 'cannot query remote "' + remote + '" for wu/' + id + ': ' + String(e.stderr || e.message).trim());
  }
  if (out.trim() !== '') throw new Fail('id_collision', 'id "' + id + '" collides with an existing remote branch wu/' + id, { collision: 'remote' });
  return true;
}

function cmdCreate(flags) {
  need(flags, ['--graph', '--units', '--id', '--source', '--request']);
  const G = loadGraph(flags);
  const id = flags['--id'];
  if (!ID_RE.test(id)) throw new Fail('usage', '--id must match ^[a-z0-9][a-z0-9-]*$');
  if (TRIGGER_SOURCES.indexOf(flags['--source']) === -1) throw new Fail('usage', '--source must be one of: ' + TRIGGER_SOURCES.join(', '));
  const units = flags['--units'];
  const archive = flags['--archive'] || path.join(units, 'archive');
  const unitDir = path.join(units, id);
  if (fs.existsSync(unitDir)) throw new Fail('id_collision', 'id "' + id + '" collides with an existing work unit: ' + unitDir, { collision: 'work-units' });
  if (fs.existsSync(path.join(archive, id)) || fs.existsSync(path.join(archive, id + '.md'))) {
    throw new Fail('id_collision', 'id "' + id + '" collides with an archived work unit in ' + archive, { collision: 'archive' });
  }
  const remoteChecked = checkRemote(id, flags['--remote']);

  const t = now();
  const state = {
    schema_version: SCHEMA_VERSION,
    id: id,
    created_at: t,
    updated_at: t,
    trigger: { source: flags['--source'], request: flags['--request'], branch: flags['--branch'] || null },
    current_node: G.entry,
    current_task: null,
    phase: null,
    walked_path: [G.entry],
    blocked_at: null,
    fail_counters: {},
    advisor_consults: [],
    reviews: [],
    human_decisions: [],
    outcome: null,
    outcome_reason: null,
  };
  const materialized = [];
  G.fields.forEach(function (f) {
    if (isApplicable(G, f, state)) { state[f.name] = clone(f.def); materialized.push(f.name); }
  });
  const line = {
    id: 'L-0001',
    timestamp: t,
    source: 'orchestrator',
    actor: null,
    node: G.entry,
    event_type: 'create',
    description: 'Created work-unit folder from ' + flags['--source'] + '.',
    source_ref: null,
  };
  const v = makeCollector();
  checkLog(G, [line], v, { G: G, unitDir: unitDir, logIds: { 'L-0001': true } });
  checkState(G, state, null, [line], unitDir, v);
  if (v.list.length) throw failState(v.list, 'new unit');
  try {
    fs.mkdirSync(units, { recursive: true });
    fs.mkdirSync(unitDir);
  } catch (e) {
    throw new Fail(e.code === 'EEXIST' ? 'already_exists' : 'write_failed', 'cannot create work-unit folder ' + unitDir + ': ' + e.message);
  }
  try {
    writePair(unitDir, [{ name: 'log.ndjson', content: serializeLines([line]) }, { name: 'state.json', content: serializeState(state) }]);
  } catch (e) {
    try { fs.rmSync(unitDir, { recursive: true, force: true }); } catch (_) { /* best effort */ }
    throw e;
  }
  return { ok: true, action: 'created', id: id, path: unitDir, current_node: G.entry, materialized: materialized, remote_checked: remoteChecked };
}

function cmdValidate(flags) {
  need(flags, ['--graph', '--unit']);
  const G = loadGraph(flags);
  const r = validateStored(G, flags['--unit']);
  return { ok: true, action: 'valid', id: r.unit.state.id, current_node: r.unit.state.current_node, phase: r.unit.state.phase, log_lines: r.lines.length };
}

function cmdWrite(flags) {
  need(flags, ['--graph', '--unit', '--state']);
  if (!!flags['--log'] === !!flags['--log-full']) throw new Fail('usage', 'exactly one of --log or --log-full is required');
  const G = loadGraph(flags);
  const unitDir = flags['--unit'];
  const cur = readUnit(unitDir);
  const curLog = parseLog(cur.logBuf);
  const v = makeCollector();

  if (curLog.lines.length > 0) {
    const last = curLog.lines[curLog.lines.length - 1];
    if (isPlainObject(last) && last.event_type === 'archive') throw failState([{ rule: 'frozen', message: 'the unit carries its archive log line; no further writes are allowed' }], 'draft');
  }

  const draft = readJsonFile(flags['--state'], 'state draft');

  // the new log content
  let newBuf;
  let added;
  if (flags['--log']) {
    const input = readJsonFile(flags['--log'], 'log draft');
    added = Array.isArray(input) ? input : [input];
    newBuf = Buffer.concat([cur.logBuf, serializeLines(added)]);
  } else {
    newBuf = readFileOr(flags['--log-full'], 'log draft');
    if (newBuf.length < cur.logBuf.length || !newBuf.subarray(0, cur.logBuf.length).equals(cur.logBuf)) {
      v('log-not-prefix', 'log.ndjson is append-only: the existing content must be a byte-prefix of the new content');
    }
    added = null;
  }
  const full = parseLog(newBuf);
  full.errors.forEach(function (m) { v('log-malformed', m); });
  const addedCount = flags['--log'] ? added.length : full.lines.length - curLog.lines.length;
  if (addedCount < 1) v('no-log-line', 'every state change needs at least one new log line');

  // materialize defaults for fields that became applicable with this write
  const materialized = [];
  if (isPlainObject(draft)) {
    G.fields.forEach(function (f) {
      if (!(f.name in draft) && isApplicable(G, f, draft) && !isApplicable(G, f, cur.state)) {
        draft[f.name] = clone(f.def);
        materialized.push(f.name);
      }
    });
  }

  const ctx = { G: G, unitDir: unitDir };
  checkLog(G, full.lines, v, ctx);
  // immutable identity
  if (isPlainObject(draft)) {
    ['schema_version', 'id', 'created_at'].forEach(function (k) { if (draft[k] !== cur.state[k]) v('identity-changed', k + ' must not change for the life of the work unit'); });
    if (!deepEqual(draft.trigger, cur.state.trigger)) v('identity-changed', 'trigger must not change for the life of the work unit');
  }
  checkState(G, draft, cur.state, full.lines, unitDir, v);
  if (isPlainObject(draft) && isPlainObject(cur.state)) checkAuthorization(G, cur.state, draft, v);
  if (isPlainObject(draft) && draft.outcome === null) {
    const hasArchive = full.lines.some(function (l) { return isPlainObject(l) && l.event_type === 'archive'; });
    if (hasArchive) v('state-invalid', 'an archive log line requires the outcome to be set');
  }
  if (v.list.length) throw failState(v.list, 'draft');

  writePair(unitDir, [{ name: 'log.ndjson', content: newBuf }, { name: 'state.json', content: serializeState(draft) }]);
  return { ok: true, action: 'written', id: draft.id, current_node: draft.current_node, appended: addedCount, materialized: materialized };
}

function cmdArchive(flags) {
  need(flags, ['--graph', '--unit']);
  const G = loadGraph(flags);
  const unitDir = path.resolve(flags['--unit']);
  const r = validateStored(G, unitDir);
  const v = makeCollector();
  if (r.unit.state.outcome === null) v('archive-not-ready', 'archive requires the outcome to be set');
  const last = r.lines[r.lines.length - 1];
  if (!isPlainObject(last) || last.event_type !== 'archive') v('archive-not-ready', 'archive requires the final log line to be an "archive" event');
  if (!fs.existsSync(path.join(unitDir, 'handoff.md'))) v('archive-not-ready', 'archive requires handoff.md at the folder root');
  if (v.list.length) throw failState(v.list, 'archive');
  const toDir = flags['--to'] || path.join(path.dirname(unitDir), 'archive');
  const target = path.join(toDir, r.unit.state.id);
  if (fs.existsSync(target)) throw new Fail('already_exists', 'archive target already exists: ' + target);
  try {
    fs.mkdirSync(toDir, { recursive: true });
    fs.renameSync(unitDir, target);
  } catch (e) {
    throw new Fail('write_failed', 'cannot move work-unit folder to archive: ' + e.message);
  }
  return { ok: true, action: 'archived', id: r.unit.state.id, path: target };
}

// ---------------------------------------------------------------------------
// red-check surface: land-tests and expect-red

// The re_entry rule whose items_field holds the ticket, and the record.
function findTicket(G, unitDir, ticket) {
  if (!fs.existsSync(unitDir) || !fs.statSync(unitDir).isDirectory()) throw new Fail('not_found', 'work-unit folder not found: ' + unitDir);
  const state = readJsonFile(path.join(unitDir, 'state.json'), 'state.json');
  for (let i = 0; i < G.reentry.length; i++) {
    const R = G.reentry[i];
    const items = isPlainObject(state) ? state[R.items_field] : null;
    const record = Array.isArray(items) ? items.find(function (it) { return isPlainObject(it) && it.id === ticket; }) : undefined;
    if (record) return { rule: R, record: record };
  }
  throw new Fail('state', 'no re_entry items field of the unit holds a record with id "' + ticket + '"', { ticket: ticket });
}

function requireDir(dir, label) {
  let st = null;
  try {
    st = fs.statSync(dir);
  } catch (_) { /* reported below */ }
  if (!st || !st.isDirectory()) throw new Fail('not_found', label + ' is not an existing directory: ' + dir);
  return dir;
}

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (_) {
    return null;
  }
}

// Every regular file under `root`, as sorted '/'-joined relative paths. A symlink or any entry
// that is neither a regular file nor a directory is refused.
function listFiles(root) {
  const out = [];
  (function walk(dir, rel) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      const full = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      const st = fs.lstatSync(full);
      if (st.isSymbolicLink()) throw new Fail('state', 'declared test tree holds a symlink, which is refused: ' + full);
      if (st.isDirectory()) walk(full, r);
      else if (st.isFile()) out.push(r);
      else throw new Fail('state', 'declared test tree holds an entry that is neither a regular file nor a directory: ' + full);
    });
  })(root, '');
  return out.sort();
}

// Plans one destination: every existing path component inside the worktree must be a real
// directory (never a symlink), and the file itself, if present, a regular file.
function checkDestination(wtReal, rel) {
  const segs = rel.split('/');
  let cur = wtReal;
  for (let i = 0; i < segs.length; i++) {
    cur = path.join(cur, segs[i]);
    const st = lstatOrNull(cur);
    if (!st) return;
    const last = i === segs.length - 1;
    if (st.isSymbolicLink()) throw new Fail('write_failed', 'destination ' + cur + ' is a symlink, which is refused (it could lead outside the worktree)');
    if (!last && !st.isDirectory()) throw new Fail('write_failed', 'destination ' + cur + ' is not a directory, so ' + rel + ' cannot be landed');
    if (last && !st.isFile()) throw new Fail('write_failed', 'destination ' + cur + ' exists and is not a regular file');
  }
}

function cmdLandTests(flags) {
  need(flags, ['--graph', '--unit', '--worktree', '--ticket']);
  const G = loadGraph(flags);
  const ticket = flags['--ticket'];
  const found = findTicket(G, flags['--unit'], ticket);
  if (ticket === '.' || ticket === '..' || /[\\/\0]/.test(ticket)) throw new Fail('state', 'ticket id "' + ticket + '" is not a single safe path segment');
  const worktree = requireDir(flags['--worktree'], 'worktree');
  const stage = path.join(flags['--unit'], found.rule.node);
  const testsDir = path.join(stage, 'tests');
  const source = path.join(testsDir, ticket);
  [stage, testsDir, source].forEach(function (p) {
    const st = lstatOrNull(p);
    if (st && st.isSymbolicLink()) throw new Fail('state', 'stage path ' + p + ' is a symlink, which is refused');
  });
  const sst = lstatOrNull(source);
  if (!sst || !sst.isDirectory()) throw new Fail('not_found', 'no declared test files for ticket "' + ticket + '": ' + source + ' does not exist');
  const files = listFiles(source);
  if (files.length === 0) throw new Fail('not_found', 'no declared test files for ticket "' + ticket + '": ' + source + ' holds no regular file');
  const wtReal = fs.realpathSync(worktree);
  files.forEach(function (rel) { checkDestination(wtReal, rel); });
  try {
    files.forEach(function (rel) {
      const dest = path.join(wtReal, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(source, rel), dest);
    });
  } catch (e) {
    throw new Fail('write_failed', 'cannot land the declared test files in ' + worktree + ': ' + e.message);
  }
  return { ok: true, action: 'tests-landed', ticket: ticket, source: source, files: files };
}

function cmdExpectRed(flags) {
  need(flags, ['--graph', '--unit', '--worktree', '--ticket']);
  const G = loadGraph(flags);
  const ticket = flags['--ticket'];
  const found = findTicket(G, flags['--unit'], ticket);
  const recFields = G.fieldsByName[found.rule.items_field].entry.items.fields;
  const commandKeys = Object.keys(recFields).filter(function (k) { return recFields[k].type === 'command'; });
  if (commandKeys.length !== 1) {
    throw new Fail('graph', 'the records of "' + found.rule.items_field + '" must carry exactly one command-typed field for expect-red, found ' + commandKeys.length + (commandKeys.length ? ': ' + commandKeys.join(', ') : ''));
  }
  const command = found.record[commandKeys[0]];
  if (typeof command !== 'string' || command.trim() === '') throw new Fail('state', 'ticket "' + ticket + '" has no runnable ' + commandKeys[0], { ticket: ticket });
  const worktree = requireDir(flags['--worktree'], 'worktree');
  const r = spawnSync(command, { shell: true, cwd: worktree, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const tail = ((r.stdout || '') + (r.stderr || '')).slice(-TAIL_CHARS);
  const body = { ticket: ticket, command: command, exit_status: r.status === null || r.status === undefined ? null : r.status, signal: r.signal || null, output_tail: tail };
  if (r.error || r.signal || r.status === null || r.status === 126 || r.status === 127) {
    const why = r.error ? 'spawn error: ' + r.error.message : r.signal ? 'killed by signal ' + r.signal : 'exit status ' + r.status;
    throw new Fail('not_runnable', 'ticket "' + ticket + '": the verification command could not run (' + why + '); a command that cannot run is a defect, not red', body);
  }
  if (r.status === 0) throw new Fail('already_green', 'ticket "' + ticket + '": the verification command exited 0 before any implementation, so the ticket is already green', body);
  return Object.assign({ ok: true, action: 'red-observed' }, body);
}

const TYPES_FLAGS = ['--types', '--plugin-types'];
const COMMANDS = {
  create: { run: cmdCreate, flags: ['--graph', '--units', '--id', '--source', '--request', '--branch', '--archive', '--remote'].concat(TYPES_FLAGS) },
  validate: { run: cmdValidate, flags: ['--graph', '--unit'].concat(TYPES_FLAGS) },
  write: { run: cmdWrite, flags: ['--graph', '--unit', '--state', '--log', '--log-full'].concat(TYPES_FLAGS) },
  archive: { run: cmdArchive, flags: ['--graph', '--unit', '--to'].concat(TYPES_FLAGS) },
  'land-tests': { run: cmdLandTests, flags: ['--graph', '--unit', '--worktree', '--ticket'].concat(TYPES_FLAGS) },
  'expect-red': { run: cmdExpectRed, flags: ['--graph', '--unit', '--worktree', '--ticket'].concat(TYPES_FLAGS) },
};

const USAGE = 'work-unit.mjs create|validate|write|archive|land-tests|expect-red --graph <graph.json> ... (see the header comment)';

function run(argv) {
  const sub = argv[0];
  if (sub === '--help' || sub === '-h') return { ok: true, action: 'help', usage: USAGE, subcommands: Object.keys(COMMANDS) };
  if (!sub || !(sub in COMMANDS)) throw new Fail('usage', USAGE + (sub ? ' (unknown subcommand: ' + sub + ')' : ''));
  return COMMANDS[sub].run(parseFlags(argv.slice(1), COMMANDS[sub].flags));
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
