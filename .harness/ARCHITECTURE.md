# Architecture

<!--
Purpose: describes how this system is organized — module map, layering and dependency direction, key boundaries.
Written by: the orchestrator (main session) only. Never written by implementor or reviewer agents.
When: seeded here at init from the project survey and interview; updated at a merge moment only when a verified work unit changed the structure this file describes. Left untouched when a merge changed behavior but not structure.
-->

## Module Map

- `.claude-plugin/` — plugin and marketplace manifests; `plugin.json` carries the released version.
- `skills/request-code-review/` — multi-agent review pipeline; `reviewer-prompt.md` is the lens-reviewer prompt.
- `skills/receive-code-review/` — verify-first handling of external PR/MR feedback via `gh`/`glab`.
- `skills/init/` — survey + interview producing CLAUDE.md and `.harness/`; owns all long-term-memory templates, including DECISION-ENTRY and FEATURE-ENTRY.
- `skills/harness-flow/` — orchestrator loop (clock-in, dispatch, reviewer gate, merge moment, clock-out); owns the work-unit state template.
- `skills/handoff/` — session-memory snapshot; owns the handoff template.
- `agents/` — `implementor` and `reviewer` subagents dispatched by harness-flow.
- `docs/` — user-facing documentation, linked from README.

## Layering & Dependency Direction

- `skills/harness-flow/` → `agents/` — harness-flow dispatches implementor/reviewer; agents never write `.harness/` or work-unit state and perform no VCS operations.
- `skills/harness-flow/` → `skills/handoff/` — clock-out (and interruption) invokes the handoff procedure.
- `skills/harness-flow/` → `skills/init/templates/` — merge moments write D-/F- entries from init's entry templates.
- `skills/harness-flow/`, `skills/handoff/` → CLAUDE.md shape produced by `skills/init/` — they read the Workflow table and Harness bullets.

## Key Boundaries

- Skill/agent names and `/open-skills:<name>` commands — public surface; renaming breaks user invocations and the load directives init writes into consuming projects.
- The CLAUDE.md shape defined by `skills/init/templates/CLAUDE.md.template` — a contract between init (producer, including update-mode migrations) and harness-flow/handoff (consumers); changing it requires updating both sides together.
- `docs/` + README vs. `skills/`/`agents/` — the former is user-facing, the latter agent-facing instructions.
