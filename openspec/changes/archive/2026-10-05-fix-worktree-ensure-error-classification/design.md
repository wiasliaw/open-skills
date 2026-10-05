# Design

## Context

`runGit` (scripts/worktree.mjs:99) already distinguishes spawn failures — `r.error` throws `git_failed` — so "git cannot run at all" is handled. The gap is non-zero exits: `ensureBranch` (scripts/worktree.mjs:324) collapses every `!r.ok` into `Fail('usage', 'invalid branch name: ...')`. Verified empirically: `git check-ref-format --branch 'bad..name'` and the same command under a broken global gitconfig both exit 128; only stderr tells them apart (`fatal: '...' is not a valid branch name` vs `fatal: bad config line ...`).

## Decision

Classify by stderr, pinned to the C locale:

```
r = runGit(['check-ref-format', '--branch', branch], { env: { LC_ALL: 'C' } })
├─ r.ok                                   → pass
├─ r.err matches /not a valid branch name/ → Fail('usage', 'invalid branch name: ' + branch)
└─ any other non-zero exit                 → Fail('git_failed', 'check-ref-format failed: ' + r.err)
```

- `LC_ALL=C` via the existing `opts.env` hook in `runGit` keeps git's message untranslated so the match is stable.
- Benign degradation: if git ever rewords the message, an invalid name misclassifies into `git_failed` — wrong class, but the thrown message still carries git's stderr verbatim, so the root cause is never swallowed again.
- The `branch.startsWith('-')` guard (protects against the name being eaten as an option) remains, still mapped to `usage`.

## Alternatives considered

- **Append stderr to the usage message only**: root cause surfaces but the exit code stays wrong (2 instead of 9), still violating "distinct exit codes per failure class". Rejected.
