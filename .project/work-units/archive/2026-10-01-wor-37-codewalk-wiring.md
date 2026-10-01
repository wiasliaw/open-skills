# Work Unit: 2026-10-01-wor-37-codewalk-wiring

- **Work-unit identifier**: 2026-10-01-wor-37-codewalk-wiring
- **Created**: 2026-10-01
- **Work-unit tool reference**: `openspec/changes/use-worktree-skill/` task 3.3 (codewalk consumes the script's detach mode)

## Contract

### Scope

Behavior-preserving refactor of codewalk's worktree handling: `skills/codewalk/SKILL.md` Step 2 delegates the worktree mechanics to `worktree.mjs ensure --detach`, keeping every reader-visible behavior identical. The detach-mode contract in `openspec/changes/use-worktree-skill/specs/worktree-script/spec.md` (written with codewalk's current Step 2 as its oracle, reviewer-verified line by line in F-017) plus the script's passing test suite (F-018) are the behavioral baseline.

1. **`skills/codewalk/SKILL.md` Step 2 "Worktree lifecycle"**: replace the manual `git worktree` procedure (path resolution, reuse check, creation flags, stale-registration recovery, info/exclude append, probe-read) with invoking `node "${CLAUDE_PLUGIN_ROOT}/skills/use-worktree/scripts/worktree.mjs" ensure --detach <full-HEAD-sha>` and reading its stdout JSON (worktree path + pin). Keep as prose only what remains codewalk policy: creating from HEAD and what the pin means; reuse persistence and the `codewalk-` purpose marker; no automatic cleanup with the user-facing `git worktree remove` removal note; the fallback rule (no git / no repo / no commits / script unavailable or failing, including no Node runtime → read the working tree directly, pin `unknown`); "never execute project code"; the Citation boundaries subsection untouched. No duplicated mechanics: the page must not restate hooks/LFS flags, the exact add invocation, exclude-file handling, or recovery steps.
2. **Docs sync (C-002)**: update `docs/codewalk.md` wherever it describes the worktree procedure so it matches the script-delegated flow (and mentions the Node >= 20 prerequisite with the no-Node fallback); flip the `ensure --detach` row in `docs/use-worktree.md` from "Intended for codewalk (not yet wired)" to wired-by-codewalk wording.
3. **Bookkeeping**: check task 3.3 in `openspec/changes/use-worktree-skill/tasks.md`.

### Verification Standards

In order:

1. `node --test "skills/use-worktree/scripts/*.test.mjs"` — still 57+/57+ passing (no script edits expected; guard against accidental ones).
2. `openspec validate use-worktree-skill --strict --no-interactive` — passes.
3. `claude plugin validate .` — passes.
4. `grep -c "worktree.mjs" skills/codewalk/SKILL.md` — >= 1.
5. `grep -n "worktree add\|hooksPath\|GIT_LFS_SKIP_SMUDGE\|info/exclude" skills/codewalk/SKILL.md` — no mechanics remain (the only permitted `git worktree` mention is the user-facing `git worktree remove` removal note and prohibition sentences).
6. Reviewer confirms by reading: every reader-visible behavior of the pre-change Step 2 (`git show HEAD~1:skills/codewalk/SKILL.md` as the oracle) survives — same path scheme, reuse semantics, fallback-to-working-tree conditions now including script unavailability, pin semantics incl. `unknown`, no-cleanup policy, never-execute-project-code; the five prohibitions and all other codewalk steps unchanged; docs accurate against the actual script behavior; no mechanics duplicated between page and script.

### Exclusions

- No edits to `skills/use-worktree/scripts/` (if the script cannot serve codewalk's flow, report blocked with the exact gap — do not patch the script or the spec in this work unit).
- No edits to codewalk's other steps, templates, prohibitions, or `skills/use-worktree/SKILL.md`.
- No edits to OpenSpec specs beyond the tasks.md checkbox.
- No `.harness/` writes; no VCS operations by the implementor.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk Step 2 delegates worktree mechanics to `worktree.mjs ensure --detach`, behavior-preserving, with docs synced | `node --test "skills/use-worktree/scripts/*.test.mjs" && claude plugin validate .` | passed (F-020) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-10-01 — feature 1, round 1: pass — all command checks green; oracle diff (HEAD~1 Step 2 vs. new page + script) confirms every reader-visible behavior preserved incl. reuse-failure-to-fallback nuance; no duplicated mechanics; docs accurate; exclusions held.

## Notes

- 2026-10-01 — Work unit created after 2026-10-01-wor-37-worktree-script-impl closed (F-018/F-019). Deviation from advisor recommendation recorded: no separate OpenSpec change for the codewalk side — the detach-mode behavioral contract already lives in the `worktree-script` spec (authored against codewalk's Step 2 as oracle) and task 3.3 of the same change records the work; a new change would state no new requirement. Characterization safety net = the script's detach-mode test suite (F-018) plus the reviewer's oracle diff against `git show HEAD~1`.
- 2026-10-01 — Merge-moment candidates: F-020; ARCHITECTURE layering update (codewalk → skills/use-worktree/scripts/ dependency; codewalk loses its "standalone" qualifier); supersede F-005 only if its verified wording ("execution-ordered worktree lifecycle" in the page) no longer holds — check at merge time; no new decision (D-008 covers the policy).
