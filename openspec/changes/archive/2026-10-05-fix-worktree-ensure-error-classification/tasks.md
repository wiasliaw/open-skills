# Tasks

## 1. Fix classification in ensureBranch

- [x] 1.1 In `scripts/worktree.mjs` `ensureBranch`, run `check-ref-format` with `LC_ALL=C` via `runGit`'s `opts.env`; classify non-zero exits: stderr matching `not a valid branch name` → `Fail('usage', ...)`, anything else → `Fail('git_failed', ...)` carrying git's stderr. Keep the `branch.startsWith('-')` guard as `usage`.

## 2. Tests

- [x] 2.1 Add/extend script tests: invalid branch name still exits 2 (`usage`); a `check-ref-format` failure with a broken `GIT_CONFIG_GLOBAL` exits 9 (`git_failed`) and the message contains git's stderr.
- [x] 2.2 Run the existing worktree script test suite; all green.
