## Why

The WOR-33 execution graph (specified in the change `graph-engineering-node-specs`) says what each node does but not how it is realized inside the open-skills plugin. Without an architecture spec, the plugin risks growing one agent per node, ad hoc permissions, and duplicated state. This change fixes the realization model before implementation starts.

## What Changes

- Define exactly three fixed actor roles: an orchestrator skill (successor of `harness-flow`) run by the main session, a generic implementor agent, and a generic reviewer agent. Node identity is data in the dispatch payload; there are no per-node agents.
- Define spec-driven dispatch construction: per stage, the orchestrator assembles instructions, mounted skills (for implementor and reviewer), prompt-carried restrictions, and verification commands from that node's `graph-node-*` spec.
- Define universal review gating: every artifact-producing stage runs implementor, then reviewer, then route. Human gates are synchronous orchestrator stops, not agents.
- Define the `work-unit.json` state schema, written only by the orchestrator, replacing markdown work-unit state for graph execution.
- State that `init` stays the pre-graph bootstrap and that Ship-type deterministic work runs as commands or tools, not LLM actors.
- Specs only: no change to `skills/`, `agents/`, `docs/`, README, `.harness/`, or the existing change `graph-engineering-node-specs`.

## Capabilities

### New Capabilities
- `graph-plugin-actor-model`: the three fixed roles, node identity as data, deterministic work outside LLM actors, init as pre-graph bootstrap.
- `graph-plugin-dispatch-construction`: how the orchestrator builds a per-stage dispatch from a node spec, including skill assignment and contractual restrictions.
- `graph-plugin-review-gating`: implementor, reviewer, route loop for every artifact-producing stage, and the two synchronous human gates.
- `graph-plugin-work-unit-state`: the single-writer `work-unit.json` schema and its invariants.

### Modified Capabilities

## Impact

Adds files under `openspec/changes/graph-plugin-architecture/` only. Later implementation changes will alter `skills/harness-flow`, `agents/`, and docs; none are touched here.
