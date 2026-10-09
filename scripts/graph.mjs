#!/usr/bin/env node
// graph.mjs - deterministic validator, assembler, and tool-availability gate for a graph
// definition (Schema 2.0).
//
// Zero-dependency Node.js (>= 20), built-in modules only. Types are resolved through the
// shared catalog module (types.mjs); everything else is self-contained.
//
// Usage:
//   node scripts/graph.mjs validate <graph.json> [--no-probe] [--config <config.json>]
//                          [--types <project types.json>] [--plugin-types <plugin types.json>]
//   node scripts/graph.mjs <graph.json> ...      (validate is the default subcommand)
//   node scripts/graph.mjs assemble <assembly.json> --slots <values.json> [--out <path>]
//                          [--library <dir>] [--types <path>] [--plugin-types <path>]
//   node scripts/graph.mjs --help                (also printed when no arguments are given)
//
// Flags:
//   --no-probe             validate: structure-only, skip the tool-availability gate.
//   --config <path>        validate: also probe the commands of the config's worktree_setup.setup.
//   --types <path>         Project type catalog (default: .harness/types.json under the cwd).
//   --plugin-types <path>  Plugin type catalog (default: the one shipped with the plugin,
//                          skills/graph-init/templates/types.json).
//   --slots <path>         assemble: JSON object {slot: value} with one value per declared slot.
//   --out <path>           assemble: the project definition to write (default .harness/graph.json).
//   --library <path>       assemble: template library with tasks/<id>.json and nodes/<id>.json
//                          (default: skills/graph-init/templates in the plugin).
//
// Output: exactly one JSON object on stdout, always. Shapes:
//   validate  { ok, command, accepted, file, errors: [{code, invariant, message, ...context}],
//               warnings: [{code, message, ...}], summary, returning_edges, tool_gate }
//   assemble  { ok, command, file, types: {file, written}, summary, warnings }  on success;
//             { ok: false, command, errors, warnings } on rejection (nothing is written)
//   Every error names the violated invariant (`invariant`) and the node, task, pipeline entry
//   (`entry: {index, task}`), edge, outcome, field, phase value, or cycle involved (`node`,
//   `task`, `entry`, `edge`, `outcome`, `field`, `phase`, `cycle`, `path`). Warnings never
//   affect acceptance.
//
// Exit codes:
//   0  ok: validate accepted (structure valid and tool gate passed or skipped); assemble wrote
//   1  rejected: structural or composition violations, including catalog content violations
//      such as TYPE_COLLISION (assemble writes nothing)
//   2  usage error (unknown subcommand or flag, missing argument)
//   3  input error (definition, assembly, slots, config, or a catalog file unreadable or not JSON)
//   4  validate only: structure valid but a tool a task needs is missing or not startable
//   5  assemble only: the definition or the types file could not be written
//   6  assemble only: refused, invoked inside a linked worktree (writers run only in the
//      main checkout)
//   70 internal error
//
// Definition shape (JSON object, exactly these six sections; there is no phase, state_fields,
// or slots section in a runtime definition):
//   schema_version  "2.x.y"
//   name            string
//   caps            { failure, advisor_consultations, edge_revisit, total_failure? }  positive ints
//   tasks           { <task-id>: TaskDef }   the task catalog; a pipeline entry resolves in it
//   nodes           [{ id, kind, purpose, pipeline?, outcomes?, re_entry?, terminal_kind? }]
//   edges           [{ from, to, outcome, guard: [{field, op, value?}] }]
// TaskDef: executor (script | llm | validator | human), purpose, instructions (required except
//   for script), equipment { skills: [string], commands: [command], mcp: [string] }, reads,
//   produces, restrictions (string arrays), exit { outcomes, artifact? } (artifact required for
//   llm, validator, human), runner (validator only: reviewer | orchestrator, default reviewer),
//   run (script only: [command | {command, codes}]), params { name: description }.
//   A command is a string, a family {base, args?}, or a state-sourced {source: "state:<path>",
//   family}. A `produces` entry state:<field> is write authorization and type reference;
//   `reads` entries state:<path> only need to resolve.
// Node: kind entry (no pipeline) | work (pipeline of {use, with?, on} + outcomes) | terminal
//   (terminal_kind success | abandonment, pipeline of script tasks, no outcomes).
//   `on` maps every exit outcome of the used task to one action: next | escalate | done
//   (terminal pipelines only) | goto:<earlier task of the same pipeline> | a declared node outcome.
// Edges: the entry node has exactly one outgoing edge: no outcome, empty guard. Guards are a
//   conjunction over catalog-resolved fields; [] is the unconditional guard. Operators (closed
//   set): eq ne in not-in lt lte gt gte; list fields also empty not-empty, and eq/ne/lt/lte/gt/gte
//   compare the list's element count.
//
// Assembly graph (the input of assemble): { schema_version, name, slots: {name: description},
//   caps, nodes: [node id | inline node], tasks?: {id: TaskDef}, edges }. Node ids load
//   <library>/nodes/<id>.json; task ids resolve in `tasks` first, then <library>/tasks/<id>.json.
//   Slots are filled everywhere in the composition except task params (which stay for the
//   pipeline entry's `with`). Parameterized plugin types whose slots are all declared are
//   instantiated into the project catalog. The flattened definition is validated in memory;
//   only a valid one is written (graph file via temp file + rename; types via types.mjs).
//
// Phase (design D8): `phase` is an ordinary state field typed by the catalogs. Exactly one
//   task, a human task, produces it and the shared first node references that task. The
//   phase-restricted route of a value p is the walk from the entry over edges whose guards can
//   hold with phase = p (other fields unconstrained). Guard exclusivity and exhaustiveness at a
//   node are judged over the phase values whose route reaches it; every non-terminal node on p's
//   route must reach the success terminal over p-traversable edges; the node referencing the
//   close-out task must lie on every route from the entry to the success terminal. A field is
//   applicable at a node when a node whose pipeline produces it reaches that node by edges.
//
// Library API (exported): validateDefinition(def, {registry, catalogErrors}) toolGate(commands,
//   env) assemble({assembly, slots, library, out, typesPath, pluginPath}) tokenize programsOf
//   main(argv). validateDefinition is pure: the caller supplies the merged type registry
//   (types.mjs) and any catalog merge errors to report with the structure errors.
//
// Stable error codes (the `invariant` field carries the human-readable name):
//   Document   DEF_NOT_OBJECT DEF_FIELD_MISSING DEF_FIELD_UNKNOWN SCHEMA_VERSION_UNSUPPORTED
//              SLOT_UNFILLED
//   Caps       CAP_MISSING CAP_INVALID LOOP_NO_CAP
//   Tasks      TASK_ID_INVALID TASK_FIELD_UNKNOWN TASK_FIELD_MISSING TASK_FIELD_INVALID
//              TASK_EXECUTOR_INVALID EQUIPMENT_INVALID EQUIPMENT_SOURCE_INVALID
//              EXIT_ARTIFACT_MISSING SCRIPT_CODES_INVALID SCRIPT_OUTCOME_INVALID BLOCKED_DECLARED
//   Nodes      NODE_ID_INVALID NODE_DUPLICATE_ID NODE_KIND_INVALID NODE_FIELD_MISSING
//              NODE_FIELD_INVALID NODE_FIELD_UNKNOWN FORBIDDEN_NODE ENTRY_COUNT
//              ENTRY_DECLARES_FORBIDDEN SUCCESS_TERMINAL_COUNT ABANDONMENT_TERMINAL_COUNT
//              TERMINAL_KIND_INVALID TERMINAL_PIPELINE_MISSING TERMINAL_DECLARES_FORBIDDEN
//              TERMINAL_TASK_NOT_SCRIPT OUTCOME_INVALID OUTCOME_UNPRODUCED REENTRY_INVALID
//   Pipeline   PIPELINE_ENTRY_INVALID TASK_UNDECLARED PIPELINE_DUPLICATE_TASK PARAM_UNBOUND
//              PARAM_UNDECLARED ON_OUTCOME_UNCOVERED ON_OUTCOME_UNDECLARED ACTION_INVALID
//              ACTION_NEXT_ON_LAST GOTO_NOT_BACKWARD
//   Edges      EDGE_INVALID EDGE_UNKNOWN_NODE EDGE_FROM_TERMINAL EDGE_TO_ENTRY EDGE_FORBIDDEN
//              EDGE_OUTCOME_MISSING EDGE_OUTCOME_UNDECLARED OUTCOME_UNCOVERED ENTRY_ROUTE_INVALID
//              GUARD_UNDECIDABLE GUARD_FIELD_INAPPLICABLE GUARD_OVERLAP GUARD_NOT_EXHAUSTIVE
//              GUARD_TOO_COMPLEX
//   Types      TYPE_DANGLING TYPE_PARAMETERIZED_UNFILLED TYPE_PATH_INVALID (resolution);
//              TYPE_COLLISION TYPE_ENTRY_INVALID TYPE_SLOT_IN_PROJECT (catalog merge, passed on
//              from types.mjs)
//   Phase      PHASE_MAINTENANCE_MISSING PHASE_APPROVAL_INVALID FIRST_NODE_NO_APPROVAL
//              PHASE_ROUTE_MISSING
//   Close-out  CLOSE_OUT_COUNT CLOSE_OUT_NODE_COUNT CLOSE_OUT_NOT_DOMINATING
//   Graph      LOOP_NO_EXIT NODE_UNREACHABLE NODE_NO_PATH_TO_SUCCESS
//   Gate       TOOL_MISSING TOOL_NOT_STARTABLE
//   Assemble   ASSEMBLY_INVALID ASSEMBLY_NODE_UNRESOLVED ASSEMBLY_TASK_UNRESOLVED SLOT_UNDECLARED
//              SLOT_VALUE_INVALID WRITE_FAILED (warning: ASSEMBLY_TASK_UNUSED)
//   Usage/IO   USAGE INPUT_UNREADABLE INPUT_INVALID_JSON CONFIG_INVALID CATALOG_UNREADABLE
//              CATALOG_INVALID_JSON CATALOG_NOT_OBJECT INTERNAL
//   Warnings   TASK_UNREFERENCED (a catalog task no pipeline uses) ASSEMBLY_TASK_UNUSED

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PLUGIN_CATALOG, PROJECT_CATALOG, findSlots, loadCatalog, loadRegistry, mergeCatalogs,
  resolveField, resolvePath, instantiate, checkPhaseEntry, writeProjectEntries, inLinkedWorktree,
} from './types.mjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXECUTORS = ['script', 'llm', 'validator', 'human'];
const ARTIFACT_EXECUTORS = ['llm', 'validator', 'human'];
const TOP_KEYS = ['schema_version', 'name', 'caps', 'tasks', 'nodes', 'edges'];
const ASSEMBLY_KEYS = ['schema_version', 'name', 'slots', 'caps', 'tasks', 'nodes', 'edges'];
const TASK_KEYS = ['executor', 'purpose', 'instructions', 'equipment', 'reads', 'produces', 'restrictions', 'exit', 'runner', 'run', 'params'];
const NODE_KEYS = ['id', 'kind', 'purpose', 'pipeline', 'outcomes', 're_entry', 'terminal_kind'];
const NODE_KINDS = ['entry', 'work', 'terminal'];
const ENTRY_KEYS = ['use', 'with', 'on'];
const RUNNERS = ['reviewer', 'orchestrator'];
const OPS = ['eq', 'ne', 'in', 'not-in', 'lt', 'lte', 'gt', 'gte', 'empty', 'not-empty'];
const RESERVED_OUTCOMES = ['next', 'escalate', 'done'];
const CLOSE_OUT_SKILLS = new Set(['open-skills:wrap', 'wrap']);
const FORBIDDEN_RE = /(human[-_ ]?gate|advisor|blocked|escalat)/i;
const BLOCKED_RE = /^blocked$/i;
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PARAM_RE = /^[a-z][a-z0-9_]*$/;
const SHELL_BUILTINS = new Set(['cd', 'echo', 'exit', 'export', 'set', 'true', 'false', 'test', '[', ':', 'unset']);
const MAX_COMBINATIONS = 100000;
const OTHER = '\u0000other';
const PROBE_TIMEOUT_MS = 10000;
const LOAD_CODES = new Set(['CATALOG_UNREADABLE', 'CATALOG_INVALID_JSON', 'CATALOG_NOT_OBJECT']);
const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_LIBRARY = path.resolve(SCRIPTS_DIR, '..', 'skills', 'graph-init', 'templates');
const DEFAULT_OUT = path.join('.harness', 'graph.json');

const INVARIANTS = {
  IN_WORKTREE: 'harness writers run only in the main checkout',
  DEF_NOT_OBJECT: 'definition is one JSON object',
  DEF_FIELD_MISSING: 'definition declares every required section',
  DEF_FIELD_UNKNOWN: 'definition holds exactly the runtime sections',
  SCHEMA_VERSION_UNSUPPORTED: 'schema version is supported (2.x)',
  SLOT_UNFILLED: 'no unfilled template slot remains (task params excepted)',
  CAP_MISSING: 'every loop cap is declared',
  CAP_INVALID: 'caps are positive integers',
  LOOP_NO_CAP: 'every cycle and every goto has a declared cap',
  TASK_ID_INVALID: 'task ids are kebab-case',
  TASK_FIELD_UNKNOWN: 'a task declares only TaskDef fields',
  TASK_FIELD_MISSING: 'a task declares every contract field',
  TASK_FIELD_INVALID: 'task fields are well-formed',
  TASK_EXECUTOR_INVALID: 'task executor is in the closed vocabulary',
  EQUIPMENT_INVALID: 'equipment is well-formed',
  EQUIPMENT_SOURCE_INVALID: 'a state-sourced command draws on a command-typed field',
  EXIT_ARTIFACT_MISSING: 'llm, validator, and human tasks declare an exit artifact',
  SCRIPT_CODES_INVALID: 'script codes map declared outcomes only, never 126, 127, or ok',
  SCRIPT_OUTCOME_INVALID: 'a script ends in ok, failed, or an outcome some run line maps',
  BLOCKED_DECLARED: 'blocked is universal and declared by no task',
  NODE_ID_INVALID: 'node ids are kebab-case',
  NODE_DUPLICATE_ID: 'node ids are unique',
  NODE_KIND_INVALID: 'node kind is in the closed vocabulary',
  NODE_FIELD_MISSING: 'node declares every contract field',
  NODE_FIELD_INVALID: 'node fields are well-formed',
  NODE_FIELD_UNKNOWN: 'a node declares only node fields',
  FORBIDDEN_NODE: 'no human-gate, advisor, blocked, or escalation node or edge',
  ENTRY_COUNT: 'exactly one entry node',
  ENTRY_DECLARES_FORBIDDEN: 'the entry node declares no pipeline, outcomes, re-entry, or terminal kind',
  SUCCESS_TERMINAL_COUNT: 'exactly one success terminal',
  ABANDONMENT_TERMINAL_COUNT: 'exactly one abandonment terminal',
  TERMINAL_KIND_INVALID: 'terminals declare success or abandonment',
  TERMINAL_PIPELINE_MISSING: 'terminals declare their pipeline (possibly empty)',
  TERMINAL_DECLARES_FORBIDDEN: 'terminals declare no outcomes or re-entry',
  TERMINAL_TASK_NOT_SCRIPT: 'terminal pipelines reference script tasks only',
  OUTCOME_INVALID: 'node outcomes are routable (reserved words and blocked are never outcomes)',
  OUTCOME_UNPRODUCED: 'every node outcome is surfaced by some pipeline action',
  REENTRY_INVALID: 're-entry rules reference resolved, applicable fields',
  PIPELINE_ENTRY_INVALID: 'pipeline entries are {use, with?, on}',
  TASK_UNDECLARED: 'every pipeline entry uses a catalog task',
  PIPELINE_DUPLICATE_TASK: 'a task appears at most once per pipeline',
  PARAM_UNBOUND: 'a pipeline entry binds every param its task declares',
  PARAM_UNDECLARED: 'a pipeline entry binds only params its task declares',
  ON_OUTCOME_UNCOVERED: 'the on map covers every exit outcome of its task',
  ON_OUTCOME_UNDECLARED: 'the on map names only exit outcomes of its task',
  ACTION_INVALID: 'actions come from the closed vocabulary',
  ACTION_NEXT_ON_LAST: 'next is illegal on the last pipeline entry',
  GOTO_NOT_BACKWARD: 'goto targets an earlier entry of the same pipeline',
  EDGE_INVALID: 'edges are well-formed',
  EDGE_UNKNOWN_NODE: 'edges connect declared nodes',
  EDGE_FROM_TERMINAL: 'terminals have no outgoing edges',
  EDGE_TO_ENTRY: 'no edge targets the entry node',
  EDGE_FORBIDDEN: 'no human-gate, advisor, blocked, or escalation node or edge',
  EDGE_OUTCOME_MISSING: 'every edge from a non-entry node names its outcome',
  EDGE_OUTCOME_UNDECLARED: 'every outcome an edge references is declared by its source',
  OUTCOME_UNCOVERED: 'edge coverage is complete per node',
  ENTRY_ROUTE_INVALID: 'the entry node routes unconditionally, without an outcome, to a work node',
  GUARD_UNDECIDABLE: 'guards are structured, machine-evaluable predicates over the closed operator set',
  GUARD_FIELD_INAPPLICABLE: 'every guard field is applicable at the edge source',
  GUARD_OVERLAP: 'guards of one outcome are mutually exclusive',
  GUARD_NOT_EXHAUSTIVE: 'guards of one outcome are jointly exhaustive',
  GUARD_TOO_COMPLEX: 'guard sets are small enough to decide',
  TYPE_DANGLING: 'every referenced state field is defined by a type catalog',
  TYPE_PARAMETERIZED_UNFILLED: 'a referenced parameterized type has been instantiated',
  TYPE_PATH_INVALID: 'state paths resolve through the type catalogs',
  TYPE_COLLISION: 'plugin and project catalogs do not collide',
  TYPE_ENTRY_INVALID: 'catalog entries are well-formed',
  TYPE_SLOT_IN_PROJECT: 'project catalog entries carry no unfilled slot',
  PHASE_MAINTENANCE_MISSING: 'the phase type carries the reserved value maintenance',
  PHASE_APPROVAL_INVALID: 'exactly one task, a human task, produces the phase',
  FIRST_NODE_NO_APPROVAL: 'the shared first node carries the phase-approval task',
  PHASE_ROUTE_MISSING: 'every phase value has a route from every reachable node to the success terminal',
  CLOSE_OUT_COUNT: 'exactly one task mounts the close-out skill',
  CLOSE_OUT_NODE_COUNT: 'exactly one node references the close-out task',
  CLOSE_OUT_NOT_DOMINATING: 'the close-out node lies on every route to the success terminal',
  LOOP_NO_EXIT: 'every loop has an exit',
  NODE_UNREACHABLE: 'every node is edge-reachable from the entry node',
  NODE_NO_PATH_TO_SUCCESS: 'the success terminal is reachable from every work node',
  TOOL_MISSING: 'every tool a task needs exists',
  TOOL_NOT_STARTABLE: 'every tool a task needs starts',
  ASSEMBLY_INVALID: 'the assembly graph is well-formed',
  ASSEMBLY_NODE_UNRESOLVED: 'every node reference resolves to a library node file',
  ASSEMBLY_TASK_UNRESOLVED: 'every referenced task resolves in the assembly or the library',
  SLOT_UNDECLARED: 'every slot and slot value is declared by the assembly',
  SLOT_VALUE_INVALID: 'a slot value fits where its placeholder sits',
  WRITE_FAILED: 'the outputs can be written',
  CATALOG_UNREADABLE: 'catalogs are readable',
  CATALOG_INVALID_JSON: 'catalogs are valid JSON',
  CATALOG_NOT_OBJECT: 'catalogs are JSON objects',
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
const uniq = (list) => [...new Set(list)];
const clone = (v) => JSON.parse(JSON.stringify(v));

function deq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function edgeLabel(e) {
  return `${e.from} -[${e.outcome ?? ''}]-> ${e.to}`;
}

const edgeCtx = (e) => ({ index: e.index, from: e.from, to: e.to, outcome: e.outcome ?? null });

// An outcome name a node can never surface: an action word, goto:*, or a forbidden construct.
const reservedOutcome = (o) => RESERVED_OUTCOMES.includes(o) || o.startsWith('goto:') || FORBIDDEN_RE.test(o);

// Every node reachable from `start` over `adjacency` (start included), never entering `skip`.
function reachSet(adjacency, start, skip = null) {
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const v = q.shift();
    for (const w of adjacency.get(v) ?? []) {
      if (w !== skip && !seen.has(w)) {
        seen.add(w);
        q.push(w);
      }
    }
  }
  return seen;
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

// ---------------------------------------------------------------------------
// Guard algebra (pure helpers): atoms, evaluation, enumeration
// ---------------------------------------------------------------------------

// The guard kind of a resolved catalog entry: how its values compare.
function guardInfo(entry) {
  const nullable = entry.nullable === true;
  if (entry.type === 'list') return { kind: 'count', nullable };
  if (isArr(entry.values)) return { kind: 'enum', domain: entry.values.slice(), nullable };
  if (entry.type === 'boolean') return { kind: 'enum', domain: [true, false], nullable };
  if (entry.type === 'integer') return { kind: 'int', nullable };
  if (entry.type === 'number') return { kind: 'num', nullable };
  if (entry.type === 'string' || entry.type === 'command' || entry.type === 'pointer') return { kind: 'opaque', nullable };
  return { kind: 'object', nullable };
}

// Constants the guards compare `field` against; they decide where the atoms fall.
function consts(conds, field) {
  const out = [];
  for (const c of conds) {
    if (c.field !== field) continue;
    if (c.op === 'in' || c.op === 'not-in') out.push(...c.value);
    else if (has(c, 'value')) out.push(c.value);
  }
  return out;
}

// One representative value per equivalence class of the field's domain, relative to `cs`.
function atomsFor(info, cs) {
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
}

function evalCond(c, atom) {
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
}

const display = (st) => JSON.stringify(st, (k, v) => (v === OTHER ? '<other>' : v));

// ---------------------------------------------------------------------------
// Structural validation (pure: no I/O)
// ---------------------------------------------------------------------------

// `registry` is the merged type catalog (types.mjs mergeCatalogs / loadRegistry); the caller
// passes the merge errors as `catalogErrors` so they are reported with the structure errors.
export function validateDefinition(def, { registry = new Map(), catalogErrors = [] } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message, ctx = {}) =>
    errors.push({ code, invariant: INVARIANTS[code] ?? code, message, ...ctx });

  const summary = {};
  const returningEdges = [];
  const gateCommands = [];
  const result = () => ({
    errors,
    warnings,
    summary,
    returning_edges: returningEdges,
    commands: gateCommands,
  });

  for (const e of catalogErrors) errors.push({ code: e.code, invariant: INVARIANTS[e.code] ?? e.code, ...e });

  if (!isObj(def)) {
    err('DEF_NOT_OBJECT', 'The definition must be a single JSON object.');
    return result();
  }

  // ---- document-level sections -------------------------------------------
  const version = def.schema_version;
  if (has(def, 'schema_version') && !(typeof version === 'string' && /^2\.\d+\.\d+$/.test(version))) {
    const legacy = typeof version === 'string' && /^1\.\d+\.\d+$/.test(version);
    err(
      'SCHEMA_VERSION_UNSUPPORTED',
      legacy
        ? `schema_version ${version} is a 1.x definition; 1.x definitions are not supported and must be re-assembled through graph-init.`
        : `schema_version must be 2.x.y, got ${JSON.stringify(version)}.`,
      { path: 'schema_version' },
    );
    return result(); // every other message would be noise about a shape that no longer exists
  }
  for (const key of TOP_KEYS) {
    if (!has(def, key)) err('DEF_FIELD_MISSING', `Missing required section "${key}".`, { path: key });
  }
  for (const key of Object.keys(def)) {
    if (!TOP_KEYS.includes(key)) {
      err('DEF_FIELD_UNKNOWN', `Unknown top-level key "${key}"; a 2.0 definition holds exactly ${TOP_KEYS.join(', ')} ("phase", "state_fields", and "slots" no longer exist in a runtime definition).`, { path: key });
    }
  }
  if (has(def, 'name') && !isStr(def.name)) err('DEF_FIELD_MISSING', 'name must be a non-empty string.', { path: 'name' });
  for (const [k, expect] of [['tasks', isObj], ['nodes', isArr], ['edges', isArr], ['caps', isObj]]) {
    if (has(def, k) && !expect(def[k])) err('DEF_FIELD_MISSING', `Section "${k}" has the wrong JSON type.`, { path: k });
  }
  const doc = {
    tasks: isObj(def.tasks) ? def.tasks : {},
    nodes: isArr(def.nodes) ? def.nodes : [],
    edges: isArr(def.edges) ? def.edges : [],
    caps: isObj(def.caps) ? def.caps : {},
  };

  // ---- unfilled template slots: legal only as a task's own params ------------
  const slotUnfilled = (s) => err('SLOT_UNFILLED', `Unfilled template slot {{${s.slot}}} at ${s.path}.`, { slot: s.slot, path: s.path });
  findSlots(def.name, 'name').forEach(slotUnfilled);
  for (const sec of ['caps', 'nodes', 'edges']) findSlots(doc[sec], sec).forEach(slotUnfilled);
  for (const [id, t] of Object.entries(doc.tasks)) {
    const params = isObj(t) && isObj(t.params) ? t.params : {};
    findSlots(t, `tasks.${id}`).filter((s) => !has(params, s.slot)).forEach(slotUnfilled);
  }

  // ---- caps ---------------------------------------------------------------
  const caps = doc.caps;
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
  const failureOk = isPosInt(caps.failure);

  // ---- task catalog -----------------------------------------------------------
  const tasks = new Map(); // id -> {id, executor, outcomes, params, gate, skills, produces, sources}

  const parseTask = (id, t) => {
    const bad = (code, msg, field) => err(code, `Task "${id}": ${msg}`, field ? { task: id, field } : { task: id });
    if (!KEBAB_RE.test(id)) bad('TASK_ID_INVALID', `"${id}" is not a kebab-case task id.`);
    if (!isObj(t)) return bad('TASK_FIELD_INVALID', 'a TaskDef must be an object.');
    const info = { id, executor: null, outcomes: null, params: [], gate: [], skills: [], produces: [], sources: [] };
    tasks.set(id, info);

    for (const k of Object.keys(t)) {
      if (!TASK_KEYS.includes(k)) {
        bad('TASK_FIELD_UNKNOWN', `declares "${k}", which is not a TaskDef field (allowed: ${TASK_KEYS.join(', ')}); type information lives in the type catalogs and node-level text no longer exists.`, k);
      }
    }

    if (!EXECUTORS.includes(t.executor)) {
      bad('TASK_EXECUTOR_INVALID', `executor is ${JSON.stringify(t.executor)}; allowed: ${EXECUTORS.join(', ')}.`, 'executor');
    } else info.executor = t.executor;
    const needsText = info.executor !== null && info.executor !== 'script';

    if (!has(t, 'purpose')) bad('TASK_FIELD_MISSING', 'declares no purpose.', 'purpose');
    else if (!isStr(t.purpose)) bad('TASK_FIELD_INVALID', 'purpose must be a non-empty string.', 'purpose');
    if (!has(t, 'instructions')) {
      if (needsText) bad('TASK_FIELD_MISSING', `${info.executor} tasks must declare instructions.`, 'instructions');
    } else if (!isStr(t.instructions)) bad('TASK_FIELD_INVALID', 'instructions must be a non-empty string.', 'instructions');

    // equipment
    if (!has(t, 'equipment')) bad('TASK_FIELD_MISSING', 'declares no equipment ({skills, commands, mcp}).', 'equipment');
    else if (!isObj(t.equipment)) bad('EQUIPMENT_INVALID', 'equipment must be an object {skills, commands, mcp}.', 'equipment');
    else {
      const eq = t.equipment;
      for (const k of Object.keys(eq)) {
        if (!['skills', 'commands', 'mcp'].includes(k)) bad('EQUIPMENT_INVALID', `equipment declares "${k}"; allowed: skills, commands, mcp.`, `equipment.${k}`);
      }
      for (const k of ['skills', 'mcp']) {
        if (!isArr(eq[k]) || !eq[k].every(isStr)) bad('EQUIPMENT_INVALID', `equipment.${k} must be an array of non-empty strings.`, `equipment.${k}`);
      }
      if (isArr(eq.skills)) info.skills = eq.skills.filter(isStr);
      if (!isArr(eq.commands)) bad('EQUIPMENT_INVALID', 'equipment.commands must be an array.', 'equipment.commands');
      else {
        eq.commands.forEach((c, i) => {
          const at = `equipment.commands[${i}]`;
          const keys = isObj(c) ? Object.keys(c) : [];
          if (isStr(c)) info.gate.push({ source: 'equipment', command: c });
          else if (isObj(c) && has(c, 'base') && keys.every((k) => k === 'base' || k === 'args') && isStr(c.base) && (c.args === undefined || typeof c.args === 'string')) {
            info.gate.push({ source: 'family', command: c.base });
          } else if (isObj(c) && keys.length === 2 && has(c, 'source') && has(c, 'family') && typeof c.source === 'string' && c.source.startsWith('state:') && c.source.length > 6 && isStr(c.family)) {
            info.gate.push({ source: 'state-family', command: c.family });
            info.sources.push({ path: c.source.slice(6), at });
          } else {
            bad('EQUIPMENT_INVALID', `${at} must be a command string, a family {base, args?}, or a state-sourced entry {source: "state:<field-path>", family: "<base>"}.`, at);
          }
        });
      }
    }

    // reads, produces, restrictions
    for (const f of ['reads', 'produces', 'restrictions']) {
      if (!has(t, f)) bad('TASK_FIELD_MISSING', `declares no ${f}.`, f);
      else if (!isArr(t[f]) || !t[f].every(isStr)) bad('TASK_FIELD_INVALID', `${f} must be an array of non-empty strings.`, f);
    }

    // exit
    if (!has(t, 'exit')) bad('TASK_FIELD_MISSING', 'declares no exit ({outcomes, artifact?}).', 'exit');
    else if (!isObj(t.exit)) bad('TASK_FIELD_INVALID', 'exit must be an object {outcomes, artifact?}.', 'exit');
    else {
      for (const k of Object.keys(t.exit)) {
        if (k !== 'outcomes' && k !== 'artifact') bad('TASK_FIELD_INVALID', `exit declares "${k}"; allowed: outcomes, artifact.`, `exit.${k}`);
      }
      const o = t.exit.outcomes;
      if (!isArr(o) || o.length === 0 || !o.every(isStr)) bad('TASK_FIELD_INVALID', 'exit.outcomes must be a non-empty array of non-empty strings.', 'exit.outcomes');
      else if (new Set(o).size !== o.length) bad('TASK_FIELD_INVALID', 'exit.outcomes contains duplicates.', 'exit.outcomes');
      else {
        info.outcomes = o.slice();
        for (const x of o) {
          if (BLOCKED_RE.test(x)) bad('BLOCKED_DECLARED', `exit.outcomes declares "${x}"; blocked is universal and handled by the fallback chain, never declared.`, 'exit.outcomes');
        }
      }
      if (ARTIFACT_EXECUTORS.includes(info.executor)) {
        if (!isStr(t.exit.artifact)) bad('EXIT_ARTIFACT_MISSING', `${info.executor} tasks must declare exit.artifact (the stage-file pattern an outcome requires).`, 'exit.artifact');
      } else if (has(t.exit, 'artifact') && !isStr(t.exit.artifact)) bad('TASK_FIELD_INVALID', 'exit.artifact must be a non-empty string.', 'exit.artifact');
    }

    // runner (validator only)
    if (has(t, 'runner')) {
      if (info.executor !== null && info.executor !== 'validator') bad('TASK_FIELD_INVALID', 'runner applies to validator tasks only.', 'runner');
      else if (!RUNNERS.includes(t.runner)) bad('TASK_FIELD_INVALID', `runner must be "reviewer" or "orchestrator", got ${JSON.stringify(t.runner)}.`, 'runner');
    }

    // run (script only)
    if (has(t, 'run') && info.executor !== null && info.executor !== 'script') {
      bad('TASK_FIELD_INVALID', `run applies to script tasks only (this task is ${info.executor}).`, 'run');
    } else if (info.executor === 'script' && !has(t, 'run')) {
      bad('TASK_FIELD_MISSING', 'script tasks must declare run.', 'run');
    } else if (has(t, 'run') && (info.executor === 'script' || info.executor === null)) {
      const mapped = new Set();
      if (!isArr(t.run) || t.run.length === 0) bad('TASK_FIELD_INVALID', 'run must be a non-empty array of commands.', 'run');
      else {
        t.run.forEach((r, i) => {
          const at = `run[${i}]`;
          if (isStr(r)) return info.gate.push({ source: 'run', command: r });
          const keys = isObj(r) ? Object.keys(r) : [];
          if (!isObj(r) || !isStr(r.command) || !keys.every((k) => k === 'command' || k === 'codes')) {
            return bad('TASK_FIELD_INVALID', `${at} must be a command string or {command, codes}.`, at);
          }
          info.gate.push({ source: 'run', command: r.command });
          if (!has(r, 'codes')) return;
          if (!isObj(r.codes)) return bad('SCRIPT_CODES_INVALID', `${at}.codes must map exit statuses to declared outcomes.`, `${at}.codes`);
          for (const [k, target] of Object.entries(r.codes)) {
            const w = `${at}.codes.${k}`;
            if (k === '126' || k === '127') bad('SCRIPT_CODES_INVALID', `${w}: status ${k} can never be mapped (a command that cannot run is a defect, not an outcome).`, w);
            else if (!/^[1-9][0-9]*$/.test(k) || Number(k) > 255) bad('SCRIPT_CODES_INVALID', `${w}: "${k}" is not an exit status between 1 and 255.`, w);
            else if (typeof target !== 'string') bad('SCRIPT_CODES_INVALID', `${w} must name a declared exit outcome.`, w);
            else if (target === 'ok') bad('SCRIPT_CODES_INVALID', `${w} maps to "ok", which is reserved for exit status 0.`, w);
            else if (info.outcomes && !info.outcomes.includes(target)) bad('SCRIPT_CODES_INVALID', `${w} maps to "${target}", which exit.outcomes does not declare.`, w);
            else mapped.add(target);
          }
        });
      }
      if (info.executor === 'script' && info.outcomes) {
        for (const must of ['ok', 'failed']) {
          if (!info.outcomes.includes(must)) bad('SCRIPT_OUTCOME_INVALID', `a script's exit.outcomes must include "${must}".`, 'exit.outcomes');
        }
        for (const o of info.outcomes) {
          if (o !== 'ok' && o !== 'failed' && !mapped.has(o)) {
            bad('SCRIPT_OUTCOME_INVALID', `exit outcome "${o}" is not the target of any run line's codes, so no run can end in it.`, 'exit.outcomes');
          }
        }
      }
    }

    // params
    if (has(t, 'params')) {
      if (!isObj(t.params)) bad('TASK_FIELD_INVALID', 'params must be an object {name: description}.', 'params');
      else {
        for (const [k, d] of Object.entries(t.params)) {
          if (!PARAM_RE.test(k)) bad('TASK_FIELD_INVALID', `param name "${k}" must match ^[a-z][a-z0-9_]*$.`, `params.${k}`);
          else if (!isStr(d)) bad('TASK_FIELD_INVALID', `param "${k}" needs a description string.`, `params.${k}`);
          else info.params.push(k);
        }
      }
    }

    // type references: produces resolves, reads dangle-checks, state-sourced equipment draws on commands
    for (const e of arr(t.produces)) {
      if (!isStr(e) || !e.startsWith('state:')) continue;
      const field = e.slice(6);
      info.produces.push(field);
      const r = resolveField(registry, field);
      if (!r.ok) err(r.code, `Task "${id}" produces state:${field}: ${r.message}`, { task: id, field });
    }
    for (const e of arr(t.reads)) {
      if (!isStr(e) || !e.startsWith('state:')) continue;
      const r = resolvePath(registry, e.slice(6));
      if (!r.ok) err(r.code, `Task "${id}" reads state:${e.slice(6)}: ${r.message}`, { task: id, field: e.slice(6) });
    }
    for (const s of info.sources) {
      const r = resolvePath(registry, s.path);
      if (!r.ok) err(r.code, `Task "${id}" ${s.at} draws on state:${s.path}: ${r.message}`, { task: id, field: s.path });
      else if (!(r.entry.type === 'command' || (r.entry.type === 'list' && isObj(r.entry.items) && r.entry.items.type === 'command'))) {
        err('EQUIPMENT_SOURCE_INVALID', `Task "${id}" ${s.at} draws on state:${s.path}, which is a ${r.entry.type} field; a state-sourced command needs a command-typed field or a list of commands.`, { task: id, field: s.path });
      }
    }
  };
  for (const [id, t] of Object.entries(doc.tasks)) parseTask(id, t);

  // ---- nodes: document-level shape --------------------------------------------
  const nodes = [];
  const byId = new Map();
  doc.nodes.forEach((n, i) => {
    const where = `nodes[${i}]`;
    if (!isObj(n)) return err('NODE_FIELD_INVALID', `${where} must be an object.`, { path: where });
    if (!isStr(n.id)) return err('NODE_FIELD_MISSING', `${where} has no id.`, { path: where });
    if (!KEBAB_RE.test(n.id)) err('NODE_ID_INVALID', `Node id "${n.id}" is not kebab-case.`, { node: n.id });
    if (byId.has(n.id)) return err('NODE_DUPLICATE_ID', `Node id "${n.id}" is declared twice.`, { node: n.id });
    byId.set(n.id, n);
    nodes.push(n);
  });

  for (const n of nodes) {
    if (FORBIDDEN_RE.test(n.id)) {
      err('FORBIDDEN_NODE', `Node "${n.id}" is a human-gate, advisor, blocked, or escalation node; the fallback chain is universal and in place.`, { node: n.id });
    }
    for (const k of Object.keys(n)) {
      if (!NODE_KEYS.includes(k)) {
        err('NODE_FIELD_UNKNOWN', `Node "${n.id}" declares "${k}", which is not a node field (allowed: ${NODE_KEYS.join(', ')}); everything executable belongs to a task referenced from the pipeline.`, { node: n.id, field: k });
      }
    }
    if (!NODE_KINDS.includes(n.kind)) {
      err('NODE_KIND_INVALID', `Node "${n.id}" has kind ${JSON.stringify(n.kind)}; allowed: ${NODE_KINDS.join(', ')}.`, { node: n.id });
    }
    if (!isStr(n.purpose)) err('NODE_FIELD_MISSING', `Node "${n.id}" declares no purpose.`, { node: n.id, field: 'purpose' });
  }

  const entries = nodes.filter((n) => n.kind === 'entry');
  const terminals = nodes.filter((n) => n.kind === 'terminal');
  const work = nodes.filter((n) => n.kind === 'work');
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

  // ---- nodes: outcomes and pipelines -------------------------------------------
  const pipelines = new Map(); // node id -> [{index, use}] (well-formed entries)
  const refs = new Map(); // task id -> [node ids that reference it]
  const gotos = []; // {node, index, task}: every goto action

  const checkPipeline = (n) => {
    const pipe = n.pipeline;
    const isTerminal = n.kind === 'terminal';
    const declared = isArr(n.outcomes) ? n.outcomes : [];
    const firstAt = new Map();
    pipe.forEach((p, i) => {
      if (isObj(p) && isStr(p.use) && !firstAt.has(p.use)) firstAt.set(p.use, i);
    });
    const used = [];
    pipelines.set(n.id, used);
    const produced = new Set();

    pipe.forEach((p, i) => {
      const bad = (code, msg, extra = {}) => err(code, `Node "${n.id}" entry ${i}${isObj(p) && isStr(p.use) ? ` (${p.use})` : ''}: ${msg}`, {
        node: n.id, entry: { index: i, task: isObj(p) && isStr(p.use) ? p.use : null }, ...extra,
      });
      if (!isObj(p)) return bad('PIPELINE_ENTRY_INVALID', 'must be an object {use, with?, on}.');
      for (const k of Object.keys(p)) {
        if (!ENTRY_KEYS.includes(k)) bad('PIPELINE_ENTRY_INVALID', `declares "${k}"; a pipeline entry is exactly {use, with?, on}.`, { field: k });
      }
      if (!isStr(p.use)) return bad('PIPELINE_ENTRY_INVALID', '"use" must name a catalog task.', { field: 'use' });
      if (!isObj(p.on)) return bad('PIPELINE_ENTRY_INVALID', '"on" must be an object mapping each exit outcome to an action.', { field: 'on' });
      if (has(p, 'with') && (!isObj(p.with) || !Object.values(p.with).every(isStr))) {
        bad('PIPELINE_ENTRY_INVALID', '"with" must be an object of non-empty string values.', { field: 'with' });
      }
      used.push({ index: i, use: p.use });
      if (!refs.has(p.use)) refs.set(p.use, []);
      if (!refs.get(p.use).includes(n.id)) refs.get(p.use).push(n.id);
      if (firstAt.get(p.use) !== i) {
        bad('PIPELINE_DUPLICATE_TASK', `task "${p.use}" is already used at entry ${firstAt.get(p.use)}; a task appears at most once per pipeline.`, { task: p.use, entries: [firstAt.get(p.use), i] });
      }

      const task = tasks.get(p.use);
      if (!task) {
        if (!has(doc.tasks, p.use)) bad('TASK_UNDECLARED', `uses task "${p.use}", which the task catalog does not declare.`, { task: p.use });
      } else {
        const bound = isObj(p.with) ? Object.keys(p.with) : [];
        for (const k of task.params) {
          if (!bound.includes(k)) bad('PARAM_UNBOUND', `does not bind param "${k}", which task "${p.use}" declares.`, { task: p.use, param: k });
        }
        for (const k of bound) {
          if (!task.params.includes(k)) bad('PARAM_UNDECLARED', `binds "${k}", which task "${p.use}" does not declare as a param.`, { task: p.use, param: k });
        }
        if (task.outcomes) {
          for (const o of task.outcomes) {
            if (!has(p.on, o)) bad('ON_OUTCOME_UNCOVERED', `the on map does not cover exit outcome "${o}" of task "${p.use}".`, { task: p.use, outcome: o });
          }
          for (const o of Object.keys(p.on)) {
            if (!task.outcomes.includes(o)) bad('ON_OUTCOME_UNDECLARED', `the on map names "${o}", which task "${p.use}" does not declare as an exit outcome.`, { task: p.use, outcome: o });
          }
        }
        if (isTerminal && task.executor !== null && task.executor !== 'script') {
          err('TERMINAL_TASK_NOT_SCRIPT', `Terminal "${n.id}" entry ${i} uses task "${p.use}", which is a ${task.executor} task; terminal pipelines run script tasks only.`, { node: n.id, entry: { index: i, task: p.use }, task: p.use });
        }
      }

      for (const [outcome, action] of Object.entries(p.on)) {
        const ctx = { task: p.use, outcome, action };
        const legal = `next, escalate, ${isTerminal ? 'done, ' : ''}goto:<earlier task>${isTerminal ? '' : `, or a declared node outcome (${declared.join(', ') || 'none'})`}`;
        if (typeof action !== 'string' || action === '') {
          bad('ACTION_INVALID', `maps "${outcome}" to ${JSON.stringify(action)}; an action is one of ${legal}.`, ctx);
        } else if (action === 'next') {
          if (i === pipe.length - 1) bad('ACTION_NEXT_ON_LAST', `maps "${outcome}" to next on the last entry of the pipeline; there is no later entry.`, ctx);
        } else if (action === 'escalate') {
          // handed to the orchestrator's in-place fallback chain
        } else if (action === 'done') {
          if (!isTerminal) bad('ACTION_INVALID', `maps "${outcome}" to done, which closes a terminal pipeline and is illegal elsewhere.`, ctx);
        } else if (action.startsWith('goto:')) {
          const target = action.slice(5);
          const j = firstAt.get(target);
          if (j === undefined || j >= i) {
            bad('GOTO_NOT_BACKWARD', `maps "${outcome}" to ${action}, but ${j === undefined ? `"${target}" is not an entry of this pipeline` : `entry ${j} (${target}) is ${j === i ? 'this entry itself' : 'later in the pipeline'}`}; goto may only return to an earlier entry.`, { ...ctx, target: { index: j ?? null, task: target } });
          } else gotos.push({ node: n.id, index: i, task: p.use });
        } else if (isTerminal) {
          bad('ACTION_INVALID', `maps "${outcome}" to the node outcome "${action}"; terminal pipelines surface no outcomes (use done or escalate).`, ctx);
        } else if (!declared.includes(action)) {
          bad('ACTION_INVALID', `maps "${outcome}" to "${action}", which is not an action or a declared node outcome (${declared.join(', ') || 'none'}).`, ctx);
        } else produced.add(action);
      }
    });

    if (!isTerminal) {
      for (const o of declared) {
        if (isStr(o) && !reservedOutcome(o) && !produced.has(o)) {
          err('OUTCOME_UNPRODUCED', `Node "${n.id}" declares outcome "${o}" but no pipeline action surfaces it.`, { node: n.id, outcome: o });
        }
      }
    }
  };

  for (const n of nodes) {
    const w = (f) => `Node "${n.id}" ${f}`;
    if (n.kind === 'entry') {
      for (const f of ['pipeline', 'outcomes', 're_entry', 'terminal_kind']) {
        if (has(n, f)) err('ENTRY_DECLARES_FORBIDDEN', `${w(`declares ${f}`)}, which the entry node must not.`, { node: n.id, field: f });
      }
      continue;
    }
    if (n.kind === 'terminal') {
      for (const f of ['outcomes', 're_entry']) {
        if (has(n, f)) err('TERMINAL_DECLARES_FORBIDDEN', `${w(`declares ${f}`)}, which terminals must not.`, { node: n.id, field: f });
      }
      if (!isArr(n.pipeline)) {
        err('TERMINAL_PIPELINE_MISSING', `Terminal "${n.id}" must declare its pipeline as an array (possibly empty).`, { node: n.id, field: 'pipeline' });
        continue;
      }
      checkPipeline(n);
      continue;
    }
    if (n.kind !== 'work') continue;

    if (has(n, 'terminal_kind')) err('NODE_FIELD_INVALID', `${w('declares terminal_kind')}, which applies to terminals only.`, { node: n.id, field: 'terminal_kind' });
    if (!has(n, 'outcomes')) err('NODE_FIELD_MISSING', `${w('does not declare')} "outcomes".`, { node: n.id, field: 'outcomes' });
    else if (!isArr(n.outcomes) || n.outcomes.length === 0 || n.outcomes.some((o) => !isStr(o))) {
      err('NODE_FIELD_INVALID', `${w('outcomes')} must be a non-empty array of strings.`, { node: n.id, field: 'outcomes' });
    } else {
      if (new Set(n.outcomes).size !== n.outcomes.length) err('NODE_FIELD_INVALID', `${w('outcomes')} contains duplicates.`, { node: n.id, field: 'outcomes' });
      for (const o of n.outcomes) {
        if (reservedOutcome(o)) {
          err('OUTCOME_INVALID', `${w('outcomes')} lists "${o}"; next, escalate, done, goto:*, blocked, advisor, and escalation words are never routable outcomes.`, { node: n.id, outcome: o });
        }
      }
    }
    if (!has(n, 'pipeline')) err('NODE_FIELD_MISSING', `${w('does not declare')} "pipeline".`, { node: n.id, field: 'pipeline' });
    else if (!isArr(n.pipeline) || n.pipeline.length === 0) err('NODE_FIELD_INVALID', `${w('pipeline')} must be a non-empty array of {use, with?, on} entries.`, { node: n.id, field: 'pipeline' });
    else checkPipeline(n);
  }

  // ---- phase: the type, the approval task, the close-out task -------------------
  const phaseRes = resolveField(registry, 'phase');
  const phaseValues = phaseRes.ok && isArr(phaseRes.entry.values) ? phaseRes.entry.values.slice() : [];
  const phaseOk = phaseValues.length > 0;
  if (!phaseRes.ok) {
    // A task referencing the field already reported the resolution error naming itself.
    if (!errors.some((e) => e.field === 'phase' && String(e.code).startsWith('TYPE_'))) {
      err(phaseRes.code, `The phase type: ${phaseRes.message}`, { field: 'phase' });
    }
  } else {
    for (const e of checkPhaseEntry(phaseRes.entry)) errors.push({ ...e, invariant: INVARIANTS[e.code] });
  }

  const producers = [...tasks.values()].filter((t) => t.produces.includes('phase'));
  let approvalTask = null;
  if (producers.length !== 1) {
    err('PHASE_APPROVAL_INVALID', `Exactly one task must produce state:phase (the phase-approval human task), found ${producers.length}.`, { tasks: producers.map((t) => t.id) });
  } else {
    approvalTask = producers[0].id;
    if (producers[0].executor !== 'human') {
      err('PHASE_APPROVAL_INVALID', `Task "${approvalTask}" produces state:phase but is a ${producers[0].executor} task; the phase is fixed by a human task.`, { task: approvalTask });
    }
  }

  const closeOutTasks = [...tasks.values()].filter((t) => t.skills.some((s) => CLOSE_OUT_SKILLS.has(s)));
  if (closeOutTasks.length !== 1) {
    err('CLOSE_OUT_COUNT', `Exactly one task must mount the close-out skill (${[...CLOSE_OUT_SKILLS].join(' or ')}), found ${closeOutTasks.length}.`, { tasks: closeOutTasks.map((t) => t.id) });
  }
  const closeOutTask = closeOutTasks.length === 1 ? closeOutTasks[0].id : null;
  let closeOut = null;
  if (closeOutTask) {
    const holders = refs.get(closeOutTask) ?? [];
    if (holders.length !== 1) {
      err('CLOSE_OUT_NODE_COUNT', `Exactly one node must reference the close-out task "${closeOutTask}", found ${holders.length}.`, { task: closeOutTask, nodes: holders });
    } else closeOut = holders[0];
  }

  // ---- edges ------------------------------------------------------------------
  const edges = []; // structurally valid edges (with index)
  doc.edges.forEach((e, i) => {
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
    if (from.kind === 'terminal') return err('EDGE_FROM_TERMINAL', `Terminal "${from.id}" has an outgoing edge to "${e.to}".`, ctx);
    if (to.kind === 'entry') return err('EDGE_TO_ENTRY', `Edge ${edgeLabel(e)} targets the entry node.`, ctx);
    edges.push({ ...e, index: i });
  });

  const edgesFrom = new Map();
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!edgesFrom.has(e.from)) edgesFrom.set(e.from, []);
    edgesFrom.get(e.from).push(e);
    adj.get(e.from).push(e.to);
  }

  // ---- field applicability (D8): a field is applicable where a producing node can reach ----
  const reach = new Map(nodes.map((n) => [n.id, reachSet(adj, n.id)]));
  const applicableCache = new Map();
  const applicableAt = (field, nodeId) => {
    if (!applicableCache.has(field)) {
      const holders = nodes.filter((n) => (pipelines.get(n.id) ?? []).some((p) => tasks.get(p.use)?.produces.includes(field)));
      applicableCache.set(field, new Set(holders.flatMap((m) => [...reach.get(m.id)])));
    }
    return applicableCache.get(field).has(nodeId);
  };

  // ---- re-entry rules ---------------------------------------------------------------
  for (const n of work) {
    if (!has(n, 're_entry')) continue;
    const r = n.re_entry;
    const bad = (msg) => err('REENTRY_INVALID', `Re-entry rule of node "${n.id}": ${msg}`, { node: n.id });
    const keys = ['list_field', 'order', 'progress_field', 'items_field'];
    if (!isObj(r) || !keys.every((k) => isStr(r[k]))) {
      bad('must be {list_field, order, progress_field, items_field}, all non-empty strings.');
      continue;
    }
    for (const k of Object.keys(r)) {
      if (!keys.includes(k)) bad(`declares unknown key "${k}"; allowed: ${keys.join(', ')}.`);
    }
    for (const k of ['list_field', 'progress_field', 'items_field']) {
      const f = resolveField(registry, r[k]);
      if (!f.ok) bad(`${k} "${r[k]}" does not resolve: ${f.message}`);
      else if (!applicableAt(r[k], n.id)) bad(`${k} "${r[k]}" is not applicable at this node (no node producing it reaches this node).`);
      else if (k === 'list_field' && f.entry.type !== 'list') bad(`list_field "${r.list_field}" must be a list field.`);
      else if (k === 'items_field' && !(f.entry.type === 'list' && isObj(f.entry.items) && f.entry.items.type === 'object' && isObj(f.entry.items.fields) && has(f.entry.items.fields, 'id'))) {
        bad(`items_field "${r.items_field}" must be a list of objects carrying an "id" field.`);
      }
    }
  }

  // ---- guards: structure and field resolution ----------------------------------------
  const fieldInfo = (name) => {
    const r = resolveField(registry, name);
    if (!r.ok) return { error: r };
    if (name === 'phase') return { kind: 'enum', domain: phaseValues.slice(), nullable: false };
    return guardInfo(r.entry);
  };

  const checkGuard = (e) => {
    const ctx = { edge: edgeCtx(e) };
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
      const info = fieldInfo(c.field);
      if (info.error) return bad('GUARD_UNDECIDABLE', `condition ${ci} references field "${c.field}": ${info.error.message}`);
      if (!applicableAt(c.field, e.from)) {
        return bad('GUARD_FIELD_INAPPLICABLE', `field "${c.field}" is not applicable at source node "${e.from}" (no node whose pipeline produces it reaches that node).`);
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

  // Enumerate every atom combination over the fields the group mentions (plus `extra`).
  // Returns {combos: [{state, matches: [edge...]}]} or {tooComplex: true}.
  const enumerate = (group, { phaseDomain = phaseValues, extra = [] } = {}) => {
    const all = group.flatMap((e) => e.guard);
    const names = uniq([...all.map((c) => c.field), ...extra]);
    const lists = names.map((nm) => {
      const info = fieldInfo(nm);
      if (nm === 'phase') info.domain = phaseDomain;
      return atomsFor(info, consts(all, nm));
    });
    const total = lists.reduce((p, l) => p * l.length, 1);
    if (total > MAX_COMBINATIONS) return { tooComplex: true, total };
    const combos = [];
    const state = {};
    const rec = (i) => {
      if (i === names.length) {
        combos.push({ state: { ...state }, matches: group.filter((e) => e.guard.every((c) => evalCond(c, state[c.field]))) });
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

  const decidable = new Set(); // edge indexes with valid guards
  for (const e of edges) {
    const from = byId.get(e.from);
    if (from.kind === 'entry') {
      if (has(e, 'outcome')) err('ENTRY_ROUTE_INVALID', `Entry edge to "${e.to}" must not name an outcome.`, { edge: edgeCtx(e) });
      if (e.guard.length) err('ENTRY_ROUTE_INVALID', `Entry edge to "${e.to}" must be unconditional (empty guard).`, { edge: edgeCtx(e) });
      continue;
    }
    if (!has(e, 'outcome')) err('EDGE_OUTCOME_MISSING', `Edge ${e.from} -> ${e.to} names no outcome.`, { edge: edgeCtx(e) });
    else if (!isArr(from.outcomes) || !from.outcomes.includes(e.outcome)) {
      err('EDGE_OUTCOME_UNDECLARED', `Edge ${edgeLabel(e)} references outcome "${e.outcome}", which node "${e.from}" does not declare.`, { edge: edgeCtx(e), node: e.from, outcome: e.outcome });
    }
    if (checkGuard(e)) decidable.add(e.index);
  }

  // ---- entry route and the shared first node ----------------------------------------
  let sharedFirst = null;
  if (entry) {
    const outs = edgesFrom.get(entry.id) ?? [];
    if (outs.length !== 1) {
      err('ENTRY_ROUTE_INVALID', `The entry node "${entry.id}" must have exactly one outgoing edge, found ${outs.length}.`, { node: entry.id });
    } else if (byId.get(outs[0].to).kind !== 'work') {
      err('ENTRY_ROUTE_INVALID', `The entry edge must target a work node, but "${outs[0].to}" is a ${byId.get(outs[0].to).kind} node.`, { node: entry.id, edge: edgeCtx(outs[0]) });
    } else sharedFirst = outs[0].to;
  }
  if (sharedFirst && approvalTask && !(pipelines.get(sharedFirst) ?? []).some((p) => p.use === approvalTask)) {
    err('FIRST_NODE_NO_APPROVAL', `The shared first node "${sharedFirst}" must reference the phase-approval task "${approvalTask}" in its pipeline.`, { node: sharedFirst, task: approvalTask });
  }

  // ---- phase-restricted routes (D8) --------------------------------------------------
  // The phase values for which an edge's guard is satisfiable (other fields unconstrained).
  // An edge with an invalid guard is not traversable; too-complex guards over-approximate.
  const firing = new Map();
  const firesFor = (e) => {
    if (!firing.has(e.index)) {
      let set;
      if (entry && e.from === entry.id) set = new Set(phaseValues);
      else if (!decidable.has(e.index)) set = new Set();
      else if (e.guard.length === 0) set = new Set(phaseValues);
      else {
        const en = enumerate([e], { extra: ['phase'] });
        set = en.tooComplex ? new Set(phaseValues) : new Set(en.combos.filter((c) => c.matches.length > 0).map((c) => c.state.phase));
      }
      firing.set(e.index, set);
    }
    return firing.get(e.index);
  };

  const routes = new Map(); // phase value -> nodes its restricted route reaches from the entry
  if (entry && phaseOk) {
    for (const p of phaseValues) {
      const seen = new Set([entry.id]);
      const q = [entry.id];
      while (q.length) {
        const v = q.shift();
        for (const e of edgesFrom.get(v) ?? []) {
          if (firesFor(e).has(p) && !seen.has(e.to)) {
            seen.add(e.to);
            q.push(e.to);
          }
        }
      }
      routes.set(p, seen);
    }
  }
  // At a node, only the phase values whose route reaches it count (all values if none does).
  const phaseDomainAt = (nodeId) => {
    const dom = phaseValues.filter((p) => routes.get(p)?.has(nodeId));
    return dom.length ? dom : phaseValues;
  };

  // ---- per-node edge coverage and guard algebra ---------------------------------------
  for (const n of work) {
    if (!isArr(n.outcomes)) continue;
    const outs = edgesFrom.get(n.id) ?? [];
    for (const o of n.outcomes) {
      if (!isStr(o) || reservedOutcome(o)) continue;
      const group = outs.filter((e) => e.outcome === o);
      if (group.length === 0) {
        err('OUTCOME_UNCOVERED', `Node "${n.id}" can surface outcome "${o}" but no outgoing edge covers it.`, { node: n.id, outcome: o });
        continue;
      }
      if (!group.every((e) => decidable.has(e.index))) continue; // guard errors already reported
      const en = enumerate(group, { phaseDomain: phaseDomainAt(n.id) });
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

  // ---- loops: exits, caps, returning edges ---------------------------------------------
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

  const sccOf = new Map();
  sccs.forEach((c, i) => c.forEach((v) => sccOf.set(v, i)));
  const exitless = new Set();
  const loopSccs = sccs.filter((c) => c.length > 1 || adj.get(c[0]).includes(c[0]));
  for (const comp of loopSccs) {
    const set = new Set(comp);
    const cycle = comp.slice().sort();
    if (!edges.some((e) => set.has(e.from) && !set.has(e.to))) {
      cycle.forEach((c) => exitless.add(c));
      err('LOOP_NO_EXIT', `Loop over nodes [${cycle.join(', ')}] has no edge leaving it.`, { cycle });
    }
  }
  // Every edge lying on a cycle (its target reaches its source) is a returning edge.
  for (const e of edges) {
    if (sccOf.get(e.from) === sccOf.get(e.to)) returningEdges.push(edgeCtx(e));
  }
  returningEdges.sort((x, y) => x.index - y.index);
  if (!edgeRevisitOk) {
    for (const r of returningEdges) {
      const cycle = sccs[sccOf.get(r.from)].slice().sort();
      err('LOOP_NO_CAP', `Edge ${r.from} -[${r.outcome}]-> ${r.to} lies on a cycle but no valid edge_revisit cap is declared.`, { edge: r, cycle });
    }
  }
  if (!failureOk) {
    for (const g of gotos) {
      err('LOOP_NO_CAP', `Node "${g.node}" entry ${g.index} (${g.task}) uses goto, but no valid failure cap is declared.`, { node: g.node, entry: { index: g.index, task: g.task } });
    }
  }

  // ---- reachability, stranded phases, close-out dominance -------------------------------
  if (entry) {
    const seen = reachSet(adj, entry.id);
    for (const n of nodes) {
      if (!seen.has(n.id) && !(abandon && n.id === abandon.id)) {
        err('NODE_UNREACHABLE', `Node "${n.id}" is not edge-reachable from the entry node.`, { node: n.id });
      }
    }
  }
  if (success) {
    const radj = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) radj.get(e.to).push(e.from);
    const can = reachSet(radj, success.id);
    for (const n of work) {
      if (!can.has(n.id) && !exitless.has(n.id)) {
        err('NODE_NO_PATH_TO_SUCCESS', `The success terminal is not reachable from node "${n.id}".`, { node: n.id });
      }
    }
  }
  if (entry && success && phaseOk) {
    for (const p of phaseValues) {
      const radj = new Map(nodes.map((n) => [n.id, []]));
      for (const e of edges) if (firesFor(e).has(p)) radj.get(e.to).push(e.from);
      const can = reachSet(radj, success.id);
      for (const nid of routes.get(p)) {
        if (byId.get(nid).kind !== 'terminal' && !can.has(nid)) {
          err('PHASE_ROUTE_MISSING', `Phase "${p}": the success terminal "${success.id}" is not reachable from node "${nid}" over edges whose guards can hold for that phase.`, { phase: p, node: nid });
        }
      }
    }
  }
  if (entry && success && closeOut && byId.has(closeOut) && reachSet(adj, entry.id, closeOut).has(success.id)) {
    err('CLOSE_OUT_NOT_DOMINATING', `The success terminal "${success.id}" is reachable from the entry node without passing through the close-out node "${closeOut}".`, { node: closeOut, terminal: success.id });
  }

  // ---- unreferenced tasks, tool-gate commands, summary ----------------------------------
  for (const id of tasks.keys()) {
    if (!refs.has(id)) warnings.push({ code: 'TASK_UNREFERENCED', message: `Task "${id}" is in the catalog but no pipeline uses it.`, task: id });
  }
  for (const info of tasks.values()) {
    for (const g of info.gate) gateCommands.push({ task: info.id, nodes: refs.get(info.id) ?? [], source: g.source, command: g.command });
  }

  Object.assign(summary, {
    nodes: nodes.length,
    edges: doc.edges.length,
    tasks: tasks.size,
    phases: phaseValues,
    entry: entry?.id ?? null,
    first_node: sharedFirst,
    phase_approval_task: approvalTask,
    close_out_task: closeOutTask,
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

// commands: [{task, nodes, source, command}]. Returns {status, probes, errors}.
export function toolGate(commands, env = process.env) {
  const users = new Map(); // program -> [{task, nodes, source, command}]
  for (const c of commands) {
    for (const prog of programsOf(c.command)) {
      if (!users.has(prog)) users.set(prog, []);
      users.get(prog).push(c);
    }
  }
  const probes = [];
  const errors = [];
  for (const [program, used] of users) {
    const usedBy = used.map((u) => ({ task: u.task, nodes: u.nodes, source: u.source, command: u.command }));
    const tasksNamed = uniq(used.map((u) => u.task).filter(Boolean));
    const nodesNamed = uniq(used.flatMap((u) => u.nodes));
    const who = `used by ${tasksNamed.length ? `task(s) ${tasksNamed.join(', ')}` : 'no task'}${nodesNamed.length ? ` in node(s) ${nodesNamed.join(', ')}` : ''}`;
    const r = resolveProgram(program, env);
    const probe = { program, resolved: r.path, via: null, status: 'ok', used_by: usedBy };
    if (!r.exists || !r.executable) {
      probe.status = r.exists ? 'not-startable' : 'missing';
      const code = r.exists ? 'TOOL_NOT_STARTABLE' : 'TOOL_MISSING';
      errors.push({
        code, invariant: INVARIANTS[code], tool: program, tasks: tasksNamed, nodes: nodesNamed,
        message: r.exists
          ? `Tool "${program}" exists at ${r.path} but is not executable (${who}).`
          : `Tool "${program}" was not found${r.direct ? ` at ${r.path}` : ' on PATH'} (${who}).`,
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
          code: 'TOOL_NOT_STARTABLE', invariant: INVARIANTS.TOOL_NOT_STARTABLE, tool: program, tasks: tasksNamed, nodes: nodesNamed,
          message: `Tool "${program}" resolved to ${r.path} but neither "--version" nor "--help" exited 0 (${who}).`,
        });
      }
    }
    probes.push(probe);
  }
  return { status: errors.length ? 'failed' : 'passed', probes, errors };
}

// ---------------------------------------------------------------------------
// Assemble: flatten an assembly graph over the template library
// ---------------------------------------------------------------------------

const EXIT = { OK: 0, REJECTED: 1, USAGE: 2, INPUT: 3, TOOLS: 4, WRITE: 5, WORKTREE: 6, INTERNAL: 70 };

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { code: 'INPUT_UNREADABLE', message: `Cannot read ${file}: ${e.message}` };
  }
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    return { code: 'INPUT_INVALID_JSON', message: `${file} is not valid JSON: ${e.message}` };
  }
}

const withInvariant = (e) => ({ code: e.code, invariant: INVARIANTS[e.code] ?? e.code, ...e });

// Fill every `{{slot}}` of one JSON value: a declared slot takes its value (a string that is
// exactly one placeholder becomes the value, any JSON; an embedded placeholder is replaced
// textually), a name in `keep` (the enclosing task's params) stays in place, anything else
// is SLOT_UNDECLARED. The fill itself is the shared types.mjs `instantiate`. A declared slot
// without a value stays in place (the caller reports SLOT_UNFILLED once per slot).
function fillSlots(value, where, ctx) {
  const { keep, declared, given, report } = ctx;
  if (typeof value === 'string') {
    const names = uniq(findSlots(value, where).map((s) => s.slot));
    if (names.length === 0) return value;
    const map = {};
    for (const nm of names) {
      if (keep.has(nm)) map[nm] = `{{${nm}}}`;
      else if (declared.has(nm)) {
        if (has(given, nm)) map[nm] = given[nm];
      } else report('SLOT_UNDECLARED', `Placeholder {{${nm}}} at ${where} is neither a declared slot nor a param of its enclosing task.`, { slot: nm, path: where });
    }
    const filled = instantiate(value, map);
    for (const e of filled.errors) if (e.code !== 'SLOT_UNFILLED') report(e.code, e.message, { slot: e.slot, path: where });
    return filled.entry;
  }
  if (isArr(value)) return value.map((x, i) => fillSlots(x, `${where}[${i}]`, ctx));
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, fillSlots(x, where ? `${where}.${k}` : k, ctx)]));
  return value;
}

// assembly: the parsed assembly graph; slots: the parsed {slot: value} object. Returns
// {ok: true, file, types: {file, written}, summary, warnings} or {ok: false, exit, errors,
// warnings}; on rejection nothing has been written.
export function assemble({
  assembly, slots, library = DEFAULT_LIBRARY, out = DEFAULT_OUT, typesPath = PROJECT_CATALOG, pluginPath = PLUGIN_CATALOG,
} = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, message, ctx = {}) => errors.push({ code, invariant: INVARIANTS[code] ?? code, message, ...ctx });
  const reject = (exit = EXIT.REJECTED) => ({ ok: false, exit, errors, warnings });

  // ---- the assembly graph itself ----------------------------------------------------
  if (!isObj(assembly)) {
    err('ASSEMBLY_INVALID', 'The assembly graph must be a single JSON object.');
    return reject();
  }
  for (const k of Object.keys(assembly)) {
    if (!ASSEMBLY_KEYS.includes(k)) err('ASSEMBLY_INVALID', `Unknown assembly key "${k}"; an assembly graph holds exactly ${ASSEMBLY_KEYS.join(', ')}.`, { path: k });
  }
  for (const k of ['schema_version', 'name', 'slots', 'caps', 'nodes', 'edges']) {
    if (!has(assembly, k)) err('ASSEMBLY_INVALID', `The assembly graph is missing "${k}".`, { path: k });
  }
  for (const [k, ok] of [
    ['schema_version', isStr(assembly.schema_version)], ['name', isStr(assembly.name)], ['caps', isObj(assembly.caps)],
    ['nodes', isArr(assembly.nodes)], ['edges', isArr(assembly.edges)], ['tasks', !has(assembly, 'tasks') || isObj(assembly.tasks)],
  ]) {
    if (has(assembly, k) && !ok) err('ASSEMBLY_INVALID', `"${k}" of the assembly graph has the wrong shape.`, { path: k });
  }
  if (has(assembly, 'slots')) {
    if (!isObj(assembly.slots)) err('ASSEMBLY_INVALID', '"slots" must be an object {name: description}.', { path: 'slots' });
    else {
      for (const [k, d] of Object.entries(assembly.slots)) {
        if (!/^[A-Za-z0-9_.-]+$/.test(k) || !isStr(d)) err('ASSEMBLY_INVALID', `Slot "${k}" must have a plain name and a description string.`, { slot: k });
      }
    }
  }
  if (errors.length) return reject();

  // ---- 1. nodes: library ids and inline objects ----------------------------------------
  const nodes = [];
  assembly.nodes.forEach((ref, i) => {
    if (isObj(ref)) return nodes.push(clone(ref));
    if (!isStr(ref)) return err('ASSEMBLY_INVALID', `nodes[${i}] must be a node id string or an inline node object.`, { path: `nodes[${i}]` });
    const file = path.join(library, 'nodes', `${ref}.json`);
    const unresolved = (why) => err('ASSEMBLY_NODE_UNRESOLVED', `Node "${ref}" does not resolve: ${why}`, { node: ref, file });
    if (!KEBAB_RE.test(ref)) return unresolved('a node reference must be a kebab-case id.');
    const r = readJson(file);
    if (r.code) return unresolved(r.message);
    if (!isObj(r.value) || r.value.id !== ref) return unresolved(`${file} must hold a node object whose id is "${ref}".`);
    nodes.push(r.value);
  });

  // ---- 2. tasks: the assembly's own first, then the library; only referenced ones inlined ---
  const own = isObj(assembly.tasks) ? assembly.tasks : {};
  const catalog = {};
  const unresolved = new Map(); // task id -> {why, file, nodes}: reported once, naming every user
  for (const n of nodes) {
    for (const p of arr(n.pipeline)) {
      if (!isObj(p) || !isStr(p.use) || has(catalog, p.use)) continue;
      if (unresolved.has(p.use)) {
        unresolved.get(p.use).nodes.push(n.id);
        continue;
      }
      if (has(own, p.use)) {
        catalog[p.use] = clone(own[p.use]);
        continue;
      }
      const file = path.join(library, 'tasks', `${p.use}.json`);
      const miss = (why) => unresolved.set(p.use, { why, file, nodes: [n.id] });
      if (!KEBAB_RE.test(p.use)) {
        miss('a task reference must be a kebab-case id.');
        continue;
      }
      const r = readJson(file);
      if (r.code) miss(r.message);
      else if (!isObj(r.value)) miss(`${file} must hold a TaskDef object.`);
      else catalog[p.use] = r.value;
    }
  }
  for (const [id, u] of unresolved) {
    err('ASSEMBLY_TASK_UNRESOLVED', `Task "${id}" (used by node ${u.nodes.map((x) => `"${x}"`).join(', ')}) does not resolve: ${u.why}`, { task: id, node: u.nodes[0], nodes: u.nodes, file: u.file });
  }
  for (const id of Object.keys(own)) {
    if (!has(catalog, id)) warnings.push({ code: 'ASSEMBLY_TASK_UNUSED', message: `The assembly task "${id}" is not referenced by any node pipeline and is not inlined.`, task: id });
  }

  // ---- 3. slots ---------------------------------------------------------------------
  const given = isObj(slots) ? slots : {};
  const declared = Object.keys(assembly.slots);
  for (const k of declared) {
    if (!has(given, k)) err('SLOT_UNFILLED', `Declared slot {{${k}}} has no value in the slots file.`, { slot: k });
  }
  for (const k of Object.keys(given)) {
    if (!declared.includes(k)) err('SLOT_UNDECLARED', `The slots file gives a value for "${k}", which the assembly graph does not declare.`, { slot: k });
  }
  const fill = { declared: new Set(declared), given, report: (code, message, ctx) => err(code, message, ctx) };
  const ordered = { schema_version: assembly.schema_version };
  for (const k of ['name', 'caps']) ordered[k] = fillSlots(clone(assembly[k]), k, { ...fill, keep: new Set() });
  ordered.tasks = {};
  for (const [id, t] of Object.entries(catalog)) {
    const keep = new Set(isObj(t) && isObj(t.params) ? Object.keys(t.params) : []);
    ordered.tasks[id] = fillSlots(clone(t), `tasks.${id}`, { ...fill, keep });
  }
  for (const k of ['nodes', 'edges']) ordered[k] = fillSlots(clone(k === 'nodes' ? nodes : assembly.edges), k, { ...fill, keep: new Set() });
  if (errors.length) return reject();

  // ---- 4. types: instantiate parameterized plugin entries whose slots are all declared ------
  const plugin = loadCatalog(pluginPath, { required: true });
  const project = loadCatalog(typesPath, { required: false });
  const loadErrors = [...plugin.errors, ...project.errors];
  if (loadErrors.length) {
    errors.push(...loadErrors.map(withInvariant));
    return reject(EXIT.INPUT);
  }
  const instantiated = {};
  const typeErrors = [];
  for (const [name, entry] of Object.entries(plugin.catalog)) {
    const needs = uniq(findSlots(entry).map((s) => s.slot));
    if (needs.length === 0 || !needs.every((s) => declared.includes(s))) continue;
    const r = instantiate(entry, given);
    typeErrors.push(...r.errors.map((e) => ({ ...e, field: name })));
    instantiated[name] = r.entry;
  }
  const merged = mergeCatalogs(plugin.catalog, { ...project.catalog, ...instantiated }, { pluginSource: pluginPath, projectSource: typesPath });

  // ---- 5. the flattened definition, validated in memory ----------------------------------
  const res = validateDefinition(ordered, { registry: merged.registry, catalogErrors: [...typeErrors, ...merged.errors] });
  warnings.push(...res.warnings);
  if (res.errors.length) {
    errors.push(...res.errors);
    return reject();
  }

  // ---- 6. write: graph temp file, then the types, then the rename that commits the graph ---
  const dir = path.dirname(out);
  const tmp = path.join(dir, `.${path.basename(out)}.${process.pid}-${Date.now()}.tmp`);
  const dropTmp = () => {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup of the temp file
    }
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(ordered, null, 2)}\n`);
  } catch (e) {
    dropTmp();
    err('WRITE_FAILED', `Cannot write ${out}: ${e.message}`, { file: out });
    return reject(EXIT.WRITE);
  }
  const pending = Object.fromEntries(Object.entries(instantiated).filter(([name, entry]) => !deq(project.catalog[name], entry)));
  let written = [];
  if (Object.keys(pending).length) {
    const w = writeProjectEntries({ entries: pending, projectPath: typesPath, pluginPath });
    if (w.errors) {
      dropTmp();
      errors.push(...w.errors.map(withInvariant));
      return reject(w.errors.some((e) => e.code === 'WRITE_FAILED') ? EXIT.WRITE : EXIT.REJECTED);
    }
    written = w.written;
  }
  try {
    fs.renameSync(tmp, out);
  } catch (e) {
    dropTmp();
    err('WRITE_FAILED', `Cannot write ${out}: ${e.message}`, { file: out });
    return reject(EXIT.WRITE);
  }
  return { ok: true, exit: EXIT.OK, file: out, types: { file: typesPath, written }, summary: res.summary, warnings };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const FLAGS = {
  validate: { '--config': 'config', '--types': 'types', '--plugin-types': 'pluginTypes' },
  assemble: { '--slots': 'slots', '--out': 'out', '--library': 'library', '--types': 'types', '--plugin-types': 'pluginTypes' },
};

const HELP = {
  ok: true,
  command: 'help',
  usage: [
    'node scripts/graph.mjs validate <graph.json> [--no-probe] [--config <config.json>] [--types <project types.json>] [--plugin-types <plugin types.json>]',
    'node scripts/graph.mjs <graph.json> [...]   (validate is the default subcommand)',
    'node scripts/graph.mjs assemble <assembly.json> --slots <values.json> [--out <path>] [--library <dir>] [--types <path>] [--plugin-types <path>]',
  ],
  flags: {
    '--no-probe': 'validate: structure-only validation; skip the tool-availability gate',
    '--config <path>': 'validate: also probe the commands of the config worktree_setup.setup list',
    '--types <path>': 'project type catalog (default .harness/types.json under the cwd)',
    '--plugin-types <path>': 'plugin type catalog (default skills/graph-init/templates/types.json in the plugin)',
    '--slots <path>': 'assemble: JSON object {slot: value}, one value per declared slot',
    '--out <path>': 'assemble: definition to write (default .harness/graph.json)',
    '--library <dir>': 'assemble: template library holding tasks/<id>.json and nodes/<id>.json (default skills/graph-init/templates in the plugin)',
  },
  exit_codes: {
    0: 'ok: validate accepted, or assemble wrote',
    1: 'rejected: structural or composition violations (assemble writes nothing)',
    2: 'usage error',
    3: 'input error (unreadable file, invalid JSON, invalid config, unreadable catalog)',
    4: 'validate: rejected by the tool gate (missing or not-startable tool)',
    5: 'assemble: write failed',
    6: 'assemble: refused inside a linked worktree (writers run only in the main checkout)',
    70: 'internal error',
  },
};

function emit(obj, code) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exitCode = code;
}

function failMany(command, errors, exit, extra = {}) {
  emit({ ok: false, command, ...(command === 'validate' ? { accepted: false } : {}), errors: errors.map(withInvariant), ...extra }, exit);
}

function fail(command, code, message, exit, extra = {}) {
  failMany(command, [{ code, message }], exit, extra);
}

function runValidate(file, opts) {
  const read = readJson(file);
  if (read.code) return fail('validate', read.code, read.message, EXIT.INPUT, { file });
  const def = read.value;

  const setupCommands = [];
  if (opts.config) {
    try {
      const cfg = JSON.parse(fs.readFileSync(opts.config, 'utf8'));
      const setup = cfg?.worktree_setup?.setup;
      if (!isObj(cfg) || !isArr(setup) || setup.some((s) => !isStr(s))) {
        return fail('validate', 'CONFIG_INVALID', `${opts.config} must hold worktree_setup.setup as an array of command strings.`, EXIT.INPUT, { file });
      }
      setup.forEach((c) => setupCommands.push({ task: null, nodes: ['config:worktree_setup'], source: 'setup', command: c }));
    } catch (e) {
      return fail('validate', 'CONFIG_INVALID', `Cannot read config ${opts.config}: ${e.message}`, EXIT.INPUT, { file });
    }
  }

  const loaded = loadRegistry({ pluginPath: opts.pluginTypes, projectPath: opts.types });
  const loadErrors = loaded.errors.filter((e) => LOAD_CODES.has(e.code));
  if (loadErrors.length) return failMany('validate', loadErrors, EXIT.INPUT, { file });
  const catalogErrors = loaded.errors;

  const res = validateDefinition(def, { registry: loaded.registry, catalogErrors });
  const base = { command: 'validate', file, summary: res.summary, returning_edges: res.returning_edges, warnings: res.warnings };
  if (res.errors.length) {
    return emit({ ok: false, ...base, accepted: false, errors: res.errors, tool_gate: { status: 'skipped', reason: 'structure-invalid' } }, EXIT.REJECTED);
  }
  if (opts.noProbe) {
    return emit({ ok: true, ...base, accepted: true, errors: [], tool_gate: { status: 'skipped', reason: '--no-probe' } }, EXIT.OK);
  }
  const gate = toolGate([...res.commands, ...setupCommands]);
  if (gate.errors.length) {
    return emit({ ok: false, ...base, accepted: false, errors: gate.errors, tool_gate: { status: gate.status, probes: gate.probes } }, EXIT.TOOLS);
  }
  return emit({ ok: true, ...base, accepted: true, errors: [], tool_gate: { status: gate.status, probes: gate.probes } }, EXIT.OK);
}

function runAssemble(file, opts) {
  if (!opts.slots) return fail('assemble', 'USAGE', '--slots <values.json> is required.', EXIT.USAGE);
  const targetDir = path.dirname(path.resolve(opts.out ?? DEFAULT_OUT));
  if (inLinkedWorktree(targetDir)) {
    return fail('assemble', 'IN_WORKTREE', 'Refusing to assemble from inside a linked worktree; run from the main checkout so .harness/ cannot diverge.', EXIT.WORKTREE);
  }
  const assemblyRead = readJson(file);
  if (assemblyRead.code) return fail('assemble', assemblyRead.code, assemblyRead.message, EXIT.INPUT, { file });
  const slotsRead = readJson(opts.slots);
  if (slotsRead.code) return fail('assemble', slotsRead.code, slotsRead.message, EXIT.INPUT, { file });
  if (!isObj(slotsRead.value)) {
    return fail('assemble', 'INPUT_INVALID_JSON', `${opts.slots} must hold one JSON object {slot: value}.`, EXIT.INPUT, { file });
  }
  const res = assemble({
    assembly: assemblyRead.value,
    slots: slotsRead.value,
    library: opts.library,
    out: opts.out,
    typesPath: opts.types,
    pluginPath: opts.pluginTypes,
  });
  if (!res.ok) return emit({ ok: false, command: 'assemble', errors: res.errors, warnings: res.warnings }, res.exit);
  return emit({ ok: true, command: 'assemble', file: res.file, types: res.types, summary: res.summary, warnings: res.warnings }, EXIT.OK);
}

export function main(argv) {
  const args = argv.slice();
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return emit(HELP, EXIT.OK);
  }
  let command = 'validate';
  if (args[0] === 'validate' || args[0] === 'assemble') command = args.shift();
  const spec = FLAGS[command];
  const opts = {};
  let file = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (command === 'validate' && a === '--no-probe') opts.noProbe = true;
    else if (has(spec, a)) {
      if (has(opts, spec[a])) return fail(command, 'USAGE', `${a} was given more than once.`, EXIT.USAGE);
      const value = args[++i];
      if (value === undefined || value.startsWith('--')) return fail(command, 'USAGE', `${a} needs a path.`, EXIT.USAGE);
      opts[spec[a]] = value;
    } else if (a.startsWith('-')) return fail(command, 'USAGE', `Unknown flag ${a}.`, EXIT.USAGE);
    else if (file === null) file = a;
    else return fail(command, 'USAGE', `Unexpected argument ${a}.`, EXIT.USAGE);
  }
  if (file === null) return fail(command, 'USAGE', command === 'assemble' ? 'An assembly graph path is required.' : 'A definition path is required.', EXIT.USAGE);
  return command === 'assemble' ? runAssemble(file, opts) : runValidate(file, opts);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    emit({ ok: false, command: process.argv[2] === 'assemble' ? 'assemble' : 'validate', errors: [{ code: 'INTERNAL', invariant: 'internal error', message: String(e?.stack ?? e) }] }, EXIT.INTERNAL);
  }
}
