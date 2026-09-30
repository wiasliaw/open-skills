## Context

`graph-engineering-node-specs` defines thirteen nodes (including Advisor), a complete edge set, and `work-unit.json` as shared state, and deliberately leaves the state schema and the plugin realization open. The plugin today ships `harness-flow` (orchestrator loop with markdown work-unit state), a generic `implementor` and `reviewer` agent (the generic advisor agent is new), and `init`. This change specifies how the graph maps onto those pieces.

## Goals / Non-Goals

**Goals:**
- A minimal, fixed actor set that can execute every node without per-node definitions.
- Dispatches derived mechanically from node specs, so a node spec change flows into behavior without editing agents.
- One state file with one writer.

**Non-Goals:**
- Implementing or editing skills, agents, or docs.
- Changing the graph's nodes or edges (the Advisor node and rewired escalation edges are defined in `graph-engineering-node-specs`; this change only realizes them).
- Choosing the tooling that enforces schema validity beyond stating the requirement.

## Decisions

- **Four fixed roles.** Orchestrator (skill, main session), generic implementor, generic reviewer, generic advisor. This amends D-005, which said "exactly three roles"; the advisor is the fourth. The advisor is stage-agnostic like the others: its dispatch payload carries the failure history, review logs and verdicts, the blocked stage's node spec, and relevant constraints, and it returns analysis plus retry guidance. It is read-only analysis and never writes state or deliverables. Rationale: human intervention stays a last resort; the advisor absorbs the first escalations. Alternative: one agent per node; rejected because node count (thirteen) multiplies definitions and every node spec change would need a matching agent edit. No per-node advisors either.
- **Node identity is dispatch data.** The payload carries node id, instructions, skills, restrictions, and commands. The agent definitions stay stage-agnostic.
- **Contractual restrictions instead of mechanical tool whitelists.** Mechanical per-node tool whitelists (for example a Build-only agent whose tool list excludes writes to `.harness/`) were rejected in favor of generic actors plus restrictions written into the dispatch prompt (for example "MUST NOT write `.harness/`" for Build). Reasons: whitelists require per-node agent definitions, contradicting the generic-actor decision; tool-level whitelists cannot express path-level rules such as "write only inside the worktree"; the reviewer independently verifies compliance, so violations are detectable. Trade-off: enforcement is by contract and review, not by the runtime.
- **Skill assignment maximizes reuse of general skills.** The implementor mounts follow WOR-33 (Research: deep-research and receive-code-review; Spec: SDD; Ticket: TDD; Build: use-worktree). The reviewer receives stage-appropriate verification skills (request-code-review for Build/Review). Skills stay skills, never nodes.
- **Review gating is uniform.** Every artifact-producing stage uses implementor, reviewer, route, so the orchestrator has one loop shape. The Build stage's reviewer pass is the graph's Review node; for other stages the reviewer pass is internal to the node and does not add graph edges.
- **Human gates are orchestrator stops.** The two graph-specified gates (grading approval, spec approval) are questions the orchestrator puts to the human in the main session, then it records the answer. They are not agents. Human Escalation is likewise an orchestrator stop to the human, reached only after two failed advisor consultations on the same problem.
- **State is one JSON file with one writer.** `work-unit.json` is written only by the orchestrator from actor reports. Actors read it and report; they never write it. No markdown copy exists for graph execution.
- **Capability mapping.** The suggested four-way split is kept, with review gating and human gates merged in one capability since gates are the human counterpart of the reviewer route. Mapping: actor model -> `graph-plugin-actor-model`; dispatch construction -> `graph-plugin-dispatch-construction`; review gating plus human gates -> `graph-plugin-review-gating`; state schema -> `graph-plugin-work-unit-state`. The deterministic-parts requirements (init, Ship) live in the actor model spec because they define which work is not an LLM actor.
- **Schema shape.** Top-level object with `schema_version`, `id`, `current_node`, `grading`, `fast_path`, `tickets[]`, `fail_counters` (map keyed by node or ticket id), `blocked_at` (node id or null), `advisor_consults[]`, `reviews[]`, `human_decisions[]`, and an append-only `log[]`. Alternatives: separate files per concern; rejected to keep a single source of truth.

## Risks / Trade-offs

- [Contractual restrictions can be violated by an actor] -> The reviewer checks restriction compliance as part of every verdict, and the orchestrator records violations as failures.
- [Single writer means the orchestrator transcribes reports, and a transcription error corrupts state] -> The log is append-only and each entry cites the report it came from; the orchestrator validates state against the schema before each write.
- [Advisor guidance could be wrong or ignored, wasting a retry] -> Consultations are capped at 2 per problem, after which the work goes to Human Escalation.

## Open Questions

Resolved: execution resumes at the `blocked_at` node after both Advisor and Human Escalation (`unblocked`), as the orchestrator records `blocked_at` in state when a stage blocks. The `graph-execution-model` edge set was revised accordingly.


- Whether Wrap's CI wait is an orchestrator-run command or a tool-call stage; this change treats CI status as a deterministic command result.
