// work-unit.mjs - owns the work-unit folder mechanics for the graph-flow
// orchestrator: creating the folder, validating state.json and log.ndjson
// against the graph-plugin-work-unit-state schema and its consistency
// invariants, gating every state write, and archiving at a terminal.
// The orchestrator drafts JSON; this script is the only writer of
// state.json and log.ndjson, and it rejects any draft that violates the
// schema or an invariant.
//
// Usage (always run through node, with the consumer project as the cwd):
//   node work-unit.mjs create   --units <dir> --id <id> --source <source> --request <text> [--issue <ref>]
//   node work-unit.mjs validate --unit <dir>
//   node work-unit.mjs write    --unit <dir> --state <draft.json> --log <lines.json>
//   node work-unit.mjs archive  --unit <dir> --to <dir>
//
// `--log` is a JSON file holding one log-line object or an array of them;
// `write` appends the lines to log.ndjson (never rewriting existing lines)
// and atomically replaces state.json, after validating the combined result.
//
// Requirements: Node.js >= 20. Only Node.js built-in modules and the
// sibling scripts/shared/ modules are used.
//
// Output contract: exactly one JSON object on stdout, diagnostics on stderr.
//   success: {"ok": true, "action": "created" | "valid" | "written" | "archived", ...}
//   failure: {"ok": false, "error": "<code>", "message": "..."}
//
// Exit codes (consumers branch on the "error" code; the exit code is the
// coarse signal):
//   0  ok
//   1  internal        unexpected exception inside the script
//   2  usage           unknown subcommand or missing/duplicate flags
//   3  state           draft or stored file violates the schema or an invariant
//   4  write_failed    the folder or a file could not be written or moved
//   5  not_found       the work-unit folder or a required file is missing
//   6  already_exists  create or archive target already exists
//   7  node_version    Node.js older than 20

import fs from 'node:fs';
import path from 'node:path';
import { MIN_NODE_MAJOR, BASE_EXIT } from './shared/definitions.mjs';
import { Fail, makeReporter, parseFlags, isPlainObject, checkNodeVersion } from './shared/lib.mjs';

const EXIT = Object.assign({}, BASE_EXIT, {
  state: 3,
  write_failed: 4,
  not_found: 5,
  already_exists: 6,
});

const { emit, reportFailure } = makeReporter('work-unit.mjs', EXIT);

// ---------------------------------------------------------------------------
// vocabulary (graph-plugin-work-unit-state)

const NODE_IDS = [
  'trigger', 'research-explore', 'human-gate-grading', 'spec', 'human-gate-spec',
  'ticket', 'build', 'review', 'wrap', 'ship', 'end', 'advisor', 'human-escalation',
];
const BLOCKABLE_NODES = ['research-explore', 'spec', 'ticket', 'build', 'review', 'wrap'];
const REVIEW_NODES = ['research-explore', 'spec', 'ticket', 'review', 'wrap'];
// The four in-node review loops, plus 'build' for the fast-path Review
// failure scope (node:build), where no ticket exists yet.
const FAIL_COUNTER_NODES = ['research-explore', 'spec', 'ticket', 'wrap', 'build'];
const GRADINGS = ['full', 'small', 'trivial', 'no-op'];
const TRIGGER_SOURCES = ['prompt', 'issue', 'ci-failure', 'analysis-request'];
const CI_STATUSES = ['pending', 'green', 'red'];
const TICKET_STATUSES = ['pending', 'in-progress', 'passed', 'failed', 'blocked'];
const CONSULT_STATUSES = ['open', 'escalated', 'resolved', 'abandoned'];
const EVIDENCE_KINDS = ['path', 'command', 'log'];
const EVENT_TYPES = ['create', 'dispatch', 'report', 'verdict', 'advisor-consultation', 'human-decision', 'route', 'archive'];
const EVENT_SOURCE = {
  'create': 'orchestrator', 'dispatch': 'orchestrator', 'route': 'orchestrator', 'archive': 'orchestrator',
  'report': 'actor-report', 'verdict': 'actor-report', 'advisor-consultation': 'actor-report',
  'human-decision': 'human-answer',
};
const ACTORS = ['implementor', 'reviewer', 'advisor'];
const GATE_NODE = { grading: 'human-gate-grading', spec: 'human-gate-spec', escalation: 'human-escalation' };
const GATE_DECISIONS = { grading: ['approved', 'rejected'], spec: ['approved', 'rejected'], escalation: ['unblocked', 'cancel'] };
const STATE_FIELDS = [
  'schema_version', 'id', 'created_at', 'updated_at', 'trigger',
  'current_node', 'grading', 'fast_path', 'blocked_at',
  'spec_ref', 'current_ticket', 'refs', 'ci_status',
  'tickets', 'fail_counters', 'advisor_consults', 'reviews', 'human_decisions',
  'outcome', 'outcome_reason',
];

// ---------------------------------------------------------------------------
// field-level checks

function bad(message) {
  return new Fail('state', message);
}

function isIso(v) {
  return typeof v === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v)
    && !Number.isNaN(Date.parse(v));
}

function checkEnum(v, allowed, where, nullable) {
  if (nullable && v === null) return;
  if (allowed.indexOf(v) === -1) {
    throw bad(where + ' must be ' + (nullable ? 'null or ' : '') + 'one of: ' + allowed.join(', '));
  }
}

function checkString(v, where) {
  if (typeof v !== 'string' || v === '') throw bad(where + ' must be a non-empty string');
}

function checkKeys(obj, allowed, where) {
  for (const key of Object.keys(obj)) {
    if (allowed.indexOf(key) === -1) throw bad(where + ' has unknown key "' + key + '"');
  }
}

// A file pointer: folder-relative, never absolute, never escaping the folder.
function checkPointer(v, where) {
  checkString(v, where);
  if (path.isAbsolute(v) || v.startsWith('/') || /^[A-Za-z]:/.test(v)) {
    throw bad(where + ' must be folder-relative: ' + v);
  }
  if (v.split(/[\\/]/).indexOf('..') !== -1) {
    throw bad(where + ' must not contain "..": ' + v);
  }
}

function checkEvidenceRef(v, where) {
  if (!isPlainObject(v)) throw bad(where + ' must be an object');
  checkKeys(v, ['kind', 'ref'], where);
  checkEnum(v.kind, EVIDENCE_KINDS, where + '.kind', false);
  checkString(v.ref, where + '.ref');
  if (v.kind === 'path' && !v.ref.startsWith('repo:')) checkPointer(v.ref, where + '.ref');
}

// ---------------------------------------------------------------------------
// state.json schema

function validateState(state) {
  if (!isPlainObject(state)) throw bad('state.json top level must be an object');
  checkKeys(state, STATE_FIELDS, 'state.json');
  for (const field of STATE_FIELDS) {
    if (!(field in state)) throw bad('state.json is missing required field "' + field + '"');
  }

  if (typeof state.schema_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(state.schema_version)) {
    throw bad('schema_version must be a semver string');
  }
  if (typeof state.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(state.id)) {
    throw bad('id must match ^[a-z0-9][a-z0-9-]*$');
  }
  if (!isIso(state.created_at)) throw bad('created_at must be an ISO-8601 UTC date-time');
  if (!isIso(state.updated_at)) throw bad('updated_at must be an ISO-8601 UTC date-time');
  if (Date.parse(state.updated_at) < Date.parse(state.created_at)) {
    throw bad('updated_at must not be earlier than created_at');
  }

  if (!isPlainObject(state.trigger)) throw bad('trigger must be an object');
  checkKeys(state.trigger, ['source', 'request'], 'trigger');
  checkEnum(state.trigger.source, TRIGGER_SOURCES, 'trigger.source', false);
  checkString(state.trigger.request, 'trigger.request');

  checkEnum(state.current_node, NODE_IDS, 'current_node', false);
  checkEnum(state.grading, GRADINGS, 'grading', true);
  if (typeof state.fast_path !== 'boolean') throw bad('fast_path must be a boolean');
  checkEnum(state.blocked_at, BLOCKABLE_NODES, 'blocked_at', true);

  if (state.spec_ref !== null) {
    if (!isPlainObject(state.spec_ref)) throw bad('spec_ref must be null or an object');
    checkKeys(state.spec_ref, ['kind', 'ref'], 'spec_ref');
    checkEnum(state.spec_ref.kind, ['openspec-change', 'path', 'url'], 'spec_ref.kind', false);
    checkString(state.spec_ref.ref, 'spec_ref.ref');
  }
  if (state.current_ticket !== null) checkString(state.current_ticket, 'current_ticket');

  if (!isPlainObject(state.refs)) throw bad('refs must be an object');
  checkKeys(state.refs, ['issue', 'pr'], 'refs');
  for (const key of ['issue', 'pr']) {
    if (state.refs[key] !== null) checkString(state.refs[key], 'refs.' + key);
  }
  checkEnum(state.ci_status, CI_STATUSES, 'ci_status', true);

  if (!Array.isArray(state.tickets)) throw bad('tickets must be an array');
  const ticketIds = {};
  state.tickets.forEach(function (t, i) {
    const where = 'tickets[' + i + ']';
    if (!isPlainObject(t)) throw bad(where + ' must be an object');
    checkKeys(t, ['id', 'title', 'description', 'status', 'verification_command', 'evidence_refs'], where);
    checkString(t.id, where + '.id');
    if (t.id in ticketIds) throw bad(where + '.id duplicates "' + t.id + '"');
    ticketIds[t.id] = true;
    checkString(t.title, where + '.title');
    checkString(t.description, where + '.description');
    checkEnum(t.status, TICKET_STATUSES, where + '.status', false);
    checkString(t.verification_command, where + '.verification_command');
    if (!Array.isArray(t.evidence_refs)) throw bad(where + '.evidence_refs must be an array');
    t.evidence_refs.forEach(function (r, j) { checkEvidenceRef(r, where + '.evidence_refs[' + j + ']'); });
    if ((t.status === 'passed' || t.status === 'failed') && t.evidence_refs.length === 0) {
      throw bad(where + '.evidence_refs must be non-empty once ' + t.status);
    }
  });

  if (!isPlainObject(state.fail_counters)) throw bad('fail_counters must be an object');
  for (const key of Object.keys(state.fail_counters)) {
    const m = /^ticket:(.+)$/.exec(key);
    if (m) {
      if (!(m[1] in ticketIds)) throw bad('fail_counters key "' + key + '" refers to no existing ticket');
    } else {
      const n = /^node:(.+)$/.exec(key);
      if (!n || FAIL_COUNTER_NODES.indexOf(n[1]) === -1) {
        throw bad('fail_counters key "' + key + '" must be ticket:<ticket-id> or node:<' + FAIL_COUNTER_NODES.join('|') + '>');
      }
    }
    const v = state.fail_counters[key];
    if (!Number.isInteger(v) || v < 0) throw bad('fail_counters["' + key + '"] must be a non-negative integer');
  }

  if (!Array.isArray(state.advisor_consults)) throw bad('advisor_consults must be an array');
  state.advisor_consults.forEach(function (c, i) {
    const where = 'advisor_consults[' + i + ']';
    if (!isPlainObject(c)) throw bad(where + ' must be an object');
    checkKeys(c, ['problem_key', 'blocked_node', 'count', 'advice', 'status'], where);
    checkString(c.problem_key, where + '.problem_key');
    if (!/^(ticket:[^#]+|node:[^#]+)#[1-9]\d*$/.test(c.problem_key)) {
      throw bad(where + '.problem_key must be <scope-key>#<n>');
    }
    checkEnum(c.blocked_node, BLOCKABLE_NODES, where + '.blocked_node', false);
    if (!Number.isInteger(c.count) || c.count < 0 || c.count > 2) throw bad(where + '.count must be 0, 1, or 2');
    if (!Array.isArray(c.advice)) throw bad(where + '.advice must be an array');
    c.advice.forEach(function (a, j) {
      const aw = where + '.advice[' + j + ']';
      if (!isPlainObject(a)) throw bad(aw + ' must be an object');
      checkKeys(a, ['file', 'date', 'log_ref'], aw);
      checkPointer(a.file, aw + '.file');
      if (!isIso(a.date)) throw bad(aw + '.date must be an ISO-8601 UTC date-time');
      checkString(a.log_ref, aw + '.log_ref');
    });
    if (c.count !== c.advice.length) throw bad(where + '.count must equal the length of its advice list');
    checkEnum(c.status, CONSULT_STATUSES, where + '.status', false);
  });

  if (!Array.isArray(state.reviews)) throw bad('reviews must be an array');
  const reviewIds = {};
  state.reviews.forEach(function (r, i) {
    const where = 'reviews[' + i + ']';
    if (!isPlainObject(r)) throw bad(where + ' must be an object');
    checkKeys(r, ['id', 'node', 'target', 'verdict', 'dimensions', 'evidence_refs', 'file', 'date'], where);
    checkString(r.id, where + '.id');
    if (r.id in reviewIds) throw bad(where + '.id duplicates "' + r.id + '"');
    reviewIds[r.id] = true;
    checkEnum(r.node, REVIEW_NODES, where + '.node', false);
    if (!isPlainObject(r.target)) throw bad(where + '.target must be an object');
    checkKeys(r.target, ['type', 'id'], where + '.target');
    checkEnum(r.target.type, ['ticket', 'stage'], where + '.target.type', false);
    checkString(r.target.id, where + '.target.id');
    if (r.target.type === 'ticket' && !(r.target.id in ticketIds)) {
      throw bad(where + '.target.id refers to no existing ticket');
    }
    if (r.target.type === 'stage' && NODE_IDS.indexOf(r.target.id) === -1) {
      throw bad(where + '.target.id must be a node id');
    }
    checkEnum(r.verdict, ['pass', 'fail'], where + '.verdict', false);
    if (!Array.isArray(r.dimensions)) throw bad(where + '.dimensions must be an array');
    r.dimensions.forEach(function (d, j) {
      const dw = where + '.dimensions[' + j + ']';
      if (!isPlainObject(d)) throw bad(dw + ' must be an object');
      checkKeys(d, ['name', 'result'], dw);
      checkString(d.name, dw + '.name');
      checkEnum(d.result, ['pass', 'fail'], dw + '.result', false);
    });
    if (r.verdict === 'pass' && r.dimensions.some(function (d) { return d.result === 'fail'; })) {
      throw bad(where + ': a pass verdict must have no failing dimension');
    }
    if (!Array.isArray(r.evidence_refs) || r.evidence_refs.length === 0) {
      throw bad(where + '.evidence_refs must hold at least one evidence reference');
    }
    r.evidence_refs.forEach(function (e, j) { checkEvidenceRef(e, where + '.evidence_refs[' + j + ']'); });
    checkPointer(r.file, where + '.file');
    if (!isIso(r.date)) throw bad(where + '.date must be an ISO-8601 UTC date-time');
  });

  if (!Array.isArray(state.human_decisions)) throw bad('human_decisions must be an array');
  const decisionIds = {};
  state.human_decisions.forEach(function (h, i) {
    const where = 'human_decisions[' + i + ']';
    if (!isPlainObject(h)) throw bad(where + ' must be an object');
    checkKeys(h, ['id', 'gate', 'node', 'decision', 'grading', 'date', 'file'], where);
    checkString(h.id, where + '.id');
    if (h.id in decisionIds) throw bad(where + '.id duplicates "' + h.id + '"');
    decisionIds[h.id] = true;
    checkEnum(h.gate, Object.keys(GATE_NODE), where + '.gate', false);
    if (h.node !== GATE_NODE[h.gate]) {
      throw bad(where + '.node must be "' + GATE_NODE[h.gate] + '" for gate "' + h.gate + '"');
    }
    checkEnum(h.decision, GATE_DECISIONS[h.gate], where + '.decision', false);
    if (h.gate === 'grading' && h.decision === 'approved') {
      checkEnum(h.grading, GRADINGS, where + '.grading', false);
    } else if (h.grading !== null) {
      throw bad(where + '.grading must be null unless gate is "grading" and decision "approved"');
    }
    if (!isIso(h.date)) throw bad(where + '.date must be an ISO-8601 UTC date-time');
    checkPointer(h.file, where + '.file');
  });

  checkEnum(state.outcome, ['shipped', 'ended'], 'outcome', true);
  if (state.outcome_reason !== null) checkString(state.outcome_reason, 'outcome_reason');
}

// ---------------------------------------------------------------------------
// log.ndjson schema

function validateLogLine(line, i) {
  const where = 'log line ' + (i + 1);
  if (!isPlainObject(line)) throw bad(where + ' must be an object');
  checkKeys(line, ['id', 'timestamp', 'source', 'actor', 'node', 'event_type', 'description', 'source_ref'], where);
  if (typeof line.id !== 'string' || !/^L-\d{4,}$/.test(line.id)) {
    throw bad(where + '.id must match L-<zero-padded sequence>');
  }
  if (!isIso(line.timestamp)) throw bad(where + '.timestamp must be an ISO-8601 UTC date-time');
  checkEnum(line.event_type, EVENT_TYPES, where + '.event_type', false);
  if (line.source !== EVENT_SOURCE[line.event_type]) {
    throw bad(where + '.source must be "' + EVENT_SOURCE[line.event_type] + '" for event_type "' + line.event_type + '"');
  }
  if (line.source === 'actor-report') {
    checkEnum(line.actor, ACTORS, where + '.actor', false);
  } else if (line.actor !== null) {
    throw bad(where + '.actor must be null unless source is "actor-report"');
  }
  checkEnum(line.node, NODE_IDS, where + '.node', false);
  checkString(line.description, where + '.description');
  if (line.source === 'orchestrator') {
    if (line.source_ref !== null) throw bad(where + '.source_ref must be null for orchestrator events');
  } else {
    checkString(line.source_ref, where + '.source_ref');
  }
}

function logSeq(id) {
  return parseInt(id.slice(2), 10);
}

function validateLogSequence(lines) {
  lines.forEach(validateLogLine);
  for (let i = 1; i < lines.length; i++) {
    if (logSeq(lines[i].id) <= logSeq(lines[i - 1].id)) {
      throw bad('log ids must strictly increase: ' + lines[i - 1].id + ' then ' + lines[i].id);
    }
    if (Date.parse(lines[i].timestamp) < Date.parse(lines[i - 1].timestamp)) {
      throw bad('log timestamps must not decrease: ' + lines[i].id + ' is earlier than ' + lines[i - 1].id);
    }
  }
}

// ---------------------------------------------------------------------------
// consistency invariants (state + log + folder)

function checkInvariants(state, lines, unitDir) {
  // 1. fast_path <-> trivial
  if (state.fast_path !== (state.grading === 'trivial')) {
    throw bad('invariant 1: fast_path must be true if and only if grading is "trivial"');
  }
  // 2. blocked_at <-> an open or escalated problem, and the escalation nodes imply it
  const hasLiveProblem = state.advisor_consults.some(function (c) {
    return c.status === 'open' || c.status === 'escalated';
  });
  if ((state.blocked_at !== null) !== (state.outcome === null && hasLiveProblem)) {
    throw bad('invariant 2: blocked_at must be non-null exactly when outcome is null and a problem is open or escalated');
  }
  if ((state.current_node === 'advisor' || state.current_node === 'human-escalation') && state.blocked_at === null) {
    throw bad('invariant 2: blocked_at must be non-null while current_node is advisor or human-escalation');
  }
  // 3 is enforced by construction: write only appends validated lines.
  // 4. updated_at equals the newest log timestamp
  if (lines.length === 0) throw bad('log.ndjson must hold at least one line');
  if (state.updated_at !== lines[lines.length - 1].timestamp) {
    throw bad('invariant 4: updated_at must equal the newest log timestamp');
  }
  // 5. outcome <-> terminal pairing
  const terminal = state.current_node === 'ship' || state.current_node === 'end';
  if ((state.outcome !== null) !== terminal) {
    throw bad('invariant 5: outcome must be non-null exactly when current_node is ship or end');
  }
  if (state.outcome === 'shipped' && state.current_node !== 'ship') {
    throw bad('invariant 5: outcome "shipped" must pair with current_node "ship"');
  }
  if (state.outcome === 'ended') {
    if (state.current_node !== 'end') throw bad('invariant 5: outcome "ended" must pair with current_node "end"');
    if (state.outcome_reason === null) throw bad('invariant 5: outcome "ended" requires a non-empty outcome_reason');
  }
  if (state.outcome === 'shipped' && state.outcome_reason !== null) {
    throw bad('invariant 5: outcome "shipped" must have a null outcome_reason');
  }
  // 6 is field-level (count === advice.length <= 2), checked in validateState.
  // 7. current_ticket exists; at most one ticket is live
  if (state.current_ticket !== null) {
    if (!state.tickets.some(function (t) { return t.id === state.current_ticket; })) {
      throw bad('invariant 7: current_ticket must be an id in tickets');
    }
  }
  const live = state.tickets.filter(function (t) { return t.status === 'in-progress' || t.status === 'blocked'; });
  if (live.length > 1) throw bad('invariant 7: at most one ticket may be in-progress or blocked');
  // 8. spec_ref present on the contract-bound stretch
  if (['ticket', 'build', 'review', 'wrap', 'ship'].indexOf(state.current_node) !== -1
    && (state.grading === 'full' || state.grading === 'small')
    && state.spec_ref === null) {
    throw bad('invariant 8: spec_ref must be non-null at ' + state.current_node + ' with grading ' + state.grading);
  }
  // 9 is field-level (fail_counters key shape), checked in validateState.
  // 10. every file pointer and folder-relative path evidence ref resolves
  const pointers = [];
  state.reviews.forEach(function (r, i) {
    pointers.push(['reviews[' + i + '].file', r.file]);
    r.evidence_refs.forEach(function (e, j) {
      if (e.kind === 'path' && !e.ref.startsWith('repo:')) pointers.push(['reviews[' + i + '].evidence_refs[' + j + ']', e.ref]);
    });
  });
  state.human_decisions.forEach(function (h, i) { pointers.push(['human_decisions[' + i + '].file', h.file]); });
  state.advisor_consults.forEach(function (c, i) {
    c.advice.forEach(function (a, j) { pointers.push(['advisor_consults[' + i + '].advice[' + j + '].file', a.file]); });
  });
  state.tickets.forEach(function (t, i) {
    t.evidence_refs.forEach(function (e, j) {
      if (e.kind === 'path' && !e.ref.startsWith('repo:')) pointers.push(['tickets[' + i + '].evidence_refs[' + j + ']', e.ref]);
    });
  });
  const root = path.resolve(unitDir);
  pointers.forEach(function (p) {
    const resolved = path.resolve(root, p[1]);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw bad('invariant 10: ' + p[0] + ' escapes the work-unit folder: ' + p[1]);
    }
    if (!fs.existsSync(resolved)) {
      throw bad('invariant 10: ' + p[0] + ' points to a missing file: ' + p[1]);
    }
  });
}

// ---------------------------------------------------------------------------
// folder I/O

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Fail('not_found', 'cannot read ' + label + ' ' + file + ': ' + e.message);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw bad(label + ' ' + file + ': invalid JSON: ' + e.message);
  }
}

function readUnit(unitDir) {
  if (!fs.existsSync(unitDir) || !fs.statSync(unitDir).isDirectory()) {
    throw new Fail('not_found', 'work-unit folder not found: ' + unitDir);
  }
  const state = readJson(path.join(unitDir, 'state.json'), 'state.json');
  const logFile = path.join(unitDir, 'log.ndjson');
  let text;
  try {
    text = fs.readFileSync(logFile, 'utf8');
  } catch (e) {
    throw new Fail('not_found', 'cannot read log.ndjson: ' + e.message);
  }
  const lines = text.split('\n').filter(function (l) { return l.trim() !== ''; }).map(function (l, i) {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw bad('log.ndjson line ' + (i + 1) + ': invalid JSON: ' + e.message);
    }
  });
  return { state: state, lines: lines };
}

function atomicWriteState(unitDir, state) {
  const target = path.join(unitDir, 'state.json');
  const tmp = target + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
    throw new Fail('write_failed', 'cannot write state.json: ' + e.message);
  }
}

function validateUnit(unitDir) {
  const unit = readUnit(unitDir);
  validateState(unit.state);
  validateLogSequence(unit.lines);
  checkInvariants(unit.state, unit.lines, unitDir);
  return unit;
}

// ---------------------------------------------------------------------------
// subcommands

function cmdCreate(flags) {
  for (const f of ['--units', '--id', '--source', '--request']) {
    if (!flags[f]) throw new Fail('usage', f + ' is required');
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(flags['--id'])) {
    throw new Fail('usage', '--id must match ^[a-z0-9][a-z0-9-]*$');
  }
  if (TRIGGER_SOURCES.indexOf(flags['--source']) === -1) {
    throw new Fail('usage', '--source must be one of: ' + TRIGGER_SOURCES.join(', '));
  }
  const unitDir = path.join(flags['--units'], flags['--id']);
  if (fs.existsSync(unitDir)) throw new Fail('already_exists', 'work-unit folder already exists: ' + unitDir);
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const state = {
    schema_version: '1.0.0',
    id: flags['--id'],
    created_at: now,
    updated_at: now,
    trigger: { source: flags['--source'], request: flags['--request'] },
    current_node: 'trigger',
    grading: null,
    fast_path: false,
    blocked_at: null,
    spec_ref: null,
    current_ticket: null,
    refs: { issue: flags['--issue'] || null, pr: null },
    ci_status: null,
    tickets: [],
    fail_counters: {},
    advisor_consults: [],
    reviews: [],
    human_decisions: [],
    outcome: null,
    outcome_reason: null,
  };
  const line = {
    id: 'L-0001',
    timestamp: now,
    source: 'orchestrator',
    actor: null,
    node: 'trigger',
    event_type: 'create',
    description: 'Created work-unit folder from ' + flags['--source'] + '.',
    source_ref: null,
  };
  validateState(state);
  validateLogLine(line, 0);
  try {
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, 'log.ndjson'), JSON.stringify(line) + '\n');
  } catch (e) {
    throw new Fail('write_failed', 'cannot create work-unit folder: ' + e.message);
  }
  atomicWriteState(unitDir, state);
  return { ok: true, action: 'created', id: flags['--id'], path: unitDir };
}

function cmdValidate(flags) {
  if (!flags['--unit']) throw new Fail('usage', '--unit is required');
  const unit = validateUnit(flags['--unit']);
  return {
    ok: true,
    action: 'valid',
    id: unit.state.id,
    current_node: unit.state.current_node,
    log_lines: unit.lines.length,
  };
}

function cmdWrite(flags) {
  for (const f of ['--unit', '--state', '--log']) {
    if (!flags[f]) throw new Fail('usage', f + ' is required');
  }
  const unitDir = flags['--unit'];
  const current = readUnit(unitDir);
  const draft = readJson(flags['--state'], 'state draft');
  const logDraft = readJson(flags['--log'], 'log draft');
  const newLines = Array.isArray(logDraft) ? logDraft : [logDraft];
  if (newLines.length === 0) throw bad('every state change needs at least one new log line');

  validateState(draft);
  // immutable identity fields
  for (const field of ['schema_version', 'id', 'created_at']) {
    if (draft[field] !== current.state[field]) throw bad(field + ' must not change for the life of the work unit');
  }
  if (JSON.stringify(draft.trigger) !== JSON.stringify(current.state.trigger)) {
    throw bad('trigger must not change for the life of the work unit');
  }
  // append-only: existing lines stay, new ids continue strictly increasing
  const combined = current.lines.concat(newLines);
  validateLogSequence(combined);
  checkInvariants(draft, combined, unitDir);

  try {
    fs.appendFileSync(path.join(unitDir, 'log.ndjson'),
      newLines.map(function (l) { return JSON.stringify(l) + '\n'; }).join(''));
  } catch (e) {
    throw new Fail('write_failed', 'cannot append to log.ndjson: ' + e.message);
  }
  atomicWriteState(unitDir, draft);
  return {
    ok: true,
    action: 'written',
    id: draft.id,
    current_node: draft.current_node,
    appended: newLines.length,
  };
}

function cmdArchive(flags) {
  for (const f of ['--unit', '--to']) {
    if (!flags[f]) throw new Fail('usage', f + ' is required');
  }
  const unitDir = flags['--unit'];
  const unit = validateUnit(unitDir);
  if (unit.state.outcome === null) {
    throw bad('archive requires outcome to be set (shipped or ended)');
  }
  const last = unit.lines[unit.lines.length - 1];
  if (last.event_type !== 'archive') {
    throw bad('archive requires the final log line to be an "archive" event');
  }
  const target = path.join(flags['--to'], unit.state.id);
  if (fs.existsSync(target)) throw new Fail('already_exists', 'archive target already exists: ' + target);
  try {
    fs.mkdirSync(flags['--to'], { recursive: true });
    fs.renameSync(unitDir, target);
  } catch (e) {
    throw new Fail('write_failed', 'cannot move work-unit folder to archive: ' + e.message);
  }
  return { ok: true, action: 'archived', id: unit.state.id, path: target };
}

// ---------------------------------------------------------------------------
// dispatch

const COMMANDS = {
  create: { run: cmdCreate, flags: ['--units', '--id', '--source', '--request', '--issue'] },
  validate: { run: cmdValidate, flags: ['--unit'] },
  write: { run: cmdWrite, flags: ['--unit', '--state', '--log'] },
  archive: { run: cmdArchive, flags: ['--unit', '--to'] },
};

function run(argv) {
  const sub = argv[0];
  if (!(sub in COMMANDS)) {
    throw new Fail('usage', 'work-unit.mjs create|validate|write|archive ...' +
      (sub ? ' (unknown subcommand: ' + sub + ')' : ''));
  }
  const flags = parseFlags(argv.slice(1), COMMANDS[sub].flags);
  return COMMANDS[sub].run(flags);
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
