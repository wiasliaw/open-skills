# Work Unit: 2026-10-01-wor-37-self-managed-worktree

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-10-01-wor-37-self-managed-worktree
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` (existing change, revised by this unit)

## Contract

### Scope

Revise the OpenSpec change `use-worktree-skill` (F-013) to replace its worktree mechanism: from "thin norm layered over Claude Code's native worktree isolation (agent worktree isolation / EnterWorktree)" to "the skill instructs the agent to create and manage the worktree itself with plain `git worktree` commands". Design ruling recorded on Linear WOR-37 (comment, 2026-10-01); on drift, that comment wins over the issue body. Specifically:

1. Rewrite the purpose/shape requirement: the skill is agent-agnostic — it relies on no Claude Code-specific mechanism (no native worktree isolation, EnterWorktree, or sandbox); the agent runs `git worktree` commands directly. The "one page" framing may relax to a thicker skill page: the spec SHALL require the skill page to state concrete commands and guardrails (create via `git worktree add` with the prescribed name/branch, collision and missing-worktree handling per the existing scenarios, no nested worktrees, write only inside the worktree).
2. Keep the remaining requirements' semantics intact (lazy per-work-unit open, live-worktree reuse rule, `<id>` / `wu/<id>` naming, `build/worktree.md` record, Wrap-owned removal with branch retention, CI-red reopen, `.harness/` boundary) — adjust only wording that references the native mechanism.
3. Update design.md: record native worktree isolation as a rejected alternative with the three-part rationale from the Linear comment — (a) the spec's own requirements (deterministic naming, Wrap-only removal vs native auto-cleanup, CI-red reopen) are only implementable self-managed; (b) portability — Build is a dispatched actor and must be runnable by non-Claude-Code agents; (c) stability — native behavior is settings/sandbox/version-dependent, not contract-stable. Note the accepted trade-off: no runtime isolation enforcement; "write only inside the worktree" is contractual + reviewer-verified, consistent with the plugin architecture's existing contractual-restriction ruling.

### Verification Standards

Run from the project root, in order:

1. `openspec validate use-worktree-skill --strict --no-interactive` — the change passes strict OpenSpec validation.
2. `claude plugin validate .` — plugin manifest still valid.

### Exclusions

- No implementation of the skill itself — no `skills/use-worktree/`, no SKILL.md; spec only.
- No edits to `graph-engineering-node-specs` or `graph-plugin-architecture`.
- No README/docs updates (C-002 not triggered).
- No applying/archiving of any OpenSpec change — all stay proposals.
- No Linear writes (the orchestrator already posted the ruling comment).
- All repository content in English (C-001).

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | `use-worktree-skill` change specifies a self-managed `git worktree` mechanism (agent-agnostic, concrete command guardrails) in place of Claude Code native isolation, other semantics unchanged | `openspec validate use-worktree-skill --strict --no-interactive && claude plugin validate .` | passed (F-014) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: pass — strict openspec validate + plugin validate re-run pass; all three contract points landed; mechanism-reference sweep clean; seven other requirements semantically unchanged (16-line spec diff reviewed); graph-plugin-architecture trade-off citation verified accurate; exclusions and C-001 clean.

## Notes

- 2026-10-01 — Unit opened immediately after F-013 passed, on user ruling (discussion in session): native isolation rejected for portability (codex etc.), control, and stability (sandbox interference in practice). Ruling posted as a comment on Linear WOR-37; WOR-37 is a sub-issue — consolidation into WOR-33 happens upstream, not in this unit.
