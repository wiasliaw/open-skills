# Work Unit: 2026-10-01-wor-37-worktree-script-impl

- **Work-unit identifier**: 2026-10-01-wor-37-worktree-script-impl
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` tasks 3.1–3.2 (implementation of the spec this change defines)

## Contract

### Scope

Implement tasks 3.1 and 3.2 of the `use-worktree-skill` change. The authoritative behavioral contract is `openspec/changes/use-worktree-skill/specs/worktree-script/spec.md` (script) and `specs/skill-use-worktree/spec.md` (page) — implement exactly what they specify, nothing more:

1. **`skills/use-worktree/scripts/worktree.mjs`** — zero-third-party-dependency Node.js (>= 20, startup version check), implementing `ensure --branch wu/<id>`, `ensure --detach <sha>`, and `setup --worktree <path>` exactly per the `worktree-script` spec: path rules, `--git-common-dir` vs `--show-toplevel` resolution per mode, stale recovery only when the registered directory is absent, collision handling, CI-red reopen, hooks/LFS flags, info/exclude handling, probe-read, pin output, config validation (version/setup/copy schema, path-traversal rejection, missing sources), CoW-preferring copies, readonly-only symlinks, stdout-JSON + distinct exit codes, `GIT_TERMINAL_PROMPT=0`, idempotency, no `remove` subcommand, never prune, never write the plugin cache, macOS/Linux (Windows unverified).
2. **`skills/use-worktree/scripts/worktree.test.mjs`** — committed `node --test` suite using only `node:test`/`node:assert` and temp-dir git fixtures; no network. Minimum cases: hooks really not executed (plant a post-checkout hook writing a marker file; assert absent); LFS smudge skipped (config flag asserted); stale registration with deleted directory recovers (exact-path remove, retry once); unregistered-but-existing directory = collision exit code, directory untouched; reuse with matching SHA succeeds, HEAD-mismatch reports probe-failure/pin-unknown without deleting; branch mode CI-red reopen on existing `wu/<id>` branch; invocation from a linked worktree and from a subdirectory resolve the correct roots; path containing spaces; `info/exclude` append with no trailing newline and with the line already present; non-git directory exit code; idempotency (same invocation twice, same result); setup: `version` 1 accepted / 2 rejected with nothing executed, unknown key rejected, absolute and `..` copy paths rejected, missing copy source fails, readonly symlink honored, detach-mode worktree refused.
3. **`skills/use-worktree/SKILL.md`** — the policy page per the revised `skill-use-worktree` spec: frontmatter (name, description) consistent with the plugin's other skills; script delegation and resolution (`${CLAUDE_PLUGIN_ROOT}`, orchestrator-passed absolute-path fallback), who provisions (orchestrator runs ensure+setup pre-dispatch), blocked-not-improvise on failure, when to open, cadence, naming, `build/worktree.md` record, Wrap-owned cleanup, scope boundary, Node >= 20 prerequisite.
4. **Docs sync (C-002)**: a `docs/use-worktree.md` page (what the skill is, who invokes it, the script's subcommands and failure behavior, Node prerequisite) and a README Skills-table row linking it.
5. **Project bookkeeping**: update CLAUDE.md's Development Environment (toolchain now includes Node >= 20 for skill scripts; still no package manager) and the Workflow verify row to include `node --test "skills/use-worktree/scripts/*.test.mjs"`; check `openspec/changes/use-worktree-skill/tasks.md` items 3.1 and 3.2.

### Verification Standards

In order:

1. `node --test "skills/use-worktree/scripts/*.test.mjs"` — all tests pass.
2. `openspec validate use-worktree-skill --strict --no-interactive` — passes.
3. `claude plugin validate .` — passes.
4. `grep -c "worktree.mjs" skills/use-worktree/SKILL.md` — >= 1, and `grep -c "use-worktree" README.md` — >= 1 (C-002 wiring present).
5. Reviewer confirms by reading + executing: the script matches every requirement and scenario of `specs/worktree-script/spec.md` (spot-run ensure/setup against a temp fixture itself, not only via the test suite); the test suite actually contains the minimum cases above and they assert the right things (no vacuous tests); SKILL.md carries no mechanics that belong to the script; docs page and README row exist and are accurate; CLAUDE.md edits are confined to the two stated spots; no third-party import anywhere in the script or tests.

### Exclusions

- No edits to `skills/codewalk/` (task 3.3 is the next work unit, its own change).
- No edits to the OpenSpec specs themselves (if the spec proves unimplementable, report blocked — do not patch the spec to fit the code).
- No edits to the other OpenSpec changes, `agents/`, or other skills.
- No `.harness/` writes; no VCS operations by the implementor.
- No package.json, node_modules, lockfiles, or build tooling anywhere.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | `worktree.mjs` implements the worktree-script spec with a committed passing `node --test` suite | `node --test "skills/use-worktree/scripts/*.test.mjs"` | passed (F-018) |
| 2 | `skills/use-worktree/SKILL.md` policy page shipped with docs page, README row, and CLAUDE.md toolchain/verify updates | `claude plugin validate . && node --test "skills/use-worktree/scripts/*.test.mjs"` | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: pass — 57/57 tests, both validations pass; spec-to-code fidelity confirmed per requirement; usage/config shared exit code adjudicated spec-conformant (one failure class at spec line 30); tests non-vacuous (positive controls + mutation checks); exclusions held.

## Notes

- 2026-10-01 — Work unit created after work unit 2026-10-01-wor-37-worktree-script-spec passed (F-017); spec is the verification target per advisor guidance (spec author and implementor separated across work units). Node v24.12.0 confirmed on this machine.
- 2026-10-01 — Merge-moment candidates: ARCHITECTURE.md module-map update (new `skills/use-worktree/` module with scripts/); no new decision expected (D-008 covers the policy); C-002 satisfied within feature 2.
