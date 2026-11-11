# Work Unit: 2026-11-11-use-loop-review-fixes-3

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-11-11-use-loop-review-fixes-3
- **Created**: 2026-11-11
- **Work-unit tool reference**: none

## Contract

### Scope

Fixes for the third external review of PR #12 (head `f6c57f4`). Three features.

#### Feature 1: `agents/sentinel.md`

- (2) Bounded sleep. Inside the loop the snippet sleeps for the smaller of `INTERVAL` and the seconds left until `end`; when none are left it does not sleep. A single wait call therefore never runs past `LIMIT` plus one check duration. The prose states this and adds that the check itself must finish within a few seconds, because the 540000 ms Bash timeout leaves a 30 s margin above `LIMIT`.
- (3) Stdout-only comparison. The check's stdout alone is captured and compared with `BASELINE`; stderr is discarded on the comparison path. On a failure path (`rc` 127 or three consecutive non-zero exits) the snippet runs the check once more with stdout discarded and stderr captured, and prints up to 10 stderr lines after the stdout lines as evidence. The prose states that a failing check runs twice, which the read-only rule makes safe. No temp file is used.
- (4) CI example. The `condition` example becomes a three-state check built on `gh pr checks --json bucket`, whose `bucket` is one of `pass`, `fail`, `pending`, `skipping`, `cancel`: print `pending` when any bucket is `pending`, else `pass` when every bucket is `pass` or `skipping`, else `fail`. Baseline `pending`. The prose notes that a baseline already at `pass` or `fail` means there is nothing to wait for and the orchestrator reports it without dispatching.
- (env) One sentence after the command-missing pre-check description: a check that starts with an environment assignment is written as `env FOO=1 cmd`.
- Everything else unchanged: `# sentinel-body` marker, heredoc delimiters, parameter validation, signal names, `fails=<n>` carry, handoff fields, outcome values, denylist, foreground-only rule.

#### Feature 2: `scripts/sentinel-snippet.test.mjs`

Two new cases, keeping the existing seven green:

8. Bounded sleep: `INTERVAL=5`, `LIMIT=2`, unchanged check; the run ends with `SENTINEL_TIMEOUT: still unchanged fails=0` in under 4 s wall time.
9. Stderr ignored: a check whose stdout is constant and equal to `BASELINE` but whose stderr differs on every call (for example `echo stable; date +%N >&2` or a counter file written by the test and echoed to stderr); with `LIMIT=3`, `INTERVAL=1` the run ends with `SENTINEL_TIMEOUT: still unchanged fails=0`, never `SENTINEL_CHANGED`.

Also extend case 4 or add an assertion to an existing failure case so that the stderr evidence line from the re-run appears after the stdout lines (for example a check `echo out; echo err >&2; exit 1` with `FAILS=2` must print `SENTINEL_FAILED: three consecutive non-zero exits (last 1)`, then `out`, then `err`).

#### Feature 3: `skills/use-loop/SKILL.md`, `docs/use-loop.md`

- (1) `## Version control` resolves the exclude file with `git rev-parse --git-path info/exclude` instead of the literal `.git/info/exclude`, states why (in a linked worktree `.git` is a file), and gives the equivalent command, for example:

  ```bash
  f=$(git rev-parse --git-path info/exclude); grep -qxF '.project/loops/' "$f" 2>/dev/null || echo '.project/loops/' >> "$f"
  ```

  The reference to `scripts/worktree.mjs` stays, since it uses the same call.
- (4) The CI example becomes the three-state check from Feature 1 with baseline `pending`. The procedure or the example states that when the baseline is already a terminal word, the orchestrator reports it and does not dispatch.
- (env) The `shell` section carries the `env FOO=1 cmd` sentence.
- The `shell` section states that only stdout is compared and that stderr appears only in failure evidence.
- Docs mirror: the `git rev-parse --git-path` resolution with the worktree reason, the three-state CI example, the terminal-baseline rule, stdout-only comparison, and the `env` sentence.
- Template and README unchanged.

### Verification Standards

Run from the repository root, in this order:

```
claude plugin validate .
node --test scripts/*.test.mjs
grep -q 'git rev-parse --git-path info/exclude' skills/use-loop/SKILL.md && grep -q 'git rev-parse --git-path info/exclude' docs/use-loop.md && ! grep -q "grep -qxF '.project/loops/' .git/info/exclude" skills/use-loop/SKILL.md
grep -q 'bucket' agents/sentinel.md && grep -q 'bucket' skills/use-loop/SKILL.md && grep -q 'bucket' docs/use-loop.md && ! grep -qF 'all(.[]; .state == "SUCCESS")' agents/sentinel.md skills/use-loop/SKILL.md docs/use-loop.md
grep -q 'env FOO=1' agents/sentinel.md && grep -q 'env FOO=1' skills/use-loop/SKILL.md
grep -c 'SENTINEL_TIMEOUT' scripts/sentinel-snippet.test.mjs | awk '{exit $1<3}'
git diff --quiet HEAD -- skills/harness-flow skills/handoff agents/implementor.md agents/reviewer.md scripts/worktree.mjs scripts/worktree.test.mjs .claude-plugin/plugin.json README.md skills/use-loop/templates
test -z "$(git ls-files -z | xargs -0 perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"
```

Snippet behavior checks (the reviewer runs them by extracting the body as the test does): with `INTERVAL=5`, `LIMIT=2` the body ends in under 4 s; with a check whose stderr varies and stdout is stable, the body ends with `SENTINEL_TIMEOUT`; with `echo out; echo err >&2; exit 1` and `FAILS=2` the output is the failure line, `out`, then `err`.

### Exclusions

- Any change to `skills/harness-flow/`, `skills/handoff/`, `agents/implementor.md`, `agents/reviewer.md`, `scripts/worktree.mjs`, `scripts/worktree.test.mjs`, `.claude-plugin/plugin.json`, `README.md`, `skills/use-loop/templates/`, `CLAUDE.md`, `.gitignore`.
- Changing the `# sentinel-body` marker, the heredoc delimiters, the signal names, the handoff fields, the outcome values, the denylist, or the foreground-only wait rule.
- Any temp file created by the snippet itself.
- Adding CI workflows.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | sentinel bounds each sleep by the time left, compares stdout only with stderr shown only in failure evidence, documents the `env FOO=1 cmd` form, and carries a three-state CI example with a terminal-baseline rule | `claude plugin validate . && node --test scripts/sentinel-snippet.test.mjs && grep -q 'bucket' agents/sentinel.md && grep -q 'env FOO=1' agents/sentinel.md && ! grep -qF 'all(.[]; .state == "SUCCESS")' agents/sentinel.md && ! grep -q 'out=\$(bash -c "\$CHECK" 2>&1)' agents/sentinel.md` | passed (F-020) |
| 2 | the snippet test proves bounded sleep, stderr-insensitive comparison, and stderr evidence ordering on failure, with the earlier seven cases still green | `node --test scripts/sentinel-snippet.test.mjs` | passed (F-021) |
| 3 | use-loop resolves the exclude file with `git rev-parse --git-path`, carries the three-state CI example and the terminal-baseline rule, states stdout-only comparison and the `env` form, with docs in sync | `claude plugin validate . && grep -q 'git rev-parse --git-path info/exclude' skills/use-loop/SKILL.md && grep -q 'git rev-parse --git-path info/exclude' docs/use-loop.md && grep -q 'bucket' skills/use-loop/SKILL.md && grep -q 'bucket' docs/use-loop.md && grep -q 'env FOO=1' skills/use-loop/SKILL.md && ! grep -qF 'all(.[]; .state == "SUCCESS")' skills/use-loop/SKILL.md docs/use-loop.md` | passed (F-022) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-11-11 — feature 1, round 1: pass — reviewer ran feature chain, all tests (30/30), exclusion diff, Han check; five snippet body runs (bounded sleep 2029 ms, stderr-insensitive, failure evidence order, changed, missing command); hunks confined to capture, failure paths, sleep lines.
- 2026-11-11 — feature 2, round 1: pass — reviewer ran the suite (10/10), validate, all tests (33/33), TIMEOUT count 4, exclusion diff, Han check; one additive hunk; cases 1 to 7 unchanged; macOS `date +%N` caveat noted and still valid.
- 2026-11-11 — feature 3, round 1: pass — reviewer ran feature chain, validate, all tests (33/33), absence greps, exclusion diff, Han check; exclude command run twice in a temp linked worktree (exit 0, resolved to the main .git/info/exclude, one line, idempotent); docs mirror; consistent with agents/sentinel.md.

## Notes

- 2026-11-11 — Opened from the third external review of PR #12. Four items and one suggestion verified and accepted. Item 1 reproduces in this worktree: `.git` is a file and `git rev-parse --git-path info/exclude` resolves to the main checkout. `gh pr checks --help` confirms `bucket` values `pass`, `fail`, `pending`, `skipping`, `cancel`. Branch `research-use-loop-skill-spec`. Implementor and reviewer run as `general-purpose` subagents following `agents/implementor.md` and `agents/reviewer.md`.
- 2026-11-11 — Feature 1 passed review. Merge moment wrote F-020 and its index row. Feature 2 set to active.
- 2026-11-11 — Feature 2 passed review. Merge moment wrote F-021 and its index row. Feature 3 set to active.
- 2026-11-11 — Feature 3 passed review. Merge moment wrote F-022 and its index row. All three features passed; work unit closed and archived. Reply posted on PR #12 by the orchestrator.
