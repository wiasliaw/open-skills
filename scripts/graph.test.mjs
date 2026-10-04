import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDefinition, toolGate, programsOf, tokenize } from './graph.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'graph.mjs');

// ---------------------------------------------------------------------------
// Fixture: a small but complete definition (feat / fix / chore / maintenance)
// ---------------------------------------------------------------------------

function work(id, outcomes, extra = {}) {
  return {
    id,
    type: 'llm',
    purpose: `Do the ${id} work.`,
    reads: ['request'],
    produces: [`${id}-output`],
    verification: `${id} output is complete`,
    mounts: { skills: [], commands: [], mcp: [] },
    restrictions: ['MUST NOT write outside its stage directory'],
    human_approval: false,
    outcomes,
    ...extra,
  };
}

function base() {
  return {
    schema_version: '1.0.0',
    name: 'test-factory',
    caps: { failure: 2, advisor_consultations: 2, edge_revisit: 3 },
    phase: {
      feat: { meaning: 'new capability', path: ['research', 'spec', 'ticket', 'build', 'review', 'wrap', 'ship'] },
      fix: { meaning: 'existing contract covers it', path: ['research', 'ticket', 'build', 'review', 'wrap', 'ship'] },
      chore: { meaning: 'housekeeping', path: ['research', 'build', 'review', 'wrap', 'ship'] },
      maintenance: {
        meaning: 'apply pending deltas to current truth',
        path: ['research', 'build', 'review', 'wrap', 'ship'],
        restriction_overrides: { wrap: ['MAY write current-truth documents'] },
      },
    },
    state_fields: {
      contract_ref: { type: 'object', nullable: true, phases: ['feat', 'fix'], default: null },
      tickets: { type: 'list', node: 'ticket', default: [] },
      current_ticket: { type: 'string', nullable: true, node: 'ticket', default: null },
      ticket_test: { type: 'string', nullable: true, node: 'ticket', executes: 'build', default: null },
      round: { type: 'integer', node: 'build', default: 0 },
      verdict_kind: { type: 'string', values: ['minor', 'major'], node: 'build', default: 'minor' },
    },
    skill_state_needs: { 'open-skills:ticket': ['tickets'] },
    nodes: [
      { id: 'trigger', type: 'entry', purpose: 'Create the work unit.' },
      work('research', ['proposal-produced'], { human_approval: true }),
      work('spec', ['spec-ready']),
      work('ticket', ['tickets-produced', 'spec-contradiction'], {
        mounts: { skills: ['open-skills:ticket'], commands: [], mcp: [] },
        reads: ['request', 'state:tickets'],
      }),
      work('build', ['ready-for-review', 'ticket-invalid'], {
        verification: { criteria: ['tests pass'], commands: ['npm test -- csv'] },
        mounts: { skills: ['open-skills:use-worktree'], commands: [{ base: 'npm test', args: '-- <pattern>' }, 'npm ci'], mcp: [] },
        pre_steps: ['npm ci'],
      }),
      work('review', ['pass', 'fail'], { type: 'validator' }),
      work('wrap', ['handed-off'], {
        mounts: { skills: ['open-skills:wrap'], commands: ['gh pr create'], mcp: [] },
      }),
      { id: 'ship', type: 'terminal', terminal_kind: 'success', purpose: 'Delivered.', steps: [] },
      { id: 'end', type: 'terminal', terminal_kind: 'abandonment', purpose: 'Abandoned.', steps: [] },
    ],
    edges: [
      { from: 'trigger', to: 'research', guard: [] },
      { from: 'research', outcome: 'proposal-produced', to: 'spec', guard: [{ field: 'phase', op: 'eq', value: 'feat' }] },
      { from: 'research', outcome: 'proposal-produced', to: 'ticket', guard: [{ field: 'phase', op: 'eq', value: 'fix' }] },
      { from: 'research', outcome: 'proposal-produced', to: 'build', guard: [{ field: 'phase', op: 'in', value: ['chore', 'maintenance'] }] },
      { from: 'spec', outcome: 'spec-ready', to: 'ticket', guard: [] },
      { from: 'ticket', outcome: 'tickets-produced', to: 'build', guard: [] },
      { from: 'ticket', outcome: 'spec-contradiction', to: 'spec', guard: [] },
      { from: 'build', outcome: 'ready-for-review', to: 'review', guard: [] },
      { from: 'build', outcome: 'ticket-invalid', to: 'ticket', guard: [] },
      { from: 'review', outcome: 'pass', to: 'wrap', guard: [] },
      { from: 'review', outcome: 'fail', to: 'build', guard: [] },
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [] },
    ],
  };
}

const node = (d, id) => d.nodes.find((n) => n.id === id);
const run = (mutate) => {
  const d = base();
  mutate?.(d);
  return validateDefinition(d);
};
const codes = (mutate) => run(mutate).errors.map((e) => e.code);
const find = (res, code) => res.errors.filter((e) => e.code === code);
function assertRejects(mutate, code, check) {
  const res = run(mutate);
  const hits = find(res, code);
  assert.ok(hits.length > 0, `expected ${code}, got ${JSON.stringify(res.errors.map((e) => e.code))}`);
  for (const h of hits) assert.ok(h.invariant && h.message, 'error names invariant and message');
  check?.(hits, res);
  return res;
}

// ---------------------------------------------------------------------------
// Accept
// ---------------------------------------------------------------------------

test('accepts a complete definition and identifies returning edges', () => {
  const res = run();
  assert.deepEqual(res.errors, []);
  assert.equal(res.summary.first_node, 'research');
  assert.equal(res.summary.close_out_node, 'wrap');
  assert.equal(res.summary.caps.total_failure, 4);
  const labels = res.returning_edges.map((r) => `${r.from}>${r.to}`).sort();
  assert.deepEqual(labels, ['build>ticket', 'review>build', 'ticket>spec']);
  const rb = res.returning_edges.find((r) => r.from === 'review');
  assert.deepEqual(rb.phases.sort(), ['chore', 'feat', 'fix', 'maintenance']);
});

test('commands are collected for the tool gate (mounts, families, steps)', () => {
  const res = run();
  const cmds = res.commands.map((c) => `${c.node}:${c.source}:${c.command}`);
  assert.ok(cmds.includes('build:mount:npm test'));
  assert.ok(cmds.includes('build:pre-step:npm ci'));
  assert.ok(cmds.includes('wrap:mount:gh pr create'));
});

// ---------------------------------------------------------------------------
// Document, caps
// ---------------------------------------------------------------------------

test('rejects a non-object definition', () => {
  assert.equal(validateDefinition([]).errors[0].code, 'DEF_NOT_OBJECT');
  assert.equal(validateDefinition(null).errors[0].code, 'DEF_NOT_OBJECT');
});

test('rejects missing sections and unsupported schema version', () => {
  assertRejects((d) => delete d.nodes, 'DEF_FIELD_MISSING');
  assertRejects((d) => delete d.state_fields, 'DEF_FIELD_MISSING');
  assertRejects((d) => { d.schema_version = '2.0.0'; }, 'SCHEMA_VERSION_UNSUPPORTED');
});

test('rejects missing or invalid caps', () => {
  assertRejects((d) => delete d.caps.failure, 'CAP_MISSING', (h) => assert.equal(h[0].cap, 'failure'));
  assertRejects((d) => delete d.caps.advisor_consultations, 'CAP_MISSING');
  assertRejects((d) => { d.caps.edge_revisit = 0; }, 'CAP_INVALID');
  assertRejects((d) => { d.caps.failure = 'two'; }, 'CAP_INVALID');
  assertRejects((d) => { d.caps.total_failure = 1; }, 'CAP_INVALID');
  assert.deepEqual(codes((d) => { d.caps.total_failure = 7; }), []);
});

test('uncapped loop is rejected and the returning edge is named', () => {
  assertRejects((d) => delete d.caps.edge_revisit, 'LOOP_NO_CAP', (hits) => {
    const names = hits.map((h) => `${h.edge.from}>${h.edge.to}`);
    assert.ok(names.includes('review>build'));
    assert.ok(hits[0].cycle.length >= 2);
  });
});

// ---------------------------------------------------------------------------
// Loops and topology
// ---------------------------------------------------------------------------

test('loop without an exit is rejected naming the cycle', () => {
  const res = assertRejects((d) => {
    d.edges.find((e) => e.from === 'ticket' && e.outcome === 'tickets-produced').to = 'spec';
  }, 'LOOP_NO_EXIT');
  assert.deepEqual(find(res, 'LOOP_NO_EXIT')[0].cycle, ['spec', 'ticket']);
});

test('cycle with no returning edge is rejected as uncounted', () => {
  assertRejects((d) => {
    d.nodes.push(work('alpha', ['again', 'done']), work('beta', ['again', 'done']));
    d.edges.push(
      { from: 'alpha', outcome: 'again', to: 'beta', guard: [] },
      { from: 'alpha', outcome: 'done', to: 'wrap', guard: [] },
      { from: 'beta', outcome: 'again', to: 'alpha', guard: [] },
      { from: 'beta', outcome: 'done', to: 'wrap', guard: [] },
    );
  }, 'LOOP_UNCOUNTED', (hits) => assert.ok(hits[0].cycle.includes('alpha') && hits[0].cycle.includes('beta')));
});

test('unreachable node is rejected', () => {
  assertRejects((d) => {
    d.nodes.push(work('orphan', ['done']));
    d.edges.push({ from: 'orphan', outcome: 'done', to: 'wrap', guard: [] });
  }, 'NODE_UNREACHABLE', (hits) => assert.equal(hits[0].node, 'orphan'));
});

// ---------------------------------------------------------------------------
// Terminals
// ---------------------------------------------------------------------------

test('terminal cardinality and kind', () => {
  assertRejects((d) => { node(d, 'end').terminal_kind = 'success'; }, 'SUCCESS_TERMINAL_COUNT');
  assertRejects((d) => { node(d, 'end').terminal_kind = 'success'; }, 'ABANDONMENT_TERMINAL_COUNT');
  assertRejects((d) => { d.nodes = d.nodes.filter((n) => n.id !== 'end'); }, 'ABANDONMENT_TERMINAL_COUNT');
  assertRejects((d) => { delete node(d, 'ship').terminal_kind; }, 'TERMINAL_KIND_INVALID');
});

test('terminals declare no outcomes, verification, or outgoing edges, and declare steps', () => {
  assertRejects((d) => { node(d, 'ship').outcomes = ['x']; }, 'TERMINAL_DECLARES_FORBIDDEN');
  assertRejects((d) => { node(d, 'ship').verification = 'checks'; }, 'TERMINAL_DECLARES_FORBIDDEN');
  assertRejects((d) => { delete node(d, 'ship').steps; }, 'TERMINAL_STEPS_MISSING');
  assertRejects((d) => d.edges.push({ from: 'ship', outcome: 'x', to: 'wrap', guard: [] }), 'EDGE_FROM_TERMINAL');
});

test('abandonment terminal is disposition-only', () => {
  assertRejects((d) => d.edges.push({ from: 'build', outcome: 'ticket-invalid', to: 'end', guard: [{ field: 'round', op: 'gt', value: 1 }] }), 'EDGE_TO_ABANDONMENT');
});

test('terminal step commands count for the tool gate', () => {
  const res = run((d) => { node(d, 'ship').steps = ['node archive.js']; });
  assert.ok(res.commands.some((c) => c.node === 'ship' && c.source === 'step'));
});

// ---------------------------------------------------------------------------
// Entry node
// ---------------------------------------------------------------------------

test('entry node invariants', () => {
  assertRejects((d) => d.nodes.push({ id: 'trigger-two', type: 'entry', purpose: 'x' }), 'ENTRY_COUNT');
  assertRejects((d) => { d.edges[0].to = 'build'; }, 'ENTRY_ROUTE_INVALID');
  assertRejects((d) => { d.edges[0].guard = [{ field: 'phase', op: 'eq', value: 'feat' }]; }, 'ENTRY_ROUTE_INVALID');
  assertRejects((d) => d.edges.push({ from: 'trigger', to: 'research', guard: [] }), 'ENTRY_ROUTE_INVALID');
  assertRejects((d) => { node(d, 'trigger').outcomes = ['go']; }, 'ENTRY_DECLARES_FORBIDDEN');
  assertRejects((d) => d.edges.push({ from: 'build', outcome: 'ticket-invalid', to: 'trigger', guard: [] }), 'EDGE_TO_ENTRY');
});

// ---------------------------------------------------------------------------
// Edge coverage and guards
// ---------------------------------------------------------------------------

test('every routable outcome needs an edge', () => {
  assertRejects((d) => { d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'fail')); }, 'OUTCOME_UNCOVERED', (hits) => {
    assert.equal(hits[0].node, 'review');
    assert.equal(hits[0].outcome, 'fail');
  });
});

test('edge outcome must be declared by its source', () => {
  assertRejects((d) => { d.edges[5].outcome = 'made-up'; }, 'EDGE_OUTCOME_UNDECLARED', (hits) => assert.equal(hits[0].outcome, 'made-up'));
  assertRejects((d) => { delete d.edges[5].outcome; }, 'EDGE_OUTCOME_MISSING');
  assertRejects((d) => { d.edges[5].to = 'nowhere'; }, 'EDGE_UNKNOWN_NODE');
});

test('overlapping guards are rejected naming outcome and both edges', () => {
  assertRejects((d) => d.edges.push({ from: 'research', outcome: 'proposal-produced', to: 'build', guard: [{ field: 'phase', op: 'ne', value: 'fix' }] }), 'GUARD_OVERLAP', (hits) => {
    assert.equal(hits[0].node, 'research');
    assert.equal(hits[0].outcome, 'proposal-produced');
    assert.equal(hits[0].edges.length, 2);
    assert.ok(hits[0].witness);
  });
  // two unconditional edges for one outcome
  assertRejects((d) => d.edges.push({ from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [] }), 'GUARD_OVERLAP');
});

test('non-exhaustive guards are rejected with a witness state', () => {
  assertRejects((d) => { d.edges = d.edges.filter((e) => !(e.from === 'research' && e.to === 'build')); }, 'GUARD_NOT_EXHAUSTIVE', (hits) => {
    assert.ok(['chore', 'maintenance'].includes(hits[0].witness.phase));
  });
});

test('unconditional catch-all after specific guards is legal', () => {
  const res = run((d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'research' && e.to === 'build'));
    d.edges.push({ from: 'research', outcome: 'proposal-produced', to: 'build', guard: [{ field: 'phase', op: 'not-in', value: ['feat', 'fix'] }] });
  });
  assert.deepEqual(res.errors, []);
});

function reviewSplit(guardA, guardB) {
  return (d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'pass'));
    d.edges.push(
      { from: 'review', outcome: 'pass', to: 'wrap', guard: guardA },
      { from: 'review', outcome: 'pass', to: 'build', guard: guardB },
    );
  };
}

test('numeric operators: exact boundaries decide exclusivity and exhaustiveness', () => {
  const g = (op, value) => [{ field: 'round', op, value }];
  // review is after build on every path, so round (owned by build) is applicable there
  assert.deepEqual(codes(reviewSplit(g('gt', 2), g('lte', 2))), []);
  assert.deepEqual(codes(reviewSplit(g('lt', 3), g('gte', 3))), []);
  assert.ok(codes(reviewSplit(g('gt', 2), g('gte', 2))).includes('GUARD_OVERLAP'));
  assert.ok(codes(reviewSplit(g('gt', 2), g('lt', 2))).includes('GUARD_NOT_EXHAUSTIVE'));
  assert.deepEqual(codes(reviewSplit(g('eq', 0), g('ne', 0))), []);
  assert.deepEqual(codes(reviewSplit(g('in', [1, 2]), g('not-in', [1, 2]))), []);
  assert.ok(codes(reviewSplit(g('in', [1, 2]), g('in', [2, 3]))).includes('GUARD_OVERLAP'));
});

test('list operators: empty, not-empty, and count comparisons', () => {
  const g = (op, value) => [{ field: 'tickets', op, ...(value === undefined ? {} : { value }) }];
  assert.deepEqual(codes(reviewSplit(g('empty'), g('not-empty'))), []);
  assert.ok(codes(reviewSplit(g('empty'), g('lt', 1))).includes('GUARD_OVERLAP'));
  assert.ok(codes(reviewSplit(g('gte', 2), g('lt', 1))).includes('GUARD_NOT_EXHAUSTIVE'));
  assert.deepEqual(codes(reviewSplit(g('lt', 2), g('gte', 2))), []);
  assert.deepEqual(codes(reviewSplit(g('eq', 0), g('gt', 0))), []);
});

test('multi-field conjunctions are decided jointly', () => {
  const both = (a, b) => [
    { field: 'round', op: a[0], value: a[1] },
    { field: 'verdict_kind', op: 'eq', value: b },
  ];
  const d1 = reviewSplit(
    both(['gt', 1], 'major'),
    [{ field: 'round', op: 'lte', value: 1 }],
  );
  // (round>1 & major) and (round<=1) leave (round>1 & minor) uncovered
  assert.ok(codes(d1).includes('GUARD_NOT_EXHAUSTIVE'));
  const d2 = (d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'pass'));
    d.edges.push(
      { from: 'review', outcome: 'pass', to: 'wrap', guard: [{ field: 'verdict_kind', op: 'eq', value: 'major' }] },
      { from: 'review', outcome: 'pass', to: 'build', guard: [{ field: 'verdict_kind', op: 'eq', value: 'minor' }, { field: 'round', op: 'lt', value: 5 }] },
      { from: 'review', outcome: 'pass', to: 'build', guard: [{ field: 'verdict_kind', op: 'eq', value: 'minor' }, { field: 'round', op: 'gte', value: 5 }] },
    );
  };
  assert.deepEqual(codes(d2), []);
});

test('undecidable guards are rejected', () => {
  const bad = (guard) => assertRejects((d) => { d.edges[5].guard = guard; }, 'GUARD_UNDECIDABLE');
  bad('spec-contradiction'); // prose
  bad([{ field: 'phase', op: 'contains', value: 'x' }]); // unknown operator
  bad([{ field: 'nope', op: 'eq', value: 1 }]); // undeclared field
  bad([{ field: 'outcome', op: 'eq', value: 'x' }]); // outcome belongs to the edge
  bad([{ field: 'phase', op: 'eq', value: 'unknown-phase' }]); // value outside vocabulary
  bad([{ field: 'phase', op: 'empty' }]); // list operator on a scalar
  bad([{ field: 'phase', op: 'lt', value: 3 }]); // ordering on enum
  bad([{ field: 'phase', op: 'in', value: [] }]);
  bad([{ field: 'phase', op: 'eq' }]); // missing value
  assertRejects((d) => { delete d.edges[5].guard; }, 'GUARD_UNDECIDABLE');
  assertRejects((d) => { d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'pass')); d.edges.push({ from: 'review', outcome: 'pass', to: 'wrap', guard: [{ field: 'verdict_kind', op: 'eq', value: 'huge' }] }); }, 'GUARD_UNDECIDABLE');
  assertRejects((d) => { d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'pass')); d.edges.push({ from: 'review', outcome: 'pass', to: 'wrap', guard: [{ field: 'tickets', op: 'in', value: [1] }] }); }, 'GUARD_UNDECIDABLE');
});

test('guard field must be applicable at the edge source', () => {
  // tickets is owned by `ticket`, which research precedes on every path
  assertRejects((d) => {
    d.edges.find((e) => e.to === 'build' && e.from === 'research').guard = [{ field: 'tickets', op: 'empty' }];
  }, 'GUARD_FIELD_INAPPLICABLE', (hits) => assert.equal(hits[0].edge.from, 'research'));
  // contract_ref is phase-bound to feat/fix; wrap lies on their paths so it is applicable there
  assert.deepEqual(codes((d) => {
    d.edges = d.edges.filter((e) => e.from !== 'wrap');
    d.edges.push(
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [{ field: 'contract_ref', op: 'eq', value: null }] },
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [{ field: 'contract_ref', op: 'ne', value: null }] },
    );
  }), []);
});

test('node-bound field is applicable at owner and later nodes only', () => {
  // round is owned by build: applicable at build itself
  assert.deepEqual(codes((d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'build' && e.outcome === 'ready-for-review'));
    d.edges.push(
      { from: 'build', outcome: 'ready-for-review', to: 'review', guard: [{ field: 'round', op: 'gte', value: 0 }] },
      { from: 'build', outcome: 'ready-for-review', to: 'review', guard: [{ field: 'round', op: 'lt', value: 0 }] },
    );
  }), []);
  // but not at ticket, which precedes build
  assertRejects((d) => {
    d.edges.find((e) => e.from === 'ticket' && e.outcome === 'tickets-produced').guard = [{ field: 'round', op: 'gte', value: 0 }];
  }, 'GUARD_FIELD_INAPPLICABLE');
});

test('oversized guard sets are rejected as too complex', () => {
  const res = run((d) => {
    d.state_fields.a = { type: 'integer', node: 'build', default: 0 };
    d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'pass'));
    const guard = [];
    for (let i = 0; i < 12; i++) {
      d.state_fields[`f${i}`] = { type: 'integer', node: 'build', default: 0 };
      guard.push({ field: `f${i}`, op: 'in', value: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    }
    d.edges.push({ from: 'review', outcome: 'pass', to: 'wrap', guard });
  });
  assert.ok(find(res, 'GUARD_TOO_COMPLEX').length === 1);
});

// ---------------------------------------------------------------------------
// Forbidden constructs
// ---------------------------------------------------------------------------

test('human-gate, advisor, blocked, and escalation constructs are rejected', () => {
  assertRejects((d) => { node(d, 'spec').type = 'human-gate'; }, 'FORBIDDEN_NODE');
  assertRejects((d) => d.nodes.push(work('advisor', ['advice'])), 'FORBIDDEN_NODE');
  assertRejects((d) => d.nodes.push(work('escalation', ['x'])), 'FORBIDDEN_NODE');
  assertRejects((d) => { node(d, 'build').outcomes.push('blocked'); }, 'OUTCOME_INVALID');
  assertRejects((d) => d.edges.push({ from: 'build', outcome: 'blocked', to: 'review', guard: [] }), 'EDGE_FORBIDDEN');
  assertRejects((d) => d.edges.push({ from: 'build', outcome: 'ticket-invalid', to: 'human-gate', guard: [] }), 'EDGE_FORBIDDEN');
});

// ---------------------------------------------------------------------------
// Close-out
// ---------------------------------------------------------------------------

test('exactly one node mounts the close-out skill', () => {
  assertRejects((d) => { node(d, 'wrap').mounts.skills = []; }, 'CLOSE_OUT_COUNT', (h) => assert.deepEqual(h[0].nodes, []));
  assertRejects((d) => { node(d, 'build').mounts.skills.push('open-skills:wrap'); }, 'CLOSE_OUT_COUNT', (h) => assert.deepEqual(h[0].nodes.sort(), ['build', 'wrap']));
});

// ---------------------------------------------------------------------------
// Phases and paths
// ---------------------------------------------------------------------------

test('maintenance phase is required', () => {
  assertRejects((d) => delete d.phase.maintenance, 'PHASE_MAINTENANCE_MISSING');
});

test('phase path invariants', () => {
  assertRejects((d) => { d.phase.fix.path[1] = 'ghost'; }, 'PATH_UNKNOWN_NODE', (h) => assert.equal(h[0].node, 'ghost'));
  assertRejects((d) => { d.phase.fix.path.push('build'); }, 'PATH_DUPLICATE_NODE');
  assertRejects((d) => { d.phase.fix.path.pop(); }, 'PATH_NOT_ENDING_SUCCESS');
  assertRejects((d) => { d.phase.chore.path = ['research', 'build', 'review', 'ship']; }, 'PATH_NO_CLOSE_OUT', (h) => assert.equal(h[0].phase, 'chore'));
  assertRejects((d) => { d.phase.chore.path = ['research', 'build', 'review', 'ship', 'wrap']; }, 'PATH_NOT_ENDING_SUCCESS');
  assertRejects((d) => { d.phase.chore.path = ['build', 'review', 'wrap', 'ship']; }, 'PATH_FIRST_NODE_MISMATCH');
  assertRejects((d) => { d.phase.chore.path = []; }, 'PHASE_INVALID');
  assertRejects((d) => { delete d.phase.chore.meaning; }, 'PHASE_INVALID');
});

test('shared first node carries the human approval', () => {
  assertRejects((d) => { node(d, 'research').human_approval = false; }, 'FIRST_NODE_NO_APPROVAL', (h) => assert.equal(h[0].node, 'research'));
});

test('path steps must be realizable through declared edges for that phase', () => {
  // no edge build -> review at all
  assertRejects((d) => { d.edges = d.edges.filter((e) => !(e.from === 'build' && e.to === 'review')); }, 'PATH_NOT_REALIZABLE', (h) => {
    assert.ok(h.every((x) => x.from === 'build' && x.to === 'review'));
    assert.equal(h.length, 4);
  });
});

test('phase-split edges are realizable for each phase', () => {
  assert.deepEqual(codes((d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'build' && e.to === 'review'));
    d.edges.push(
      { from: 'build', outcome: 'ready-for-review', to: 'review', guard: [{ field: 'phase', op: 'eq', value: 'feat' }] },
      { from: 'build', outcome: 'ready-for-review', to: 'review', guard: [{ field: 'phase', op: 'ne', value: 'feat' }] },
    );
  }), []);
});

test('a guard that excludes a phase makes that phase path unrealizable', () => {
  const res = run((d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'wrap'));
    d.edges.push(
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [{ field: 'phase', op: 'eq', value: 'feat' }] },
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [{ field: 'phase', op: 'eq', value: 'fix' }] },
      { from: 'wrap', outcome: 'handed-off', to: 'ship', guard: [{ field: 'phase', op: 'eq', value: 'chore' }] },
    );
  });
  // maintenance is uncovered: not exhaustive, and its path hop wrap->ship cannot fire
  assert.ok(find(res, 'GUARD_NOT_EXHAUSTIVE').length === 1);
  const unreal = find(res, 'PATH_NOT_REALIZABLE');
  assert.deepEqual(unreal.map((u) => u.phase), ['maintenance']);
});

test('restriction overrides must name nodes on the phase path', () => {
  assertRejects((d) => { d.phase.maintenance.restriction_overrides = { spec: ['x'] }; }, 'PHASE_OVERRIDE_INVALID');
  assertRejects((d) => { d.phase.maintenance.restriction_overrides = { wrap: 'x' }; }, 'PHASE_OVERRIDE_INVALID');
});

// ---------------------------------------------------------------------------
// State fields
// ---------------------------------------------------------------------------

test('state field declaration invariants', () => {
  assertRejects((d) => { d.state_fields.phase = { type: 'string', node: 'research', default: 'x' }; }, 'STATE_FIELD_CORE_COLLISION');
  assertRejects((d) => { delete d.state_fields.round.default; }, 'STATE_FIELD_INVALID');
  assertRejects((d) => { d.state_fields.round.default = 'zero'; }, 'STATE_FIELD_INVALID');
  assertRejects((d) => { d.state_fields.verdict_kind.default = 'huge'; }, 'STATE_FIELD_INVALID');
  assertRejects((d) => { d.state_fields.round.type = 'bignum'; }, 'STATE_FIELD_INVALID');
  assertRejects((d) => { d.state_fields.current_ticket.default = null; d.state_fields.current_ticket.nullable = false; }, 'STATE_FIELD_INVALID');
  assertRejects((d) => { d.state_fields.round.phases = ['feat']; }, 'STATE_FIELD_APPLICABILITY_INVALID');
  assertRejects((d) => { delete d.state_fields.round.node; }, 'STATE_FIELD_APPLICABILITY_INVALID');
  assertRejects((d) => { d.state_fields.round.node = 'ghost'; }, 'STATE_FIELD_APPLICABILITY_INVALID');
  assertRejects((d) => { d.state_fields.round.node = 'ship'; }, 'STATE_FIELD_APPLICABILITY_INVALID');
  assertRejects((d) => { d.state_fields.contract_ref.phases = ['feat', 'ghost']; }, 'STATE_FIELD_APPLICABILITY_INVALID');
});

test('fields a node reads or a mounted skill needs must be declared and applicable', () => {
  assertRejects((d) => { node(d, 'spec').reads.push('state:nonexistent'); }, 'STATE_FIELD_UNDECLARED', (h) => {
    assert.equal(h[0].node, 'spec');
    assert.equal(h[0].field, 'nonexistent');
  });
  assertRejects((d) => { node(d, 'research').reads.push('state:tickets'); }, 'STATE_FIELD_INAPPLICABLE_AT_NODE');
  assertRejects((d) => { d.skill_state_needs['open-skills:ticket'].push('missing_field'); }, 'STATE_FIELD_UNDECLARED');
  assertRejects((d) => { delete d.state_fields.tickets; }, 'STATE_FIELD_UNDECLARED');
  // a node reading a field owned by an earlier node is fine
  assert.deepEqual(codes((d) => { node(d, 'review').reads.push('state:round'); }), []);
});

test('command-holding field names an executing node that mounts a family', () => {
  assertRejects((d) => { d.state_fields.ticket_test.executes = 'ghost'; }, 'STATE_FIELD_EXECUTOR_INVALID');
  assertRejects((d) => { d.state_fields.ticket_test.executes = 'review'; }, 'STATE_FIELD_EXECUTOR_INVALID');
  assertRejects((d) => { node(d, 'build').mounts.commands = ['npm ci']; node(d, 'build').verification = 'ok'; }, 'STATE_FIELD_EXECUTOR_INVALID');
});

// ---------------------------------------------------------------------------
// Mounts, commands, slots, node contract
// ---------------------------------------------------------------------------

test('verification commands must be covered by the node mounts', () => {
  assertRejects((d) => { node(d, 'build').verification = { criteria: 'x', commands: ['pytest'] }; }, 'VERIFICATION_COMMAND_UNMOUNTED', (h) => {
    assert.equal(h[0].node, 'build');
    assert.equal(h[0].command, 'pytest');
  });
  // family covers leading-argument prefix
  assert.deepEqual(codes((d) => { node(d, 'build').verification = { criteria: 'x', commands: ['npm test', 'npm test -- a b'] }; }), []);
  // a different subcommand is not covered
  assertRejects((d) => { node(d, 'build').verification = { criteria: 'x', commands: ['npm run lint'] }; }, 'VERIFICATION_COMMAND_UNMOUNTED');
  // a plain (non-family) mount covers only the exact command
  assertRejects((d) => {
    node(d, 'build').mounts.commands = ['npm test', { base: 'npm ci' }];
    node(d, 'build').verification = { criteria: 'x', commands: ['npm test -- csv'] };
  }, 'VERIFICATION_COMMAND_UNMOUNTED');
  // steps are not mounts for verification coverage
  assertRejects((d) => { node(d, 'build').verification = { criteria: 'x', commands: ['git status'] }; node(d, 'build').pre_steps = ['git status']; }, 'VERIFICATION_COMMAND_UNMOUNTED');
});

test('unfilled template slots are rejected wherever they appear', () => {
  assertRejects((d) => { node(d, 'wrap').mounts.commands.push('{{pr_command}}'); }, 'SLOT_UNFILLED', (h) => {
    assert.equal(h[0].slot, 'pr_command');
    assert.match(h[0].path, /nodes\[6\]\.mounts\.commands/);
  });
  assertRejects((d) => { node(d, 'build').mounts.commands.push({ base: '{{ test_command }}' }); }, 'SLOT_UNFILLED');
  assertRejects((d) => { node(d, 'build').pre_steps = ['{{install}}']; }, 'SLOT_UNFILLED');
});

test('deterministic and tool nodes report pass and mount their commands', () => {
  const det = (mut) => (d) => {
    d.nodes.push(work('lint', ['pass'], { type: 'deterministic', mounts: { skills: [], commands: ['npm run lint'], mcp: [] } }));
    mut?.(node(d, 'lint'));
    d.edges.push({ from: 'lint', outcome: 'pass', to: 'wrap', guard: [] });
    d.edges.push({ from: 'build', outcome: 'ready-for-review', to: 'lint', guard: [{ field: 'round', op: 'gt', value: 99 }] });
  };
  assert.ok(!codes(det()).includes('DETERMINISTIC_OUTCOME'));
  assertRejects(det((n) => { n.outcomes = ['pass', 'fail']; }), 'DETERMINISTIC_OUTCOME');
  assertRejects(det((n) => { n.mounts.commands = []; }), 'DETERMINISTIC_NO_COMMANDS');
});

test('node contract fields are required', () => {
  for (const f of ['reads', 'produces', 'restrictions', 'verification', 'mounts', 'human_approval', 'outcomes', 'purpose']) {
    assertRejects((d) => { delete node(d, 'spec')[f]; }, 'NODE_FIELD_MISSING', (h) => assert.equal(h[0].field ?? 'purpose', f));
  }
  assertRejects((d) => { node(d, 'spec').type = 'wizard'; }, 'NODE_TYPE_INVALID');
  assertRejects((d) => { node(d, 'spec').id = 'Spec_Node'; }, 'NODE_ID_INVALID');
  assertRejects((d) => d.nodes.push(work('spec', ['x'])), 'NODE_DUPLICATE_ID');
  assertRejects((d) => { node(d, 'spec').mounts.commands = [42]; }, 'MOUNT_INVALID');
  assertRejects((d) => { node(d, 'spec').human_approval = 'yes'; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'spec').outcomes = []; }, 'NODE_FIELD_INVALID');
});

test('re-entry rules reference declared, applicable list and progress fields', () => {
  const ok = (d) => {
    d.state_fields.done_count = { type: 'integer', node: 'ticket', default: 0 };
    node(d, 'build').re_entry = { list_field: 'tickets', order: 'declared', progress_field: 'done_count' };
  };
  assert.deepEqual(codes(ok), []);
  assertRejects((d) => { ok(d); node(d, 'build').re_entry.list_field = 'round'; }, 'REENTRY_INVALID');
  assertRejects((d) => { ok(d); node(d, 'build').re_entry.progress_field = 'ghost'; }, 'REENTRY_INVALID');
  assertRejects((d) => { ok(d); node(d, 'build').re_entry = { list_field: 'tickets' }; }, 'REENTRY_INVALID');
  assertRejects((d) => { ok(d); node(d, 'research').re_entry = { list_field: 'tickets', order: 'declared', progress_field: 'done_count' }; }, 'REENTRY_INVALID');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test('tokenize and programsOf', () => {
  assert.deepEqual(tokenize('npm test -- "a b"'), ['npm', 'test', '--', 'a b']);
  assert.deepEqual(programsOf('FOO=1 npm ci && cd x; echo hi | grep h'), ['npm', 'grep']);
  assert.deepEqual(programsOf('cd /tmp'), []);
});

// ---------------------------------------------------------------------------
// Tool gate
// ---------------------------------------------------------------------------

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-gate-'));
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

const cmds = (...list) => list.map((command) => ({ node: 'n', source: 'mount', command }));

test('tool gate passes existing tools and never runs a real effect', () => {
  const s = sandbox();
  s.good('npm');
  s.good('gh');
  const r = toolGate(cmds('npm test', 'gh pr create'), { PATH: s.bin });
  assert.equal(r.status, 'passed');
  assert.deepEqual(r.probes.map((p) => [p.program, p.via]), [['npm', '--version'], ['gh', '--version']]);
  assert.equal(fs.existsSync(s.effect), false);
});

test('tool gate falls back to --help and reports missing tools by name', () => {
  const s = sandbox();
  s.tool('oddtool', 'if [ "$1" = "--help" ]; then exit 0; fi\nexit 2');
  s.tool('brokentool', 'exit 1');
  const r = toolGate(
    [{ node: 'build', source: 'mount', command: 'oddtool run' }, { node: 'wrap', source: 'post-step', command: 'ghost deploy' }, { node: 'review', source: 'mount', command: 'brokentool x' }],
    { PATH: s.bin },
  );
  assert.equal(r.status, 'failed');
  const byTool = Object.fromEntries(r.errors.map((e) => [e.tool, e]));
  assert.equal(byTool.ghost.code, 'TOOL_MISSING');
  assert.deepEqual(byTool.ghost.nodes, ['wrap']);
  assert.equal(byTool.brokentool.code, 'TOOL_NOT_STARTABLE');
  assert.equal(r.probes.find((p) => p.program === 'oddtool').via, '--help');
  assert.equal(byTool.oddtool, undefined);
});

test('tool gate checks explicit paths for existence without invoking them', () => {
  const s = sandbox();
  const direct = s.tool('local.sh', `touch "${s.effect}"`);
  const r = toolGate(cmds(`${direct} --flag`, `${path.join(s.dir, 'nope.sh')} x`), { PATH: '' });
  assert.equal(fs.existsSync(s.effect), false);
  assert.equal(r.probes.find((p) => p.resolved === direct).via, 'exists');
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 'TOOL_MISSING');
});

test('tool gate probes every program of a compound command', () => {
  const s = sandbox();
  s.good('one');
  const r = toolGate(cmds('one a && two b'), { PATH: s.bin });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].tool, 'two');
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cli(args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  let out;
  assert.doesNotThrow(() => { out = JSON.parse(r.stdout); }, `stdout must be one JSON object, got: ${r.stdout}`);
  assert.equal(r.stdout.trim().split('\n').filter((l) => l.startsWith('{') && !l.startsWith('{ ')).length <= 1, true);
  return { status: r.status, out };
}

function writeDef(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-cli-'));
  const file = path.join(dir, 'graph.json');
  const d = base();
  mutate?.(d);
  fs.writeFileSync(file, JSON.stringify(d));
  return { dir, file };
}

test('CLI: --help and no args print one JSON object and exit 0', () => {
  for (const args of [['--help'], []]) {
    const { status, out } = cli(args);
    assert.equal(status, 0);
    assert.equal(out.command, 'help');
    assert.ok(out.exit_codes['4']);
  }
});

test('CLI: usage and input errors have distinct exit codes', () => {
  assert.equal(cli(['validate']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--bogus']).status, 2);
  assert.equal(cli(['validate', 'x.json', '--config']).status, 2);
  const missing = cli(['validate', '/nonexistent/graph.json']);
  assert.equal(missing.status, 3);
  assert.equal(missing.out.errors[0].code, 'INPUT_UNREADABLE');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-cli-'));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{nope');
  const r = cli([bad]);
  assert.equal(r.status, 3);
  assert.equal(r.out.errors[0].code, 'INPUT_INVALID_JSON');
});

test('CLI: valid definition is accepted with --no-probe', () => {
  const { file } = writeDef();
  const { status, out } = cli(['validate', file, '--no-probe']);
  assert.equal(status, 0);
  assert.equal(out.ok, true);
  assert.equal(out.accepted, true);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.tool_gate, { status: 'skipped', reason: '--no-probe' });
  assert.equal(out.returning_edges.length, 3);
});

test('CLI: invalid definition exits 1 naming the violated invariants', () => {
  const { file } = writeDef((d) => {
    d.edges = d.edges.filter((e) => !(e.from === 'review' && e.outcome === 'fail'));
    delete d.caps.failure;
  });
  const { status, out } = cli([file, '--no-probe']);
  assert.equal(status, 1);
  assert.equal(out.accepted, false);
  const got = out.errors.map((e) => e.code);
  assert.ok(got.includes('OUTCOME_UNCOVERED') && got.includes('CAP_MISSING'));
  assert.equal(out.tool_gate.reason, 'structure-invalid');
  assert.ok(out.errors.every((e) => e.invariant));
});

test('CLI: tool gate accepts when every tool starts, exits 4 when one is missing', () => {
  const s = sandbox();
  s.good('npm');
  const { file } = writeDef();
  // gh is absent: structure is valid, tool gate rejects
  const rej = cli(['validate', file], { PATH: s.bin });
  assert.equal(rej.status, 4);
  assert.equal(rej.out.accepted, false);
  assert.equal(rej.out.errors[0].code, 'TOOL_MISSING');
  assert.equal(rej.out.errors[0].tool, 'gh');
  assert.deepEqual(rej.out.errors[0].nodes, ['wrap']);
  s.good('gh');
  const acc = cli(['validate', file], { PATH: s.bin });
  assert.equal(acc.status, 0);
  assert.equal(acc.out.tool_gate.status, 'passed');
  assert.equal(fs.existsSync(s.effect), false);
});

test('CLI: --config probes worktree setup commands', () => {
  const s = sandbox();
  s.good('npm');
  s.good('gh');
  const { dir, file } = writeDef();
  const cfg = path.join(dir, 'config.json');
  fs.writeFileSync(cfg, JSON.stringify({ worktree_setup: { setup: ['pnpm install'], copy: [] } }));
  const r = cli(['validate', file, '--config', cfg], { PATH: s.bin });
  assert.equal(r.status, 4);
  assert.equal(r.out.errors[0].tool, 'pnpm');
  assert.deepEqual(r.out.errors[0].nodes, ['config:worktree_setup']);
  fs.writeFileSync(cfg, JSON.stringify({ nothing: true }));
  assert.equal(cli(['validate', file, '--config', cfg], { PATH: s.bin }).status, 3);
});

test('entry node steps and mounts are validated and gated', () => {
  assertRejects((d) => { node(d, 'trigger').pre_steps = [42]; }, 'MOUNT_INVALID');
  assertRejects((d) => { node(d, 'trigger').post_steps = 'x'; }, 'NODE_FIELD_INVALID');
  assertRejects((d) => { node(d, 'trigger').mounts = { commands: [42] }; }, 'MOUNT_INVALID');
  const res = run((d) => { node(d, 'trigger').pre_steps = ['nonexistent-tool-xyz init']; node(d, 'trigger').mounts = { commands: ['entry-mount-tool'] }; });
  assert.equal(res.errors.length, 0);
  const cmdsOut = res.commands.filter((c) => c.node === 'trigger');
  assert.deepEqual(cmdsOut.map((c) => c.command).sort(), ['entry-mount-tool', 'nonexistent-tool-xyz init']);
  const s = sandbox();
  s.good('npm');
  s.good('gh');
  const { file } = writeDef((d) => { node(d, 'trigger').pre_steps = ['nonexistent-tool-xyz init']; });
  const rej = cli(['validate', file], { PATH: s.bin });
  assert.equal(rej.status, 4);
  assert.equal(rej.out.errors[0].tool, 'nonexistent-tool-xyz');
  assert.deepEqual(rej.out.errors[0].nodes, ['trigger']);
});
