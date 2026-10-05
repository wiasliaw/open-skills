# Fix worktree ensure error classification

## Why

`scripts/worktree.mjs` `ensureBranch` reports every non-zero exit of `git check-ref-format --branch` as `usage: invalid branch name` (exit 2). But environment failures — a broken global gitconfig, or git < 2.18 run outside a repository — also exit 128, so they are misreported as an invalid branch name, masking the real root cause. This violates the `skill-use-worktree` spec, which requires "distinct exit codes per failure class" and that consumers report blocked "with the script's error code".

## What Changes

- `ensureBranch` classifies `check-ref-format` failures: only a genuine "not a valid branch name" stderr becomes `usage`; any other non-zero exit becomes `git_failed` with git's stderr in the message.
- The `check-ref-format` invocation pins `LC_ALL=C` so the stderr match is not broken by localized git messages.
- The existing `branch.startsWith('-')` guard stays unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-use-worktree`: clarifying delta on "Mechanics are script-owned" — an environmental git failure SHALL be reported as the git failure class with git's stderr, never masked as a usage error. This pins down behavior the "distinct exit codes per failure class" clause already implies; the fix itself is conformance repair.

## Impact

- `scripts/worktree.mjs` (`ensureBranch`, ~5 lines)
- Script tests covering the `ensure` error classes
