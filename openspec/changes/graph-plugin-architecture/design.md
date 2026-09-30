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
- **Schema shape.** Top-level object with `schema_version`, `id`, `created_at`, `updated_at`, `trigger`, `current_node`, `grading`, `fast_path`, `blocked_at`, `spec_ref`, `current_ticket`, `refs`, `ci_status`, `tickets[]`, `fail_counters`, `advisor_consults[]`, `reviews[]`, `human_decisions[]`, `outcome`, `outcome_reason`, and an append-only `log[]`. Every field is written only by the orchestrator and carries a defined type, allowed values, and lifecycle (see the `graph-plugin-work-unit-state` spec). Alternatives: separate files per concern; rejected to keep a single source of truth.
- **Schema decisions.**
  - Node ids are the thirteen kebab-case suffixes of the `graph-node-*` specs (`research-explore`, `human-gate-grading`, and so on), so state ids and spec names stay mechanically linked.
  - Fields added beyond the minimum inventory, each because a node spec or edge needs it: `created_at`/`updated_at` (requested); `trigger` (Trigger outputs the source and original request); `current_ticket` (Ticket outputs "selection of the next ticket"); `refs.issue`/`refs.pr` and `ci_status` (Ship reads the green CI result, PR reference, and issue reference; Wrap routes on CI); `outcome_reason` (ended needs a reason); ticket `title` alongside `description` (kept from the earlier draft); `advisor_consults[].blocked_node` and `status`; `reviews[].dimensions` and `id`; `log[].id`, `actor`, `event_type`, `source_ref`.
  - Fail counter key scheme: `ticket:<ticket-id>` for the Build and Review loop and `node:<node-id>` for the in-node review loops of Research, Spec, Ticket, and Wrap. One scheme covers both kinds of "fail >= 2" edge condition. Counters reset on pass or on a human `unblocked`, never on Advisor advice, so a still-failing retry keeps selecting the Advisor edge and the consult cap, not the counter, decides when the Human Escalation edge applies.
  - Advisor problem key is `<scope-key>#<n>`. The ordinal `n` lets a scope that fails again after resolution or human unblock open a fresh problem with its own cap of 2, while the entry `status` (`open`, `escalated`, `resolved`, `abandoned`) defines when `blocked_at` must be non-null.
  - `blocked_at` for a Review fail count of 2 or more is `build` (the node that repairs and is retried), and `review` only when Review itself cannot run; otherwise it is the originating node. Resume then always lands on the node that can act on the advice.
  - `blocked_at` is retained during the retry after advice and after a human `unblocked`, and cleared only when the retried node passes or execution ends. This keeps the retry linked to its problem entry; the alternative of clearing on resume loses that link.
  - `grading` is reset to null when a gate rejection routes back to Research (Research is always followed by a new grading gate), and is upgraded to `full` with `fast_path` false on a fast-path Review failure.
  - `spec_ref` is set when the Spec stage's review passes (`full`), at grading approval for `small` (existing spec reused), and stays null for `trivial` and `no-op`.
  - The normative example document lives in the spec, not here, because `design.md` is not synced into the long-term specs at archive time and the example must survive as normative content.
  - Evidence references are typed objects (`path`, `command`, `log`) rather than free strings so a reviewer can resolve them mechanically.

## Risks / Trade-offs

- [Contractual restrictions can be violated by an actor] -> The reviewer checks restriction compliance as part of every verdict, and the orchestrator records violations as failures.
- [Single writer means the orchestrator transcribes reports, and a transcription error corrupts state] -> The log is append-only and each entry cites the report it came from; the orchestrator validates state against the schema and its consistency invariants before each write.
- [Advisor guidance could be wrong or ignored, wasting a retry] -> Consultations are capped at 2 per problem, after which the work goes to Human Escalation.

## Open Questions

Resolved: execution resumes at the `blocked_at` node after both Advisor and Human Escalation (`unblocked`), as the orchestrator records `blocked_at` in state when a stage blocks. The `graph-execution-model` edge set was revised accordingly.


- Whether Wrap's CI wait is an orchestrator-run command or a tool-call stage; this change treats CI status as a deterministic command result.
