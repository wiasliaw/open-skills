#!/usr/bin/env node
// graph.mjs - deterministic validator and tool-availability gate for a graph definition.
//
// Zero-dependency Node.js (>= 20), built-in modules only. Self-contained.
//
// Usage:
//   node scripts/graph.mjs validate <definition.json> [--no-probe] [--config <config.json>]
//   node scripts/graph.mjs <definition.json> ...      (validate is the default subcommand)
//   node scripts/graph.mjs --help
//
// Flags:
//   --no-probe        Structure-only validation: skip the tool-availability gate.
//   --config <path>   Also probe the commands of the config's worktree_setup.setup list.
//
// Output: exactly one JSON object on stdout, always. Shape:
//   { ok, command, accepted, file, errors: [{code, invariant, message, ...context}],
//     summary, returning_edges, tool_gate }
//   Every error names the violated invariant (`invariant`) and the node, edge, cycle,
//   outcome, or phase involved (`node`, `edge`, `cycle`, `outcome`, `phase`, `path`).
//
// Exit codes:
//   0  accepted: every structural invariant holds and the tool gate passed (or was skipped)
//   1  rejected: one or more structural invariants violated (tool gate not run)
//   2  usage error (unknown flag, missing argument)
//   3  input error (file unreadable, not JSON, or --config invalid)
//   4  rejected by the tool gate: structure is valid but a mounted tool is missing or
//      not startable
//   70 internal error
//
// Definition shape (JSON object):
//   schema_version  "1.x.y"
//   name            string
//   caps            { failure, advisor_consultations, edge_revisit, total_failure? }  positive ints
//   phase           { <key>: { meaning, path: [nodeId...], restriction_overrides?: {nodeId: [string]} } }
//                   the reserved key `maintenance` is required; a path starts at the shared
//                   phase-approval node and ends at the success terminal through the close-out node
//   state_fields    { <name>: { type, values?, nullable?, default, node | phases, executes? } }
//                   type: string | integer | number | boolean | object | list
//   skill_state_needs?  { <skill>: [fieldName...] }  fields a mounted skill reads or writes
//   nodes           [{ id, type, purpose, reads, produces, verification, outcomes, mounts,
//                      restrictions, human_approval, pre_steps?, post_steps?, re_entry?,
//                      terminal_kind (terminal only: success | abandonment), steps (terminal only) }]
//                   type: entry | llm | deterministic | tool | validator | terminal
//                   mounts: { skills: [string], commands: [string | {base, args?}], mcp: [string] }
//                   verification: string | [string] | { criteria, commands: [string] }
//                   reads/produces entries of the form `state:<field>` reference state fields
//                   re_entry: { list_field, order, progress_field }
//   edges           [{ from, to, outcome, guard: [{field, op, value?}] }]
//                   guard = conjunction; [] is the unconditional guard. Fields: declared state
//                   fields and `phase`. The reported outcome is the edge's `outcome` property.
//                   Operators (closed set): eq ne in not-in lt lte gt gte; list fields also
//                   empty not-empty, and eq/ne/lt/lte/gt/gte compare the list's element count.
//
// Stable error codes (the `invariant` field carries the human-readable name):
//   Document   DEF_NOT_OBJECT DEF_FIELD_MISSING SCHEMA_VERSION_UNSUPPORTED
//   Caps       CAP_MISSING CAP_INVALID LOOP_NO_CAP
//   Nodes      NODE_DUPLICATE_ID NODE_ID_INVALID NODE_TYPE_INVALID NODE_FIELD_MISSING
//              NODE_FIELD_INVALID FORBIDDEN_NODE ENTRY_COUNT SUCCESS_TERMINAL_COUNT
//              ABANDONMENT_TERMINAL_COUNT TERMINAL_KIND_INVALID TERMINAL_DECLARES_FORBIDDEN
//              TERMINAL_STEPS_MISSING ENTRY_DECLARES_FORBIDDEN OUTCOME_INVALID
//              DETERMINISTIC_OUTCOME DETERMINISTIC_NO_COMMANDS CLOSE_OUT_COUNT MOUNT_INVALID
//              VERIFICATION_COMMAND_UNMOUNTED SLOT_UNFILLED REENTRY_INVALID
//   Edges      EDGE_INVALID EDGE_UNKNOWN_NODE EDGE_FROM_TERMINAL EDGE_TO_ENTRY
//              EDGE_TO_ABANDONMENT EDGE_FORBIDDEN EDGE_OUTCOME_MISSING EDGE_OUTCOME_UNDECLARED
//              OUTCOME_UNCOVERED ENTRY_ROUTE_INVALID GUARD_UNDECIDABLE GUARD_FIELD_INAPPLICABLE
//              GUARD_OVERLAP GUARD_NOT_EXHAUSTIVE GUARD_TOO_COMPLEX
//   Phases     PHASE_MAINTENANCE_MISSING PHASE_INVALID PATH_UNKNOWN_NODE PATH_DUPLICATE_NODE
//              PATH_FIRST_NODE_MISMATCH FIRST_NODE_NO_APPROVAL PATH_NO_CLOSE_OUT
//              PATH_NOT_ENDING_SUCCESS PATH_NOT_REALIZABLE PHASE_OVERRIDE_INVALID
//   Graph      LOOP_NO_EXIT LOOP_UNCOUNTED NODE_UNREACHABLE NODE_NO_PATH_TO_SUCCESS
//   State      STATE_FIELD_INVALID STATE_FIELD_APPLICABILITY_INVALID STATE_FIELD_CORE_COLLISION
//              STATE_FIELD_UNDECLARED STATE_FIELD_INAPPLICABLE_AT_NODE STATE_FIELD_EXECUTOR_INVALID
//   Gate       TOOL_MISSING TOOL_NOT_STARTABLE
//   Usage/IO   USAGE INPUT_UNREADABLE INPUT_INVALID_JSON CONFIG_INVALID INTERNAL

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORK_TYPES = ['llm', 'deterministic', 'tool', 'validator'];
const NODE_TYPES = ['entry', 'terminal', ...WORK_TYPES];
const FIELD_TYPES = ['string', 'integer', 'number', 'boolean', 'object', 'list'];
const OPS = ['eq', 'ne', 'in', 'not-in', 'lt', 'lte', 'gt', 'gte', 'empty', 'not-empty'];
const CLOSE_OUT_SKILLS = new Set(['open-skills:wrap', 'wrap']);
const FORBIDDEN_RE = /(human[-_ ]?gate|advisor|blocked|escalat)/i;
const SLOT_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const NODE_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const FIELD_NAME_RE = /^[a-z][a-z0-9_]*$/;
const CORE_FIELDS = new Set([
  'schema_version', 'id', 'created_at', 'updated_at', 'trigger', 'current_node', 'phase',
  'walked_path', 'problem', 'problems', 'blocked_at', 'blocked_node', 'fail_counters',
  'failure_counters', 'advisor_consults', 'advisor_consultations', 'reviews',
  'human_decisions', 'outcome', 'outcome_reason',
]);
const SHELL_BUILTINS = new Set(['cd', 'echo', 'exit', 'export', 'set', 'true', 'false', 'test', '[', ':', 'unset']);
const MAX_COMBINATIONS = 100000;
const OTHER = '\u0000other';
const PROBE_TIMEOUT_MS = 10000;

const INVARIANTS = {
  DEF_NOT_OBJECT: 'definition is one JSON object',
  DEF_FIELD_MISSING: 'definition declares every required section',
  SCHEMA_VERSION_UNSUPPORTED: 'schema version is supported',
  CAP_MISSING: 'every loop cap is declared',
  CAP_INVALID: 'caps are positive integers',
  LOOP_NO_CAP: 'every loop has a declared cap',
  NODE_DUPLICATE_ID: 'node ids are unique',
  NODE_ID_INVALID: 'node ids are kebab-case',
  NODE_TYPE_INVALID: 'node type is in the closed vocabulary',
  NODE_FIELD_MISSING: 'node declares every contract field',
  NODE_FIELD_INVALID: 'node fields are well-formed',
  FORBIDDEN_NODE: 'no human-gate, advisor, blocked, or escalation node or edge',
  ENTRY_COUNT: 'exactly one entry node',
  SUCCESS_TERMINAL_COUNT: 'exactly one success terminal',
  ABANDONMENT_TERMINAL_COUNT: 'exactly one abandonment terminal',
  TERMINAL_KIND_INVALID: 'terminals declare success or abandonment',
  TERMINAL_DECLARES_FORBIDDEN: 'terminals declare no verification, outcomes, or outgoing edges',
  TERMINAL_STEPS_MISSING: 'terminals declare their deterministic steps',
  ENTRY_DECLARES_FORBIDDEN: 'the entry node declares no verification or outcomes',
  OUTCOME_INVALID: 'outcomes are routable (blocked is universal, declared nowhere)',
  DETERMINISTIC_OUTCOME: 'deterministic and tool nodes report the fixed outcome pass',
  DETERMINISTIC_NO_COMMANDS: 'deterministic and tool nodes mount the commands they execute',
  CLOSE_OUT_COUNT: 'exactly one node mounts the close-out skill',
  MOUNT_INVALID: 'mounts are well-formed',
  VERIFICATION_COMMAND_UNMOUNTED: 'every verification command is covered by the node mounts',
  SLOT_UNFILLED: 'no unfilled template slot remains',
  REENTRY_INVALID: 're-entry rules reference declared, applicable fields',
  EDGE_INVALID: 'edges are well-formed',
  EDGE_UNKNOWN_NODE: 'edges connect declared nodes',
  EDGE_FROM_TERMINAL: 'terminals have no outgoing edges',
  EDGE_TO_ENTRY: 'no edge targets the entry node',
  EDGE_TO_ABANDONMENT: 'the abandonment terminal is disposition-only (no inbound edges)',
  EDGE_FORBIDDEN: 'no human-gate, advisor, blocked, or escalation node or edge',
  EDGE_OUTCOME_MISSING: 'every edge from a non-entry node names its outcome',
  EDGE_OUTCOME_UNDECLARED: 'every outcome an edge references is declared by its source',
  OUTCOME_UNCOVERED: 'edge coverage is complete per node',
  ENTRY_ROUTE_INVALID: 'the entry node routes unconditionally to the shared first node',
  GUARD_UNDECIDABLE: 'guards are structured, machine-evaluable predicates over the closed operator set',
  GUARD_FIELD_INAPPLICABLE: 'every guard field is applicable at the edge source',
  GUARD_OVERLAP: 'guards of one outcome are mutually exclusive',
  GUARD_NOT_EXHAUSTIVE: 'guards of one outcome are jointly exhaustive',
  GUARD_TOO_COMPLEX: 'guard sets are small enough to decide',
  PHASE_MAINTENANCE_MISSING: 'the maintenance phase is declared',
  PHASE_INVALID: 'phases declare a meaning and a path',
  PATH_UNKNOWN_NODE: 'phase paths name declared nodes',
  PATH_DUPLICATE_NODE: 'phase paths do not repeat a node',
  PATH_FIRST_NODE_MISMATCH: 'all paths share the same first node, reached from the entry node',
  FIRST_NODE_NO_APPROVAL: 'the shared first node carries the human approval',
  PATH_NO_CLOSE_OUT: 'every path runs through the close-out node',
  PATH_NOT_ENDING_SUCCESS: 'every path ends at the success terminal',
  PATH_NOT_REALIZABLE: 'every path is realizable through the declared edges',
  PHASE_OVERRIDE_INVALID: 'restriction overrides name nodes on the phase path',
  LOOP_NO_EXIT: 'every loop has an exit',
  LOOP_UNCOUNTED: 'every loop contains a revisit-counted returning edge',
  NODE_UNREACHABLE: 'every node is edge-reachable from the entry node',
  NODE_NO_PATH_TO_SUCCESS: 'the success terminal is reachable from every node',
  STATE_FIELD_INVALID: 'state fields declare name, type, values, and default',
  STATE_FIELD_APPLICABILITY_INVALID: 'state field applicability names declared nodes or phases',
  STATE_FIELD_CORE_COLLISION: 'state fields do not redeclare the core contract',
  STATE_FIELD_UNDECLARED: 'every state field a node or skill needs is declared',
  STATE_FIELD_INAPPLICABLE_AT_NODE: 'every state field a node uses is applicable at that node',
  STATE_FIELD_EXECUTOR_INVALID: 'a command-holding field names an executing node that mounts a command family',
  TOOL_MISSING: 'every mounted tool exists',
  TOOL_NOT_STARTABLE: 'every mounted tool starts',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string' && x.trim() !== '';
const isArr = Array.isArray;
const isPosInt = (x) => Number.isInteger(x) && x > 0;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const arr = (x) => (isArr(x) ? x : []);

function deq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function edgeLabel(e) {
  return `${e.from} -[${e.outcome ?? ''}]-> ${e.to}`;
}

// Split a command line into tokens, honoring single and double quotes.
export function tokenize(cmd) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (c === '\\' && i + 1 < cmd.length) {
      cur += cmd[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started || cur) tokens.push(cur);
      cur = '';
      started = false;
    } else {
      cur += c;
      started = true;
    }
  }
  if (started || cur) tokens.push(cur);
  return tokens;
}

// Split a shell line into simple-command segments on && || ; | outside quotes.
function shellSegments(cmd) {
  const segs = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ';' || c === '|' || (c === '&' && cmd[i + 1] === '&')) {
      if (c === '&' || (c === '|' && cmd[i + 1] === '|')) i++;
      segs.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  segs.push(cur);
  return segs.map((s) => s.trim()).filter(Boolean);
}

// Programs a command line executes (skips env assignments and shell builtins).
export function programsOf(cmd) {
  const out = [];
  for (const seg of shellSegments(cmd)) {
    const toks = tokenize(seg);
    let i = 0;
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i])) i++;
    const prog = toks[i];
    if (prog && !SHELL_BUILTINS.has(prog)) out.push(prog);
  }
  return out;
}

function startsWithTokens(tokens, base) {
  if (base.length === 0 || tokens.length < base.length) return false;
  return base.every((t, i) => tokens[i] === t);
}

// A mount covers an invocation: exact mounts must equal it; families cover any
// invocation whose program and leading arguments equal the family's base.
function mountCovers(mount, invTokens) {
  if (mount.family) return startsWithTokens(invTokens, mount.tokens);
  return deq(mount.tokens, invTokens);
}

function findSlots(value, where, out) {
  if (typeof value === 'string') {
    for (const m of value.matchAll(SLOT_RE)) out.push({ slot: m[1], path: where });
  } else if (isArr(value)) {
    value.forEach((v, i) => findSlots(v, `${where}[${i}]`, out));
  } else if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) findSlots(v, where ? `${where}.${k}` : k, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structural validation (pure: no I/O)
// ---------------------------------------------------------------------------

export function validateDefinition(def) {
  const errors = [];
  const err = (code, message, ctx = {}) =>
    errors.push({ code, invariant: INVARIANTS[code] ?? code, message, ...ctx });

  const result = () => ({
    errors,
    summary: summary,
    returning_edges: returningEdges,
    commands: gateCommands,
  });
  const summary = {};
  const returningEdges = [];
  const gateCommands = [];

  if (!isObj(def)) {
    err('DEF_NOT_OBJECT', 'The definition must be a single JSON object.');
    return result();
  }

  // ---- document-level sections -------------------------------------------
  for (const key of ['schema_version', 'name', 'caps', 'phase', 'state_fields', 'nodes', 'edges']) {
    if (!has(def, key)) err('DEF_FIELD_MISSING', `Missing required section "${key}".`, { path: key });
  }
  if (has(def, 'schema_version')) {
    if (typeof def.schema_version !== 'string' || !/^1\.\d+\.\d+$/.test(def.schema_version)) {
      err('SCHEMA_VERSION_UNSUPPORTED', `schema_version must be 1.x.y, got ${JSON.stringify(def.schema_version)}.`, { path: 'schema_version' });
    }
  }
  if (has(def, 'name') && !isStr(def.name)) err('DEF_FIELD_MISSING', 'name must be a non-empty string.', { path: 'name' });

  for (const [k, expect] of [['phase', isObj], ['state_fields', isObj], ['nodes', isArr], ['edges', isArr], ['caps', isObj]]) {
    if (!has(def, k) || !expect(def[k])) {
      if (has(def, k)) err('DEF_FIELD_MISSING', `Section "${k}" has the wrong JSON type.`, { path: k });
      def = { ...def, [k]: k === 'nodes' || k === 'edges' ? [] : {} };
    }
  }

  // ---- unfilled template slots -------------------------------------------
  for (const s of findSlots(def, '', [])) {
    err('SLOT_UNFILLED', `Unfilled template slot {{${s.slot}}} at ${s.path}.`, { slot: s.slot, path: s.path });
  }

  // ---- caps ---------------------------------------------------------------
  const caps = isObj(def.caps) ? def.caps : {};
  for (const k of ['failure', 'advisor_consultations', 'edge_revisit']) {
    if (!has(caps, k)) err('CAP_MISSING', `Cap "${k}" is not declared.`, { cap: k });
    else if (!isPosInt(caps[k])) err('CAP_INVALID', `Cap "${k}" must be a positive integer.`, { cap: k });
  }
  if (has(caps, 'total_failure')) {
    if (!isPosInt(caps.total_failure)) err('CAP_INVALID', 'Cap "total_failure" must be a positive integer.', { cap: 'total_failure' });
    else if (isPosInt(caps.failure) && caps.total_failure < caps.failure) {
      err('CAP_INVALID', 'Cap "total_failure" must not be below the failure cap.', { cap: 'total_failure' });
    }
  }
  const edgeRevisitOk = isPosInt(caps.edge_revisit);

  // ---- nodes ---------------------------------------------------------------
  const nodes = [];
  const byId = new Map();
  def.nodes.forEach((n, i) => {
    const where = `nodes[${i}]`;
    if (!isObj(n)) return err('NODE_FIELD_INVALID', `${where} must be an object.`, { path: where });
    if (!isStr(n.id)) return err('NODE_FIELD_MISSING', `${where} has no id.`, { path: where });
    if (!NODE_ID_RE.test(n.id)) err('NODE_ID_INVALID', `Node id "${n.id}" is not kebab-case.`, { node: n.id });
    if (byId.has(n.id)) return err('NODE_DUPLICATE_ID', `Node id "${n.id}" is declared twice.`, { node: n.id });
    byId.set(n.id, n);
    nodes.push(n);
  });

  for (const n of nodes) {
    if (FORBIDDEN_RE.test(n.id) || (typeof n.type === 'string' && FORBIDDEN_RE.test(n.type))) {
      err('FORBIDDEN_NODE', `Node "${n.id}" is a human-gate, advisor, blocked, or escalation node; the fallback chain is universal and in place.`, { node: n.id });
    }
    if (!NODE_TYPES.includes(n.type)) {
      if (!(typeof n.type === 'string' && FORBIDDEN_RE.test(n.type))) {
        err('NODE_TYPE_INVALID', `Node "${n.id}" has type ${JSON.stringify(n.type)}; allowed: ${NODE_TYPES.join(', ')}.`, { node: n.id });
      }
    }
    if (!isStr(n.purpose)) err('NODE_FIELD_MISSING', `Node "${n.id}" declares no purpose.`, { node: n.id, field: 'purpose' });
  }

  const entries = nodes.filter((n) => n.type === 'entry');
  const terminals = nodes.filter((n) => n.type === 'terminal');
  const work = nodes.filter((n) => WORK_TYPES.includes(n.type));
  if (entries.length !== 1) {
    err('ENTRY_COUNT', `Exactly one entry node is required, found ${entries.length}.`, { nodes: entries.map((n) => n.id) });
  }
  const entry = entries.length === 1 ? entries[0] : null;
  for (const t of terminals) {
    if (t.terminal_kind !== 'success' && t.terminal_kind !== 'abandonment') {
      err('TERMINAL_KIND_INVALID', `Terminal "${t.id}" must declare terminal_kind "success" or "abandonment".`, { node: t.id });
    }
  }
  const successTerms = terminals.filter((t) => t.terminal_kind === 'success');
  const abandonTerms = terminals.filter((t) => t.terminal_kind === 'abandonment');
  if (successTerms.length !== 1) {
    err('SUCCESS_TERMINAL_COUNT', `Exactly one success terminal is required, found ${successTerms.length}.`, { nodes: successTerms.map((n) => n.id) });
  }
  if (abandonTerms.length !== 1) {
    err('ABANDONMENT_TERMINAL_COUNT', `Exactly one abandonment terminal is required, found ${abandonTerms.length}.`, { nodes: abandonTerms.map((n) => n.id) });
  }
  const success = successTerms.length === 1 ? successTerms[0] : null;
  const abandon = abandonTerms.length === 1 ? abandonTerms[0] : null;

  // Normalized mounts per node: node id -> [{raw, tokens, family}]
  const mountsOf = new Map();
  const closeOutNodes = [];

  const normCommand = (c, where, nodeId) => {
    if (typeof c === 'string' && c.trim() !== '') return { raw: c, tokens: tokenize(c), family: false };
    if (isObj(c) && isStr(c.base) && (c.args === undefined || typeof c.args === 'string')) {
      return { raw: c.base, tokens: tokenize(c.base), family: true, args: c.args };
    }
    err('MOUNT_INVALID', `Command mount at ${where} must be a command string or {base, args?}.`, { node: nodeId, path: where });
    return null;
  };
  const strList = (v, where, nodeId, code = 'NODE_FIELD_INVALID') => {
    if (!isArr(v) || v.some((x) => typeof x !== 'string')) {
      err(code, `${where} must be an array of strings.`, { node: nodeId, path: where });
      return [];
    }
    return v;
  };

  for (const n of nodes) {
    const w = (f) => `node "${n.id}" ${f}`;
    const isWork = WORK_TYPES.includes(n.type);
    const mounts = [];
    mountsOf.set(n.id, mounts);

    if (n.type === 'entry' || n.type === 'terminal') {
      if (has(n, 'outcomes') && !(isArr(n.outcomes) && n.outcomes.length === 0)) {
        err(n.type === 'entry' ? 'ENTRY_DECLARES_FORBIDDEN' : 'TERMINAL_DECLARES_FORBIDDEN', `${w('declares outcomes')}, which ${n.type} nodes must not.`, { node: n.id, field: 'outcomes' });
      }
      if (has(n, 'verification') && n.verification !== null && !(isArr(n.verification) && n.verification.length === 0) && n.verification !== '') {
        err(n.type === 'entry' ? 'ENTRY_DECLARES_FORBIDDEN' : 'TERMINAL_DECLARES_FORBIDDEN', `${w('declares verification')}, which ${n.type} nodes must not.`, { node: n.id, field: 'verification' });
      }
    }
    if (n.type === 'terminal') {
      if (!isArr(n.steps)) {
        err('TERMINAL_STEPS_MISSING', `Terminal "${n.id}" must declare its deterministic steps as an array (possibly empty).`, { node: n.id, field: 'steps' });
      } else {
        n.steps.forEach((s, i) => {
          const c = typeof s === 'string' ? s : isObj(s) ? s.command : null;
          if (!isStr(c)) err('MOUNT_INVALID', `Terminal step ${i} of "${n.id}" must be a command string.`, { node: n.id, path: `steps[${i}]` });
          else gateCommands.push({ node: n.id, source: 'step', command: c });
        });
      }
    }
    // steps
    for (const f of ['pre_steps', 'post_steps']) {
      if (!has(n, f)) continue;
      if (!isArr(n[f])) {
        err('NODE_FIELD_INVALID', `${w(f)} must be an array of commands.`, { node: n.id, field: f });
        continue;
      }
      n[f].forEach((s, i) => {
        const c = typeof s === 'string' ? s : isObj(s) ? s.command : null;
        if (!isStr(c)) err('MOUNT_INVALID', `${w(f + '[' + i + ']')} must be a command string.`, { node: n.id, path: `${f}[${i}]` });
        else gateCommands.push({ node: n.id, source: f === 'pre_steps' ? 'pre-step' : 'post-step', command: c });
      });
    }

    if (n.type === 'entry' || n.type === 'terminal') {
      if (has(n, 'mounts')) {
        if (!isObj(n.mounts) || (has(n.mounts, 'commands') && !isArr(n.mounts.commands))) {
          err('MOUNT_INVALID', `${w('mounts')} must be an object with a commands array.`, { node: n.id, path: 'mounts' });
        } else {
          arr(n.mounts.commands).forEach((c, i) => {
            const m = normCommand(c, `mounts.commands[${i}]`, n.id);
            if (m) {
              mounts.push(m);
              gateCommands.push({ node: n.id, source: 'mount', command: m.raw });
            }
          });
        }
      }
    }
    if (!isWork) continue;

    // required contract fields
    for (const f of ['reads', 'produces', 'restrictions']) {
      if (!has(n, f)) err('NODE_FIELD_MISSING', `${w('does not declare')} "${f}".`, { node: n.id, field: f });
      else strList(n[f], `${w(f)}`, n.id);
    }
    if (!has(n, 'verification')) err('NODE_FIELD_MISSING', `${w('does not declare')} "verification".`, { node: n.id, field: 'verification' });
    if (!has(n, 'human_approval')) err('NODE_FIELD_MISSING', `${w('does not declare')} "human_approval".`, { node: n.id, field: 'human_approval' });
    else if (typeof n.human_approval !== 'boolean') err('NODE_FIELD_INVALID', `${w('human_approval')} must be a boolean.`, { node: n.id, field: 'human_approval' });
    if (!has(n, 'outcomes')) err('NODE_FIELD_MISSING', `${w('does not declare')} "outcomes".`, { node: n.id, field: 'outcomes' });
    else if (!isArr(n.outcomes) || n.outcomes.length === 0 || n.outcomes.some((o) => !isStr(o))) {
      err('NODE_FIELD_INVALID', `${w('outcomes')} must be a non-empty array of strings.`, { node: n.id, field: 'outcomes' });
    } else {
      if (new Set(n.outcomes).size !== n.outcomes.length) err('NODE_FIELD_INVALID', `${w('outcomes')} contains duplicates.`, { node: n.id, field: 'outcomes' });
      for (const o of n.outcomes) {
        if (/^blocked$/i.test(o) || FORBIDDEN_RE.test(o)) {
          err('OUTCOME_INVALID', `${w('outcomes')} lists "${o}"; blocked, advisor, and escalation are universal and never routable outcomes.`, { node: n.id, outcome: o });
        }
      }
      if (n.type === 'deterministic' || n.type === 'tool') {
        if (!(n.outcomes.length === 1 && n.outcomes[0] === 'pass')) {
          err('DETERMINISTIC_OUTCOME', `${w('is a ' + n.type + ' node, so its outcomes must be exactly ["pass"]')}.`, { node: n.id, outcomes: n.outcomes });
        }
      }
    }

    // mounts
    if (!isObj(n.mounts)) {
      err('NODE_FIELD_MISSING', `${w('does not declare')} "mounts" ({skills, commands, mcp}).`, { node: n.id, field: 'mounts' });
    } else {
      for (const f of ['skills', 'commands', 'mcp']) {
        if (!isArr(n.mounts[f])) err('MOUNT_INVALID', `${w('mounts.' + f)} must be an array.`, { node: n.id, path: `mounts.${f}` });
      }
      strList(n.mounts.skills ?? [], w('mounts.skills'), n.id, 'MOUNT_INVALID');
      strList(n.mounts.mcp ?? [], w('mounts.mcp'), n.id, 'MOUNT_INVALID');
      arr(n.mounts.commands).forEach((c, i) => {
        const m = normCommand(c, `mounts.commands[${i}]`, n.id);
        if (m) {
          mounts.push(m);
          gateCommands.push({ node: n.id, source: 'mount', command: m.raw });
        }
      });
      if (arr(n.mounts.skills).some((s) => CLOSE_OUT_SKILLS.has(s))) closeOutNodes.push(n.id);
    }
    if ((n.type === 'deterministic' || n.type === 'tool') && mounts.length === 0) {
      err('DETERMINISTIC_NO_COMMANDS', `${w('is a ' + n.type + ' node and must mount the commands it executes')}.`, { node: n.id });
    }

    // verification commands must be covered by this node's mounts
    const v = n.verification;
    let vCommands = [];
    if (isObj(v)) {
      if (has(v, 'commands')) {
        if (!isArr(v.commands) || v.commands.some((c) => !isStr(c))) {
          err('NODE_FIELD_INVALID', `${w('verification.commands')} must be an array of command strings.`, { node: n.id, field: 'verification.commands' });
        } else vCommands = v.commands;
      }
    } else if (has(n, 'verification') && !(typeof v === 'string' || isArr(v))) {
      err('NODE_FIELD_INVALID', `${w('verification')} must be a string, an array, or {criteria, commands}.`, { node: n.id, field: 'verification' });
    }
    for (const c of vCommands) {
      const toks = tokenize(c);
      if (!mounts.some((m) => mountCovers(m, toks))) {
        err('VERIFICATION_COMMAND_UNMOUNTED', `Verification command "${c}" of node "${n.id}" is not covered by the node's mounts.`, { node: n.id, command: c });
      }
    }
  }

  if (closeOutNodes.length !== 1) {
    err('CLOSE_OUT_COUNT', `Exactly one node must mount the close-out skill (${[...CLOSE_OUT_SKILLS].join(' or ')}), found ${closeOutNodes.length}.`, { nodes: closeOutNodes });
  }
  const closeOut = closeOutNodes.length === 1 ? closeOutNodes[0] : null;

  // ---- phases ----------------------------------------------------------------
  const phaseKeys = Object.keys(def.phase);
  if (!has(def.phase, 'maintenance')) {
    err('PHASE_MAINTENANCE_MISSING', 'The reserved phase "maintenance" must be declared.', { phase: 'maintenance' });
  }
  const paths = new Map(); // phase -> valid path array
  for (const [pk, p] of Object.entries(def.phase)) {
    if (!/^[a-z][a-z0-9-]*$/.test(pk)) err('PHASE_INVALID', `Phase key "${pk}" must be lowercase kebab-case.`, { phase: pk });
    if (!isObj(p) || !isStr(p.meaning) || !isArr(p.path) || p.path.length === 0 || p.path.some((x) => typeof x !== 'string')) {
      err('PHASE_INVALID', `Phase "${pk}" must declare a non-empty "meaning" and a non-empty "path" array of node ids.`, { phase: pk });
      continue;
    }
    let ok = true;
    for (const id of p.path) {
      if (!byId.has(id)) {
        ok = false;
        err('PATH_UNKNOWN_NODE', `Path of phase "${pk}" names undeclared node "${id}".`, { phase: pk, node: id });
      }
    }
    const seen = new Set();
    for (const id of p.path) {
      if (seen.has(id)) {
        ok = false;
        err('PATH_DUPLICATE_NODE', `Path of phase "${pk}" repeats node "${id}".`, { phase: pk, node: id });
      }
      seen.add(id);
    }
    if (has(p, 'restriction_overrides')) {
      if (!isObj(p.restriction_overrides)) {
        err('PHASE_OVERRIDE_INVALID', `restriction_overrides of phase "${pk}" must be an object.`, { phase: pk });
      } else {
        for (const [nid, rs] of Object.entries(p.restriction_overrides)) {
          if (!p.path.includes(nid)) err('PHASE_OVERRIDE_INVALID', `Phase "${pk}" overrides restrictions of node "${nid}", which is not on its path.`, { phase: pk, node: nid });
          if (!isArr(rs) || rs.some((x) => typeof x !== 'string')) err('PHASE_OVERRIDE_INVALID', `Override for node "${nid}" in phase "${pk}" must be an array of strings.`, { phase: pk, node: nid });
        }
      }
    }
    if (ok) paths.set(pk, p.path);
  }

  const firstNodes = new Map();
  for (const [pk, p] of paths) firstNodes.set(pk, p[0]);
  const distinctFirst = [...new Set(firstNodes.values())];
  let sharedFirst = null;
  if (distinctFirst.length > 1) {
    err('PATH_FIRST_NODE_MISMATCH', `Phase paths start at different nodes: ${[...firstNodes].map(([k, v]) => `${k}:${v}`).join(', ')}.`, { nodes: distinctFirst, phases: [...firstNodes.keys()] });
  } else if (distinctFirst.length === 1) {
    sharedFirst = distinctFirst[0];
    const fn = byId.get(sharedFirst);
    if (!WORK_TYPES.includes(fn.type)) {
      err('PATH_FIRST_NODE_MISMATCH', `The shared first node "${sharedFirst}" must be a work node, not ${fn.type}.`, { node: sharedFirst });
    }
    if (fn.human_approval !== true) {
      err('FIRST_NODE_NO_APPROVAL', `The shared first node "${sharedFirst}" must set human_approval: true (it records the phase).`, { node: sharedFirst });
    }
  }
  for (const [pk, p] of paths) {
    if (entry && p.includes(entry.id)) err('PATH_FIRST_NODE_MISMATCH', `Path of phase "${pk}" includes the entry node.`, { phase: pk, node: entry.id });
    if (abandon && p.includes(abandon.id)) err('PATH_NOT_ENDING_SUCCESS', `Path of phase "${pk}" includes the abandonment terminal.`, { phase: pk, node: abandon.id });
    if (closeOut && !p.includes(closeOut)) err('PATH_NO_CLOSE_OUT', `Path of phase "${pk}" does not run through the close-out node "${closeOut}".`, { phase: pk, node: closeOut });
    if (success && p[p.length - 1] !== success.id) err('PATH_NOT_ENDING_SUCCESS', `Path of phase "${pk}" must end at the success terminal "${success.id}".`, { phase: pk });
    if (closeOut && success && p.includes(closeOut) && p[p.length - 1] === success.id && p.indexOf(closeOut) > p.length - 2) {
      err('PATH_NO_CLOSE_OUT', `Close-out node "${closeOut}" must precede the success terminal on the path of phase "${pk}".`, { phase: pk, node: closeOut });
    }
  }

  // ---- state field declarations -----------------------------------------------
  const fields = new Map(); // name -> declaration
  for (const [name, f] of Object.entries(def.state_fields)) {
    const wf = `State field "${name}"`;
    let ok = true;
    const bad = (code, msg) => {
      ok = false;
      err(code, msg, { field: name });
    };
    if (!FIELD_NAME_RE.test(name)) bad('STATE_FIELD_INVALID', `${wf} must be a lowercase snake_case name.`);
    if (CORE_FIELDS.has(name)) bad('STATE_FIELD_CORE_COLLISION', `${wf} redeclares a field of the work-unit core contract.`);
    if (!isObj(f)) {
      bad('STATE_FIELD_INVALID', `${wf} must be an object.`);
      continue;
    }
    if (!FIELD_TYPES.includes(f.type)) bad('STATE_FIELD_INVALID', `${wf} has type ${JSON.stringify(f.type)}; allowed: ${FIELD_TYPES.join(', ')}.`);
    if (has(f, 'values') && (!isArr(f.values) || f.values.length === 0)) bad('STATE_FIELD_INVALID', `${wf} "values" must be a non-empty array.`);
    if (has(f, 'nullable') && typeof f.nullable !== 'boolean') bad('STATE_FIELD_INVALID', `${wf} "nullable" must be a boolean.`);
    if (!has(f, 'default')) bad('STATE_FIELD_INVALID', `${wf} must declare a default value.`);
    else if (ok) {
      const d = f.default;
      const elemOk = (x) => !isArr(f.values) || f.values.some((v) => deq(v, x));
      let good;
      if (d === null) good = f.nullable === true;
      else if (f.type === 'string') good = typeof d === 'string' && elemOk(d);
      else if (f.type === 'integer') good = Number.isInteger(d) && elemOk(d);
      else if (f.type === 'number') good = typeof d === 'number' && Number.isFinite(d) && elemOk(d);
      else if (f.type === 'boolean') good = typeof d === 'boolean' && elemOk(d);
      else if (f.type === 'object') good = isObj(d);
      else if (f.type === 'list') good = isArr(d) && d.every(elemOk);
      if (!good) bad('STATE_FIELD_INVALID', `${wf} default ${JSON.stringify(d)} does not conform to its type, values, or nullability.`);
    }
    const hasNode = has(f, 'node');
    const hasPhases = has(f, 'phases');
    if (hasNode === hasPhases) {
      bad('STATE_FIELD_APPLICABILITY_INVALID', `${wf} must declare exactly one of "node" (owning node) or "phases".`);
    } else if (hasNode) {
      const owner = byId.get(f.node);
      if (!owner) bad('STATE_FIELD_APPLICABILITY_INVALID', `${wf} is bound to undeclared node ${JSON.stringify(f.node)}.`);
      else if (!WORK_TYPES.includes(owner.type)) bad('STATE_FIELD_APPLICABILITY_INVALID', `${wf} is bound to node "${f.node}", which is not a work node.`);
    } else {
      if (!isArr(f.phases) || f.phases.length === 0) bad('STATE_FIELD_APPLICABILITY_INVALID', `${wf} "phases" must be a non-empty array.`);
      else for (const p of f.phases) if (!has(def.phase, p)) bad('STATE_FIELD_APPLICABILITY_INVALID', `${wf} is bound to undeclared phase ${JSON.stringify(p)}.`);
    }
    if (has(f, 'executes')) {
      const ex = byId.get(f.executes);
      const exMounts = ex ? mountsOf.get(ex.id) : [];
      if (!ex || !WORK_TYPES.includes(ex.type)) bad('STATE_FIELD_EXECUTOR_INVALID', `${wf} names executing node ${JSON.stringify(f.executes)}, which is not a declared work node.`);
      else if (!exMounts.some((m) => m.family)) bad('STATE_FIELD_EXECUTOR_INVALID', `${wf} names executing node "${ex.id}", which mounts no command family to cover run-time invocations.`);
    }
    if (ok) fields.set(name, f);
  }

  // applicable nodes per declared field
  const applicable = new Map();
  for (const [name, f] of fields) {
    const set = new Set();
    if (has(f, 'node')) {
      set.add(f.node);
      for (const p of paths.values()) {
        const i = p.indexOf(f.node);
        if (i >= 0) p.slice(i).forEach((x) => set.add(x));
      }
    } else {
      for (const ph of arr(f.phases)) arr(paths.get(ph)).forEach((x) => set.add(x));
    }
    applicable.set(name, set);
  }

  // state references by nodes, mounted skills, and re-entry rules
  const skillNeeds = isObj(def.skill_state_needs) ? def.skill_state_needs : {};
  const needField = (nodeId, name, via) => {
    if (CORE_FIELDS.has(name)) return;
    if (!has(def.state_fields, name)) {
      return err('STATE_FIELD_UNDECLARED', `Node "${nodeId}" needs state field "${name}" (${via}), which is not declared in state_fields.`, { node: nodeId, field: name });
    }
    if (fields.has(name) && !applicable.get(name).has(nodeId)) {
      err('STATE_FIELD_INAPPLICABLE_AT_NODE', `Node "${nodeId}" needs state field "${name}" (${via}), which is not applicable at that node.`, { node: nodeId, field: name });
    }
  };
  for (const n of work) {
    for (const k of ['reads', 'produces']) {
      for (const e of arr(n[k])) {
        if (typeof e === 'string' && e.startsWith('state:')) needField(n.id, e.slice(6), k);
      }
    }
    for (const s of arr(n.mounts?.skills)) {
      if (isArr(skillNeeds[s])) skillNeeds[s].forEach((f) => needField(n.id, f, `skill ${s}`));
    }
    if (has(n, 're_entry')) {
      const r = n.re_entry;
      const bad = (msg) => err('REENTRY_INVALID', `Re-entry rule of node "${n.id}": ${msg}`, { node: n.id });
      if (!isObj(r) || !isStr(r.list_field) || !isStr(r.order) || !isStr(r.progress_field)) {
        bad('must be {list_field, order, progress_field}, all non-empty strings.');
      } else {
        for (const k of ['list_field', 'progress_field']) {
          const f = fields.get(r[k]);
          if (!f) bad(`${k} "${r[k]}" is not a declared state field.`);
          else if (!applicable.get(r[k]).has(n.id)) bad(`${k} "${r[k]}" is not applicable at this node.`);
          else if (k === 'list_field' && f.type !== 'list') bad(`list_field "${r.list_field}" must be a list field.`);
        }
      }
    }
  }
  for (const s of Object.keys(skillNeeds)) {
    if (!isArr(skillNeeds[s]) || skillNeeds[s].some((x) => typeof x !== 'string')) {
      err('NODE_FIELD_INVALID', `skill_state_needs["${s}"] must be an array of field names.`, { path: `skill_state_needs.${s}` });
    }
  }

  // ---- edges --------------------------------------------------------------------
  const edges = []; // structurally valid edges (with index)
  def.edges.forEach((e, i) => {
    const where = `edges[${i}]`;
    if (!isObj(e) || !isStr(e.from) || !isStr(e.to)) {
      return err('EDGE_INVALID', `${where} must be an object with string "from" and "to".`, { path: where });
    }
    const ctx = { edge: { index: i, from: e.from, to: e.to, outcome: e.outcome ?? null } };
    let ok = true;
    for (const side of ['from', 'to']) {
      if (!byId.has(e[side])) {
        ok = false;
        err('EDGE_UNKNOWN_NODE', `${where} references undeclared node "${e[side]}" as ${side}.`, { ...ctx, node: e[side] });
      }
    }
    if (has(e, 'outcome') && !isStr(e.outcome)) {
      ok = false;
      err('EDGE_INVALID', `${where} outcome must be a non-empty string.`, ctx);
    }
    if (!has(e, 'guard') || !isArr(e.guard)) {
      ok = false;
      err('GUARD_UNDECIDABLE', `${where} (${edgeLabel(e)}) guard must be an array of {field, op, value} conditions ([] is the unconditional guard); prose guards are not machine-evaluable.`, ctx);
    }
    for (const t of [e.from, e.to, e.outcome]) {
      if (typeof t === 'string' && FORBIDDEN_RE.test(t)) {
        ok = false;
        err('EDGE_FORBIDDEN', `${where} (${edgeLabel(e)}) involves a human-gate, advisor, blocked, or escalation element ("${t}"); these are universal and declared nowhere.`, ctx);
        break;
      }
    }
    if (!ok) return;
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (from.type === 'terminal') return err('EDGE_FROM_TERMINAL', `Terminal "${from.id}" has an outgoing edge to "${e.to}".`, ctx);
    if (to.type === 'entry') return err('EDGE_TO_ENTRY', `Edge ${edgeLabel(e)} targets the entry node.`, ctx);
    if (abandon && to.id === abandon.id) {
      return err('EDGE_TO_ABANDONMENT', `Edge ${edgeLabel(e)} targets the abandonment terminal, which is reachable only through dispositions.`, ctx);
    }
    edges.push({ ...e, index: i });
  });

  // guard structural validation: returns true when decidable
  const fieldInfo = (name, srcId) => {
    if (name === 'phase') {
      const dom = phaseKeys.filter((k) => !paths.has(k) || paths.get(k).includes(srcId));
      return { kind: 'enum', domain: dom.length ? dom : phaseKeys, nullable: false, builtin: true };
    }
    const f = fields.get(name);
    if (!f) return null;
    if (f.type === 'list') return { kind: 'count', nullable: false };
    if (isArr(f.values)) {
      const dom = f.values.slice();
      return { kind: 'enum', domain: dom, nullable: f.nullable === true };
    }
    if (f.type === 'boolean') return { kind: 'enum', domain: [true, false], nullable: f.nullable === true };
    if (f.type === 'integer') return { kind: 'int', nullable: f.nullable === true };
    if (f.type === 'number') return { kind: 'num', nullable: f.nullable === true };
    if (f.type === 'string') return { kind: 'opaque', nullable: f.nullable === true };
    return { kind: 'object', nullable: f.nullable === true };
  };

  const checkGuard = (e) => {
    const ctx = { edge: { index: e.index, from: e.from, to: e.to, outcome: e.outcome ?? null } };
    let ok = true;
    const bad = (code, msg) => {
      ok = false;
      err(code, `Edge ${edgeLabel(e)}: ${msg}`, ctx);
    };
    e.guard.forEach((c, ci) => {
      if (!isObj(c) || !isStr(c.field) || !OPS.includes(c.op)) {
        return bad('GUARD_UNDECIDABLE', `condition ${ci} must be {field, op, value?} with op in {${OPS.join(', ')}}.`);
      }
      if (c.field === 'outcome') {
        return bad('GUARD_UNDECIDABLE', `condition ${ci} references "outcome"; declare the reported outcome in the edge's "outcome" property instead.`);
      }
      const info = fieldInfo(c.field, e.from);
      if (!info) return bad('GUARD_UNDECIDABLE', `condition ${ci} references undeclared field "${c.field}".`);
      if (!info.builtin && !CORE_FIELDS.has(c.field) && !applicable.get(c.field)?.has(e.from)) {
        return bad('GUARD_FIELD_INAPPLICABLE', `field "${c.field}" is not applicable at source node "${e.from}".`);
      }
      const { op } = c;
      const valueOk = (v) => {
        if (v === null) return info.nullable;
        switch (info.kind) {
          case 'enum': return info.domain.some((d) => deq(d, v));
          case 'int': case 'count': return Number.isInteger(v);
          case 'num': return typeof v === 'number' && Number.isFinite(v);
          case 'opaque': return typeof v === 'string';
          default: return false;
        }
      };
      if (op === 'empty' || op === 'not-empty') {
        if (info.kind !== 'count') return bad('GUARD_UNDECIDABLE', `operator "${op}" applies to list fields only ("${c.field}" is not a list).`);
        if (has(c, 'value')) return bad('GUARD_UNDECIDABLE', `operator "${op}" takes no value.`);
      } else if (op === 'in' || op === 'not-in') {
        if (info.kind === 'count') return bad('GUARD_UNDECIDABLE', `operator "${op}" is not defined on list fields (use count comparisons).`);
        if (!isArr(c.value) || c.value.length === 0 || !c.value.every(valueOk)) {
          return bad('GUARD_UNDECIDABLE', `condition ${ci} (${c.field} ${op}) needs a non-empty array of values valid for the field.`);
        }
      } else if (op === 'eq' || op === 'ne') {
        if (!has(c, 'value') || !valueOk(c.value)) return bad('GUARD_UNDECIDABLE', `condition ${ci} (${c.field} ${op}) has a value invalid for the field.`);
        if (info.kind === 'object' && c.value !== null) return bad('GUARD_UNDECIDABLE', `object field "${c.field}" can only be compared to null.`);
      } else {
        if (!['int', 'num', 'count'].includes(info.kind)) return bad('GUARD_UNDECIDABLE', `operator "${op}" needs a numeric or list field ("${c.field}" is not).`);
        if (typeof c.value !== 'number' || !valueOk(c.value)) return bad('GUARD_UNDECIDABLE', `condition ${ci} (${c.field} ${op}) needs a numeric value.`);
      }
    });
    return ok;
  };

  // atom-based decision procedure ------------------------------------------------
  const consts = (conds, field) => {
    const out = [];
    for (const c of conds) {
      if (c.field !== field) continue;
      if (c.op === 'in' || c.op === 'not-in') out.push(...c.value);
      else if (has(c, 'value')) out.push(c.value);
    }
    return out;
  };
  const atomsFor = (info, cs) => {
    let a;
    const nums = cs.filter((x) => typeof x === 'number');
    if (info.kind === 'enum') a = info.domain.slice();
    else if (info.kind === 'opaque') a = [...new Set(cs.filter((x) => typeof x === 'string')), OTHER];
    else if (info.kind === 'object') a = [OTHER];
    else if (info.kind === 'num') {
      const ks = [...new Set(nums)].sort((x, y) => x - y);
      a = ks.slice();
      for (let i = 0; i + 1 < ks.length; i++) a.push((ks[i] + ks[i + 1]) / 2);
      a.push(ks.length ? ks[0] - 1 : 0, ks.length ? ks[ks.length - 1] + 1 : 0);
    } else {
      const s = new Set([0, 1]);
      for (const k of nums) [k - 1, k, k + 1].forEach((x) => s.add(x));
      a = [...s].filter((x) => Number.isInteger(x) && (info.kind === 'count' ? x >= 0 : true));
    }
    if (info.nullable) a.push(null);
    return [...new Set(a.map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x));
  };
  const evalCond = (c, atom) => {
    const v = c.value;
    switch (c.op) {
      case 'eq': return deq(atom, v);
      case 'ne': return !deq(atom, v);
      case 'in': return v.some((x) => deq(atom, x));
      case 'not-in': return !v.some((x) => deq(atom, x));
      case 'lt': return typeof atom === 'number' && atom < v;
      case 'lte': return typeof atom === 'number' && atom <= v;
      case 'gt': return typeof atom === 'number' && atom > v;
      case 'gte': return typeof atom === 'number' && atom >= v;
      case 'empty': return atom === 0;
      case 'not-empty': return typeof atom === 'number' && atom >= 1;
      default: return false;
    }
  };
  // Enumerate every atom combination over the fields the edges mention.
  // Returns {combos: [{state, matches: [edge...]}]} or {tooComplex: true}.
  const enumerate = (group, srcId, phaseOverride) => {
    const names = [...new Set(group.flatMap((e) => e.guard.map((c) => c.field)))];
    const all = group.flatMap((e) => e.guard);
    const lists = names.map((nm) => {
      const info = fieldInfo(nm, srcId);
      if (nm === 'phase' && phaseOverride) info.domain = [phaseOverride];
      return atomsFor(info, consts(all, nm));
    });
    const total = lists.reduce((p, l) => p * l.length, 1);
    if (total > MAX_COMBINATIONS) return { tooComplex: true, total };
    const combos = [];
    const state = {};
    const rec = (i) => {
      if (i === names.length) {
        const matches = group.filter((e) => e.guard.every((c) => evalCond(c, state[c.field])));
        combos.push({ state: { ...state }, matches });
        return;
      }
      for (const a of lists[i]) {
        state[names[i]] = a;
        rec(i + 1);
      }
    };
    rec(0);
    return { combos };
  };
  const display = (st) => JSON.stringify(st, (k, v) => (v === OTHER ? '<other>' : v));

  // per-node edge coverage and guard algebra
  const edgesFrom = new Map();
  for (const e of edges) {
    if (!edgesFrom.has(e.from)) edgesFrom.set(e.from, []);
    edgesFrom.get(e.from).push(e);
  }
  const decidable = new Set(); // edge indexes with valid guards
  for (const e of edges) {
    const from = byId.get(e.from);
    if (from.type === 'entry') {
      if (has(e, 'outcome')) err('EDGE_INVALID', `Entry edge ${edgeLabel(e)} must not name an outcome.`, { edge: { index: e.index, from: e.from, to: e.to } });
      if (e.guard.length) err('ENTRY_ROUTE_INVALID', `Entry edge to "${e.to}" must be unconditional (empty guard).`, { edge: { index: e.index, from: e.from, to: e.to } });
      continue;
    }
    if (!has(e, 'outcome')) {
      err('EDGE_OUTCOME_MISSING', `Edge ${e.from} -> ${e.to} names no outcome.`, { edge: { index: e.index, from: e.from, to: e.to } });
      continue;
    }
    if (!isArr(from.outcomes) || !from.outcomes.includes(e.outcome)) {
      err('EDGE_OUTCOME_UNDECLARED', `Edge ${edgeLabel(e)} references outcome "${e.outcome}", which node "${e.from}" does not declare.`, { edge: { index: e.index, from: e.from, to: e.to, outcome: e.outcome }, node: e.from, outcome: e.outcome });
      continue;
    }
    if (checkGuard(e)) decidable.add(e.index);
  }

  if (entry) {
    const outs = edgesFrom.get(entry.id) ?? [];
    if (outs.length !== 1) {
      err('ENTRY_ROUTE_INVALID', `The entry node "${entry.id}" must have exactly one outgoing edge, found ${outs.length}.`, { node: entry.id });
    } else if (sharedFirst && outs[0].to !== sharedFirst) {
      err('ENTRY_ROUTE_INVALID', `The entry node routes to "${outs[0].to}" but the shared first node of all paths is "${sharedFirst}".`, { node: entry.id, edge: { index: outs[0].index, from: entry.id, to: outs[0].to } });
    }
  }

  for (const n of work) {
    if (!isArr(n.outcomes)) continue;
    const outs = edgesFrom.get(n.id) ?? [];
    for (const o of n.outcomes) {
      if (typeof o !== 'string' || /^blocked$/i.test(o)) continue;
      const group = outs.filter((e) => e.outcome === o);
      if (group.length === 0) {
        err('OUTCOME_UNCOVERED', `Node "${n.id}" can report outcome "${o}" but no outgoing edge covers it.`, { node: n.id, outcome: o });
        continue;
      }
      if (!group.every((e) => decidable.has(e.index))) continue; // guard errors already reported
      const en = enumerate(group, n.id, null);
      if (en.tooComplex) {
        err('GUARD_TOO_COMPLEX', `Guards of node "${n.id}" outcome "${o}" span ${en.total} state combinations; simplify them.`, { node: n.id, outcome: o });
        continue;
      }
      const pairs = new Map();
      let uncovered = null;
      let uncoveredCount = 0;
      for (const c of en.combos) {
        if (c.matches.length === 0) {
          uncoveredCount++;
          uncovered ??= c.state;
        } else if (c.matches.length > 1) {
          for (let i = 0; i < c.matches.length; i++) {
            for (let j = i + 1; j < c.matches.length; j++) {
              const key = `${c.matches[i].index}|${c.matches[j].index}`;
              if (!pairs.has(key)) pairs.set(key, { a: c.matches[i], b: c.matches[j], state: c.state });
            }
          }
        }
      }
      for (const { a, b, state } of pairs.values()) {
        err('GUARD_OVERLAP', `Node "${n.id}" outcome "${o}": edges ${edgeLabel(a)} (edges[${a.index}]) and ${edgeLabel(b)} (edges[${b.index}]) can both match, e.g. at ${display(state)}.`, {
          node: n.id, outcome: o,
          edges: [{ index: a.index, from: a.from, to: a.to }, { index: b.index, from: b.from, to: b.to }],
          witness: state,
        });
      }
      if (uncoveredCount) {
        err('GUARD_NOT_EXHAUSTIVE', `Node "${n.id}" outcome "${o}": no edge matches ${uncoveredCount} state combination(s), e.g. ${display(uncovered)}.`, { node: n.id, outcome: o, witness: uncovered });
      }
    }
  }

  // ---- path realizability --------------------------------------------------------
  // Edge a->b can be taken by a unit of phase p when its guard is satisfiable under phase = p.
  const edgeFiresInPhase = (e, p) => {
    if (!decidable.has(e.index) && byId.get(e.from).type !== 'entry') return false;
    if (e.guard.length === 0) return true;
    const en = enumerate([e], e.from, p);
    return !en.tooComplex && en.combos.some((c) => c.matches.length === 1);
  };
  for (const [pk, p] of paths) {
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      const cands = (edgesFrom.get(a) ?? []).filter((e) => e.to === b);
      if (!cands.some((e) => edgeFiresInPhase(e, pk))) {
        err('PATH_NOT_REALIZABLE', `Path of phase "${pk}" steps ${a} -> ${b}, but no declared edge ${a} -> ${b} can fire for that phase.`, { phase: pk, from: a, to: b });
      }
    }
  }

  // returning edges: target earlier (or equal) on some phase path
  const retMap = new Map();
  for (const [pk, p] of paths) {
    for (const e of edges) {
      const ia = p.indexOf(e.from);
      const ib = p.indexOf(e.to);
      if (ia >= 0 && ib >= 0 && ib <= ia && e.outcome !== undefined && edgeFiresInPhase(e, pk)) {
        const key = e.index;
        if (!retMap.has(key)) retMap.set(key, { from: e.from, to: e.to, outcome: e.outcome, index: e.index, phases: [] });
        retMap.get(key).phases.push(pk);
      }
    }
  }
  returningEdges.push(...[...retMap.values()].sort((x, y) => x.index - y.index));

  // ---- graph topology: loops, exits, reachability -------------------------------
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.from).push(e.to);

  // Tarjan SCC
  let idx = 0;
  const stack = [];
  const onStack = new Set();
  const index = new Map();
  const low = new Map();
  const sccs = [];
  const strong = (v) => {
    index.set(v, idx);
    low.set(v, idx++);
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v)) {
      if (!index.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  };
  for (const n of nodes) if (!index.has(n.id)) strong(n.id);

  const exitless = new Set();
  const loopSccs = sccs.filter((c) => c.length > 1 || adj.get(c[0]).includes(c[0]));
  for (const comp of loopSccs) {
    const set = new Set(comp);
    const cycle = comp.slice().sort();
    const hasExit = edges.some((e) => set.has(e.from) && !set.has(e.to));
    if (!hasExit) {
      cycle.forEach((c) => exitless.add(c));
      err('LOOP_NO_EXIT', `Loop over nodes [${cycle.join(', ')}] has no edge leaving it.`, { cycle });
    }
  }
  if (!edgeRevisitOk) {
    for (const r of returningEdges) {
      err('LOOP_NO_CAP', `Returning edge ${r.from} -[${r.outcome}]-> ${r.to} forms a loop but no valid edge_revisit cap is declared.`, { edge: { index: r.index, from: r.from, to: r.to, outcome: r.outcome }, cycle: [r.to, r.from] });
    }
  }
  // every cycle must contain a returning (revisit-counted) edge
  {
    const ret = new Set(returningEdges.map((r) => r.index));
    const g = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) if (!ret.has(e.index)) g.get(e.from).push(e.to);
    const color = new Map();
    const trail = [];
    let found = null;
    const dfs = (v) => {
      color.set(v, 1);
      trail.push(v);
      for (const w of g.get(v)) {
        if (found) return;
        if (color.get(w) === 1) {
          found = trail.slice(trail.indexOf(w));
          return;
        }
        if (!color.has(w)) dfs(w);
      }
      trail.pop();
      color.set(v, 2);
    };
    for (const n of nodes) {
      if (!color.has(n.id) && !found) dfs(n.id);
    }
    if (found) {
      err('LOOP_UNCOUNTED', `Cycle [${found.join(' -> ')} -> ${found[0]}] has no returning edge (target earlier on a phase path), so no revisit counter would bound it.`, { cycle: found });
    }
  }

  if (entry) {
    const seen = new Set([entry.id]);
    const q = [entry.id];
    while (q.length) {
      const v = q.shift();
      for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); q.push(w); }
    }
    for (const n of nodes) {
      if (!seen.has(n.id) && !(abandon && n.id === abandon.id)) {
        err('NODE_UNREACHABLE', `Node "${n.id}" is not edge-reachable from the entry node.`, { node: n.id });
      }
    }
  }
  if (success) {
    const radj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) radj.get(e.to).push(e.from);
    const can = new Set([success.id]);
    const q = [success.id];
    while (q.length) {
      const v = q.shift();
      for (const w of radj.get(v)) if (!can.has(w)) { can.add(w); q.push(w); }
    }
    for (const n of nodes) {
      if (!can.has(n.id) && n.type !== 'terminal' && !exitless.has(n.id)) {
        err('NODE_NO_PATH_TO_SUCCESS', `The success terminal is not reachable from node "${n.id}".`, { node: n.id });
      }
    }
  }

  Object.assign(summary, {
    nodes: nodes.length,
    edges: def.edges.length,
    phases: phaseKeys,
    entry: entry?.id ?? null,
    first_node: sharedFirst,
    close_out_node: closeOut,
    success_terminal: success?.id ?? null,
    abandonment_terminal: abandon?.id ?? null,
    caps: {
      failure: caps.failure ?? null,
      advisor_consultations: caps.advisor_consultations ?? null,
      edge_revisit: caps.edge_revisit ?? null,
      total_failure: has(caps, 'total_failure') ? caps.total_failure : isPosInt(caps.failure) ? caps.failure * 2 : null,
    },
  });
  return result();
}

// ---------------------------------------------------------------------------
// Tool-availability gate (existence and startability only)
// ---------------------------------------------------------------------------

function isExecutableFile(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveProgram(prog, env) {
  if (prog.includes('/')) {
    const p = path.resolve(prog);
    return { path: p, direct: true, exists: fs.existsSync(p), executable: isExecutableFile(p) };
  }
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, prog);
    if (isExecutableFile(p)) return { path: p, direct: false, exists: true, executable: true };
  }
  return { path: null, direct: false, exists: false, executable: false };
}

// commands: [{node, source, command}]. Returns {status, probes, errors}.
export function toolGate(commands, env = process.env) {
  const users = new Map(); // program -> [{node, source, command}]
  for (const c of commands) {
    for (const prog of programsOf(c.command)) {
      if (!users.has(prog)) users.set(prog, []);
      users.get(prog).push(c);
    }
  }
  const probes = [];
  const errors = [];
  for (const [program, used] of users) {
    const usedBy = used.map((u) => ({ node: u.node, source: u.source, command: u.command }));
    const nodesNamed = [...new Set(used.map((u) => u.node))];
    const r = resolveProgram(program, env);
    const probe = { program, resolved: r.path, via: null, status: 'ok', used_by: usedBy };
    if (!r.exists || !r.executable) {
      probe.status = r.exists ? 'not-startable' : 'missing';
      const code = r.exists ? 'TOOL_NOT_STARTABLE' : 'TOOL_MISSING';
      errors.push({
        code, invariant: INVARIANTS[code], tool: program, nodes: nodesNamed,
        message: r.exists
          ? `Tool "${program}" exists at ${r.path} but is not executable (used by ${nodesNamed.join(', ')}).`
          : `Tool "${program}" was not found${r.direct ? ` at ${r.path}` : ' on PATH'} (used by ${nodesNamed.join(', ')}).`,
      });
    } else if (r.direct) {
      probe.via = 'exists'; // explicit paths are never invoked: invocation could have real effects
    } else {
      let ok = false;
      for (const flag of ['--version', '--help']) {
        const res = spawnSync(r.path, [flag], { timeout: PROBE_TIMEOUT_MS, stdio: 'ignore', env });
        if (!res.error && res.status === 0) {
          ok = true;
          probe.via = flag;
          break;
        }
      }
      if (!ok) {
        probe.status = 'not-startable';
        errors.push({
          code: 'TOOL_NOT_STARTABLE', invariant: INVARIANTS.TOOL_NOT_STARTABLE, tool: program, nodes: nodesNamed,
          message: `Tool "${program}" resolved to ${r.path} but neither "--version" nor "--help" exited 0 (used by ${nodesNamed.join(', ')}).`,
        });
      }
    }
    probes.push(probe);
  }
  return { status: errors.length ? 'failed' : 'passed', probes, errors };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const EXIT = { OK: 0, REJECTED: 1, USAGE: 2, INPUT: 3, TOOLS: 4, INTERNAL: 70 };

const HELP = {
  ok: true,
  command: 'help',
  usage: [
    'node scripts/graph.mjs validate <definition.json> [--no-probe] [--config <config.json>]',
    'node scripts/graph.mjs <definition.json> [--no-probe] [--config <config.json>]',
  ],
  flags: {
    '--no-probe': 'structure-only validation; skip the tool-availability gate',
    '--config <path>': 'also probe the commands of the config worktree_setup.setup list',
  },
  exit_codes: {
    0: 'accepted',
    1: 'rejected: structural invariant violations',
    2: 'usage error',
    3: 'input error (unreadable file, invalid JSON, invalid config)',
    4: 'rejected by the tool gate (missing or not-startable tool)',
    70: 'internal error',
  },
};

function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exitCode = code;
}

function fail(code, message, exit, extra = {}) {
  emit({ ok: false, command: 'validate', accepted: false, errors: [{ code, invariant: INVARIANTS[code] ?? code, message }], ...extra }, exit);
}

export function main(argv) {
  const args = argv.slice();
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return emit(HELP, EXIT.OK);
  }
  if (args[0] === 'validate') args.shift();
  let file = null;
  let noProbe = false;
  let configPath = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--no-probe') noProbe = true;
    else if (a === '--config') {
      configPath = args[++i];
      if (!configPath) return fail('USAGE', '--config needs a path.', EXIT.USAGE);
    } else if (a.startsWith('-')) return fail('USAGE', `Unknown flag ${a}.`, EXIT.USAGE);
    else if (file === null) file = a;
    else return fail('USAGE', `Unexpected argument ${a}.`, EXIT.USAGE);
  }
  if (file === null) return fail('USAGE', 'A definition path is required.', EXIT.USAGE);

  let def;
  try {
    const text = fs.readFileSync(file, 'utf8');
    try {
      def = JSON.parse(text);
    } catch (e) {
      return fail('INPUT_INVALID_JSON', `${file} is not valid JSON: ${e.message}`, EXIT.INPUT, { file });
    }
  } catch (e) {
    return fail('INPUT_UNREADABLE', `Cannot read ${file}: ${e.message}`, EXIT.INPUT, { file });
  }

  const setupCommands = [];
  if (configPath) {
    try {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const setup = cfg?.worktree_setup?.setup;
      if (!isObj(cfg) || !isArr(setup) || setup.some((s) => !isStr(s))) {
        return fail('CONFIG_INVALID', `${configPath} must hold worktree_setup.setup as an array of command strings.`, EXIT.INPUT, { file });
      }
      setup.forEach((c) => setupCommands.push({ node: 'config:worktree_setup', source: 'setup', command: c }));
    } catch (e) {
      return fail('CONFIG_INVALID', `Cannot read config ${configPath}: ${e.message}`, EXIT.INPUT, { file });
    }
  }

  const res = validateDefinition(def);
  const base = { command: 'validate', file, summary: res.summary, returning_edges: res.returning_edges };
  if (res.errors.length) {
    return emit({ ok: false, ...base, accepted: false, errors: res.errors, tool_gate: { status: 'skipped', reason: 'structure-invalid' } }, EXIT.REJECTED);
  }
  if (noProbe) {
    return emit({ ok: true, ...base, accepted: true, errors: [], tool_gate: { status: 'skipped', reason: '--no-probe' } }, EXIT.OK);
  }
  const gate = toolGate([...res.commands, ...setupCommands]);
  if (gate.errors.length) {
    return emit({ ok: false, ...base, accepted: false, errors: gate.errors, tool_gate: { status: gate.status, probes: gate.probes } }, EXIT.TOOLS);
  }
  return emit({ ok: true, ...base, accepted: true, errors: [], tool_gate: { status: gate.status, probes: gate.probes } }, EXIT.OK);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    emit({ ok: false, command: 'validate', accepted: false, errors: [{ code: 'INTERNAL', invariant: 'internal error', message: String(e?.stack ?? e) }] }, EXIT.INTERNAL);
  }
}
