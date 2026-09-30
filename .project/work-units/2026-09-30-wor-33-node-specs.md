# Work Unit: 2026-09-30-wor-33-node-specs

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-30-wor-33-node-specs
- **Created**: 2026-09-30
- **Work-unit tool reference**: `openspec/changes/graph-engineering-node-specs/` (OpenSpec initialized this branch; CLAUDE.md declaration of the tool is Feature 2 of this unit)

## Contract

### Scope

Land the WOR-33 "graph-engineering for coding" design as an OpenSpec change in this repository, and declare the OpenSpec adoption:

1. An OpenSpec change `graph-engineering-node-specs` under `openspec/changes/`, following the OpenSpec spec-driven schema (proposal, design, per-capability specs), defining a spec for every node of the finalized execution graph — Trigger, Research & Explore, Human Gate (grading approval), Spec, Human Gate (spec approval), Ticket, Build, Review, Wrap, Ship, Human Escalation, End — plus the pre-graph `init` bootstrap. Each node spec covers: purpose, node type (LLM loop / deterministic / tool / validator / human), inputs read from state, outputs written to state (`work-unit.json`), outgoing conditional edges with their guard conditions, and mounted skills. Source of truth for content: Linear issue WOR-33 body "設計定案（現行版）" (2026-09-30), reproduced in the dispatch.
2. Repository bookkeeping for the new tool: add `.claude/settings.local.json` to `.gitignore`; update root CLAUDE.md — Repo Structure (add `openspec/`), Harness section `work-unit tool:` bullet (declare OpenSpec changes as the work-unit tool reference convention).

### Verification Standards

Run from the project root, in order:

1. `openspec validate graph-engineering-node-specs --strict --no-interactive` — the change passes strict OpenSpec validation.
2. `claude plugin validate .` — plugin manifest still valid.
3. `git check-ignore .claude/settings.local.json` — exits 0 (feature 2 only).
4. `grep -n "openspec" CLAUDE.md` — Harness `work-unit tool:` bullet and Repo Structure mention OpenSpec (feature 2 only).

### Exclusions

- No implementation of the graph engine itself — specs only; no changes to existing `skills/`, `agents/`, or `docs/` content.
- No README/docs updates (C-002 not triggered: no user-facing skill is added, renamed, or changed).
- No archiving/applying of the OpenSpec change — it stays in `changes/` as a proposal.
- Whiteboard and Linear remain the discussion record; this unit does not modify them.
- All repository content in English (C-001) — the Chinese discussion is source material, not content to copy verbatim.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | OpenSpec change `graph-engineering-node-specs` defines specs for all 12 graph nodes + init bootstrap per WOR-33 finalized design | `openspec validate graph-engineering-node-specs --strict --no-interactive && claude plugin validate .` | passed (F-006) |
| 2 | OpenSpec adoption declared: `.gitignore` covers `.claude/settings.local.json`; CLAUDE.md Repo Structure and Harness declare `openspec/` and the work-unit tool | `git check-ignore .claude/settings.local.json && grep -n "openspec" CLAUDE.md && claude plugin validate .` | not_started |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-30 — feature 1, round 1: pass — strict openspec validate + plugin validate re-run pass; 23 edges verified individually; guard precedence coherent; C-001 clean; exclusions clean.

## Notes

- 2026-09-30 — Branch `feature/wor-33-node-specs` created off clean `main`. `openspec init --tools claude` run by orchestrator as deterministic tool scaffolding (openspec/config.yaml + .claude/ opsx skills); untracked as yet.
- 2026-09-30 — Design source: Linear WOR-33 body rewritten to 設計定案（現行版） same day; whiteboard: local tldraw file `WOR-33 graph-engineering.tldraw`.
- 2026-09-30 — Feature 1 implementor reports ready-for-review: change `graph-engineering-node-specs` with 14 capabilities (1 execution-model cross-cutting + init bootstrap + 12 nodes); strict validate + plugin validate reported passing; notable mapping decisions: one capability per node, `graph-execution-model` holds shared rules, Review fail<2 edge scoped to non-fast path to avoid guard overlap.
