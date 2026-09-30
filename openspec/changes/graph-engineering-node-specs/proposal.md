## Why

The "graph-engineering for coding" execution graph (Linear WOR-33) has been finalized as a design, but nothing in the repo specifies what each node must do. Node-level specs make the graph reviewable and give later implementation work a contract.

## What Changes

- Add a spec per node of the execution graph: Trigger, Research & Explore, Human Gate (grading), Spec, Human Gate (spec), Ticket, Build, Review, Wrap, Ship, Advisor, Human Escalation, End.
- Add a spec for the pre-graph `init` bootstrap, which is not a node.
- Add a cross-cutting spec for graph vocabulary, the complete conditional edge set, and design principles.
- Each node spec covers purpose, node type, state inputs, state outputs (`work-unit.json`), outgoing conditional edges with guards, and mounted skills.
- Introduce the Advisor tier: a new node that absorbs blocked stages and repeated failures before Human Escalation. Rewire the escalation edges (blocked and fail-twice route to Advisor; Advisor routes back to the `blocked_at` node or, after two failed consultations, to Human Escalation; Human Escalation resumes at `blocked_at`), giving 26 conditional edges in total.
- Specs only: no implementation and no change to existing skills, agents, or docs.

## Capabilities

### New Capabilities
- `graph-execution-model`: vocabulary, static-relation ruling, complete edge set (26 edges), loop caps (stage fail to Advisor, Advisor consultations to Human), terminals, human-intervention concentration, single memory write point.
- `graph-init-bootstrap`: pre-graph repo survey and tool-availability check.
- `graph-node-trigger`: entry node creating `work-unit.json`.
- `graph-node-research-explore`: research loop proposing a grading.
- `graph-node-human-gate-grading`: mandatory grading approval gate.
- `graph-node-spec`: converts research into the specification contract.
- `graph-node-human-gate-spec`: spec approval gate.
- `graph-node-ticket`: decomposition into verifiable tickets.
- `graph-node-build`: worktree implementation loop.
- `graph-node-review`: independent validator with failure caps.
- `graph-node-wrap`: merge moment and sole long-term memory writer.
- `graph-node-ship`: success terminal.
- `graph-node-advisor`: LLM root-cause analysis on blocked or repeatedly failing stages; the escalation tier before the human.
- `graph-node-human-escalation`: last-resort unblock or cancel gate reached only through Advisor.
- `graph-node-end`: abandonment terminal.

### Modified Capabilities

## Impact

Adds files under `openspec/changes/graph-engineering-node-specs/` only. No code, skills, agents, docs, or `.harness/` content is affected. Existing `openspec/specs/` capabilities are untouched.
