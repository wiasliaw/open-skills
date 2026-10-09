import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDefinition, assemble, toolGate, programsOf, tokenize } from './graph.mjs';
import { PLUGIN_CATALOG, mergeCatalogs, instantiate, loadRegistry } from './types.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'graph.mjs');
const FIXTURES = path.join(HERE, 'fixtures');

// ---------------------------------------------------------------------------
// Fixture: the golden flattened coding-factory (11 nodes, 20 edges, 19 tasks),
// generated once by `assemble` over the reference library and committed
// ---------------------------------------------------------------------------

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const GOLDEN = readJson(path.join(FIXTURES, 'coding-factory.graph.json'));
const SLOTS = readJson(path.join(FIXTURES, 'coding-factory.slots.json'));
const SHIPPED = readJson(PLUGIN_CATALOG);
const PHASE = instantiate(SHIPPED.phase, SLOTS).entry;

// Extra catalog fields the guard-algebra tests reach through producers added to the golden.
const EXTRA = {
  round: { type: 'integer', default: 0 },
  ratio: { type: 'number', default: 0 },
  verdict_kind: { type: 'string', values: ['minor', 'major'], default: 'minor' },
  label: { type: 'string', nullable: true, default: null },
  late_flag: { type: 'boolean', default: false },
  blob: { type: 'object', nullable: true, default: null },
  hooks: { type: 'list', default: [], items: { type: 'command' } },
  notes: { type: 'list', default: [], items: { type: 'string' } },
};
for (let i = 0; i < 12; i++) EXTRA[`f${i}`] = { type: 'integer', default: 0 };

const registryOf = (project = {}) => mergeCatalogs(SHIPPED, { phase: PHASE, ...project }).registry;
const REGISTRY = registryOf();
const EXTRA_REGISTRY = registryOf(EXTRA);

const node = (d, id) => d.nodes.find((n) => n.id === id);
const task = (d, id) => d.tasks[id];
const pipe = (d, id) => node(d, id).pipeline;
const edge = (d, from, to, outcome) => d.edges.find((e) => e.from === from && e.to === to && (outcome === undefined || e.outcome === outcome));
const dropEdges = (d, pred) => { d.edges = d.edges.filter((e) => !pred(e)); };

const run = (mutate, registry = REGISTRY) => {
  const d = clone(GOLDEN);
  mutate?.(d);
  return validateDefinition(d, { registry });
};
// Guard-algebra variant: extra catalog fields, produced by tasks whose nodes reach `review`.
const runX = (mutate) => run((d) => {
  task(d, 'implement-change').produces.push(...Object.keys(EXTRA).filter((k) => k !== 'late_flag').map((k) => `state:${k}`));
  task(d, 'deliver').produces.push('state:late_flag');
  mutate?.(d);
}, EXTRA_REGISTRY);
const codes = (mutate) => run(mutate).errors.map((e) => e.code);
const codesX = (mutate) => runX(mutate).errors.map((e) => e.code);
const find = (res, code) => res.errors.filter((e) => e.code === code);
function assertRejects(mutate, code, check, runner = run) {
  const res = runner(mutate);
  const hits = find(res, code);
  assert.ok(hits.length > 0, `expected ${code}, got ${JSON.stringify(res.errors.map((e) => e.code))}`);
  for (const h of hits) assert.ok(h.invariant && h.message, 'error names invariant and message');
  check?.(hits, res);
  return res;
}
const assertRejectsX = (mutate, code, check) => assertRejects(mutate, code, check, runX);

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

test('accepts the golden coding-factory with no errors and no warnings', () => {
  const res = run();
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(res.summary, {
    nodes: 11,
    edges: 20,
    tasks: 19,
    phases: ['feat', 'fix', 'chore', 'maintenance'],
    entry: 'trigger',
    first_node: 'research',
    phase_approval_task: 'approve-phase',
    close_out_task: 'close-out',
    close_out_node: 'wrap',
    success_terminal: 'ship',
    abandonment_terminal: 'end',
    caps: { failure: 2, advisor_consultations: 2, edge_revisit: 2, total_failure: 4 },
  });
});

test('the golden has the expected returning edges: every edge lying on a cycle', () => {
  const res = run();
  const labels = res.returning_edges.map((r) => `${r.index}:${r.from}>${r.to}[${r.outcome}]`);
  assert.deepEqual(labels, [
    '1:research>spec[phase-approved]',
    '2:research>ticket[phase-approved]',
    '6:spec>ticket[contract-produced]',
    '8:ticket>build[tickets-produced]',
    '9:ticket>spec[spec-contradiction]',
    '10:ticket>research[spec-contradiction]',
    '11:build>ticket[ticket-done]',
    '13:build>ticket[ticket-invalid]',
    '14:build-direct>review[ready-for-review]',
    '15:maintain>review[ready-for-review]',
    '17:review>build-direct[fail]',
    '18:review>maintain[fail]',
  ]);
  // not on any cycle: the entry edge, the exits, the forward spine
  assert.ok(!res.returning_edges.some((r) => ['trigger', 'wrap'].includes(r.from) || r.to === 'ship' || r.to === 'end'));
});

// ---------------------------------------------------------------------------
// Document level
// ---------------------------------------------------------------------------

test('rejects a non-object definition', () => {
  assert.equal(validateDefinition([], { registry: REGISTRY }).errors[0].code, 'DEF_NOT_OBJECT');
  assert.equal(validateDefinition(null).errors[0].code, 'DEF_NOT_OBJECT');
});

test('rejects missing sections and wrong section types', () => {
  for (const k of ['schema_version', 'name', 'caps', 'tasks', 'nodes', 'edges']) {
    assertRejects((d) => delete d[k], 'DEF_FIELD_MISSING', (h) => assert.equal(h[0].path, k));
  }
  assertRejects((d) => { d.tasks = []; }, 'DEF_FIELD_MISSING');
  assertRejects((d) => { d.nodes = {}; }, 'DEF_FIELD_MISSING');
  assertRejects((d) => { d.name = ''; }, 'DEF_FIELD_MISSING');
});

test('a 1.x definition is rejected with SCHEMA_VERSION_UNSUPPORTED and a re-assembly pointer', () => {
  const res = run((d) => { d.schema_version = '1.0.0'; d.phase = {}; d.state_fields = {}; });
  assert.deepEqual(res.errors.map((e) => e.code), ['SCHEMA_VERSION_UNSUPPORTED']);
  assert.match(res.errors[0].message, /1\.x/);
  assert.match(res.errors[0].message, /re-assembled through graph-init/);
  assertRejects((d) => { d.schema_version = '3.0.0'; }, 'SCHEMA_VERSION_UNSUPPORTED');
  assertRejects((d) => { d.schema_version = 2; }, 'SCHEMA_VERSION_UNSUPPORTED');
  assert.deepEqual(codes((d) => { d.schema_version = '2.7.1'; }), []);
});

test('a runtime definition holds exactly six sections: phase, state_fields, slots, and others are unknown', () => {
  for (const key of ['phase', 'state_fields', 'slots', 'skill_state_needs']) {
    assertRejects((d) => { d[key] = {}; }, 'DEF_FIELD_UNKNOWN', (h) => {
      assert.equal(h[0].path, key);
      assert.ok(h[0].message.includes(`"${key}"`));
      assert.match(h[0].message, /phase.*state_fields.*slots.*no longer exist/);
    });
  }
});

test('rejects missing or invalid caps', () => {
  assertRejects((d) => delete d.caps.failure, 'CAP_MISSING', (h) => assert.equal(h[0].cap, 'failure'));
  assertRejects((d) => delete d.caps.advisor_consultations, 'CAP_MISSING');
  assertRejects((d) => delete d.caps.edge_revisit, 'CAP_MISSING');
  assertRejects((d) => { d.caps.edge_revisit = 0; }, 'CAP_INVALID');
  assertRejects((d) => { d.caps.failure = 'two'; }, 'CAP_INVALID');
  assertRejects((d) => { d.caps.total_failure = 1; }, 'CAP_INVALID');
  assertRejects((d) => { d.caps.total_failure = 0; }, 'CAP_INVALID');
  assert.deepEqual(codes((d) => { d.caps.total_failure = 7; }), []);
  assert.equal(run((d) => delete d.caps.total_failure).summary.caps.total_failure, 4);
});

test('placeholders are unfilled slots everywhere except as a task\'s own params', () => {
  // the golden carries {{change_dir}} in author-contract, which declares it as a param
  assert.ok(JSON.stringify(GOLDEN).includes('{{change_dir}}'));
  assertRejects((d) => { node(d, 'wrap').purpose = 'Deliver via {{pr_command}}.'; }, 'SLOT_UNFILLED', (h) => {
    assert.equal(h[0].slot, 'pr_command');
    assert.match(h[0].path, /^nodes\[\d+\]\.purpose$/);
  });
  assertRejects((d) => { edge(d, 'research', 'spec').guard[0].value = '{{phase_one}}'; }, 'SLOT_UNFILLED');
  assertRejects((d) => { d.caps.failure = '{{cap}}'; }, 'SLOT_UNFILLED');
  assertRejects((d) => { d.name = '{{factory_name}}'; }, 'SLOT_UNFILLED');
  assertRejects((d) => { task(d, 'commit-work').run[0] = '{{unfilled}}'; }, 'SLOT_UNFILLED', (h) => {
    assert.match(h[0].path, /^tasks\.commit-work\.run\[0\]$/);
  });
  // another task's param is not this task's param
  assertRejects((d) => { task(d, 'commit-work').restrictions.push('Write under {{change_dir}}.'); }, 'SLOT_UNFILLED', (h) => {
    assert.equal(h[0].slot, 'change_dir');
  });
  // a placeholder naming a param of its own task is legal
  assert.deepEqual(codes((d) => { task(d, 'author-contract').restrictions.push('Stay under {{change_dir}}.'); }), []);
});

// ---------------------------------------------------------------------------
// TaskDef contract
// ---------------------------------------------------------------------------

test('task executor is one of script, llm, validator, human', () => {
  for (const ex of ['wizard', undefined, 5]) {
    assertRejects((d) => { task(d, 'research-request').executor = ex; }, 'TASK_EXECUTOR_INVALID', (h) => {
      assert.equal(h[0].task, 'research-request');
      assert.equal(h[0].field, 'executor');
    });
  }
});

test('1.x fields on a task are rejected as unknown', () => {
  for (const key of ['criteria', 'prompt', 'type', 'mounts', 'verification', 'steps']) {
    assertRejects((d) => { task(d, 'review-change')[key] = 'x'; }, 'TASK_FIELD_UNKNOWN', (h) => {
      assert.equal(h[0].task, 'review-change');
      assert.equal(h[0].field, key);
    });
  }
});

test('task contract fields are required and well-formed', () => {
  for (const f of ['purpose', 'equipment', 'reads', 'produces', 'restrictions', 'exit']) {
    assertRejects((d) => delete task(d, 'research-request')[f], 'TASK_FIELD_MISSING', (h) => {
      assert.equal(h[0].field, f);
      assert.equal(h[0].task, 'research-request');
    });
  }
  assertRejects((d) => { task(d, 'research-request').purpose = ''; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'research-request').reads = 'request'; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'research-request').produces = [1]; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'research-request').restrictions = ['ok', '']; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { d.tasks.Bad_Task = clone(d.tasks['commit-work']); }, 'TASK_ID_INVALID');
  assertRejects((d) => { d.tasks['commit-work'] = 'nope'; }, 'TASK_FIELD_INVALID');
});

test('instructions are required for llm, validator, and human tasks and optional for script', () => {
  for (const id of ['research-request', 'review-change', 'approve-phase']) {
    assertRejects((d) => delete task(d, id).instructions, 'TASK_FIELD_MISSING', (h) => assert.equal(h[0].field, 'instructions'));
  }
  assertRejects((d) => { task(d, 'review-change').instructions = ''; }, 'TASK_FIELD_INVALID');
  assert.equal(task(GOLDEN, 'commit-work').instructions, undefined);
  assert.deepEqual(codes((d) => { task(d, 'commit-work').instructions = 'Commit and tolerate an empty tree.'; }), []);
  assertRejects((d) => { task(d, 'commit-work').instructions = 42; }, 'TASK_FIELD_INVALID');
});

test('equipment is skills, commands, mcp; a command is a string, a family, or a state-sourced entry', () => {
  const bad = (mut) => assertRejects((d) => mut(task(d, 'implement-ticket').equipment, task(d, 'implement-ticket')), 'EQUIPMENT_INVALID', (h) => assert.equal(h[0].task, 'implement-ticket'));
  bad((eq) => { eq.skills = 'x'; });
  bad((eq) => { eq.mcp = [1]; });
  bad((eq) => delete eq.commands);
  bad((eq) => delete eq.skills);
  bad((eq) => { eq.extra = []; });
  bad((eq) => eq.commands.push(42));
  bad((eq) => eq.commands.push({ base: '' }));
  bad((eq) => eq.commands.push({ base: 'npm', args: 1 }));
  bad((eq) => eq.commands.push({ base: 'npm', other: 1 }));
  bad((eq) => eq.commands.push({ source: 'state:tickets.verification_command' }));
  bad((eq) => eq.commands.push({ source: 'tickets.verification_command', family: 'npm' }));
  bad((eq) => eq.commands.push({ source: 'state:', family: 'npm' }));
  bad((eq) => eq.commands.push({ source: 'state:tickets.verification_command', family: '' }));
  assertRejects((d) => { task(d, 'implement-ticket').equipment = 'npm'; }, 'EQUIPMENT_INVALID');
  assert.deepEqual(codes((d) => task(d, 'implement-ticket').equipment.commands.push({ base: 'npm', args: '-- <pattern>' }, 'npm ci')), []);
});

test('exit outcomes are a non-empty unique list; llm, validator, human tasks need an artifact', () => {
  assertRejects((d) => { task(d, 'review-change').exit.outcomes = []; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'review-change').exit.outcomes = ['pass', 'pass']; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'review-change').exit.outcomes = ['pass', '']; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'review-change').exit.surprise = 1; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'commit-work').exit.artifact = ''; }, 'TASK_FIELD_INVALID');
  for (const id of ['research-request', 'review-change', 'approve-contract']) {
    assertRejects((d) => delete task(d, id).exit.artifact, 'EXIT_ARTIFACT_MISSING', (h) => assert.equal(h[0].task, id));
  }
  assertRejects((d) => { task(d, 'review-change').exit.artifact = ''; }, 'EXIT_ARTIFACT_MISSING');
  // scripts need none
  assert.equal(task(GOLDEN, 'provision-worktree').exit.artifact, undefined);
});

test('runner is validator-only, reviewer or orchestrator, default reviewer', () => {
  assert.deepEqual(codes((d) => { task(d, 'verify-build').runner = 'reviewer'; }), []);
  assert.deepEqual(codes((d) => { task(d, 'review-change').runner = 'orchestrator'; }), []);
  assert.deepEqual(codes((d) => delete task(d, 'review-change').runner), []);
  assertRejects((d) => { task(d, 'verify-build').runner = 'worker'; }, 'TASK_FIELD_INVALID', (h) => {
    assert.equal(h[0].task, 'verify-build');
    assert.equal(h[0].field, 'runner');
  });
  assertRejects((d) => { task(d, 'research-request').runner = 'reviewer'; }, 'TASK_FIELD_INVALID', (h) => assert.equal(h[0].field, 'runner'));
});

test('run is required for scripts and forbidden elsewhere; entries are a command or {command, codes}', () => {
  assertRejects((d) => delete task(d, 'commit-work').run, 'TASK_FIELD_MISSING', (h) => assert.equal(h[0].field, 'run'));
  assertRejects((d) => { task(d, 'commit-work').run = []; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'commit-work').run = 'git commit'; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'commit-work').run.push(7); }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'commit-work').run.push({ command: 'x', extra: 1 }); }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'review-change').run = ['npm test']; }, 'TASK_FIELD_INVALID', (h) => assert.equal(h[0].field, 'run'));
  assertRejects((d) => { task(d, 'research-request').run = ['x']; }, 'TASK_FIELD_INVALID');
});

test('script codes map declared non-ok outcomes from statuses 1-255, never 126 or 127', () => {
  const codesOf = (mut) => (d) => mut(task(d, 'red-check').run[2].codes, task(d, 'red-check'));
  // the golden red check maps 11 to ticket-invalid
  assert.deepEqual(task(GOLDEN, 'red-check').run[2].codes, { 11: 'ticket-invalid' });
  assert.deepEqual(codes(), []);
  assert.deepEqual(codes(codesOf((c) => { c['12'] = 'failed'; })), []);
  assertRejects(codesOf((c) => { c['126'] = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID', (h) => assert.match(h[0].message, /126/));
  assertRejects(codesOf((c) => { c['127'] = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID', (h) => assert.match(h[0].message, /127/));
  assertRejects(codesOf((c) => { c.abc = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID');
  assertRejects(codesOf((c) => { c['1.5'] = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID');
  assertRejects(codesOf((c) => { c['0'] = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID');
  assertRejects(codesOf((c) => { c['256'] = 'ticket-invalid'; }), 'SCRIPT_CODES_INVALID');
  assertRejects(codesOf((c) => { c['13'] = 'made-up'; }), 'SCRIPT_CODES_INVALID', (h) => assert.match(h[0].message, /made-up/));
  assertRejects(codesOf((c) => { c['13'] = 'ok'; }), 'SCRIPT_CODES_INVALID', (h) => assert.match(h[0].message, /ok/));
  assertRejects(codesOf((c) => { c['13'] = 5; }), 'SCRIPT_CODES_INVALID');
  assertRejects((d) => { task(d, 'red-check').run[2].codes = ['11']; }, 'SCRIPT_CODES_INVALID');
});

test('a script ends in ok, failed, or an outcome some run line maps', () => {
  // an extra declared outcome no run line can produce
  assertRejects((d) => {
    task(d, 'provision-worktree').exit.outcomes.push('odd');
    pipe(d, 'build')[0].on.odd = 'escalate';
  }, 'SCRIPT_OUTCOME_INVALID', (h) => {
    assert.equal(h[0].task, 'provision-worktree');
    assert.match(h[0].message, /odd/);
  });
  // ok and failed are mandatory
  assertRejects((d) => { task(d, 'commit-work').exit.outcomes = ['ok']; }, 'SCRIPT_OUTCOME_INVALID', (h) => assert.match(h[0].message, /failed/));
  assertRejects((d) => { task(d, 'commit-work').exit.outcomes = ['failed']; }, 'SCRIPT_OUTCOME_INVALID', (h) => assert.match(h[0].message, /ok/));
  // red-check without its mapping can no longer produce ticket-invalid
  assertRejects((d) => { task(d, 'red-check').run[2] = task(d, 'red-check').run[2].command; }, 'SCRIPT_OUTCOME_INVALID', (h) => assert.match(h[0].message, /ticket-invalid/));
});

test('a task exit outcome named blocked is rejected: blocked is universal and never declared', () => {
  assertRejects((d) => { task(d, 'review-change').exit.outcomes.push('blocked'); }, 'BLOCKED_DECLARED', (h) => {
    assert.equal(h[0].task, 'review-change');
    assert.equal(h[0].field, 'exit.outcomes');
  });
  assertRejects((d) => { task(d, 'commit-work').exit.outcomes.push('Blocked'); }, 'BLOCKED_DECLARED');
});

test('params are named by ^[a-z][a-z0-9_]*$ with a description', () => {
  assert.deepEqual(codes((d) => { task(d, 'deliver').params = { branch_name: 'The branch' }; pipe(d, 'wrap')[4].with = { branch_name: 'main' }; }), []);
  assertRejects((d) => { task(d, 'commit-work').params = { 'Bad-Name': 'x' }; }, 'TASK_FIELD_INVALID', (h) => assert.equal(h[0].field, 'params.Bad-Name'));
  assertRejects((d) => { task(d, 'commit-work').params = { ok_name: '' }; }, 'TASK_FIELD_INVALID');
  assertRejects((d) => { task(d, 'commit-work').params = ['x']; }, 'TASK_FIELD_INVALID');
});

// ---------------------------------------------------------------------------
// Node contract
// ---------------------------------------------------------------------------

test('node ids are kebab-case and unique; kind is entry, work, or terminal; purpose is required', () => {
  assertRejects((d) => { node(d, 'spec').id = 'Spec_Node'; }, 'NODE_ID_INVALID');
  assertRejects((d) => d.nodes.push(clone(node(d, 'spec'))), 'NODE_DUPLICATE_ID', (h) => assert.equal(h[0].node, 'spec'));
  assertRejects((d) => { node(d, 'spec').kind = 'wizard'; }, 'NODE_KIND_INVALID');
  assertRejects((d) => { delete node(d, 'spec').kind; }, 'NODE_KIND_INVALID');
  assertRejects((d) => { delete node(d, 'spec').purpose; }, 'NODE_FIELD_MISSING', (h) => assert.equal(h[0].field, 'purpose'));
  assertRejects((d) => { d.nodes.push('stray'); }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { d.nodes.push({ kind: 'work' }); }, 'NODE_FIELD_MISSING');
});

test('1.x node fields are rejected as unknown', () => {
  for (const key of ['type', 'mounts', 'verification', 'pre_steps', 'post_steps', 'human_approval', 'steps', 'reads', 'produces', 'restrictions', 'instructions']) {
    assertRejects((d) => { node(d, 'review')[key] = key === 'type' ? 'validator' : []; }, 'NODE_FIELD_UNKNOWN', (h) => {
      assert.equal(h[0].node, 'review');
      assert.equal(h[0].field, key);
    });
  }
});

test('work nodes need a non-empty pipeline and unique non-empty outcomes', () => {
  assertRejects((d) => { delete node(d, 'review').pipeline; }, 'NODE_FIELD_MISSING', (h) => assert.equal(h[0].field, 'pipeline'));
  assertRejects((d) => { node(d, 'review').pipeline = []; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'review').pipeline = 'x'; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { delete node(d, 'review').outcomes; }, 'NODE_FIELD_MISSING', (h) => assert.equal(h[0].field, 'outcomes'));
  assertRejects((d) => { node(d, 'review').outcomes = []; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'review').outcomes = ['pass', 'pass', 'fail']; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'review').outcomes = ['pass', 7]; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'review').terminal_kind = 'success'; }, 'NODE_FIELD_INVALID');
});

test('node outcomes may not be reserved words, goto, or forbidden constructs', () => {
  for (const o of ['next', 'escalate', 'done', 'goto:x', 'blocked', 'advisor-consult']) {
    assertRejects((d) => { node(d, 'build').outcomes.push(o); }, 'OUTCOME_INVALID', (h) => assert.equal(h[0].outcome, o));
  }
});

test('every node outcome is surfaced by some pipeline action', () => {
  assertRejects((d) => { node(d, 'review').outcomes.push('limbo'); }, 'OUTCOME_UNPRODUCED', (h) => {
    assert.equal(h[0].node, 'review');
    assert.equal(h[0].outcome, 'limbo');
  });
  // a surface action that no longer exists leaves its outcome unproduced
  assertRejects((d) => { pipe(d, 'review')[0].on.fail = 'escalate'; }, 'OUTCOME_UNPRODUCED', (h) => assert.equal(h[0].outcome, 'fail'));
});

test('the entry node declares no pipeline, outcomes, re-entry, or terminal kind', () => {
  assertRejects((d) => { node(d, 'trigger').outcomes = ['go']; }, 'ENTRY_DECLARES_FORBIDDEN');
  assertRejects((d) => { node(d, 'trigger').pipeline = []; }, 'ENTRY_DECLARES_FORBIDDEN');
  assertRejects((d) => { node(d, 'trigger').re_entry = {}; }, 'ENTRY_DECLARES_FORBIDDEN');
  assertRejects((d) => { node(d, 'trigger').terminal_kind = 'success'; }, 'ENTRY_DECLARES_FORBIDDEN');
  assertRejects((d) => d.nodes.push({ id: 'trigger-two', kind: 'entry', purpose: 'x' }), 'ENTRY_COUNT');
  assertRejects((d) => { d.nodes = d.nodes.filter((n) => n.id !== 'trigger'); }, 'ENTRY_COUNT');
});

test('terminal cardinality and kind', () => {
  assertRejects((d) => { node(d, 'end').terminal_kind = 'success'; }, 'SUCCESS_TERMINAL_COUNT');
  assertRejects((d) => { node(d, 'end').terminal_kind = 'success'; }, 'ABANDONMENT_TERMINAL_COUNT');
  assertRejects((d) => { node(d, 'ship').terminal_kind = 'abandonment'; }, 'SUCCESS_TERMINAL_COUNT');
  assertRejects((d) => { d.nodes = d.nodes.filter((n) => n.id !== 'end'); dropEdges(d, (e) => e.to === 'end'); }, 'ABANDONMENT_TERMINAL_COUNT');
  assertRejects((d) => { delete node(d, 'ship').terminal_kind; }, 'TERMINAL_KIND_INVALID');
});

test('terminals declare a script-only pipeline (possibly empty), no outcomes, no outgoing edges', () => {
  assertRejects((d) => { delete node(d, 'ship').pipeline; }, 'TERMINAL_PIPELINE_MISSING');
  assertRejects((d) => { node(d, 'ship').pipeline = 'x'; }, 'TERMINAL_PIPELINE_MISSING');
  assertRejects((d) => { node(d, 'ship').outcomes = ['x']; }, 'TERMINAL_DECLARES_FORBIDDEN');
  assertRejects((d) => { node(d, 'ship').re_entry = {}; }, 'TERMINAL_DECLARES_FORBIDDEN');
  assertRejects((d) => d.edges.push({ from: 'ship', to: 'wrap', outcome: 'x', guard: [] }), 'EDGE_FROM_TERMINAL');
  assertRejects((d) => { node(d, 'ship').pipeline = [{ use: 'review-change', on: { pass: 'done', fail: 'escalate' } }]; }, 'TERMINAL_TASK_NOT_SCRIPT', (h) => {
    assert.equal(h[0].node, 'ship');
    assert.equal(h[0].task, 'review-change');
  });
  // an empty terminal pipeline is legal
  assert.deepEqual(codes((d) => { node(d, 'end').pipeline = []; delete d.tasks['archive-abandoned']; }), []);
});

// ---------------------------------------------------------------------------
// Pipeline entries and actions
// ---------------------------------------------------------------------------

test('a pipeline entry is exactly {use, with?, on}', () => {
  assertRejects((d) => { pipe(d, 'review')[0].extra = 1; }, 'PIPELINE_ENTRY_INVALID', (h) => assert.equal(h[0].field, 'extra'));
  assertRejects((d) => { delete pipe(d, 'review')[0].use; }, 'PIPELINE_ENTRY_INVALID');
  assertRejects((d) => { delete pipe(d, 'review')[0].on; }, 'PIPELINE_ENTRY_INVALID');
  assertRejects((d) => { pipe(d, 'review')[0].on = []; }, 'PIPELINE_ENTRY_INVALID');
  assertRejects((d) => { pipe(d, 'review')[0] = 'review-change'; }, 'PIPELINE_ENTRY_INVALID');
  assertRejects((d) => { pipe(d, 'spec')[0].with = []; }, 'PIPELINE_ENTRY_INVALID');
  assertRejects((d) => { pipe(d, 'spec')[0].with.change_dir = ''; }, 'PIPELINE_ENTRY_INVALID');
});

test('use must resolve in the task catalog', () => {
  assertRejects((d) => { pipe(d, 'review')[0].use = 'ghost-task'; }, 'TASK_UNDECLARED', (h) => {
    assert.equal(h[0].node, 'review');
    assert.equal(h[0].task, 'ghost-task');
    assert.deepEqual(h[0].entry, { index: 0, task: 'ghost-task' });
  });
});

test('a task appears at most once per pipeline', () => {
  assertRejects((d) => pipe(d, 'build').push({ use: 'provision-worktree', on: { ok: 'escalate', failed: 'escalate' } }), 'PIPELINE_DUPLICATE_TASK', (h) => {
    assert.equal(h[0].node, 'build');
    assert.equal(h[0].task, 'provision-worktree');
    assert.deepEqual(h[0].entries, [0, 5]);
  });
  // the same task in two different nodes is fine (the golden shares commit-work four times)
  assert.equal(GOLDEN.nodes.filter((n) => (n.pipeline ?? []).some((p) => p.use === 'commit-work')).length, 4);
});

test('with binds exactly the params the task declares', () => {
  assertRejects((d) => delete pipe(d, 'spec')[0].with, 'PARAM_UNBOUND', (h) => {
    assert.equal(h[0].node, 'spec');
    assert.equal(h[0].param, 'change_dir');
  });
  assertRejects((d) => { pipe(d, 'spec')[0].with = {}; }, 'PARAM_UNBOUND');
  assertRejects((d) => { pipe(d, 'spec')[0].with.other = 'x'; }, 'PARAM_UNDECLARED', (h) => assert.equal(h[0].param, 'other'));
  assertRejects((d) => { pipe(d, 'review')[0].with = { x: 'y' }; }, 'PARAM_UNDECLARED');
  assert.deepEqual(codes((d) => { pipe(d, 'spec')[0].with.change_dir = 'docs/changes'; }), []);
});

test('the on map covers the task\'s exit outcomes exactly, naming node, entry, and outcome', () => {
  assertRejects((d) => delete pipe(d, 'review')[0].on.fail, 'ON_OUTCOME_UNCOVERED', (h) => {
    assert.equal(h[0].node, 'review');
    assert.deepEqual(h[0].entry, { index: 0, task: 'review-change' });
    assert.equal(h[0].outcome, 'fail');
  });
  assertRejects((d) => delete pipe(d, 'build')[1].on['ticket-invalid'], 'ON_OUTCOME_UNCOVERED', (h) => {
    assert.equal(h[0].node, 'build');
    assert.equal(h[0].entry.index, 1);
    assert.equal(h[0].outcome, 'ticket-invalid');
  });
  assertRejects((d) => { pipe(d, 'review')[0].on.maybe = 'escalate'; }, 'ON_OUTCOME_UNDECLARED', (h) => {
    assert.equal(h[0].node, 'review');
    assert.equal(h[0].outcome, 'maybe');
  });
});

test('actions: next, escalate, done (terminal only), goto, or a declared node outcome', () => {
  // next is illegal on the last entry
  assertRejects((d) => { pipe(d, 'review')[0].on.pass = 'next'; }, 'ACTION_NEXT_ON_LAST', (h) => {
    assert.equal(h[0].node, 'review');
    assert.equal(h[0].entry.index, 0);
    assert.equal(h[0].outcome, 'pass');
  });
  // done closes terminal pipelines only
  assertRejects((d) => { pipe(d, 'review')[0].on.pass = 'done'; }, 'ACTION_INVALID', (h) => assert.match(h[0].message, /terminal/));
  assertRejects((d) => { pipe(d, 'wrap')[4].on.ok = 'done'; }, 'ACTION_INVALID');
  assert.deepEqual(pipe(GOLDEN, 'ship')[0].on, { ok: 'done', failed: 'escalate' });
  // a surfaced outcome must be declared by the node
  assertRejects((d) => { pipe(d, 'review')[0].on.pass = 'passed'; }, 'ACTION_INVALID', (h) => assert.match(h[0].message, /passed/));
  // surfaced outcomes are illegal in terminal pipelines
  assertRejects((d) => { pipe(d, 'ship')[0].on.ok = 'wrapped'; }, 'ACTION_INVALID', (h) => assert.match(h[0].message, /terminal/));
  assertRejects((d) => { pipe(d, 'ship')[0].on.ok = ''; }, 'ACTION_INVALID');
  assertRejects((d) => { pipe(d, 'ship')[0].on.ok = 7; }, 'ACTION_INVALID');
  // next in the middle of a terminal pipeline is fine
  assert.deepEqual(codes((d) => {
    node(d, 'end').pipeline.unshift({ use: 'commit-work', on: { ok: 'next', failed: 'escalate' } });
  }), []);
});

test('goto must target an earlier entry of the same pipeline, naming node and both entries', () => {
  // build: 0 provision-worktree, 1 red-check, 2 implement-ticket, 3 verify-build, 4 commit-work
  assertRejects((d) => { pipe(d, 'build')[2].on.done = 'goto:verify-build'; }, 'GOTO_NOT_BACKWARD', (h) => {
    assert.equal(h[0].node, 'build');
    assert.deepEqual(h[0].entry, { index: 2, task: 'implement-ticket' });
    assert.deepEqual(h[0].target, { index: 3, task: 'verify-build' });
    assert.match(h[0].message, /later/);
  });
  assertRejects((d) => { pipe(d, 'build')[3].on.fail = 'goto:verify-build'; }, 'GOTO_NOT_BACKWARD', (h) => {
    assert.deepEqual(h[0].entry, { index: 3, task: 'verify-build' });
    assert.deepEqual(h[0].target, { index: 3, task: 'verify-build' });
    assert.match(h[0].message, /itself/);
  });
  assertRejects((d) => { pipe(d, 'build')[3].on.fail = 'goto:ghost'; }, 'GOTO_NOT_BACKWARD', (h) => {
    assert.equal(h[0].target.index, null);
    assert.equal(h[0].target.task, 'ghost');
  });
  // a task from another node is not an entry of this pipeline
  assertRejects((d) => { pipe(d, 'build')[3].on.fail = 'goto:fold-deltas'; }, 'GOTO_NOT_BACKWARD');
  assert.deepEqual(codes((d) => { pipe(d, 'build')[3].on.fail = 'goto:red-check'; }), []);
});

// ---------------------------------------------------------------------------
// Edges and the entry route
// ---------------------------------------------------------------------------

test('every routable outcome needs an edge', () => {
  assertRejects((d) => dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass'), 'OUTCOME_UNCOVERED', (h) => {
    assert.equal(h[0].node, 'review');
    assert.equal(h[0].outcome, 'pass');
  });
});

test('edge outcome must be declared by its source and the edge well-formed', () => {
  assertRejects((d) => { edge(d, 'review', 'wrap').outcome = 'made-up'; }, 'EDGE_OUTCOME_UNDECLARED', (h) => assert.equal(h[0].outcome, 'made-up'));
  assertRejects((d) => { delete edge(d, 'review', 'wrap').outcome; }, 'EDGE_OUTCOME_MISSING');
  assertRejects((d) => { edge(d, 'review', 'wrap').to = 'nowhere'; }, 'EDGE_UNKNOWN_NODE');
  assertRejects((d) => { d.edges.push('x'); }, 'EDGE_INVALID');
  assertRejects((d) => { edge(d, 'review', 'wrap').outcome = ''; }, 'EDGE_INVALID');
});

test('entry edge: exactly one, no outcome, empty guard, targeting a work node', () => {
  assertRejects((d) => { edge(d, 'trigger', 'research').to = 'ship'; }, 'ENTRY_ROUTE_INVALID', (h) => assert.match(h[0].message, /work node/));
  assertRejects((d) => { edge(d, 'trigger', 'research').guard = [{ field: 'phase', op: 'eq', value: 'feat' }]; }, 'ENTRY_ROUTE_INVALID', (h) => assert.match(h[0].message, /unconditional/));
  assertRejects((d) => { edge(d, 'trigger', 'research').outcome = 'go'; }, 'ENTRY_ROUTE_INVALID', (h) => assert.match(h[0].message, /outcome/));
  assertRejects((d) => d.edges.push({ from: 'trigger', to: 'research', guard: [] }), 'ENTRY_ROUTE_INVALID', (h) => assert.match(h[0].message, /exactly one/));
  assertRejects((d) => dropEdges(d, (e) => e.from === 'trigger'), 'ENTRY_ROUTE_INVALID');
  assertRejects((d) => d.edges.push({ from: 'build', to: 'trigger', outcome: 'ticket-invalid', guard: [] }), 'EDGE_TO_ENTRY');
});

test('the entry edge targets the shared first node, which must carry the phase-approval task', () => {
  assertRejects((d) => { edge(d, 'trigger', 'research').to = 'build'; }, 'FIRST_NODE_NO_APPROVAL', (h) => {
    assert.equal(h[0].node, 'build');
    assert.equal(h[0].task, 'approve-phase');
  });
  assertRejects((d) => { pipe(d, 'research').pop(); pipe(d, 'research')[0].on['proposal-produced'] = 'phase-approved'; }, 'FIRST_NODE_NO_APPROVAL', (h) => assert.equal(h[0].node, 'research'));
});

test('edges into the abandonment terminal are legal', () => {
  assert.equal(GOLDEN.edges.filter((e) => e.to === 'end').length, 2);
  assert.deepEqual(run().errors, []);
  // split ticket-invalid: with pending work it returns to ticket, otherwise the unit is abandoned
  const res = run((d) => {
    edge(d, 'build', 'ticket', 'ticket-invalid').guard = [{ field: 'pending_tickets', op: 'not-empty' }];
    d.edges.push({ from: 'build', to: 'end', outcome: 'ticket-invalid', guard: [{ field: 'pending_tickets', op: 'empty' }] });
  });
  assert.deepEqual(res.errors, [], JSON.stringify(res.errors));
});

// ---------------------------------------------------------------------------
// Guard algebra
// ---------------------------------------------------------------------------

test('overlapping guards are rejected naming outcome and both edges', () => {
  assertRejects((d) => d.edges.push({ from: 'research', to: 'build-direct', outcome: 'phase-approved', guard: [{ field: 'phase', op: 'ne', value: 'fix' }] }), 'GUARD_OVERLAP', (hits) => {
    assert.equal(hits[0].node, 'research');
    assert.equal(hits[0].outcome, 'phase-approved');
    assert.equal(hits[0].edges.length, 2);
    assert.ok(hits[0].witness);
  });
  // two unconditional edges for one outcome
  assertRejects((d) => d.edges.push({ from: 'wrap', to: 'ship', outcome: 'handed-off', guard: [] }), 'GUARD_OVERLAP');
});

test('non-exhaustive guards are rejected with a witness state', () => {
  assertRejects((d) => dropEdges(d, (e) => e.from === 'research' && e.to === 'build-direct'), 'GUARD_NOT_EXHAUSTIVE', (hits) => {
    assert.equal(hits[0].node, 'research');
    assert.equal(hits[0].outcome, 'phase-approved');
    assert.equal(hits[0].witness.phase, 'chore');
  });
});

test('an unconditional catch-all and not-in splits are legal', () => {
  const res = run((d) => {
    dropEdges(d, (e) => e.from === 'research' && ['build-direct', 'maintain'].includes(e.to));
    d.edges.push({ from: 'research', to: 'build-direct', outcome: 'phase-approved', guard: [{ field: 'phase', op: 'not-in', value: ['feat', 'fix'] }] });
  });
  // maintain is now unreachable, but the guards themselves are exclusive and exhaustive
  assert.ok(!res.errors.some((e) => String(e.code).startsWith('GUARD_')), JSON.stringify(res.errors));
});

test('guard exclusivity and exhaustiveness use the per-node phase domain', () => {
  // as is: ticket/spec-contradiction covers only feat (to spec) and fix (to research), the phases that reach ticket
  const res = run();
  assert.deepEqual(res.errors, []);
  assert.deepEqual(GOLDEN.edges.filter((e) => e.from === 'ticket' && e.outcome === 'spec-contradiction').map((e) => e.guard[0].value).sort(), ['feat', 'fix']);
  // a chore route into ticket puts chore in the domain: spec-contradiction is no longer exhaustive
  assertRejects((d) => { edge(d, 'research', 'build-direct').to = 'ticket'; }, 'GUARD_NOT_EXHAUSTIVE', (hits) => {
    const h = hits.find((x) => x.node === 'ticket' && x.outcome === 'spec-contradiction');
    assert.ok(h, JSON.stringify(hits));
    assert.equal(h.witness.phase, 'chore');
  });
  // overlap is judged over the domain too: two guards that overlap only on unreachable phases are exclusive here
  assert.deepEqual(codes((d) => {
    edge(d, 'ticket', 'spec', 'spec-contradiction').guard = [{ field: 'phase', op: 'in', value: ['feat', 'chore'] }];
  }), []);
});

function reviewSplit(guardA, guardB) {
  return (d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    d.edges.push(
      { from: 'review', to: 'wrap', outcome: 'pass', guard: guardA },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: guardB },
    );
  };
}

test('numeric operators: exact boundaries decide exclusivity and exhaustiveness', () => {
  const g = (op, value) => [{ field: 'round', op, value }];
  assert.deepEqual(codesX(reviewSplit(g('gt', 2), g('lte', 2))), []);
  assert.deepEqual(codesX(reviewSplit(g('lt', 3), g('gte', 3))), []);
  assert.ok(codesX(reviewSplit(g('gt', 2), g('gte', 2))).includes('GUARD_OVERLAP'));
  assert.ok(codesX(reviewSplit(g('gt', 2), g('lt', 2))).includes('GUARD_NOT_EXHAUSTIVE'));
  assert.deepEqual(codesX(reviewSplit(g('eq', 0), g('ne', 0))), []);
  assert.deepEqual(codesX(reviewSplit(g('in', [1, 2]), g('not-in', [1, 2]))), []);
  assert.ok(codesX(reviewSplit(g('in', [1, 2]), g('in', [2, 3]))).includes('GUARD_OVERLAP'));
  // number fields compare between the constants too
  const r = (op, value) => [{ field: 'ratio', op, value }];
  assert.deepEqual(codesX(reviewSplit(r('lt', 0.5), r('gte', 0.5))), []);
  assert.ok(codesX(reviewSplit(r('lt', 0.5), r('gt', 0.5))).includes('GUARD_NOT_EXHAUSTIVE'));
});

test('list operators: empty, not-empty, and count comparisons', () => {
  const g = (op, value) => [{ field: 'tickets', op, ...(value === undefined ? {} : { value }) }];
  assert.deepEqual(codesX(reviewSplit(g('empty'), g('not-empty'))), []);
  assert.ok(codesX(reviewSplit(g('empty'), g('lt', 1))).includes('GUARD_OVERLAP'));
  assert.ok(codesX(reviewSplit(g('gte', 2), g('lt', 1))).includes('GUARD_NOT_EXHAUSTIVE'));
  assert.deepEqual(codesX(reviewSplit(g('lt', 2), g('gte', 2))), []);
  assert.deepEqual(codesX(reviewSplit(g('eq', 0), g('gt', 0))), []);
});

test('enum, boolean, string, and null guards', () => {
  const v = (op, value) => [{ field: 'verdict_kind', op, value }];
  assert.deepEqual(codesX(reviewSplit(v('eq', 'minor'), v('eq', 'major'))), []);
  assert.ok(codesX(reviewSplit(v('eq', 'minor'), v('ne', 'major'))).includes('GUARD_OVERLAP'));
  const b = (value) => [{ field: 'late_flag', op: 'eq', value }];
  assert.deepEqual(codesX((d) => {
    dropEdges(d, (e) => e.from === 'wrap');
    d.edges.push({ from: 'wrap', to: 'ship', outcome: 'handed-off', guard: b(true) }, { from: 'wrap', to: 'ship', outcome: 'handed-off', guard: b(false) });
  }), []);
  // a nullable string is judged against the constants, the other strings, and null
  const s = (op, value) => [{ field: 'label', op, value }];
  assert.deepEqual(codesX(reviewSplit(s('eq', null), s('ne', null))), []);
  assert.deepEqual(codesX(reviewSplit(s('eq', 'x'), s('ne', 'x'))), []);
  assert.ok(codesX(reviewSplit(s('eq', 'x'), s('eq', 'y'))).includes('GUARD_NOT_EXHAUSTIVE'));
  // object fields only compare to null
  const o = (op, value) => [{ field: 'blob', op, value }];
  assert.deepEqual(codesX(reviewSplit(o('eq', null), o('ne', null))), []);
  assertRejectsX(reviewSplit(o('eq', 'x'), o('ne', null)), 'GUARD_UNDECIDABLE');
});

test('multi-field conjunctions are decided jointly', () => {
  const both = (a, b) => [
    { field: 'round', op: a[0], value: a[1] },
    { field: 'verdict_kind', op: 'eq', value: b },
  ];
  // (round>1 & major) and (round<=1) leave (round>1 & minor) uncovered
  assert.ok(codesX(reviewSplit(both(['gt', 1], 'major'), [{ field: 'round', op: 'lte', value: 1 }])).includes('GUARD_NOT_EXHAUSTIVE'));
  assert.deepEqual(codesX((d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    d.edges.push(
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'verdict_kind', op: 'eq', value: 'major' }] },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'verdict_kind', op: 'eq', value: 'minor' }, { field: 'round', op: 'lt', value: 5 }] },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'verdict_kind', op: 'eq', value: 'minor' }, { field: 'round', op: 'gte', value: 5 }] },
    );
  }), []);
  // phase combines with other fields over the per-node domain
  assert.deepEqual(codesX((d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    d.edges.push(
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'phase', op: 'eq', value: 'chore' }, { field: 'round', op: 'gt', value: 0 }] },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'phase', op: 'ne', value: 'chore' }] },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'phase', op: 'eq', value: 'chore' }, { field: 'round', op: 'lte', value: 0 }] },
    );
  }), []);
});

test('undecidable guards are rejected', () => {
  const bad = (guard) => assertRejects((d) => { edge(d, 'research', 'spec').guard = guard; }, 'GUARD_UNDECIDABLE');
  bad('spec-contradiction'); // prose
  bad([{ field: 'phase', op: 'contains', value: 'x' }]); // unknown operator
  bad([{ field: 'nope', op: 'eq', value: 1 }]); // undefined field
  bad([{ field: 'outcome', op: 'eq', value: 'x' }]); // outcome belongs to the edge
  bad([{ field: 'phase', op: 'eq', value: 'unknown-phase' }]); // value outside the instantiated vocabulary
  bad([{ field: 'phase', op: 'eq', value: null }]); // phase is never null in a guard
  bad([{ field: 'phase', op: 'empty' }]); // list operator on a scalar
  bad([{ field: 'phase', op: 'lt', value: 3 }]); // ordering on an enum
  bad([{ field: 'phase', op: 'in', value: [] }]);
  bad([{ field: 'phase', op: 'eq' }]); // missing value
  bad([null]);
  assertRejects((d) => { delete edge(d, 'research', 'spec').guard; }, 'GUARD_UNDECIDABLE');
  assertRejectsX(reviewSplit([{ field: 'verdict_kind', op: 'eq', value: 'huge' }], []), 'GUARD_UNDECIDABLE');
  assertRejectsX(reviewSplit([{ field: 'tickets', op: 'in', value: [1] }], []), 'GUARD_UNDECIDABLE');
  assertRejectsX(reviewSplit([{ field: 'tickets', op: 'empty', value: 1 }], []), 'GUARD_UNDECIDABLE');
  assertRejectsX(reviewSplit([{ field: 'round', op: 'gt', value: 'two' }], []), 'GUARD_UNDECIDABLE');
  assertRejectsX(reviewSplit([{ field: 'label', op: 'eq', value: 5 }], []), 'GUARD_UNDECIDABLE');
  // a field still defined only by a parameterized plugin entry cannot be guarded on
  const res = run(undefined, mergeCatalogs(SHIPPED, {}).registry);
  assert.ok(find(res, 'GUARD_UNDECIDABLE').some((e) => /graph-init instantiation/.test(e.message)));
});

test('guard field must be applicable at the edge source (a producing node reaches it)', () => {
  // late_flag is produced by deliver (node wrap): applicable at wrap and ship only, not at review
  assertRejectsX((d) => { edge(d, 'review', 'wrap').guard = [{ field: 'late_flag', op: 'eq', value: true }]; }, 'GUARD_FIELD_INAPPLICABLE', (h) => {
    assert.equal(h[0].edge.from, 'review');
    assert.match(h[0].message, /late_flag/);
  });
  // ... but at wrap itself, the producing node, it is
  assert.deepEqual(codesX((d) => {
    dropEdges(d, (e) => e.from === 'wrap');
    d.edges.push(
      { from: 'wrap', to: 'ship', outcome: 'handed-off', guard: [{ field: 'late_flag', op: 'eq', value: true }] },
      { from: 'wrap', to: 'ship', outcome: 'handed-off', guard: [{ field: 'late_flag', op: 'eq', value: false }] },
    );
  }), []);
  // a field no task produces is applicable nowhere
  const orphan = run((d) => { edge(d, 'research', 'spec').guard = [{ field: 'late_flag', op: 'eq', value: true }]; }, registryOf(EXTRA));
  assert.ok(find(orphan, 'GUARD_FIELD_INAPPLICABLE').length >= 1);
  // pending_tickets is produced by ticket, which reaches build: the golden's build guards are legal
  assert.ok(edge(GOLDEN, 'build', 'ticket', 'ticket-done').guard[0].field === 'pending_tickets');
  assert.deepEqual(run().errors, []);
});

test('oversized guard sets are rejected as too complex', () => {
  const res = runX((d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    const guard = [];
    for (let i = 0; i < 12; i++) guard.push({ field: `f${i}`, op: 'in', value: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    d.edges.push({ from: 'review', to: 'wrap', outcome: 'pass', guard });
  });
  assert.equal(find(res, 'GUARD_TOO_COMPLEX').length, 1);
  assert.equal(find(res, 'GUARD_TOO_COMPLEX')[0].node, 'review');
});

// ---------------------------------------------------------------------------
// Forbidden constructs
// ---------------------------------------------------------------------------

test('human-gate, advisor, blocked, and escalation constructs are rejected', () => {
  const extra = (id) => (d) => d.nodes.push({ id, kind: 'work', purpose: 'x', pipeline: [{ use: 'commit-work', on: { ok: 'x', failed: 'escalate' } }], outcomes: ['x'] });
  assertRejects(extra('advisor'), 'FORBIDDEN_NODE');
  assertRejects(extra('human-gate'), 'FORBIDDEN_NODE');
  assertRejects(extra('escalation'), 'FORBIDDEN_NODE');
  assertRejects((d) => d.edges.push({ from: 'build', to: 'review', outcome: 'blocked', guard: [] }), 'EDGE_FORBIDDEN');
  assertRejects((d) => d.edges.push({ from: 'build', to: 'human-gate', outcome: 'ticket-invalid', guard: [] }), 'EDGE_FORBIDDEN');
  // blocked can be a declared nowhere: node outcome, task outcome, edge
  assertRejects((d) => { node(d, 'build').outcomes.push('blocked'); }, 'OUTCOME_INVALID');
});

// ---------------------------------------------------------------------------
// Type references through the registry
// ---------------------------------------------------------------------------

test('produces state:<field> must resolve through the catalogs', () => {
  assertRejects((d) => { task(d, 'commit-work').produces.push('state:ghost'); }, 'TYPE_DANGLING', (h) => {
    assert.equal(h[0].task, 'commit-work');
    assert.equal(h[0].field, 'ghost');
  });
  // a non-state produces entry is just an artifact name
  assert.deepEqual(codes((d) => { task(d, 'commit-work').produces.push('commit-record'); }), []);
});

test('a parameterized phase type that was never instantiated is rejected, pointing at graph-init', () => {
  const res = run(undefined, mergeCatalogs(SHIPPED, {}).registry);
  const hit = find(res, 'TYPE_PARAMETERIZED_UNFILLED').find((e) => e.task === 'approve-phase');
  assert.ok(hit, JSON.stringify(res.errors.map((e) => e.code)));
  assert.equal(hit.field, 'phase');
  assert.match(hit.message, /graph-init instantiation/);
  // with no task referencing the field the phase check names it on its own
  const bare = run((d) => { task(d, 'approve-phase').produces = []; task(d, 'approve-phase').reads = []; }, mergeCatalogs(SHIPPED, {}).registry);
  assert.ok(find(bare, 'TYPE_PARAMETERIZED_UNFILLED').some((e) => e.field === 'phase' && !e.task));
});

test('reads state:<path> is checked for dangling references only', () => {
  assertRejects((d) => { task(d, 'commit-work').reads.push('state:ghost'); }, 'TYPE_DANGLING', (h) => {
    assert.equal(h[0].task, 'commit-work');
    assert.equal(h[0].field, 'ghost');
  });
  assertRejects((d) => { task(d, 'commit-work').reads.push('state:tickets.nope'); }, 'TYPE_PATH_INVALID');
  // applicability is not checked: a task reading a field before any producer is fine
  assert.deepEqual(codes((d) => { task(d, 'approve-phase').reads.push('state:tickets', 'state:tickets.verification_command'); }), []);
});

test('a state-sourced command must draw on a command-typed field', () => {
  const src = (source) => (d) => task(d, 'implement-ticket').equipment.commands.push({ source, family: 'npm test' });
  assertRejects(src('state:ghost'), 'TYPE_DANGLING', (h) => assert.equal(h[0].task, 'implement-ticket'));
  assertRejects(src('state:tickets'), 'EQUIPMENT_SOURCE_INVALID', (h) => {
    assert.equal(h[0].task, 'implement-ticket');
    assert.equal(h[0].field, 'tickets');
  });
  assertRejects(src('state:current_ticket'), 'EQUIPMENT_SOURCE_INVALID');
  assertRejects(src('state:tickets.status'), 'EQUIPMENT_SOURCE_INVALID');
  assertRejects(src('state:tickets.nope'), 'TYPE_PATH_INVALID');
  // a command-typed path is fine
  assert.deepEqual(codes(src('state:tickets.verification_command')), []);
});

test('a state-sourced command may draw on a list of commands', () => {
  const res = run((d) => { task(d, 'implement-ticket').equipment.commands.push({ source: 'state:hooks', family: 'npm test' }); }, registryOf(EXTRA));
  assert.deepEqual(res.errors, []);
  const notCommands = run((d) => { task(d, 'implement-ticket').equipment.commands.push({ source: 'state:notes', family: 'npm test' }); }, registryOf(EXTRA));
  assert.ok(find(notCommands, 'EQUIPMENT_SOURCE_INVALID').length === 1);
});

test('catalog merge errors are reported with the structure errors', () => {
  const merged = mergeCatalogs(SHIPPED, { phase: PHASE, contract_ref: { type: 'string', default: '' } });
  assert.ok(merged.errors.some((e) => e.code === 'TYPE_COLLISION'));
  const res = validateDefinition(clone(GOLDEN), { registry: merged.registry, catalogErrors: merged.errors });
  assert.ok(res.errors.some((e) => e.code === 'TYPE_COLLISION' && e.invariant));
});

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

test('the instantiated phase type must contain maintenance', () => {
  const noMaint = registryOf({ phase: { ...PHASE, values: ['feat', 'fix', 'chore'] } });
  const res = run(undefined, noMaint);
  assert.ok(find(res, 'PHASE_MAINTENANCE_MISSING').length === 1);
  assert.equal(find(res, 'PHASE_MAINTENANCE_MISSING')[0].field, 'phase');
  // the guards over a smaller vocabulary are checked against it, so the maintenance edges are undecidable
  assert.ok(res.errors.some((e) => e.code === 'GUARD_UNDECIDABLE'));
  assert.deepEqual(run().summary.phases, ['feat', 'fix', 'chore', 'maintenance']);
});

test('exactly one task produces state:phase, and it is a human task', () => {
  assertRejects((d) => { task(d, 'approve-phase').produces = ['state:contract_ref']; }, 'PHASE_APPROVAL_INVALID', (h) => assert.deepEqual(h[0].tasks, []));
  assertRejects((d) => { task(d, 'approve-contract').produces.push('state:phase'); }, 'PHASE_APPROVAL_INVALID', (h) => assert.deepEqual(h[0].tasks.sort(), ['approve-contract', 'approve-phase']));
  assertRejects((d) => { task(d, 'approve-phase').executor = 'llm'; }, 'PHASE_APPROVAL_INVALID', (h) => {
    assert.equal(h[0].task, 'approve-phase');
    assert.match(h[0].message, /human/);
  });
});

test('every phase value has a route from every reachable node to the success terminal', () => {
  // maintenance loses its route entirely
  assertRejects((d) => dropEdges(d, (e) => e.from === 'research' && e.to === 'maintain'), 'PHASE_ROUTE_MISSING', (hits) => {
    assert.ok(hits.every((h) => h.phase === 'maintenance'));
    assert.ok(hits.some((h) => h.node === 'research'));
    assert.match(hits[0].message, /maintenance/);
  });
  // a phase trapped in a cycle whose only exits belong to other phases
  const res = assertRejects((d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    d.edges.push(
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'phase', op: 'ne', value: 'maintenance' }] },
      { from: 'review', to: 'maintain', outcome: 'pass', guard: [{ field: 'phase', op: 'eq', value: 'maintenance' }] },
    );
  }, 'PHASE_ROUTE_MISSING', (hits) => {
    assert.ok(hits.every((h) => h.phase === 'maintenance'));
    assert.deepEqual(hits.map((h) => h.node).sort(), ['maintain', 'research', 'review', 'trigger']);
  });
  // everything else about that definition is fine: the trap is the only defect
  assert.deepEqual([...new Set(res.errors.map((e) => e.code))], ['PHASE_ROUTE_MISSING']);
});

// ---------------------------------------------------------------------------
// Close-out
// ---------------------------------------------------------------------------

test('exactly one task mounts the close-out skill', () => {
  assertRejects((d) => { task(d, 'close-out').equipment.skills = ['open-skills:use-worktree']; }, 'CLOSE_OUT_COUNT', (h) => assert.deepEqual(h[0].tasks, []));
  assertRejects((d) => { task(d, 'implement-change').equipment.skills.push('open-skills:wrap'); }, 'CLOSE_OUT_COUNT', (h) => assert.deepEqual(h[0].tasks.sort(), ['close-out', 'implement-change']));
  // the bare skill name counts too
  assertRejects((d) => { task(d, 'implement-change').equipment.skills.push('wrap'); }, 'CLOSE_OUT_COUNT');
  assert.equal(run().summary.close_out_task, 'close-out');
});

test('exactly one node references the close-out task', () => {
  assertRejects((d) => pipe(d, 'build-direct').splice(1, 0, { use: 'close-out', on: { done: 'next' } }), 'CLOSE_OUT_NODE_COUNT', (h) => {
    assert.equal(h[0].task, 'close-out');
    assert.deepEqual(h[0].nodes.sort(), ['build-direct', 'wrap']);
  });
  // nobody references it any more
  assertRejects((d) => { pipe(d, 'wrap').splice(1, 1); pipe(d, 'wrap')[1].on.fail = 'escalate'; }, 'CLOSE_OUT_NODE_COUNT', (h) => assert.deepEqual(h[0].nodes, []));
});

test('the close-out node must dominate the success terminal', () => {
  // review pass -> ship for chore, -> wrap otherwise: a route reaches success without the close-out node
  const res = assertRejects((d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    d.edges.push(
      { from: 'review', to: 'ship', outcome: 'pass', guard: [{ field: 'phase', op: 'eq', value: 'chore' }] },
      { from: 'review', to: 'wrap', outcome: 'pass', guard: [{ field: 'phase', op: 'ne', value: 'chore' }] },
    );
  }, 'CLOSE_OUT_NOT_DOMINATING', (h) => {
    assert.equal(h[0].node, 'wrap');
    assert.equal(h[0].terminal, 'ship');
    assert.match(h[0].message, /"wrap"/);
    assert.match(h[0].message, /"ship"/);
  });
  assert.deepEqual([...new Set(res.errors.map((e) => e.code))], ['CLOSE_OUT_NOT_DOMINATING']);
  assert.equal(run().summary.close_out_node, 'wrap');
});

// ---------------------------------------------------------------------------
// Loops and reachability
// ---------------------------------------------------------------------------

const withLoop = (exit) => (d) => {
  for (const id of ['alpha', 'beta']) {
    d.nodes.push({ id, kind: 'work', purpose: `The ${id} loop node.`, pipeline: [{ use: 'review-change', on: { pass: 'out', fail: 'again' } }], outcomes: exit ? ['again', 'out'] : ['again'] });
  }
  if (!exit) { // no `out` surface action either: only `again` remains
    for (const id of ['alpha', 'beta']) pipe(d, id)[0].on.pass = 'again';
  }
  edge(d, 'maintain', 'review', 'ready-for-review').to = 'alpha';
  d.edges.push({ from: 'alpha', to: 'beta', outcome: 'again', guard: [] }, { from: 'beta', to: 'alpha', outcome: 'again', guard: [] });
  if (exit) d.edges.push({ from: 'alpha', to: 'wrap', outcome: 'out', guard: [] }, { from: 'beta', to: 'wrap', outcome: 'out', guard: [] });
};

test('a loop without an exit is rejected naming the cycle', () => {
  assertRejects(withLoop(false), 'LOOP_NO_EXIT', (h) => assert.deepEqual(h[0].cycle, ['alpha', 'beta']));
  assert.deepEqual(codes(withLoop(true)), []);
});

test('an uncapped edge cycle is rejected naming each cycle edge; a goto needs the failure cap', () => {
  assertRejects((d) => delete d.caps.edge_revisit, 'LOOP_NO_CAP', (hits) => {
    assert.equal(hits.length, 12, 'one error per edge on a cycle');
    const names = hits.map((h) => `${h.edge.from}>${h.edge.to}`);
    assert.ok(names.includes('review>build-direct'));
    assert.ok(hits.every((h) => h.edge.index !== undefined && h.cycle.length >= 2));
  });
  assertRejects((d) => delete d.caps.failure, 'LOOP_NO_CAP', (hits) => {
    assert.equal(hits.length, 6, 'one error per goto');
    const where = hits.map((h) => `${h.node}:${h.entry.index}:${h.entry.task}`).sort();
    assert.ok(where.includes('build:3:verify-build'));
    assert.ok(where.includes('research:1:approve-phase'));
  });
  assertRejects((d) => { d.caps.failure = 0; }, 'LOOP_NO_CAP');
  // no goto, no failure-cap requirement from gotos
  const noGoto = run((d) => {
    for (const n of d.nodes) for (const p of n.pipeline ?? []) for (const [k, v] of Object.entries(p.on)) if (String(v).startsWith('goto:')) p.on[k] = 'escalate';
    delete d.caps.failure;
  });
  assert.deepEqual(find(noGoto, 'LOOP_NO_CAP'), []);
});

test('unreachable node is rejected', () => {
  assertRejects((d) => {
    d.nodes.push({ id: 'orphan', kind: 'work', purpose: 'x', pipeline: [{ use: 'commit-work', on: { ok: 'done', failed: 'escalate' } }], outcomes: ['done'] });
    d.edges.push({ from: 'orphan', to: 'wrap', outcome: 'done', guard: [] });
  }, 'NODE_UNREACHABLE', (hits) => assert.equal(hits[0].node, 'orphan'));
  // the abandonment terminal is exempt: with every edge into it gone it is still not reported
  assert.ok(!run((d) => dropEdges(d, (e) => e.to === 'end')).errors.some((e) => e.code === 'NODE_UNREACHABLE'));
});

test('the success terminal must be reachable from every work node', () => {
  assertRejects((d) => {
    d.nodes.push({ id: 'dead-end', kind: 'work', purpose: 'x', pipeline: [{ use: 'commit-work', on: { ok: 'stop', failed: 'escalate' } }], outcomes: ['stop'] });
    edge(d, 'maintain', 'review', 'ready-for-review').to = 'dead-end';
    d.edges.push({ from: 'dead-end', to: 'end', outcome: 'stop', guard: [] });
  }, 'NODE_NO_PATH_TO_SUCCESS', (hits) => {
    // the dead end and the node that only leads into it
    assert.deepEqual(hits.map((h) => h.node).sort(), ['dead-end', 'maintain']);
  });
});

// ---------------------------------------------------------------------------
// Re-entry
// ---------------------------------------------------------------------------

test('re-entry rules reference resolved, applicable fields; list_field is a list', () => {
  assert.deepEqual(node(GOLDEN, 'ticket').re_entry, { list_field: 'pending_tickets', order: 'declared', progress_field: 'current_ticket', items_field: 'tickets' });
  assert.deepEqual(codes(), []);
  const reentry = (mut) => (d) => mut(node(d, 'ticket').re_entry);
  assertRejects(reentry((r) => { r.list_field = 'current_ticket'; }), 'REENTRY_INVALID', (h) => assert.match(h[0].message, /list/));
  assertRejects(reentry((r) => { r.progress_field = 'ghost'; }), 'REENTRY_INVALID', (h) => assert.match(h[0].message, /ghost/));
  assertRejects(reentry((r) => { r.list_field = 'ghost'; }), 'REENTRY_INVALID');
  assertRejects(reentry((r) => { delete r.order; }), 'REENTRY_INVALID');
  assertRejects((d) => { node(d, 'ticket').re_entry = { list_field: 'pending_tickets' }; }, 'REENTRY_INVALID');
  assertRejects((d) => { node(d, 'ticket').re_entry = { list_field: 'pending_tickets', order: 'declared', progress_field: 'current_ticket' }; }, 'REENTRY_INVALID', (h) => assert.match(h[0].message, /items_field/));
  assertRejects((d) => { node(d, 'ticket').re_entry = 'pending_tickets'; }, 'REENTRY_INVALID');
  // late_flag is produced by deliver at wrap: it resolves but is not applicable at ticket
  assertRejectsX((d) => { node(d, 'ticket').re_entry.progress_field = 'late_flag'; }, 'REENTRY_INVALID', (h) => assert.match(h[0].message, /not applicable/));
});

test('re-entry items_field: required, no other key, a list of objects carrying an id, applicable at the node', () => {
  const reentry = (mut) => (d) => mut(node(d, 'ticket').re_entry);
  const named = (h, node, field) => {
    assert.equal(h[0].node, node);
    assert.ok(h[0].message.includes(`"${node}"`) && h[0].message.includes(field), h[0].message);
  };
  // required and a non-empty string
  assertRejects(reentry((r) => { delete r.items_field; }), 'REENTRY_INVALID', (h) => named(h, 'ticket', 'items_field'));
  assertRejects(reentry((r) => { r.items_field = ''; }), 'REENTRY_INVALID', (h) => named(h, 'ticket', 'items_field'));
  assertRejects(reentry((r) => { r.items_field = 7; }), 'REENTRY_INVALID');
  // any other key is rejected
  assertRejects(reentry((r) => { r.extra = 'x'; }), 'REENTRY_INVALID', (h) => assert.match(h[0].message, /unknown key "extra"/));
  // must resolve
  assertRejects(reentry((r) => { r.items_field = 'ghost'; }), 'REENTRY_INVALID', (h) => named(h, 'ticket', 'items_field'));
  // must be a list of objects with an id: a list of strings, a scalar, and an object list without id all fail
  assertRejects(reentry((r) => { r.items_field = 'pending_tickets'; }), 'REENTRY_INVALID', (h) => assert.match(h[0].message, /items_field "pending_tickets" must be a list of objects carrying an "id"/));
  assertRejects(reentry((r) => { r.items_field = 'current_ticket'; }), 'REENTRY_INVALID', (h) => assert.match(h[0].message, /list of objects/));
  const noId = { type: 'list', default: [], items: { type: 'object', fields: { label: { type: 'string' } } } };
  assertRejects((d) => {
    task(d, 'decompose-tickets').produces.push('state:no_id_items');
    node(d, 'ticket').re_entry.items_field = 'no_id_items';
  }, 'REENTRY_INVALID', (h) => assert.match(h[0].message, /carrying an "id"/), (m) => run(m, registryOf({ no_id_items: noId })));
  // applicable at the node: a list of {id} records produced only downstream resolves but is not applicable at ticket
  const lateItems = { type: 'list', default: [], items: { type: 'object', fields: { id: { type: 'string' } } } };
  assertRejects((d) => {
    task(d, 'deliver').produces.push('state:late_items');
    node(d, 'ticket').re_entry.items_field = 'late_items';
  }, 'REENTRY_INVALID', (h) => assert.match(h[0].message, /items_field "late_items" is not applicable/), (m) => run(m, registryOf({ late_items: lateItems })));
  // ... while the same field produced at the node is accepted
  const ok = run((d) => {
    task(d, 'decompose-tickets').produces.push('state:late_items');
    node(d, 'ticket').re_entry.items_field = 'late_items';
  }, registryOf({ late_items: lateItems }));
  assert.deepEqual(ok.errors, []);
});

// ---------------------------------------------------------------------------
// Warnings, summary, commands
// ---------------------------------------------------------------------------

test('a catalog task no pipeline uses is a warning, never an error', () => {
  const res = run((d) => { d.tasks.spare = clone(d.tasks['commit-work']); });
  assert.deepEqual(res.errors, []);
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].code, 'TASK_UNREFERENCED');
  assert.equal(res.warnings[0].task, 'spare');
  assert.equal(res.summary.tasks, 20);
});

test('tool-gate commands: equipment, family, state-family, and run lines, terminals included', () => {
  const res = run();
  const by = (task_, source) => res.commands.filter((c) => c.task === task_ && c.source === source).map((c) => c.command);
  // plain equipment commands
  assert.deepEqual(by('verify-build', 'equipment'), ['npm test', 'npm run lint']);
  // a family contributes its base, a state-sourced entry its family
  assert.deepEqual(by('author-contract', 'family'), ['openspec']);
  assert.deepEqual(by('implement-ticket', 'family'), ['npm test']);
  assert.deepEqual(by('implement-ticket', 'state-family'), ['npm test']);
  // run lines: strings and {command, codes}
  assert.equal(by('red-check', 'run').length, 3);
  assert.ok(by('red-check', 'run')[2].includes('expect-red'));
  assert.equal(by('commit-work', 'run').length, 1);
  // terminal pipelines count: archive-shipped runs in ship, archive-abandoned in end
  const ship = res.commands.filter((c) => c.task === 'archive-shipped');
  assert.ok(ship.length === 2 && ship.every((c) => c.source === 'run' && c.nodes.length === 1 && c.nodes[0] === 'ship'));
  assert.deepEqual(res.commands.filter((c) => c.task === 'archive-abandoned')[0].nodes, ['end']);
  // each record names the nodes that reference the task
  assert.deepEqual([...new Set(res.commands.filter((c) => c.task === 'commit-work').flatMap((c) => c.nodes))].sort(), ['build', 'build-direct', 'maintain', 'wrap']);
  // every program of the golden definition
  const programs = new Set(res.commands.flatMap((c) => programsOf(c.command)));
  assert.deepEqual([...programs].sort(), ['gh', 'git', 'node', 'npm', 'openspec']);
});

test('validation never throws on garbage input', () => {
  const garbage = [
    {},
    { schema_version: '2.0.0' },
    { schema_version: '2.0.0', name: 'x', caps: [], tasks: [], nodes: {}, edges: 'x' },
    { schema_version: '2.0.0', name: 'x', caps: {}, tasks: { a: null, b: [], 'c-d': { executor: 'script', run: [null, { command: 1, codes: 5 }], exit: { outcomes: [1] }, equipment: { commands: [null] } } }, nodes: [null, 3, { id: 'n' }, { id: 'e', kind: 'work', pipeline: [null, { use: 'a', on: 1 }, { use: 'c-d', on: { ok: 5 } }], outcomes: 'x' }, { id: 't', kind: 'terminal', pipeline: [{}] }], edges: [null, {}, { from: 'n', to: 'e', guard: [{ field: 3 }] }] },
  ];
  for (const g of garbage) assert.doesNotThrow(() => validateDefinition(g, { registry: REGISTRY }));
  assert.doesNotThrow(() => validateDefinition(clone(GOLDEN)));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('tokenize and programsOf', () => {
  assert.deepEqual(tokenize('npm test -- "a b"'), ['npm', 'test', '--', 'a b']);
  assert.deepEqual(programsOf('FOO=1 npm ci && cd x; echo hi | grep h'), ['npm', 'grep']);
  assert.deepEqual(programsOf('cd /tmp'), []);
  assert.deepEqual(programsOf('test ! -d "$WU_WORKTREE" || git worktree remove --force "$WU_WORKTREE"'), ['git']);
});

// ---------------------------------------------------------------------------
// Tool gate
// ---------------------------------------------------------------------------

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sandbox(t) {
  const dir = tmp(t);
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const effect = path.join(dir, 'real-effect');
  const tool = (name, body) => {
    const p = path.join(bin, name);
    fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
    fs.chmodSync(p, 0o755);
    return p;
  };
  // Well-behaved tool: answers --version, any other invocation is a "real effect".
  const good = (name) => tool(name, `if [ "$1" = "--version" ]; then echo 1.0; exit 0; fi\ntouch "${effect}"\nexit 0`);
  return { dir, bin, effect, tool, good };
}

const cmds = (...list) => list.map((command) => ({ task: 'a-task', nodes: ['a-node'], source: 'equipment', command }));

test('tool gate passes existing tools and never runs a real effect', (t) => {
  const s = sandbox(t);
  s.good('npm');
  s.good('gh');
  const r = toolGate(cmds('npm test', 'gh pr create'), { PATH: s.bin });
  assert.equal(r.status, 'passed');
  assert.deepEqual(r.probes.map((p) => [p.program, p.via]), [['npm', '--version'], ['gh', '--version']]);
  assert.deepEqual(r.probes[0].used_by, [{ task: 'a-task', nodes: ['a-node'], source: 'equipment', command: 'npm test' }]);
  assert.equal(fs.existsSync(s.effect), false);
});

test('tool gate falls back to --help and names the tool, tasks, and nodes of what is missing', (t) => {
  const s = sandbox(t);
  s.tool('oddtool', 'if [ "$1" = "--help" ]; then exit 0; fi\nexit 2');
  s.tool('brokentool', 'exit 1');
  const r = toolGate(
    [
      { task: 'implement-change', nodes: ['build-direct'], source: 'family', command: 'oddtool run' },
      { task: 'deliver', nodes: ['wrap'], source: 'run', command: 'ghost deploy' },
      { task: 'review-change', nodes: ['review'], source: 'equipment', command: 'brokentool x' },
    ],
    { PATH: s.bin },
  );
  assert.equal(r.status, 'failed');
  const byTool = Object.fromEntries(r.errors.map((e) => [e.tool, e]));
  assert.equal(byTool.ghost.code, 'TOOL_MISSING');
  assert.deepEqual(byTool.ghost.tasks, ['deliver']);
  assert.deepEqual(byTool.ghost.nodes, ['wrap']);
  assert.equal(byTool.brokentool.code, 'TOOL_NOT_STARTABLE');
  assert.deepEqual(byTool.brokentool.tasks, ['review-change']);
  assert.equal(r.probes.find((p) => p.program === 'oddtool').via, '--help');
  assert.equal(byTool.oddtool, undefined);
  assert.ok(r.errors.every((e) => e.invariant && e.message.includes(e.tasks[0])));
});

test('tool gate checks explicit paths for existence without invoking them', (t) => {
  const s = sandbox(t);
  const direct = s.tool('local.sh', `touch "${s.effect}"`);
  const r = toolGate(cmds(`${direct} --flag`, `${path.join(s.dir, 'nope.sh')} x`), { PATH: '' });
  assert.equal(fs.existsSync(s.effect), false);
  assert.equal(r.probes.find((p) => p.resolved === direct).via, 'exists');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'TOOL_MISSING');
});

test('tool gate probes every program of a compound command', (t) => {
  const s = sandbox(t);
  s.good('one');
  const r = toolGate(cmds('one a && two b'), { PATH: s.bin });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].tool, 'two');
});

test('tool gate reports a tool used by several tasks once, naming them all', (t) => {
  const s = sandbox(t);
  const r = toolGate([
    { task: 'one-task', nodes: ['n1'], source: 'run', command: 'ghost a' },
    { task: 'two-task', nodes: ['n1', 'n2'], source: 'equipment', command: 'ghost b' },
  ], { PATH: s.bin });
  assert.equal(r.errors.length, 1);
  assert.deepEqual(r.errors[0].tasks, ['one-task', 'two-task']);
  assert.deepEqual(r.errors[0].nodes, ['n1', 'n2']);
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cli(args, { env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, cwd });
  let out;
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout); }, `stdout must be exactly one JSON object, got: ${r.stdout}`);
  assert.ok(r.stdout.endsWith('\n'));
  return { status: r.status, out };
}

const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  return file;
};

// A project dir holding the golden (or a mutation of it) and its project type catalog.
function project(t, mutate) {
  const dir = tmp(t);
  const d = clone(GOLDEN);
  mutate?.(d);
  const file = writeJson(path.join(dir, '.harness', 'graph.json'), d);
  const types = writeJson(path.join(dir, '.harness', 'types.json'), { phase: PHASE });
  return { dir, file, types };
}

test('CLI: --help and no args print one JSON object listing both subcommands and exit 0', () => {
  for (const args of [['--help'], [], ['validate', '-h']]) {
    const { status, out } = cli(args);
    assert.equal(status, 0);
    assert.equal(out.command, 'help');
    assert.ok(out.exit_codes['4'] && out.exit_codes['5']);
    assert.ok(out.usage.some((u) => u.includes('validate')) && out.usage.some((u) => u.includes('assemble')));
    assert.ok(out.flags['--types <path>'] && out.flags['--plugin-types <path>'] && out.flags['--slots <path>']);
  }
});

test('CLI: usage and input errors have distinct exit codes', (t) => {
  assert.equal(cli(['validate']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--bogus']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--config']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--types']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--plugin-types', '--no-probe']).status, 2);
  assert.equal(cli(['validate', 'x.json', 'y.json']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--types', 'a', '--types', 'b']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--slots', 's.json']).status, 2, 'assemble flags do not apply to validate');
  const missing = cli(['validate', '/nonexistent/graph.json']);
  assert.equal(missing.status, 3);
  assert.equal(missing.out.errors[0].code, 'INPUT_UNREADABLE');
  const dir = tmp(t);
  const bad = writeJson(path.join(dir, 'bad.json'), '{nope');
  const r = cli([bad]);
  assert.equal(r.status, 3);
  assert.equal(r.out.errors[0].code, 'INPUT_INVALID_JSON');
});

test('CLI: valid definition is accepted with --no-probe', (t) => {
  const p = project(t);
  const { status, out } = cli(['validate', p.file, '--no-probe', '--types', p.types]);
  assert.equal(status, 0);
  assert.equal(out.ok, true);
  assert.equal(out.accepted, true);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(out.tool_gate, { status: 'skipped', reason: '--no-probe' });
  assert.equal(out.returning_edges.length, 12);
  assert.equal(out.summary.nodes, 11);
  assert.equal(out.summary.edges, 20);
  assert.equal(out.summary.tasks, 19);
});

test('CLI: --types defaults to .harness/types.json under the cwd; validate is the default subcommand', (t) => {
  const p = project(t);
  const { status, out } = cli([p.file, '--no-probe'], { cwd: p.dir });
  assert.equal(status, 0, JSON.stringify(out.errors));
  assert.equal(out.accepted, true);
  // without a project catalog the parameterized phase type was never instantiated
  const bare = tmp(t);
  const file = writeJson(path.join(bare, 'graph.json'), GOLDEN);
  const rej = cli([file, '--no-probe'], { cwd: bare });
  assert.equal(rej.status, 1);
  assert.ok(rej.out.errors.some((e) => e.code === 'TYPE_PARAMETERIZED_UNFILLED'));
});

test('CLI: catalog flags choose the catalogs; content violations exit 1, unreadable catalogs exit 3', (t) => {
  const p = project(t);
  // a custom plugin catalog: the golden's fields are dangling in it
  const plugin = writeJson(path.join(p.dir, 'plugin-types.json'), { phase: SHIPPED.phase });
  const dangling = cli(['validate', p.file, '--no-probe', '--types', p.types, '--plugin-types', plugin]);
  assert.equal(dangling.status, 1);
  assert.ok(dangling.out.errors.some((e) => e.code === 'TYPE_DANGLING'));
  // a project entry colliding with a plugin entry is a catalog content violation: exit 1
  const clash = writeJson(path.join(p.dir, 'clash.json'), { phase: PHASE, contract_ref: { type: 'string', default: '' } });
  const collide = cli(['validate', p.file, '--no-probe', '--types', clash]);
  assert.equal(collide.status, 1);
  assert.ok(collide.out.errors.some((e) => e.code === 'TYPE_COLLISION' && e.invariant));
  // unreadable or invalid catalogs: exit 3
  const missingPlugin = cli(['validate', p.file, '--no-probe', '--types', p.types, '--plugin-types', path.join(p.dir, 'nope.json')]);
  assert.equal(missingPlugin.status, 3);
  assert.equal(missingPlugin.out.errors[0].code, 'CATALOG_UNREADABLE');
  const badJson = writeJson(path.join(p.dir, 'bad-types.json'), '{nope');
  const invalid = cli(['validate', p.file, '--no-probe', '--types', badJson]);
  assert.equal(invalid.status, 3);
  assert.equal(invalid.out.errors[0].code, 'CATALOG_INVALID_JSON');
  const notObject = writeJson(path.join(p.dir, 'arr-types.json'), '[]');
  assert.equal(cli(['validate', p.file, '--no-probe', '--types', notObject]).out.errors[0].code, 'CATALOG_NOT_OBJECT');
});

test('CLI: invalid definition exits 1 naming the violated invariants', (t) => {
  const p = project(t, (d) => {
    dropEdges(d, (e) => e.from === 'review' && e.outcome === 'pass');
    delete d.caps.failure;
  });
  const { status, out } = cli([p.file, '--no-probe', '--types', p.types]);
  assert.equal(status, 1);
  assert.equal(out.accepted, false);
  const got = out.errors.map((e) => e.code);
  assert.ok(got.includes('OUTCOME_UNCOVERED') && got.includes('CAP_MISSING'));
  assert.equal(out.tool_gate.reason, 'structure-invalid');
  assert.ok(out.errors.every((e) => e.invariant));
});

test('CLI: a 1.x definition exits 1 with the schema-version error', (t) => {
  const p = project(t, (d) => { d.schema_version = '1.0.0'; });
  const { status, out } = cli([p.file, '--no-probe', '--types', p.types]);
  assert.equal(status, 1);
  assert.deepEqual(out.errors.map((e) => e.code), ['SCHEMA_VERSION_UNSUPPORTED']);
});

// Every program the golden's commands need, as well-behaved stubs.
const GOLDEN_TOOLS = ['node', 'git', 'npm', 'gh', 'openspec'];

test('CLI: tool gate accepts when every tool starts, exits 4 when one is missing, naming task and node', (t) => {
  const s = sandbox(t);
  for (const name of GOLDEN_TOOLS.filter((x) => x !== 'gh')) s.good(name);
  const p = project(t);
  const rej = cli(['validate', p.file, '--types', p.types], { env: { PATH: s.bin } });
  assert.equal(rej.status, 4);
  assert.equal(rej.out.accepted, false);
  assert.equal(rej.out.errors[0].code, 'TOOL_MISSING');
  assert.equal(rej.out.errors[0].tool, 'gh');
  assert.deepEqual(rej.out.errors[0].tasks, ['deliver']);
  assert.deepEqual(rej.out.errors[0].nodes, ['wrap']);
  s.good('gh');
  const acc = cli(['validate', p.file, '--types', p.types], { env: { PATH: s.bin } });
  assert.equal(acc.status, 0, JSON.stringify(acc.out.errors));
  assert.equal(acc.out.tool_gate.status, 'passed');
  assert.equal(fs.existsSync(s.effect), false);
});

test('CLI: --config probes worktree setup commands', (t) => {
  const s = sandbox(t);
  for (const name of GOLDEN_TOOLS) s.good(name);
  const p = project(t);
  const cfg = writeJson(path.join(p.dir, 'config.json'), { worktree_setup: { setup: ['pnpm install'], copy: [] } });
  const r = cli(['validate', p.file, '--types', p.types, '--config', cfg], { env: { PATH: s.bin } });
  assert.equal(r.status, 4);
  assert.equal(r.out.errors[0].tool, 'pnpm');
  assert.deepEqual(r.out.errors[0].nodes, ['config:worktree_setup']);
  assert.deepEqual(r.out.errors[0].tasks, []);
  writeJson(cfg, { nothing: true });
  assert.equal(cli(['validate', p.file, '--types', p.types, '--config', cfg], { env: { PATH: s.bin } }).status, 3);
  assert.equal(cli(['validate', p.file, '--types', p.types, '--config', path.join(p.dir, 'missing.json')], { env: { PATH: s.bin } }).out.errors[0].code, 'CONFIG_INVALID');
  s.good('pnpm');
  writeJson(cfg, { worktree_setup: { setup: ['pnpm install'], copy: [] } });
  assert.equal(cli(['validate', p.file, '--types', p.types, '--config', cfg], { env: { PATH: s.bin } }).status, 0);
});

// ---------------------------------------------------------------------------
// Assemble: a small synthetic library
// ---------------------------------------------------------------------------

const lib = {
  tasks: {
    'approve-phase': {
      executor: 'human',
      purpose: 'Approve the phase.',
      instructions: 'Approve or send back.',
      equipment: { skills: [], commands: [], mcp: [] },
      reads: [],
      produces: ['state:phase'],
      restrictions: [],
      exit: { outcomes: ['approved'], artifact: 'decision-<n>.md' },
    },
    'do-work': {
      executor: 'llm',
      purpose: 'Do the work.',
      instructions: 'Work on {{topic}} and run {{test_command}} when done.',
      equipment: { skills: [], commands: ['{{test_command}} --coverage', { base: '{{test_command}}' }], mcp: [] },
      reads: [],
      produces: [],
      restrictions: ['Stay within {{topic}}.'],
      exit: { outcomes: ['done'], artifact: 'report-<n>.md' },
      params: { topic: 'What to work on' },
    },
    'close-out': {
      executor: 'llm',
      purpose: 'Close out.',
      instructions: 'Write the handoff.',
      equipment: { skills: ['open-skills:wrap'], commands: [], mcp: [] },
      reads: [],
      produces: [],
      restrictions: [],
      exit: { outcomes: ['done'], artifact: 'handoff.md' },
    },
    archive: {
      executor: 'script',
      purpose: 'Archive the unit.',
      run: ['echo archived'],
      equipment: { skills: [], commands: [], mcp: [] },
      reads: [],
      produces: [],
      restrictions: [],
      exit: { outcomes: ['ok', 'failed'] },
    },
  },
  nodes: {
    trigger: { id: 'trigger', kind: 'entry', purpose: 'Entry.' },
    work: {
      id: 'work',
      kind: 'work',
      purpose: 'Do everything.',
      pipeline: [
        { use: 'approve-phase', on: { approved: 'next' } },
        { use: 'do-work', with: { topic: 'docs' }, on: { done: 'next' } },
        { use: 'close-out', on: { done: 'finished' } },
      ],
      outcomes: ['finished'],
    },
    ship: { id: 'ship', kind: 'terminal', terminal_kind: 'success', purpose: 'Delivered.', pipeline: [{ use: 'archive', on: { ok: 'done', failed: 'escalate' } }] },
    end: { id: 'end', kind: 'terminal', terminal_kind: 'abandonment', purpose: 'Abandoned.', pipeline: [{ use: 'archive', on: { ok: 'done', failed: 'escalate' } }] },
  },
};

const ASSEMBLY = {
  schema_version: '2.0.0',
  name: 'synthetic',
  slots: { phase_values: 'Phase values.', test_command: 'The test command.' },
  caps: { failure: 2, advisor_consultations: 2, edge_revisit: 2 },
  nodes: ['trigger', 'work', 'ship', 'end'],
  edges: [
    { from: 'trigger', to: 'work', guard: [] },
    { from: 'work', to: 'ship', outcome: 'finished', guard: [{ field: 'phase', op: 'in', value: '{{phase_values}}' }] },
  ],
};
const VALUES = { phase_values: ['feat', 'maintenance'], test_command: 'npm test' };

// A workspace: the library on disk, an assembly graph, and the project paths.
function workspace(t, { assembly = ASSEMBLY, library = lib } = {}) {
  const dir = tmp(t);
  const root = path.join(dir, 'library');
  for (const [kind, files] of Object.entries(library)) {
    for (const [id, body] of Object.entries(files)) writeJson(path.join(root, kind, `${id}.json`), body);
  }
  return {
    dir,
    library: root,
    assembly: writeJson(path.join(dir, 'assembly.json'), assembly),
    slots: writeJson(path.join(dir, 'slots.json'), VALUES),
    out: path.join(dir, 'project', '.harness', 'graph.json'),
    types: path.join(dir, 'project', '.harness', 'types.json'),
  };
}
const call = (w, over = {}) => assemble({
  assembly: readJson(w.assembly), slots: readJson(w.slots), library: w.library, out: w.out, typesPath: w.types, ...over,
});
const asmCli = (w, extra = []) => cli(['assemble', w.assembly, '--slots', w.slots, '--library', w.library, '--out', w.out, '--types', w.types, ...extra]);
const nothingWritten = (w) => {
  assert.equal(fs.existsSync(w.out), false, 'the definition must not be written');
  assert.equal(fs.existsSync(w.types), false, 'the types file must not be written');
  const dir = path.dirname(w.out);
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')) : [], [], 'no temp file is left behind');
};

test('assemble: a library composition flattens into a self-contained definition', (t) => {
  const w = workspace(t);
  const res = call(w);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.file, w.out);
  assert.deepEqual(res.types, { file: w.types, written: ['phase'] });
  assert.deepEqual(res.warnings, []);
  assert.equal(res.summary.nodes, 4);
  assert.equal(res.summary.tasks, 4);
  const def = readJson(w.out);
  // exactly the runtime sections: no slots, no phase, no state_fields
  assert.deepEqual(Object.keys(def), ['schema_version', 'name', 'caps', 'tasks', 'nodes', 'edges']);
  assert.deepEqual(def.nodes.map((n) => n.id), ['trigger', 'work', 'ship', 'end']);
  assert.deepEqual(Object.keys(def.tasks).sort(), ['approve-phase', 'archive', 'close-out', 'do-work']);
  // slot fill: embedded placeholder replaced textually, whole-value placeholder takes any JSON
  assert.deepEqual(def.tasks['do-work'].equipment.commands, ['npm test --coverage', { base: 'npm test' }]);
  assert.deepEqual(def.edges[1].guard[0].value, ['feat', 'maintenance']);
  // task params stay in place for the pipeline entry's `with`
  assert.equal(def.tasks['do-work'].instructions, 'Work on {{topic}} and run npm test when done.');
  assert.deepEqual(def.tasks['do-work'].restrictions, ['Stay within {{topic}}.']);
  assert.deepEqual(def.nodes[1].pipeline[1].with, { topic: 'docs' });
  assert.deepEqual(def.caps, { failure: 2, advisor_consultations: 2, edge_revisit: 2 });
  // the written definition validates with no access to the library
  fs.rmSync(w.library, { recursive: true });
  const { registry, errors } = loadRegistry({ projectPath: w.types });
  assert.deepEqual(errors, []);
  const check = validateDefinition(def, { registry });
  assert.deepEqual(check.errors, [], JSON.stringify(check.errors));
  assert.deepEqual(check.warnings, []);
  assert.deepEqual(check.summary.phases, ['feat', 'maintenance']);
});

test('assemble: the phase instantiation is written to the project types file, merged with existing entries', (t) => {
  const w = workspace(t);
  writeJson(w.types, { extra_note: { type: 'string', nullable: true, default: null } });
  const res = call(w);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.types.written, ['phase']);
  const types = readJson(w.types);
  assert.deepEqual(Object.keys(types).sort(), ['extra_note', 'phase']);
  assert.deepEqual(types.phase, instantiate(SHIPPED.phase, VALUES).entry);
  assert.deepEqual(types.phase.values, ['feat', 'maintenance']);
});

test('assemble: an unchanged instantiation is not rewritten', (t) => {
  const w = workspace(t);
  assert.equal(call(w).ok, true);
  const before = fs.readFileSync(w.types, 'utf8');
  fs.utimesSync(w.types, new Date(0), new Date(0));
  const again = call(w);
  assert.equal(again.ok, true);
  assert.deepEqual(again.types.written, []);
  assert.equal(fs.readFileSync(w.types, 'utf8'), before);
  assert.equal(fs.statSync(w.types).mtimeMs, 0, 'the file was not touched');
  // a changed instantiation replaces the stored entry
  fs.writeFileSync(w.slots, JSON.stringify({ ...VALUES, phase_values: ['feat', 'docs', 'maintenance'] }));
  const changed = call(w, { slots: readJson(w.slots) });
  assert.deepEqual(changed.types.written, ['phase']);
  assert.deepEqual(readJson(w.types).phase.values, ['feat', 'docs', 'maintenance']);
});

test('assemble: a parameterized plugin entry whose slots are not all declared is left alone', (t) => {
  const w = workspace(t);
  const plugin = writeJson(path.join(w.dir, 'plugin-types.json'), { ...SHIPPED, other: { type: 'string', values: '{{other_values}}', default: 'a' } });
  const res = call(w, { pluginPath: plugin });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(res.types.written, ['phase']);
  assert.deepEqual(Object.keys(readJson(w.types)), ['phase']);
  // declaring that slot too instantiates the second entry as well
  const assembly = { ...ASSEMBLY, slots: { ...ASSEMBLY.slots, other_values: 'Values of the other type.' } };
  const both = call(w, { pluginPath: plugin, assembly, slots: { ...VALUES, other_values: ['a', 'b'] } });
  assert.equal(both.ok, true, JSON.stringify(both.errors));
  assert.deepEqual(both.types.written, ['other']);
  assert.deepEqual(readJson(w.types).other.values, ['a', 'b']);
});

test('assemble: inline nodes and assembly tasks override the library; unused assembly tasks warn', (t) => {
  const assembly = clone(ASSEMBLY);
  assembly.nodes[3] = { ...lib.nodes.end, purpose: 'Abandoned, edited inline.' };
  assembly.tasks = {
    archive: { ...lib.tasks.archive, run: ['echo archived-by-assembly'] },
    spare: clone(lib.tasks.archive),
  };
  const w = workspace(t, { assembly });
  const res = call(w);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  const def = readJson(w.out);
  assert.equal(node(def, 'end').purpose, 'Abandoned, edited inline.');
  assert.deepEqual(def.tasks.archive.run, ['echo archived-by-assembly']);
  assert.equal(def.tasks.spare, undefined, 'only referenced tasks are inlined');
  assert.deepEqual(res.warnings.map((x) => [x.code, x.task]), [['ASSEMBLY_TASK_UNUSED', 'spare']]);
});

test('assemble: unresolved node or task references are named, and nothing is written', (t) => {
  const missingNode = clone(ASSEMBLY);
  missingNode.nodes.push('ghost-node');
  const w1 = workspace(t, { assembly: missingNode });
  const r1 = call(w1);
  assert.equal(r1.ok, false);
  assert.equal(r1.exit, 1);
  assert.deepEqual(r1.errors.map((e) => e.code), ['ASSEMBLY_NODE_UNRESOLVED']);
  assert.equal(r1.errors[0].node, 'ghost-node');
  assert.ok(r1.errors[0].file.endsWith(path.join('nodes', 'ghost-node.json')));
  nothingWritten(w1);

  const w2 = workspace(t);
  fs.rmSync(path.join(w2.library, 'tasks', 'do-work.json'));
  const r2 = call(w2);
  assert.deepEqual(r2.errors.map((e) => e.code), ['ASSEMBLY_TASK_UNRESOLVED']);
  assert.equal(r2.errors[0].task, 'do-work');
  assert.equal(r2.errors[0].node, 'work');
  nothingWritten(w2);

  // a node file whose id disagrees with the reference, and one that is not JSON
  const w3 = workspace(t);
  writeJson(path.join(w3.library, 'nodes', 'work.json'), { ...lib.nodes.work, id: 'other' });
  assert.deepEqual(call(w3).errors.map((e) => e.code), ['ASSEMBLY_NODE_UNRESOLVED']);
  const w4 = workspace(t);
  writeJson(path.join(w4.library, 'tasks', 'archive.json'), '{nope');
  const r4 = call(w4);
  assert.deepEqual(r4.errors.map((e) => e.code), ['ASSEMBLY_TASK_UNRESOLVED'], 'reported once, not once per node');
  assert.deepEqual(r4.errors[0].nodes, ['ship', 'end']);
  nothingWritten(w4);

  // a reference may not climb out of the library
  const sneaky = clone(ASSEMBLY);
  sneaky.nodes.push('../outside');
  assert.equal(call(workspace(t, { assembly: sneaky })).errors[0].code, 'ASSEMBLY_NODE_UNRESOLVED');

  // the default library is the plugin's templates
  const dflt = assemble({ assembly: { ...ASSEMBLY, nodes: ['no-such-node'] }, slots: VALUES, out: w1.out, typesPath: w1.types });
  assert.ok(dflt.errors[0].file.endsWith(path.join('skills', 'graph-init', 'templates', 'nodes', 'no-such-node.json')));
});

test('assemble: an unfilled slot is named and nothing is written', (t) => {
  const w = workspace(t);
  const res = call(w, { slots: { phase_values: VALUES.phase_values } });
  assert.equal(res.ok, false);
  assert.equal(res.exit, 1);
  assert.deepEqual(res.errors.map((e) => [e.code, e.slot]), [['SLOT_UNFILLED', 'test_command']]);
  nothingWritten(w);
  assert.equal(call(w, { slots: {} }).errors.length, 2);
});

test('assemble: a value for an undeclared slot is rejected', (t) => {
  const w = workspace(t);
  const res = call(w, { slots: { ...VALUES, bonus: 'x' } });
  assert.deepEqual(res.errors.map((e) => [e.code, e.slot]), [['SLOT_UNDECLARED', 'bonus']]);
  nothingWritten(w);
});

test('assemble: a placeholder that is neither a declared slot nor its task\'s param is SLOT_UNDECLARED', (t) => {
  // an undeclared name inside a task
  const lib2 = clone(lib);
  lib2.tasks['do-work'].restrictions.push('Never touch {{mystery}}.');
  const w1 = workspace(t, { library: lib2 });
  const r1 = call(w1);
  assert.deepEqual(r1.errors.map((e) => [e.code, e.slot]), [['SLOT_UNDECLARED', 'mystery']]);
  assert.match(r1.errors[0].path, /^tasks\.do-work\.restrictions\[1\]$/);
  nothingWritten(w1);
  // a task param used outside its task (a node purpose) is not a param there
  const lib3 = clone(lib);
  lib3.nodes.work.purpose = 'Work on {{topic}}.';
  const r2 = call(workspace(t, { library: lib3 }));
  assert.deepEqual(r2.errors.map((e) => [e.code, e.slot]), [['SLOT_UNDECLARED', 'topic']]);
  assert.match(r2.errors[0].path, /^nodes\[1\]\.purpose$/);
  // a param name of ANOTHER task does not count
  const lib4 = clone(lib);
  lib4.tasks['close-out'].restrictions = ['Remember {{topic}}.'];
  assert.deepEqual(call(workspace(t, { library: lib4 })).errors.map((e) => e.code), ['SLOT_UNDECLARED']);
  // an embedded placeholder with a non-string value
  const lib5 = clone(lib);
  lib5.tasks['do-work'].instructions = 'Phases: {{phase_values}}.';
  const r5 = call(workspace(t, { library: lib5 }));
  assert.deepEqual(r5.errors.map((e) => e.code), ['SLOT_VALUE_INVALID']);
});

test('assemble: an invalid composition is rejected with the validator errors and nothing is written', (t) => {
  const assembly = clone(ASSEMBLY);
  delete assembly.caps.failure;
  assembly.edges.pop();
  const w = workspace(t, { assembly });
  const res = call(w);
  assert.equal(res.ok, false);
  assert.equal(res.exit, 1);
  const got = res.errors.map((e) => e.code);
  assert.ok(got.includes('CAP_MISSING') && got.includes('OUTCOME_UNCOVERED'), JSON.stringify(got));
  assert.ok(res.errors.every((e) => e.invariant));
  nothingWritten(w);
  // a phase vocabulary without maintenance cannot be instantiated
  const w2 = workspace(t);
  const noMaint = call(w2, { slots: { ...VALUES, phase_values: ['feat', 'fix'] } });
  assert.ok(noMaint.errors.some((e) => e.code === 'PHASE_MAINTENANCE_MISSING'));
  nothingWritten(w2);
  // a project catalog entry colliding with a plugin entry is a content violation (exit 1)
  const w3 = workspace(t);
  writeJson(w3.types, { contract_ref: { type: 'string', default: '' } });
  const clash = call(w3);
  assert.equal(clash.exit, 1);
  assert.ok(clash.errors.some((e) => e.code === 'TYPE_COLLISION'));
  assert.deepEqual(readJson(w3.types), { contract_ref: { type: 'string', default: '' } });
  assert.equal(fs.existsSync(w3.out), false);
});

test('assemble: the assembly graph itself is checked', (t) => {
  const w = workspace(t);
  const bad = (mut) => {
    const a = clone(ASSEMBLY);
    mut(a);
    const res = call(w, { assembly: a });
    assert.equal(res.ok, false);
    assert.equal(res.exit, 1);
    return res.errors.map((e) => e.code);
  };
  assert.deepEqual(bad((a) => { a.phase = {}; }), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => { a.state_fields = {}; }), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => delete a.slots), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => delete a.edges), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => { a.nodes = 'x'; }), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => { a.nodes.push(7); }), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => { a.slots.Bad = ''; }), ['ASSEMBLY_INVALID']);
  assert.deepEqual(bad((a) => { a.tasks = []; }), ['ASSEMBLY_INVALID']);
  assert.equal(assemble({ assembly: [], slots: {} }).errors[0].code, 'ASSEMBLY_INVALID');
  nothingWritten(w);
});

test('assemble: an unreadable library or catalog is an input error (exit 3)', (t) => {
  const w = workspace(t);
  const plugin = writeJson(path.join(w.dir, 'plugin-types.json'), '{nope');
  const res = call(w, { pluginPath: plugin });
  assert.equal(res.ok, false);
  assert.equal(res.exit, 3);
  assert.equal(res.errors[0].code, 'CATALOG_INVALID_JSON');
  nothingWritten(w);
  writeJson(w.types, '[]');
  const res2 = call(w);
  assert.equal(res2.exit, 3);
  assert.equal(res2.errors[0].code, 'CATALOG_NOT_OBJECT');
});

test('assemble: an unwritable output directory is a write failure (exit 5) and leaves no types behind', (t) => {
  const w = workspace(t);
  // a regular file where the output's parent directory should be
  const blocker = writeJson(path.join(w.dir, 'blocker'), 'file');
  const out = path.join(blocker, 'graph.json');
  const res = call(w, { out });
  assert.equal(res.ok, false);
  assert.equal(res.exit, 5);
  assert.equal(res.errors[0].code, 'WRITE_FAILED');
  assert.equal(res.errors[0].file, out);
  assert.ok(res.errors[0].message.includes(out));
  assert.equal(fs.existsSync(w.types), false, 'the types file is written only once the graph file can be');
  const viaCli = cli(['assemble', w.assembly, '--slots', w.slots, '--library', w.library, '--out', out, '--types', w.types]);
  assert.equal(viaCli.status, 5);
  assert.equal(viaCli.out.errors[0].code, 'WRITE_FAILED');
});

test('assemble: an unwritable types file is a write failure and the graph file is not committed', (t) => {
  if (process.getuid?.() === 0) return t.skip('permission checks do not bind root');
  const w = workspace(t);
  const ro = path.join(w.dir, 'readonly');
  fs.mkdirSync(ro);
  fs.chmodSync(ro, 0o555);
  t.after(() => {
    try {
      fs.chmodSync(ro, 0o755); // so the workspace can be removed when the read-only dir is still there
    } catch {
      // already removed
    }
  });
  const types = path.join(ro, 'sub', 'types.json');
  const res = call(w, { typesPath: types });
  assert.equal(res.ok, false);
  assert.equal(res.exit, 5);
  assert.equal(res.errors[0].code, 'WRITE_FAILED');
  assert.ok(res.errors[0].message.includes(types));
  assert.equal(fs.existsSync(w.out), false);
  assert.deepEqual(fs.readdirSync(path.dirname(w.out)).filter((f) => f.endsWith('.tmp')), []);
});

test('assemble: round trip of the golden fixture from a templatized library', (t) => {
  // Split the golden into library files and put the slots back where their values appear.
  const templatize = (obj) => JSON.parse(JSON.stringify(obj)
    .replaceAll('"gh pr create --fill"', '"{{open_pr_command}}"')
    .replaceAll('"npm run lint"', '"{{lint_command}}"')
    .replaceAll('"npm test"', '"{{test_command}}"'));
  const library = { tasks: {}, nodes: {} };
  for (const [id, def] of Object.entries(GOLDEN.tasks)) library.tasks[id] = templatize(def);
  for (const n of GOLDEN.nodes) library.nodes[n.id] = n;
  const assembly = {
    schema_version: GOLDEN.schema_version,
    name: GOLDEN.name,
    slots: Object.fromEntries(Object.keys(SLOTS).map((k) => [k, `The ${k} slot.`])),
    caps: GOLDEN.caps,
    nodes: GOLDEN.nodes.map((n) => n.id),
    edges: GOLDEN.edges,
  };
  assert.ok(JSON.stringify(library).includes('{{test_command}}') && JSON.stringify(library).includes('{{open_pr_command}}'));
  const w = workspace(t, { assembly, library });
  fs.writeFileSync(w.slots, JSON.stringify(SLOTS));
  const res = call(w);
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.deepEqual(readJson(w.out), GOLDEN);
  assert.deepEqual(res.summary, run().summary);
  assert.deepEqual(readJson(w.types), { phase: PHASE });
});

// ---------------------------------------------------------------------------
// Assemble: CLI
// ---------------------------------------------------------------------------

test('CLI assemble: writes the definition and the types, then the output validates', (t) => {
  const w = workspace(t);
  const r = asmCli(w);
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.ok, true);
  assert.equal(r.out.command, 'assemble');
  assert.equal(r.out.file, w.out);
  assert.deepEqual(r.out.types, { file: w.types, written: ['phase'] });
  assert.equal(r.out.summary.nodes, 4);
  assert.deepEqual(r.out.warnings, []);
  const v = cli(['validate', w.out, '--types', w.types, '--no-probe']);
  assert.equal(v.status, 0, JSON.stringify(v.out.errors));
  assert.equal(v.out.accepted, true);
});

test('CLI assemble: --out and --types default to .harness/ under the cwd', (t) => {
  const w = workspace(t);
  const cwd = path.join(w.dir, 'proj');
  fs.mkdirSync(cwd);
  const r = cli(['assemble', w.assembly, '--slots', w.slots, '--library', w.library], { cwd });
  assert.equal(r.status, 0, JSON.stringify(r.out));
  assert.equal(r.out.file, path.join('.harness', 'graph.json'));
  assert.ok(fs.existsSync(path.join(cwd, '.harness', 'graph.json')));
  assert.ok(fs.existsSync(path.join(cwd, '.harness', 'types.json')));
  assert.equal(cli(['validate', '.harness/graph.json', '--no-probe'], { cwd }).status, 0);
});

test('CLI assemble: --plugin-types selects the plugin catalog', (t) => {
  const w = workspace(t);
  const plugin = writeJson(path.join(w.dir, 'plugin-types.json'), SHIPPED);
  assert.equal(asmCli(w, ['--plugin-types', plugin]).status, 0);
  // without the parameterized phase entry nothing is instantiated, and the phase field dangles
  const noPhase = writeJson(path.join(w.dir, 'plugin-no-phase.json'), { current_ticket: SHIPPED.current_ticket });
  fs.rmSync(w.out);
  fs.rmSync(w.types);
  const rej = asmCli(w, ['--plugin-types', noPhase]);
  assert.equal(rej.status, 1);
  assert.ok(rej.out.errors.some((e) => e.code === 'TYPE_DANGLING'));
  nothingWritten(w);
});

test('CLI assemble: usage, input, rejection, and write failures have distinct exit codes', (t) => {
  const w = workspace(t);
  assert.equal(cli(['assemble']).status, 2);
  assert.equal(cli(['assemble', w.assembly]).status, 2, '--slots is required');
  assert.equal(cli(['assemble', w.assembly, '--slots']).status, 2);
  assert.equal(cli(['assemble', w.assembly, '--slots', w.slots, '--no-probe']).status, 2, 'validate flags do not apply to assemble');
  assert.equal(cli(['assemble', w.assembly, '--slots', w.slots, '--config', 'c.json']).status, 2);
  assert.equal(cli(['assemble', w.assembly, 'extra.json', '--slots', w.slots]).status, 2);
  const noAssembly = cli(['assemble', path.join(w.dir, 'missing.json'), '--slots', w.slots]);
  assert.equal(noAssembly.status, 3);
  assert.equal(noAssembly.out.errors[0].code, 'INPUT_UNREADABLE');
  const noSlots = cli(['assemble', w.assembly, '--slots', path.join(w.dir, 'missing.json')]);
  assert.equal(noSlots.status, 3);
  const badSlots = writeJson(path.join(w.dir, 'bad-slots.json'), '{nope');
  assert.equal(cli(['assemble', w.assembly, '--slots', badSlots]).out.errors[0].code, 'INPUT_INVALID_JSON');
  const arrSlots = writeJson(path.join(w.dir, 'arr-slots.json'), '[1]');
  assert.equal(cli(['assemble', w.assembly, '--slots', arrSlots]).status, 3);
  const badAssembly = writeJson(path.join(w.dir, 'bad-assembly.json'), '{nope');
  assert.equal(cli(['assemble', badAssembly, '--slots', w.slots]).status, 3);
  // an unfilled slot: exit 1, nothing written
  writeJson(w.slots, { phase_values: ['feat', 'maintenance'] });
  const unfilled = asmCli(w);
  assert.equal(unfilled.status, 1);
  assert.equal(unfilled.out.ok, false);
  assert.deepEqual(unfilled.out.errors.map((e) => e.code), ['SLOT_UNFILLED']);
  assert.ok(unfilled.out.errors[0].invariant);
  nothingWritten(w);
});

// ---------------------------------------------------------------------------
// Shipped template library
// ---------------------------------------------------------------------------

const SHIPPED_LIBRARY = path.join(HERE, '..', 'skills', 'graph-init', 'templates');
const SHIPPED_ASSEMBLY = path.join(SHIPPED_LIBRARY, 'graphs', 'coding-factory.json');

test('shipped library: assembles into the golden coding-factory and the result validates', (t) => {
  const dir = tmp(t);
  const out = path.join(dir, '.harness', 'graph.json');
  const types = path.join(dir, '.harness', 'types.json');
  const asm = cli([
    'assemble', SHIPPED_ASSEMBLY,
    '--slots', path.join(FIXTURES, 'coding-factory.slots.json'),
    '--library', SHIPPED_LIBRARY, '--out', out, '--types', types,
  ]);
  assert.equal(asm.status, 0, JSON.stringify(asm.out));
  assert.equal(asm.out.ok, true);
  assert.deepEqual(asm.out.warnings, [], 'no unused assembly tasks or other warnings');
  // library <-> golden drift guard
  assert.deepEqual(readJson(out), GOLDEN);
  // the assembled project definition is accepted without any access to the library
  const v = cli(['validate', out, '--types', types, '--no-probe']);
  assert.equal(v.status, 0, JSON.stringify(v.out.errors));
  assert.equal(v.out.accepted, true);
  assert.deepEqual(v.out.errors, []);
  assert.deepEqual(v.out.warnings, []);
  assert.equal(v.out.summary.nodes, 11);
  assert.equal(v.out.summary.edges, 20);
  assert.equal(v.out.summary.tasks, 19);
  // the instantiated phase type landed in the project catalog, reserved value included
  const catalog = readJson(types);
  assert.ok(catalog.phase.values.includes('maintenance'));
  assert.deepEqual(catalog.phase.values, SLOTS.phase_values);
  assert.deepEqual(catalog, { phase: PHASE });
});

// ---------------------------------------------------------------------------
// Linked-worktree guard (assemble CLI)
// ---------------------------------------------------------------------------

function gitRepoWithWorktree(t) {
  const dir = tmp(t);
  const main = path.join(dir, 'mainco');
  const wt = path.join(dir, 'wt');
  fs.mkdirSync(main, { recursive: true });
  const git = (args, cwd) => {
    const r = spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
  };
  git(['init', '-q', '-b', 'main'], main);
  git(['commit', '--allow-empty', '-q', '-m', 'init'], main);
  git(['worktree', 'add', '-q', wt, '-b', 'unit'], main);
  return { main, wt };
}

test('assemble cli: refuses an --out inside a linked worktree with IN_WORKTREE, writes nothing', (t) => {
  const w = workspace(t);
  const { wt } = gitRepoWithWorktree(t);
  const out = path.join(wt, '.harness', 'graph.json');
  const types = path.join(wt, '.harness', 'types.json');
  const r = cli(['assemble', w.assembly, '--slots', w.slots, '--library', w.library, '--out', out, '--types', types]);
  assert.equal(r.status, 6);
  assert.equal(r.out.ok, false);
  assert.equal(r.out.errors[0].code, 'IN_WORKTREE');
  assert.ok(r.out.errors[0].invariant);
  assert.equal(fs.existsSync(path.join(wt, '.harness')), false, 'nothing written in the worktree');
});

test('assemble cli: succeeds with an --out in the main checkout of a repo that has worktrees', (t) => {
  const w = workspace(t);
  const { main } = gitRepoWithWorktree(t);
  const out = path.join(main, '.harness', 'graph.json');
  const types = path.join(main, '.harness', 'types.json');
  const r = cli(['assemble', w.assembly, '--slots', w.slots, '--library', w.library, '--out', out, '--types', types]);
  assert.equal(r.status, 0, JSON.stringify(r.out.errors));
  assert.equal(fs.existsSync(out), true);
});
