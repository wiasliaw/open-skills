## Why

The demo e2e run exposed three config-schema defects: `memory.budgets` keys are documented as repo-relative paths in `bootstrap.md` but `memory.mjs` rejects any key containing a slash, so a config written by following the bootstrap reference passes `init.mjs` validation and later fails at run time; the current-truth documents the budgets name are never created by any stage, leaving the memory model inoperative from day one; and the config carries fields no runtime consumer reads (`vcs.strategy`) or that cannot legally exist (`vcs.base_ref`, supported by `worktree.mjs` but rejected by the `init.mjs` whitelist).

## What Changes

- `memory.budgets` keys are bare file names everywhere: `init.mjs` rejects keys containing path separators (matching `memory.mjs`), and `bootstrap.md` interview prompts and example switch from `.harness/ARCHITECTURE.md` to `ARCHITECTURE.md`. **BREAKING** for configs written with path-style keys (none known to exist; the demo already uses bare names).
- Bootstrap (Tier 1) creates an empty skeleton for every budgeted current-truth document under `.harness/` when the memory section is confirmed, so the memory layer is operative immediately.
- `vcs.strategy` is removed from the config schema: dropped from the `init.mjs` whitelist and required-field checks, `bootstrap.md`, and `docs/file-formats.md`. **BREAKING** for existing configs carrying the key; `init.mjs` names the offending key with a migration hint (re-draft without it). The demo config and `init.test.mjs` are updated.
- `vcs.base_ref` support is removed from `worktree.mjs` (dead branch: the config writer's whitelist rejects the key, so only a hand-written — and therefore invalid — config could carry it). `worktree.test.mjs` drops its `base_ref` case.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-build`: the Project bootstrap requirement changes — the config schema loses `vcs.strategy`, budget keys are constrained to bare file names at write time, and bootstrap gains the duty to create skeleton current-truth documents for every declared budget.
- `memory-and-handoff`: the bounded-current-truth requirement gains the precise budget-key contract (bare file name, resolved under `.harness/`) so config writer and memory mechanics agree by specification.

## Impact

- Scripts: `scripts/init.mjs` (vcs/budget validation), `scripts/worktree.mjs` (drop `base_ref`).
- Tests: `scripts/init.test.mjs`, `scripts/worktree.test.mjs`.
- Docs: `skills/graph-build/references/bootstrap.md`, `docs/file-formats.md`.
- Fixtures: `demo/.harness/config.json` (remove `strategy`).
- No change to `graph.mjs`, `work-unit.mjs`, or any graph definition.
