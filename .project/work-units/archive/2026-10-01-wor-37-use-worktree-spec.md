# Work Unit: 2026-10-01-wor-37-use-worktree-spec

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-10-01-wor-37-use-worktree-spec
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` (created by this unit's feature 1)

## Contract

### Scope

Design the spec for the `use-worktree` general skill (Linear WOR-37, child of WOR-33) as a new OpenSpec change `use-worktree-skill` under `openspec/changes/`, following the OpenSpec schema (proposal, design, per-capability spec, tasks). The spec defines the skill that WOR-33's skill-mount table attaches to the Build node, covering:

1. **Purpose and shape** — a thin, one-page general skill layered over Claude Code's native worktree isolation (agent worktree isolation / EnterWorktree); the spec defines what the skill page must state, not a reimplementation of the platform mechanism.
2. **When to open a worktree** — the conditions under which Build opens one (per-work-unit vs per-ticket cadence, reuse across tickets, relation to the Build node's "isolated worktree" requirement in `openspec/changes/graph-engineering-node-specs/specs/graph-node-build/spec.md`).
3. **Naming convention** — a deterministic naming scheme for worktrees tied to the work-unit/ticket identity.
4. **Cleanup ownership** — the skill MUST assign worktree removal to the Wrap node (already fixed by `graph-node-wrap`'s "Wrap cleans residue" requirement) and MUST NOT make Build or the skill itself remove worktrees; the spec records what Build leaves behind for Wrap.

The change stays a proposal in `openspec/changes/` — consistent with the two sibling WOR-33 changes. Design source of truth: Linear WOR-37 body and WOR-33 設計定案 (2026-09-30); on drift, Linear wins.

### Verification Standards

Run from the project root, in order:

1. `openspec validate use-worktree-skill --strict --no-interactive` — the change passes strict OpenSpec validation.
2. `claude plugin validate .` — plugin manifest still valid.

### Exclusions

- No implementation of the skill itself — no `skills/use-worktree/` directory, no SKILL.md; spec only.
- No edits to the existing changes `graph-engineering-node-specs` and `graph-plugin-architecture` — the new change must be consistent with them (Build mounts use-worktree; Wrap owns cleanup) but does not modify them.
- No README/docs updates (C-002 not triggered: no user-facing skill is added yet).
- No applying/archiving of any OpenSpec change — all stay proposals.
- No Linear writes; WOR-37/WOR-33 are source material only.
- All repository content in English (C-001) — the Chinese issue bodies are source material, not content to copy verbatim.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | OpenSpec change `use-worktree-skill` specifies the Build-mounted use-worktree general skill (when to open, naming convention, Wrap-owned cleanup) consistently with the WOR-33 node specs | `openspec validate use-worktree-skill --strict --no-interactive && claude plugin validate .` | passed (F-013) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: fail — both verification commands pass and exclusions/C-001 clean, but the spec is unsatisfiable on the CI-red path: Wrap removes the worktree before opening the PR (CI runs after), yet the re-entry scenario requires Build to reuse the recorded worktree after red CI; no defined behavior for a record pointing at a removed worktree.
- 2026-10-01 — feature 1, round 2: pass — strict openspec validate + plugin validate re-run pass; CI-red path resolved via "live worktree" rule (reuse only if recorded AND on disk; otherwise fresh worktree on retained branch `wu/<id>`, record rewritten); branch retention judged a non-contradicting refinement of the Wrap spec; exclusions and C-001 clean.

## Notes

- 2026-10-01 — Unit opened on existing branch `feature/wor-33-node-specs` per user direction (WOR-37 is a child of WOR-33; the spec joins the same PR). Clock-in clean: tree clean, `claude plugin validate .` passing, no in-flight work units.
- 2026-10-01 — Round-1 fix introduced the "live worktree" rule and branch retention by Wrap (worktree removed, branch `wu/<id>` kept for the PR / CI-red re-entry). Rationale and rejected alternatives recorded in the change's design.md — no separate D- entry needed.
- 2026-10-01 — Unit closed: F-013 recorded; change `use-worktree-skill` deliberately left as a proposal in `openspec/changes/` (same convention as the sibling WOR-33 changes — applying reserved for the implementation unit).
