# Work Unit: 2026-10-01-wor-37-branch-named-worktree

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-10-01-wor-37-branch-named-worktree
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` (existing change, revised by this unit)

## Contract

### Scope

Simplify the naming scheme in the OpenSpec change `use-worktree-skill` (F-014): a single identifier instead of two. The branch name is defined first — `wu/<work-unit-id>` — and the worktree name IS the branch name, verbatim. User ruling in session, 2026-10-01. Specifically:

1. Rewrite the "Deterministic naming" requirement: branch `wu/<id>` is the primary name; the worktree is named by the branch name (worktree path ends in `wu/<id>`, e.g. `git worktree add ../wu/<id> wu/<id>`). No separate worktree-name rule. The no-ticket-id/no-timestamp/no-randomness rule and both collision/missing-worktree scenarios keep their semantics, re-expressed in terms of the single name.
2. Sweep the other requirements that mention the old two-name scheme: "When Build opens a worktree" (CI-red reopen wording), "Build leaves a record for Wrap" — the record may collapse from name+path+branch to branch (which is the name) + path, "Cleanup belongs to Wrap" (removes the worktree, not the branch — unchanged semantics). Example in the naming requirement updated.
3. Update design.md's naming decision to the single-identifier scheme, recording the old two-name scheme (worktree `<id>`, branch `wu/<id>`) as the superseded alternative and the rationale: one derivation rule instead of two, no mapping between names, and the `wu/` path prefix naturally groups all graph worktrees.

### Verification Standards

Run from the project root, in order:

1. `openspec validate use-worktree-skill --strict --no-interactive` — the change passes strict OpenSpec validation.
2. `claude plugin validate .` — plugin manifest still valid.

### Exclusions

- No implementation of the skill itself — no `skills/use-worktree/`, no SKILL.md; spec only.
- No edits to `graph-engineering-node-specs` or `graph-plugin-architecture`.
- No README/docs updates (C-002 not triggered).
- No applying/archiving of any OpenSpec change — all stay proposals.
- No semantic changes beyond naming: lifecycle, live-worktree rule, cadence, cleanup ownership, scope boundary, and the self-managed mechanism stay as F-014 verified them.
- All repository content in English (C-001).

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | `use-worktree-skill` change names the worktree by its branch name `wu/<id>` (single identifier), all other semantics unchanged | `openspec validate use-worktree-skill --strict --no-interactive && claude plugin validate .` | passed (F-015) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: pass — strict openspec validate + plugin validate re-run pass; single-identifier naming coherent throughout (grep clean outside design.md's superseded-alternative line); 10+/10− diff limited to spec.md/design.md; all non-naming semantics confirmed unchanged; siblings prescribe no worktree naming; exclusions and C-001 clean.

## Notes

- 2026-10-01 — Unit opened on user ruling in session: naming simplification, branch name first, worktree named by it. Third revision unit of the same change on branch `feature/wor-33-node-specs`.
