## Context

The graph and its realization are fully specified (`graph-engineering-node-specs`, `graph-plugin-architecture`); this change is their first implementation slice: orchestrator skill, actor set, and state mechanics. It follows the repo's established split — policy in SKILL.md, mechanics in a plugin-root script.

## Decisions

- **Skill name `graph-flow`.** Keeps the `-flow` lineage of its predecessor while naming the model. The slash command is `/open-skills:graph-flow`.
- **Node dispatch data ships as `references/nodes.md`.** Dispatches must be "built from the node spec", but openspec changes are repo content, not plugin runtime content for consumer projects. The skill therefore carries a condensed per-node reference derived from the specs; a node-spec change is folded into this file. One file, not thirteen, because sections are small and the orchestrator always loads the whole routing picture.
- **Memory namespace stays `.harness/`.** The open question from `remove-harness-and-relocate-scripts` is closed by inertia with the specs: `worktree.mjs` and `init.mjs` already pin `.harness/` paths, and the graph specs name `.harness/` as long-term memory throughout. Work units (short-term) live at `.project/work-units/`, matching the location the graph-plugin spec leaves declarable.
- **`work-unit.mjs` is the single write gate.** The schema and ten invariants are enforced in code, not prose: `write` takes a drafted `state.json` plus new log lines, validates the combined result (append-only by construction — the script only ever appends to `log.ndjson`), and applies atomically. Invariant 3's "previous content is a prefix" is guaranteed structurally rather than by diffing.
- **Reviewer and advisor get the Write tool.** The architecture moves report-writing from the orchestrator to the producing actor, so both agents need Write; confinement to `review-<n>.md` / `advice-<n>.md` is contractual (prompt-carried, reviewer-checked), consistent with the architecture's rejection of mechanical whitelists.
- **Unshipped skill mounts degrade to instructions.** The node specs mount deep-research, SDD, and TDD, which this plugin does not ship. The dispatch carries the mount's intent as instructions instead; with OpenSpec present, the Spec stage produces an OpenSpec change (`spec_ref.kind` = `openspec-change`).
- **Trigger/Ship/End run in the orchestrator.** They produce no LLM-stage artifacts; Trigger is the `create` subcommand, Ship/End are commands plus the `archive` subcommand, per the actor-model spec's deterministic-work rule.

## Risks / Trade-offs

- [The orchestrator loop is prose, not code, so routing errors are possible] -> every state transition passes the script's invariant validation, which rejects structurally inconsistent routes (e.g. outcome off-terminal, blocked_at without an open problem).
- [Write-tool confinement for reviewer/advisor is contractual only] -> identical to the architecture's chosen enforcement model; violations are detectable from the stage diff and fail the review.
- [`references/nodes.md` can drift from the specs] -> it declares its derivation; a spec change's tasks must include updating it (same discipline as C-002 for docs).

## Dogfooding findings (work unit 2026-10-03-demo-slugify)

The first full run of the loop (research → grading gate → fast-path build → Review fail → upgrade → spec → spec gate → ticket → build ×2 → review → wrap → ship) surfaced three findings, resolved as follows:

1. The installed v0.1.0 reviewer agent lacks the Write tool, so the orchestrator persisted reviewer reports (deviation logged per occurrence in the work unit's `log.ndjson`). Already fixed in `agents/reviewer.md`; takes effect when the next plugin version ships.
2. `fail_counters` had no key shape for a fast-path Review failure (no ticket exists yet). Resolved: `node:build` added to the `graph-plugin-work-unit-state` spec and `work-unit.mjs` as the fast-path failure scope — audit-only, feeding no Advisor edge.
3. Re-dispatching the LLM Ticket node for selection-only re-entry is waste. Resolved: `graph-node-ticket` now declares selection-only re-entry a deterministic orchestrator step; `skills/graph-flow` updated to match.

Advisor and Human Escalation remain unexercised by a real run.

## Open Questions

- Whether Wrap's CI wait needs a bundled polling helper or stays a project-declared command (inherited from `graph-plugin-architecture`).
- Whether this repo itself re-adopts graph-flow in its CLAUDE.md (dogfooding) — deferred until the loop has run in anger at least once.
