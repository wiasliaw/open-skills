# Work Unit: 2026-10-01-wor-37-worktree-setup-config

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-10-01-wor-37-worktree-setup-config
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` and `openspec/changes/graph-engineering-node-specs/` (both existing changes, revised by this unit)

## Contract

### Scope

Specify worktree setup — how a fresh worktree gets the untracked files it needs (dependencies, env files, large assets), which `git worktree add` cannot provide since it checks out tracked files only. User ruling in session, 2026-10-01: the investigation happens at init, and a dedicated config file is the record. Two coordinated edits:

1. **`graph-engineering-node-specs` / `graph-init-bootstrap` spec**: add a requirement — during its project survey, init SHALL investigate worktree setup needs: (a) the setup command(s) that regenerate dependencies in a fresh worktree (e.g. a package-manager install), and (b) untracked assets that cannot be cheaply regenerated (large data, env files) and must be copied. Init SHALL record the findings in a dedicated machine-readable config file at a fixed, spec-named path; the file SHALL be written even when nothing is needed (explicitly empty), so Build can rely on its presence. The config is part of init's bootstrap output; no other actor writes it.
2. **`use-worktree-skill` spec**: add a requirement ("worktree setup after creation" or similar) — the skill page SHALL require Build to run the setup step after every `git worktree add`, on first open AND on CI-red reopen (amend the CI-red scenario accordingly): run the declared setup commands; copy the declared assets, preferring copy-on-write (`cp -c` on APFS, `cp --reflink=auto` where supported) with plain copy as fallback; MUST NOT symlink mutable directories between worktrees (isolation) — symlinks only for assets the config declares read-only. Build reads the config and MUST NOT modify it.
3. **design.md of both changes as appropriate**: record the decision and alternatives — regenerate-over-copy as the default posture; the declared-config approach as the portable equivalent of Claude Code's native worktree-setting (which was rejected with the native mechanism); CoW preference rationale.

Implementor latitude: the config file's exact name, location, and minimal schema (setup commands list + copy entries with an optional read-only marker) are design decisions — choose, keep the schema minimal, and record rationale and rejected alternatives in design.md. The location must be readable by any actor and writable at init time per the existing write-ownership rules.

### Verification Standards

Run from the project root, in order:

1. `openspec validate use-worktree-skill --strict --no-interactive`
2. `openspec validate graph-engineering-node-specs --strict --no-interactive`
3. `claude plugin validate .`

### Exclusions

- No implementation — no `skills/use-worktree/`, no SKILL.md, no actual config file created in this repo; spec only.
- No edits to `graph-plugin-architecture` (if the config location interacts with the work-unit state folder rules, stay consistent with that spec rather than editing it).
- No changes to node specs other than `graph-init-bootstrap` within `graph-engineering-node-specs` — amended after round 1 (2026-10-01): minimal edits to `graph-execution-model` (pre-graph init exception to the single write point) and `graph-node-build` (config added to the inputs list) are in scope; all other node specs remain off-limits.
- No README/docs updates (C-002 not triggered).
- No applying/archiving of any OpenSpec change — all stay proposals.
- No semantic changes to the already-verified use-worktree behaviors beyond the setup addition and the CI-red scenario amendment (F-015 semantics otherwise intact).
- All repository content in English (C-001).

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | Worktree setup specified end to end: init surveys needs and writes a dedicated config; Build runs setup from it after every worktree creation (incl. CI-red reopen), CoW-preferring, no mutable symlinks | `openspec validate use-worktree-skill --strict --no-interactive && openspec validate graph-engineering-node-specs --strict --no-interactive && claude plugin validate .` | passed (F-016) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: fail — all three verification commands pass and scope/exclusions clean, but the init write of `.harness/worktree-setup.json` is unreconciled with the single-long-term-memory-write-point requirements (graph-execution-model, graph-node-wrap), Build's read contradicts graph-node-build's "read only" inputs list, init's state-outputs requirement omits the config, and tasks.md lacks a setup row (minor). Orchestrator amended the contract for round 2: edit set widened to graph-execution-model (write-point carve-out) and graph-node-build (inputs list) within graph-engineering-node-specs.

## Notes

- 2026-10-01 — Unit opened on user rulings in session: investigation at init; a dedicated config file as the record. Cross-change edit has precedent (F-009 advisor tier touched both WOR-33 changes). Fourth revision unit of `use-worktree-skill` on branch `feature/wor-33-node-specs`.
- 2026-10-01 — Round 2 pass. Config: `.harness/worktree-setup.json` (version + setup[] + copy[] with readonly marker); implementor additions accepted by review: main-checkout read, blocked on setup failure. Write-point reconciliation: "within the running graph" qualifier + explicit pre-graph init exception in graph-execution-model; graph-node-wrap untouched ("only node" — init is not a node). Rationale in both changes' design.md — no separate D- entry.
- 2026-10-01 — Unit closed: F-016 recorded (additive — F-015 and F-006 remain active); both changes stay proposals.
