## Why

The WOR-33 execution graph (specified in the change `graph-engineering-node-specs`) says what each node does but not how it is realized inside the open-skills plugin. Without an architecture spec, the plugin risks growing one agent per node, ad hoc permissions, and duplicated state. This change fixes the realization model before implementation starts.

## What Changes

- Define exactly four fixed actor roles: an orchestrator skill (successor of `harness-flow`) run by the main session, a generic implementor agent, a generic reviewer agent, and a generic advisor agent. Node identity is data in the dispatch payload; there are no per-node agents.
- Define spec-driven dispatch construction: per stage, the orchestrator assembles instructions, mounted skills (for implementor and reviewer), prompt-carried restrictions, and verification commands from that node's `graph-node-*` spec.
- Define universal review gating: every artifact-producing stage runs implementor, then reviewer, then route. Escalation is tiered: stage failures and blocked states go to the advisor first, and only two failed advisor consultations reach the human. Human gates and Human Escalation are synchronous orchestrator stops, not agents.
- Define the per-work-unit folder (`state.json`, `log.ndjson`, one directory per executed stage) and the `state.json` routing schema as a complete field-level contract (name, type, allowed values, writer, lifecycle for every field, including `blocked_at`, `fail_counters`, and `advisor_consults`), its lifecycle, consistency invariants, and one normative example. `state.json` and `log.ndjson` are written only by the orchestrator; stage artifacts are written by the actor that produced them. This replaces markdown work-unit state for graph execution.
- State that `init` stays the pre-graph bootstrap and that Ship-type deterministic work runs as commands or tools, not LLM actors.
- Specs only: no change to `skills/`, `agents/`, `docs/`, README, or `.harness/`. The existing change `graph-engineering-node-specs` receives only vocabulary rewording from `work-unit.json` to the work-unit folder.

## Capabilities

### New Capabilities
- `graph-plugin-actor-model`: the four fixed roles, node identity as data, deterministic work outside LLM actors, init as pre-graph bootstrap.
- `graph-plugin-dispatch-construction`: how the orchestrator builds a per-stage dispatch from a node spec, including skill assignment, contractual restrictions, and the advisor dispatch payload.
- `graph-plugin-review-gating`: implementor, reviewer, route loop for every artifact-producing stage, the advisor escalation tier, and the two synchronous human gates.
- `graph-plugin-work-unit-state`: the work-unit folder layout, the orchestrator-only `state.json` and `log.ndjson`, the field-level `state.json` schema, lifecycle, invariants, and normative example.

### Modified Capabilities

## Impact

Adds files under `openspec/changes/graph-plugin-architecture/`, and rewords storage vocabulary in `openspec/changes/graph-engineering-node-specs/`. This change amends decision D-005 ("exactly three roles") to four roles. Later implementation changes will alter `skills/harness-flow`, `agents/`, and docs; none are touched here.
