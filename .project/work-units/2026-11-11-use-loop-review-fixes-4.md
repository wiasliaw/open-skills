# Work Unit: 2026-11-11-use-loop-review-fixes-4

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-11-11-use-loop-review-fixes-4
- **Created**: 2026-11-11
- **Work-unit tool reference**: none

## Contract

### Scope

Fixes for the fourth (optional) review items on PR #12. Three features.

#### Feature 1: `agents/sentinel.md`

- (3a) The `condition` example becomes a multi-line check that handles the no-checks case and a missing tool:

  ```
  command -v gh >/dev/null || exit 127
  out=$(gh pr checks 123 --json bucket); [ -n "$out" ] || out='[]'
  printf '%s' "$out" | jq -r 'if length == 0 or any(.[]; .bucket == "pending") then "pending" elif all(.[]; .bucket == "pass" or .bucket == "skipping") then "pass" else "fail" end'
  ```

  Baseline `pending`. The prose explains: right after a push `gh pr checks` exits non-zero with no stdout until the first check registers, so an empty result reads as `pending`; the first line surfaces a missing `gh` through the rc 127 path.
- (3a rule) Next to the `env FOO=1 cmd` sentence: a compound check (assignments, `;`, pipelines) starts with `command -v <tool> >/dev/null || exit 127;` so the first word is a real command and a missing tool is reported instead of masked.
- (3b) The terminal-baseline wording: `pass` and `fail` are the stop words of this loop, not final states of the pull request; a CI rerun returns the state to `pending`, so the orchestrator can start a new round with baseline `fail` when the user wants to wait for the rerun.
- Everything else unchanged, including the snippet body, marker, delimiters, signals, denylist.

#### Feature 2: `scripts/sentinel-snippet.test.mjs`

- (3c) Case 9 uses a portable source of varying stderr, `echo $RANDOM >&2` (bash builtin) or an equivalent that does not depend on `date +%N`. The assertion is unchanged. All ten cases stay green.

#### Feature 4: refusal list exception for `/dev/null`

The `shell` refusal list in `agents/sentinel.md` names redirection `>` or `>>`; the Feature 1 example uses `>/dev/null`. Add one clause to that list entry: redirection to `/dev/null` is allowed, because it discards output and writes nothing. Mirror the clause wherever `skills/use-loop/SKILL.md` or `docs/use-loop.md` repeats the redirection rule. No other change.

#### Feature 3: `skills/use-loop/SKILL.md`, `docs/use-loop.md`

- (1) `## Version control` aligns with `scripts/worktree.mjs`: the line is anchored to the repository root as `/.project/loops/`; the command creates the parent directory and guarantees a trailing newline before appending:

  ```bash
  f=$(git rev-parse --git-path info/exclude); mkdir -p "$(dirname "$f")"
  [ -s "$f" ] && [ "$(tail -c1 "$f" | wc -l)" -eq 0 ] && echo >> "$f"
  grep -qxF '/.project/loops/' "$f" 2>/dev/null || echo '/.project/loops/' >> "$f"
  ```

  The prose names the two rare cases (missing `info/` directory, file without a trailing newline). The default line text changes from `.project/loops/` to `/.project/loops/` everywhere the skill and docs quote it.
- (2) Step 2: the baseline is the check's stdout only (run it with stderr separated, for example `2>/dev/null` on the capture, and show stderr to the user when needed). If the check exits non-zero, show the user its stdout and stderr, do not write the journal, do not dispatch; fix the check first.
- (3a) The CI example in `shell` becomes the Feature 1 multi-line check with baseline `pending`, with the no-checks explanation; the `command -v <tool> >/dev/null || exit 127;` rule for compound checks appears beside the `env FOO=1 cmd` sentence.
- (3b) The terminal-baseline rule uses the Feature 1 wording (stop words; a rerun returns to `pending`; a new round with baseline `fail` is possible).
- Docs mirror (1), (2), (3a), (3b).
- Template and README unchanged.

### Verification Standards

Run from the repository root, in this order:

```
claude plugin validate .
node --test scripts/*.test.mjs
grep -q 'command -v gh >/dev/null || exit 127' agents/sentinel.md && grep -q 'command -v gh >/dev/null || exit 127' skills/use-loop/SKILL.md && grep -q 'command -v gh >/dev/null || exit 127' docs/use-loop.md
grep -q 'length == 0' agents/sentinel.md && grep -q 'length == 0' skills/use-loop/SKILL.md && grep -q 'length == 0' docs/use-loop.md
grep -qi 'stop word' agents/sentinel.md && grep -qi 'stop word' skills/use-loop/SKILL.md && grep -qi 'stop word' docs/use-loop.md
grep -qF "'/.project/loops/'" skills/use-loop/SKILL.md && grep -q 'mkdir -p' skills/use-loop/SKILL.md && grep -q 'tail -c1' skills/use-loop/SKILL.md && grep -qF '/.project/loops/' docs/use-loop.md
! grep -q 'date +%s%N' scripts/sentinel-snippet.test.mjs
git diff --quiet HEAD -- skills/harness-flow skills/handoff agents/implementor.md agents/reviewer.md scripts/worktree.mjs scripts/worktree.test.mjs .claude-plugin/plugin.json README.md skills/use-loop/templates
test -z "$(git ls-files -z | xargs -0 perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"
```

Exclude-command check for Feature 3 (reviewer): in a temp repository, remove `.git/info`, run the command, confirm the file exists with one line `/.project/loops/`; then write a file with content `x` and no trailing newline, run the command, confirm the content is `x`, newline, `/.project/loops/`, newline; run once more and confirm nothing was appended.

Step 2 ordering (contract from work unit 2) still holds: review in step 1, first check run in step 2.

### Exclusions

- Any change to `skills/harness-flow/`, `skills/handoff/`, `agents/implementor.md`, `agents/reviewer.md`, `scripts/worktree.mjs`, `scripts/worktree.test.mjs`, `.claude-plugin/plugin.json`, `README.md`, `skills/use-loop/templates/`, `CLAUDE.md`, `.gitignore`.
- Changing the snippet body, the `# sentinel-body` marker, the heredoc delimiters, the signal names, the handoff fields, the outcome values, the denylist, or the foreground-only wait rule.
- Adding CI workflows.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | sentinel carries a CI example that reads an empty result as pending and surfaces a missing tool, a compound-check prefix rule, and stop-word wording for terminal baselines | `claude plugin validate . && node --test scripts/sentinel-snippet.test.mjs && grep -q 'command -v gh >/dev/null \|\| exit 127' agents/sentinel.md && grep -q 'length == 0' agents/sentinel.md && grep -qi 'stop word' agents/sentinel.md` | passed (F-023) |
| 2 | snippet test case 9 varies stderr without `date +%N` and all ten cases pass | `node --test scripts/sentinel-snippet.test.mjs && ! grep -q 'date +%s%N' scripts/sentinel-snippet.test.mjs` | active |
| 3 | use-loop's exclude command creates the parent directory, guarantees a trailing newline, and anchors the line; step 2 captures stdout only and stops on a failing check; the CI example and stop-word rule match the agent; docs in sync | `claude plugin validate . && grep -qF "'/.project/loops/'" skills/use-loop/SKILL.md && grep -q 'mkdir -p' skills/use-loop/SKILL.md && grep -q 'tail -c1' skills/use-loop/SKILL.md && grep -q 'command -v gh >/dev/null \|\| exit 127' skills/use-loop/SKILL.md && grep -qi 'stop word' docs/use-loop.md && grep -qF '/.project/loops/' docs/use-loop.md` | not_started |
| 4 | the refusal list allows redirection to `/dev/null`, so the CI example is not refused | `grep -qi "redirection to `/dev/null` is allowed" agents/sentinel.md` | not_started |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-11-11 — feature 1, round 1: pass — reviewer ran feature chain (snippet 10/10), validate, all tests (33/33), exclusion diff, Han check; example run against PR 12 printed pending; through the body ended with TIMEOUT; missing tool ended with command missing. Non-blocking: wrong PR number reads as pending (outside contract); refusal list names `>` while the example uses `>/dev/null` — added as Feature 4.

## Notes

- 2026-11-11 — Opened from the fourth (optional) review items on PR #12; the user accepted all and asked to merge to `main` after this work unit. `gh pr checks --help` documents exit code 8 for pending; with no checks the command exits non-zero with empty stdout. Branch `research-use-loop-skill-spec`. Implementor and reviewer run as `general-purpose` subagents following `agents/implementor.md` and `agents/reviewer.md`.
- 2026-11-11 — Feature 1 passed review. Merge moment wrote F-023 and its index row. Feature 4 added to the contract from the reviewer's finding. Feature 2 set to active.
