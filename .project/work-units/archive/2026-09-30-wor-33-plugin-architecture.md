# Work Unit: 2026-09-30-wor-33-plugin-architecture

- **Work-unit identifier**: 2026-09-30-wor-33-plugin-architecture
- **Created**: 2026-09-30
- **Work-unit tool reference**: `openspec/changes/graph-plugin-architecture/`

## Contract

### Scope

An OpenSpec change `graph-plugin-architecture` under `openspec/changes/` defining how the WOR-33 execution graph is realized inside the open-skills plugin (decision: extend open-skills, not a new plugin). It must specify:

1. **Actor model** — exactly three fixed roles: orchestrator (a skill run by the main session, successor of harness-flow), a generic implementor agent, and a generic reviewer agent. Nodes are data, not agents: no per-node agent definitions.
2. **Dispatch construction** — per stage, the orchestrator builds the dispatch from the node's spec (the `graph-node-*` capabilities of change `graph-engineering-node-specs`): stage instructions, the skills assigned for that stage (for the implementor AND for the reviewer), prompt-carried restrictions (permissions are contractual, e.g. "Build must not write `.harness/`"), and the stage's verification commands. Skill assignment maximizes reuse of general skills.
3. **Review gating** — every artifact-producing stage is implementor → reviewer → route; human gates exist only at the two graph-specified points (grading approval, spec approval) and are synchronous orchestrator stops, not agents.
4. **State** — a single `work-unit.json` owned and written only by the orchestrator (actors read, never write), with a schema covering at least: identifier, current node, grading, fast-path flag, ticket list with per-ticket status and verification, fail counters, review verdicts, and an execution log. It replaces markdown work-unit state for graph execution; no parallel markdown copy.
5. **Deterministic edges of the system** — init stays the pre-graph bootstrap (existing init skill); Ship-type deterministic work runs as commands, not LLM actors.

### Verification Standards

1. `openspec validate graph-plugin-architecture --strict --no-interactive` passes.
2. `claude plugin validate .` passes.

### Exclusions

- No implementation: no new/changed files under `skills/`, `agents/`, `docs/`, README, `.harness/`, `.gitignore`, CLAUDE.md.
- No edits to the existing change `graph-engineering-node-specs` (reference it; don't rewrite it).
- Change stays a proposal — not applied, not archived.
- English only (C-001); C-002 not triggered.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | OpenSpec change `graph-plugin-architecture` defines the 3-actor model, spec-driven dispatch construction, universal review gating, and the work-unit.json state schema | `openspec validate graph-plugin-architecture --strict --no-interactive && claude plugin validate .` | passed (F-008) |

## Review Log

- 2026-09-30 — feature 1, round 1: pass — both commands re-run pass; 4 scope areas covered with requirements+scenarios; consistent with frozen 23-edge set (escalation-resume gap flagged, not invented); C-001 clean; exclusions clean.

## Notes

- 2026-09-30 — Design settled in session with user: (1) extend open-skills (rejected: separate plugin); (2) generic actors, node identity carried in dispatch payload; orchestrator assigns per-stage skills to both actors to maximize general-skill reuse; (3) permissions are contractual — written into dispatch prompts (rejected: per-node agents with mechanical tool whitelists); (4) single work-unit.json, no markdown twin.
- 2026-09-30 — Continuing on branch `feature/wor-33-node-specs` (previous unit's PR not yet opened; both changes belong to the WOR-33 deliverable).
- 2026-09-30 — Feature 1 implementor ready-for-review: 4 capabilities (actor-model, dispatch-construction, review-gating incl. human gates, work-unit-state). Notable: in-node implementor→reviewer loops for non-Build stages (2nd fail → Escalation); Wrap dispatch may write `.harness/` but never work-unit.json; schema adds human_decisions[]. Flagged open design gap (in its design.md): frozen edge set only routes Escalation back to Build or End — resume point for non-Build blocked stages undefined; to surface to user.
