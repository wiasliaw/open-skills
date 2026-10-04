// work-unit.mjs - the single write gate for the work-unit folder. It creates a
// unit, validates a stored unit, gates every state/log write, and archives a
// unit at a terminal. The orchestrator drafts state and log lines; this script
// validates the draft against the work-unit-state contract plus the unit's
// graph declaration and applies it atomically. Hand-editing state.json or
// log.ndjson is forbidden.
//
// Usage (run through node, with the consumer project as the cwd):
//   node work-unit.mjs create   --graph <graph.json> --units <dir> --id <id> --source <source>
//                               --request <text> [--branch <name>] [--archive <dir>] [--remote <name|url|none>]
//   node work-unit.mjs validate --graph <graph.json> --unit <dir>
//   node work-unit.mjs write    --graph <graph.json> --unit <dir> --state <draft.json>
//                               (--log <lines.json> | --log-full <log.ndjson draft>)
//   node work-unit.mjs archive  --graph <graph.json> --unit <dir> [--to <archive dir>]
//   node work-unit.mjs --help
//
// --graph is the project's graph definition (the per-unit schema is derived
// from it at validation time; no schema file is stored). `--log` is a JSON
// file holding one log-line object or an array of them, appended to the
// existing log. `--log-full` is the complete new log.ndjson content; the gate
// requires the existing bytes to be a byte-prefix of it. `--archive` defaults
// to <units>/archive. `--remote` is the git remote (name or URL) whose
// `wu/<id>` branches the id must not collide with; it defaults to `origin`
// when that remote exists and is skipped when it does not; `none` skips it.
//
// Graph definition fields this script reads (see the graph-definition spec):
//   nodes[]{id,type,mounts.commands,terminal|kind|outcome}, edges[]{from,to},
//   caps{consultation|advisor_consultations,...}, phase{<name>:{path[]}}
//   (also accepted as `phases`), state_fields{<name>:<field declaration>}.
// A field declaration: {type: string|integer|number|boolean|object|list,
//   nullable, values, items, fields, default, node | phases, scope_kind,
//   executes}. Spec keys inside items/fields: pointer (string is a
//   folder-relative file pointer), evidence (object is an evidence ref),
//   command (string is a run-time-generated invocation), optional (object
//   key may be absent). `scope_kind` on a list of {id} objects declares a
//   failure-counter scope kind `<scope_kind>:<id>`. `executes` names the node
//   whose mounts must cover each command-marked value. A declaration named
//   like a core field is ignored (the core contract wins).
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "created" | "valid" | "written" | "archived" | "help", ...}
//   failure: {"ok": false, "error": "<code>", "message": "...", "violations": [{"rule","message"}]}
//
// Exit codes (consumers branch on the "error" code; the exit code is the
// coarse signal):
//   0  ok
//   1  internal          unexpected exception inside the script
//   2  usage             unknown subcommand or missing/duplicate/invalid flags
//   3  state             draft or stored unit violates the contract or an invariant
//   4  write_failed      the folder or a file could not be written or moved
//   5  not_found         the work-unit folder, a required file, or the graph file is missing
//   6  already_exists    create or archive target already exists
//   7  node_version      Node.js older than 20
//   8  graph             the graph definition cannot back a work unit
//   9  id_collision      the id exists in the work-units location, the archive, or as a remote wu/<id> branch
//   10 remote_unreachable the remote could not be queried for wu/<id> branches

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MIN_NODE_MAJOR = 20;
const SCHEMA_VERSION = '1.0.0';

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
  'archive': 'orchestrator',
  'report': 'actor-report',
  'verdict': 'actor-report',
  'advisor-consultation': 'actor-report',
  'human-decision': 'human-answer',
};
const ACTORS = ['worker', 'reviewer', 'advisor'];
const APPROVAL_DECISIONS = ['approved', 'send-back', 'not-needed'];
const ESCALATION_DECISIONS = ['retry', 'move-back', 'end'];
const CORE_FIELDS = [
  'schema_version', 'id', 'created_at', 'updated_at', 'trigger', 'current_node',
  'phase', 'walked_path', 'blocked_at', 'fail_counters', 'advisor_consults',
  'reviews', 'human_decisions', 'outcome', 'outcome_reason',
];

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
// graph definition: load and compile what the gate needs

const PLACEHOLDER_RE = /^(\{\{.*\}\}|<.*>|\[.*\]|\{.*\}|\$\{?\w+\}?)$/;

function tokenize(cmd) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) tokens.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  return tokens;
}

// A mount is a plain command (covers exactly itself), a string family with a
// placeholder token (base = the tokens before it), or {base, args}.
function compileMount(entry) {
  if (typeof entry === 'string') {
    const tokens = tokenize(entry);
    const idx = tokens.findIndex(function (t) { return PLACEHOLDER_RE.test(t); });
    if (idx === -1) return { base: tokens, family: false };
    const base = tokens.slice(0, idx);
    while (base.length && base[base.length - 1] === '--') base.pop(); // `--` introduces the argument pattern
    return { base: base, family: true };
  }
  if (isPlainObject(entry) && typeof (entry.base || entry.command) === 'string') {
    return { base: tokenize(entry.base || entry.command), family: true };
  }
  return null;
}

function mountCovers(mount, invocation) {
  const tokens = tokenize(invocation);
  if (mount.base.length === 0 || tokens.length < mount.base.length) return false;
  for (let i = 0; i < mount.base.length; i++) if (tokens[i] !== mount.base[i]) return false;
  return mount.family || tokens.length === mount.base.length;
}

function terminalKind(node) {
  if (node.outcome === 'shipped' || node.outcome === 'ended') return node.outcome;
  const k = node.terminal || node.kind;
  if (k === 'success' || k === 'shipped') return 'shipped';
  if (k === 'abandonment' || k === 'abandon' || k === 'ended') return 'ended';
  return node.id === 'end' || /^abandon/.test(node.id) ? 'ended' : 'shipped';
}

function compileGraph(raw, label) {
  const errs = [];
  const bad = function (m) { errs.push(m); };
  if (!isPlainObject(raw)) throw new Fail('graph', label + ': top level must be an object');
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : null;
  if (!nodes) bad('nodes must be an array');
  const nodesById = {};
  let entry = null;
  const terminals = {};
  (nodes || []).forEach(function (n, i) {
    if (!isPlainObject(n) || typeof n.id !== 'string' || !n.id) { bad('nodes[' + i + '] needs a string id'); return; }
    if (n.id in nodesById) { bad('duplicate node id "' + n.id + '"'); return; }
    nodesById[n.id] = n;
    if (n.type === 'entry') {
      if (entry !== null) bad('more than one entry node');
      entry = n.id;
    }
    if (n.type === 'terminal') terminals[n.id] = terminalKind(n);
  });
  if (nodes && entry === null) bad('no entry node (type "entry")');
  if (nodes && Object.keys(terminals).length === 0) bad('no terminal node (type "terminal")');

  const edges = Array.isArray(raw.edges) ? raw.edges : [];
  edges.forEach(function (e, i) {
    if (!isPlainObject(e) || typeof e.from !== 'string' || typeof e.to !== 'string') bad('edges[' + i + '] needs string from/to');
  });

  const caps = isPlainObject(raw.caps) ? raw.caps : {};
  const consultCap = [caps.consultation, caps.consultations, caps.advisor_consultations].find(Number.isInteger);
  if (!Number.isInteger(consultCap) || consultCap < 0) bad('caps must declare a non-negative integer consultation cap');

  const phaseDecl = isPlainObject(raw.phase) ? raw.phase : isPlainObject(raw.phases) ? raw.phases : null;
  const phases = {};
  let firstNode = null;
  if (!phaseDecl) bad('phase vocabulary missing (key "phase")');
  else {
    if (!('maintenance' in phaseDecl)) bad('phase vocabulary must declare "maintenance"');
    Object.keys(phaseDecl).forEach(function (name) {
      const p = phaseDecl[name];
      if (!isPlainObject(p) || !Array.isArray(p.path) || p.path.length === 0) { bad('phase "' + name + '" needs a non-empty path'); return; }
      p.path.forEach(function (id) { if (!(id in nodesById)) bad('phase "' + name + '" path names undeclared node "' + id + '"'); });
      if (firstNode === null) firstNode = p.path[0];
      else if (p.path[0] !== firstNode) bad('phase "' + name + '" does not share the first node "' + firstNode + '"');
      phases[name] = { path: p.path.slice() };
    });
  }

  const fields = [];
  const decls = isPlainObject(raw.state_fields) ? raw.state_fields : {};
  Object.keys(decls).forEach(function (name) {
    if (CORE_FIELDS.indexOf(name) !== -1) return; // the core contract wins
    const d = decls[name];
    if (!isPlainObject(d)) { bad('state_fields.' + name + ' must be an object'); return; }
    const hasNode = typeof d.node === 'string';
    const hasPhases = Array.isArray(d.phases);
    if (hasNode === hasPhases) { bad('state_fields.' + name + ' must bind exactly one of "node" or "phases"'); return; }
    if (hasNode && !(d.node in nodesById)) bad('state_fields.' + name + ' binds undeclared node "' + d.node + '"');
    if (hasPhases) d.phases.forEach(function (p) { if (phaseDecl && !(p in phases)) bad('state_fields.' + name + ' binds undeclared phase "' + p + '"'); });
    if (d.executes !== undefined && !(d.executes in nodesById)) bad('state_fields.' + name + '.executes names undeclared node "' + d.executes + '"');
    if (d.scope_kind !== undefined && (typeof d.scope_kind !== 'string' || !ID_RE.test(d.scope_kind) || d.scope_kind === 'node' || d.scope_kind === 'edge' || d.type !== 'list')) {
      bad('state_fields.' + name + '.scope_kind must be an id-like name (not node/edge) on a list field');
    }
    const field = { name: name, spec: d, node: hasNode ? d.node : null, phases: hasPhases ? d.phases : null, scope_kind: d.scope_kind || null, executes: d.executes || null };
    if (!('default' in d)) {
      if (d.nullable) field.def = null;
      else if (d.type === 'list') field.def = [];
      else bad('state_fields.' + name + ' has no default');
    } else field.def = clone(d.default);
    fields.push(field);
  });
  // Declared defaults must satisfy their own declaration (pointers excluded).
  fields.forEach(function (f) {
    if (f.def === undefined) return;
    const probe = makeCollector();
    checkSpec(f.def, f.spec, f.name + '.default', probe, null, true);
    probe.list.forEach(function (x) { bad(x.message); });
  });

  if (errs.length) throw new Fail('graph', label + ': ' + errs.join('; '), { violations: errs.map(function (m) { return { rule: 'graph-definition', message: m }; }) });

  const mounts = {};
  Object.keys(nodesById).forEach(function (id) {
    const m = nodesById[id].mounts;
    const cmds = isPlainObject(m) && Array.isArray(m.commands) ? m.commands : [];
    mounts[id] = cmds.map(compileMount).filter(Boolean);
  });
  return { nodesById: nodesById, entry: entry, terminals: terminals, edges: edges, consultCap: consultCap, phases: phases, firstNode: firstNode, fields: fields, mounts: mounts };
}

function loadGraph(file) {
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
  return compileGraph(raw, 'graph definition ' + file);
}

// ---------------------------------------------------------------------------
// applicability: one definition shared by materialization and validation

function isApplicable(G, field, state) {
  const phase = typeof state.phase === 'string' ? state.phase : null;
  if (field.phases) return phase !== null && field.phases.indexOf(phase) !== -1;
  const walked = Array.isArray(state.walked_path) ? state.walked_path : [];
  const reached = walked.indexOf(field.node) !== -1 || state.current_node === field.node;
  if (!reached) return false;
  return phase === null || (G.phases[phase] !== undefined && G.phases[phase].path.indexOf(field.node) !== -1);
}

// ---------------------------------------------------------------------------
// value / pointer / evidence checks

function isIso(v) {
  return typeof v === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)
    && !Number.isNaN(Date.parse(v));
}

// ctx: {G, unitDir, logIds} - pointers/evidence need the folder; when ctx is
// null (graph default probing) pointer-like checks are skipped.
function checkPointer(p, where, v, ctx) {
  if (typeof p !== 'string' || p === '') { v('pointer-invalid', where + ' must be a non-empty folder-relative path'); return; }
  if (path.isAbsolute(p) || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.indexOf('\\') !== -1) { v('pointer-invalid', where + ' must be folder-relative: ' + p); return; }
  const segs = p.split('/');
  if (segs.indexOf('..') !== -1 || segs.indexOf('.') !== -1 || segs.indexOf('') !== -1) { v('pointer-invalid', where + ' must be a normalized path inside the folder: ' + p); return; }
  if (!ctx) return;
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
  if (ref.kind === 'log' && ctx && !ctx.logIds[ref.ref]) v('evidence-dangling', where + '.ref names no log line: ' + ref.ref);
}

// Validates `value` against a field spec. `invocations` (array|null) collects
// command-marked strings. `noFiles` skips folder-dependent checks.
function checkSpec(value, spec, where, v, ctx, noFiles, invocations) {
  if (value === null) {
    if (!spec.nullable) v('type-mismatch', where + ' must not be null');
    return;
  }
  const t = spec.type;
  if (t === 'string') {
    if (typeof value !== 'string') { v('type-mismatch', where + ' must be a string'); return; }
    if (spec.pointer && !noFiles) checkPointer(value, where, v, ctx);
    if (spec.command && invocations) invocations.push({ where: where, value: value });
  } else if (t === 'integer') {
    if (!Number.isInteger(value)) { v('type-mismatch', where + ' must be an integer'); return; }
  } else if (t === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) { v('type-mismatch', where + ' must be a number'); return; }
  } else if (t === 'boolean') {
    if (typeof value !== 'boolean') { v('type-mismatch', where + ' must be a boolean'); return; }
  } else if (t === 'object') {
    if (!isPlainObject(value)) { v('type-mismatch', where + ' must be an object'); return; }
    if (spec.evidence && !noFiles) checkEvidence(value, where, v, ctx);
    if (isPlainObject(spec.fields)) {
      Object.keys(value).forEach(function (k) { if (!(k in spec.fields)) v('undeclared-field', where + ' has undeclared key "' + k + '"'); });
      Object.keys(spec.fields).forEach(function (k) {
        if (!(k in value)) { if (!spec.fields[k].optional) v('type-mismatch', where + '.' + k + ' is required'); return; }
        checkSpec(value[k], spec.fields[k], where + '.' + k, v, ctx, noFiles, invocations);
      });
    }
  } else if (t === 'list') {
    if (!Array.isArray(value)) { v('type-mismatch', where + ' must be a list'); return; }
    value.forEach(function (item, i) {
      if (spec.items) checkSpec(item, spec.items, where + '[' + i + ']', v, ctx, noFiles, invocations);
      else if (Array.isArray(spec.values) && spec.values.indexOf(item) === -1) v('value-not-allowed', where + '[' + i + '] must be one of: ' + spec.values.join(', '));
    });
    return;
  } else {
    v('type-mismatch', where + ' has unsupported declared type "' + t + '"');
    return;
  }
  if (Array.isArray(spec.values) && t !== 'object' && spec.values.indexOf(value) === -1) {
    v('value-not-allowed', where + ' must be one of: ' + spec.values.join(', '));
  }
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

function scopeValid(G, state, scope) {
  let m = /^node:(.+)$/.exec(scope);
  if (m) return m[1] in G.nodesById ? null : 'scope "' + scope + '" names an undeclared node';
  m = /^edge:(.+)$/.exec(scope);
  if (m) {
    const body = m[1];
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== '-') continue;
      const from = body.slice(0, i);
      const to = body.slice(i + 1);
      if (G.edges.some(function (e) { return e.from === from && e.to === to; })) return null;
    }
    return 'scope "' + scope + '" names no declared edge';
  }
  m = /^([a-z0-9][a-z0-9-]*):(.+)$/.exec(scope);
  if (m) {
    const kinds = G.fields.filter(function (f) { return f.scope_kind === m[1]; });
    if (kinds.length === 0) return 'scope kind "' + m[1] + '" is not declared by the graph';
    const live = kinds.filter(function (f) { return Array.isArray(state[f.name]) && state[f.name].some(function (it) { return isPlainObject(it) && it.id === m[2]; }); });
    if (live.length === 0) return 'scope "' + scope + '" names no existing ' + m[1] + ' (a scope exists only where its concept does)';
    return null;
  }
  return 'scope "' + scope + '" is not node:<id>, edge:<from>-<to>, or a declared <kind>:<id>';
}

// ---------------------------------------------------------------------------
// the state contract

function checkState(G, state, prev, lines, unitDir, v) {
  if (!isPlainObject(state)) { v('state-invalid', 'state.json top level must be an object'); return; }
  const logIds = {};
  lines.forEach(function (l) { if (isPlainObject(l) && typeof l.id === 'string') logIds[l.id] = true; });
  const ctx = { G: G, unitDir: unitDir, logIds: logIds };
  const declared = {};
  G.fields.forEach(function (f) { declared[f.name] = f; });

  // top-level fields: core, or declared by the graph and applicable
  Object.keys(state).forEach(function (k) {
    if (CORE_FIELDS.indexOf(k) !== -1) return;
    if (!(k in declared)) v('undeclared-field', 'top-level field "' + k + '" is neither in the core contract nor declared by the graph');
  });
  CORE_FIELDS.forEach(function (k) { if (!(k in state)) v('state-invalid', 'state.json is missing core field "' + k + '"'); });

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

  // current node, walked path
  if (typeof state.current_node !== 'string' || !(state.current_node in G.nodesById)) v('node-undeclared', 'current_node must be a node id declared by the graph');
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
  if (phase !== null && (typeof phase !== 'string' || !(phase in G.phases))) v('phase-undeclared', 'phase must be null or a key of the graph phase vocabulary');
  else if (phase === null && prev && prev.phase !== null) v('phase-immutable', 'the recorded phase cannot be cleared');
  if (prev && prev.phase !== null && phase !== prev.phase) v('phase-immutable', 'the phase is immutable once recorded (was "' + prev.phase + '", draft has ' + JSON.stringify(phase) + ')');
  if (isPlainObject(trig)) {
    if (phase === 'maintenance' && trig.source !== 'maintenance-due') v('maintenance-binding', 'the maintenance phase may only be recorded on a unit with trigger source maintenance-due');
    if (trig.source === 'maintenance-due' && phase !== null && phase !== 'maintenance') v('maintenance-binding', 'a maintenance-due unit may record no phase other than maintenance');
  }
  if (typeof state.current_node === 'string' && state.current_node in G.nodesById) {
    const cn = state.current_node;
    const abandon = G.terminals[cn] === 'ended';
    if (typeof phase === 'string' && phase in G.phases) {
      if (G.phases[phase].path.indexOf(cn) === -1 && !abandon && cn !== G.entry) v('node-off-path', 'current_node "' + cn + '" is neither on the path of phase "' + phase + '" nor the abandonment terminal');
    } else if (phase === null && cn !== G.entry && cn !== G.firstNode && !abandon) {
      v('node-off-path', 'before the phase is recorded, current_node must be the entry node, the shared first node, or the abandonment terminal');
    }
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
    if (present && !applicable) v('field-inapplicable', 'field "' + f.name + '" exists outside its applicability (' + (f.node ? 'node "' + f.node + '" not on the unit\'s approved path or not reached' : 'phases ' + f.phases.join('/') + ' not approved') + ')');
    else if (!present && applicable) v('field-missing', 'field "' + f.name + '" is applicable and must be present');
    else if (present) {
      const invocations = [];
      checkSpec(state[f.name], f.spec, f.name, v, ctx, false, invocations);
      if (f.spec.type === 'list' && f.scope_kind && Array.isArray(state[f.name])) {
        const seen = {};
        state[f.name].forEach(function (it, i) {
          if (!isPlainObject(it) || typeof it.id !== 'string' || it.id === '') { v('scope-id-invalid', f.name + '[' + i + '] needs a non-empty string id'); return; }
          if (it.id in seen) v('scope-id-invalid', f.name + '[' + i + '].id duplicates "' + it.id + '"');
          seen[it.id] = true;
        });
      }
      if (f.executes) {
        const probe = invocations.length === 0 && f.spec.type === 'string' && typeof state[f.name] === 'string' ? [{ where: f.name, value: state[f.name] }] : invocations;
        probe.forEach(function (inv) {
          if (!G.mounts[f.executes].some(function (m) { return mountCovers(m, inv.value); })) v('command-not-mounted', inv.where + ' invocation "' + inv.value + '" is not covered by the mounts of node "' + f.executes + '"');
        });
      }
    }
  });

  // fail counters
  if (!isPlainObject(state.fail_counters)) v('state-invalid', 'fail_counters must be an object keyed by scope');
  else {
    Object.keys(state.fail_counters).forEach(function (scope) {
      const bad = scopeValid(G, state, scope);
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
      else { const bad = scopeValid(G, state, p.scope); if (bad) v('scope-invalid', where + ': ' + bad); }
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
      Object.keys(r).forEach(function (k) { if (['id', 'node', 'target', 'verdict', 'dimensions', 'evidence_refs', 'file', 'date'].indexOf(k) === -1) v('state-invalid', where + ' has unknown key "' + k + '"'); });
      if (typeof r.id !== 'string' || r.id === '') v('state-invalid', where + '.id must be a non-empty string');
      else { if (r.id in seen) v('state-invalid', where + '.id duplicates "' + r.id + '"'); seen[r.id] = true; }
      if (typeof r.node !== 'string' || !(r.node in G.nodesById)) v('node-undeclared', where + '.node must be a declared node id');
      if (!isPlainObject(r.target) || typeof r.target.type !== 'string' || typeof r.target.id !== 'string') v('state-invalid', where + '.target must be {type, id}');
      else if (r.target.type === 'stage') { if (!(r.target.id in G.nodesById)) v('node-undeclared', where + '.target.id must be a declared node id'); }
      else { const bad = scopeValid(G, state, r.target.type + ':' + r.target.id); if (bad) v('scope-invalid', where + '.target: ' + bad); }
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
        else if (typeof h.phase !== 'string' || !(h.phase in G.phases)) v('phase-undeclared', where + '.phase must be a declared phase');
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
  const G = loadGraph(flags['--graph']);
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
  const G = loadGraph(flags['--graph']);
  const r = validateStored(G, flags['--unit']);
  return { ok: true, action: 'valid', id: r.unit.state.id, current_node: r.unit.state.current_node, phase: r.unit.state.phase, log_lines: r.lines.length };
}

function cmdWrite(flags) {
  need(flags, ['--graph', '--unit', '--state']);
  if (!!flags['--log'] === !!flags['--log-full']) throw new Fail('usage', 'exactly one of --log or --log-full is required');
  const G = loadGraph(flags['--graph']);
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
  const G = loadGraph(flags['--graph']);
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

const COMMANDS = {
  create: { run: cmdCreate, flags: ['--graph', '--units', '--id', '--source', '--request', '--branch', '--archive', '--remote'] },
  validate: { run: cmdValidate, flags: ['--graph', '--unit'] },
  write: { run: cmdWrite, flags: ['--graph', '--unit', '--state', '--log', '--log-full'] },
  archive: { run: cmdArchive, flags: ['--graph', '--unit', '--to'] },
};

const USAGE = 'work-unit.mjs create|validate|write|archive --graph <graph.json> ... (see the header comment)';

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
