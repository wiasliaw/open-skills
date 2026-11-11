# Work Unit: 2026-11-11-use-loop-review-fixes-2

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-11-11-use-loop-review-fixes-2
- **Created**: 2026-11-11
- **Work-unit tool reference**: none

## Contract

### Scope

Fixes for the second external review of PR #12 (head `f7d0d5a`). Four code items in two features; the PR description fix is the orchestrator's.

#### Feature 1: `agents/sentinel.md`

- (2) Remove the contradiction between "leave the body unchanged" and "replace the `!=` test with the predicate". Delete the predicate-replacement sentence. The `condition` field is always "current differs from baseline". A predicate is encoded in the check itself: the check prints `true` or `false` (or any two distinct words), and the baseline is the word observed before dispatch. State this where the `condition` field is defined and give one example.
- (3) Extend `disallowedTools` with `PowerShell`, `RemoteTrigger`, `Workflow`, and `Skill`. The Prohibitions sentence that describes what the denylist removes names the new entries' purpose: no shell other than Bash, no cloud scheduled task, no workflow or skill that could dispatch agents or schedule work.
- Everything else unchanged, including the snippet body and the `# sentinel-body` marker; `scripts/sentinel-snippet.test.mjs` must keep passing.

#### Feature 2: `skills/use-loop/SKILL.md`, `docs/use-loop.md`

- (1) Reorder the Procedure so review precedes execution. Step 1: resolve the journal location and compose the loop record (id, condition, check kind, full check text, interval, deadline) with no check executed yet; show the complete record to the user; state that the check MUST be read-only; a check that creates, modifies, or deletes anything, runs version-control commands, or writes to an external system is not run and not dispatched. Step 2: run the check once for the baseline, write the journal from the template with Status `open`, apply the Version control rule, dispatch `open-skills:sentinel` with `run_in_background: true` and the loop record, record the round start. Steps 3 to 5 unchanged. Exactly five numbered steps remain.
- (2) Replace every "predicate becomes true" wording in the skill and the docs with the check-encodes-the-predicate rule from Feature 1, including the Terms list.
- (3) The `## Safety` section lists the extended denylist and no longer states a count that would go stale.
- (4) `## Version control` fixes the exact line appended to `.git/info/exclude`: the loops directory relative to the repository root with a trailing slash, by default `.project/loops/`; append only when `grep -qxF '<line>' .git/info/exclude` fails; name the equivalent command. State that the orchestrator never edits a tracked `.gitignore` for this.
- Docs mirror the reorder, the predicate rule, the extended denylist, and the exact exclude line.
- Template unchanged unless it mentions "predicate"; README unchanged.

### Verification Standards

Run from the repository root, in this order:

```
claude plugin validate .
node --test scripts/*.test.mjs
! grep -q 'replace the `!= "\$BASELINE"` test' agents/sentinel.md && ! grep -qi 'predicate becomes true' agents/sentinel.md skills/use-loop/SKILL.md docs/use-loop.md skills/use-loop/templates/LOOP.md.template
grep -q '^disallowedTools:' agents/sentinel.md && for t in PowerShell RemoteTrigger Workflow Skill Write Edit NotebookEdit Agent SendMessage TaskStop Monitor CronCreate CronDelete ScheduleWakeup AskUserQuestion; do grep -q "^disallowedTools:.*\b$t\b" agents/sentinel.md || { echo "missing $t"; exit 1; }; done
grep -q 'grep -qxF' skills/use-loop/SKILL.md && grep -q '\.project/loops/`' skills/use-loop/SKILL.md && grep -q 'info/exclude' docs/use-loop.md
awk '/^## Procedure/{f=1;next} /^## /{f=0} f && /^[0-9]\. /{n++} END{exit n!=5}' skills/use-loop/SKILL.md
grep -qi 'RemoteTrigger' skills/use-loop/SKILL.md && grep -qi 'RemoteTrigger' docs/use-loop.md
git diff --quiet HEAD -- skills/harness-flow skills/handoff agents/implementor.md agents/reviewer.md scripts .claude-plugin/plugin.json README.md
test -z "$(git ls-files -z | xargs -0 perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"
```

Ordering check for Feature 2: in the Procedure, the sentence that shows the record to the user and the read-only statement appear in step 1, and the first occurrence of "Run the check once" appears in step 2.

### Exclusions

- Any change to `skills/harness-flow/`, `skills/handoff/`, `agents/implementor.md`, `agents/reviewer.md`, `scripts/`, `.claude-plugin/plugin.json`, `README.md`, `CLAUDE.md`, `.gitignore`.
- Changing the snippet body, the `# sentinel-body` marker, the heredoc delimiters, the handoff fields, the outcome values, or the foreground-only wait rule.
- Adding CI workflows.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | sentinel defines the condition as "differs from baseline" with predicates encoded in the check output, carries no body-editing instruction, and denies PowerShell, RemoteTrigger, Workflow, and Skill in addition to the previous eleven tools | `claude plugin validate . && node --test scripts/sentinel-snippet.test.mjs && ! grep -qi 'predicate becomes true' agents/sentinel.md && ! grep -qF 'replace the' agents/sentinel.md && grep -q '^disallowedTools:.*PowerShell' agents/sentinel.md && grep -q '^disallowedTools:.*RemoteTrigger' agents/sentinel.md && grep -q '^disallowedTools:.*Workflow' agents/sentinel.md && grep -q '^disallowedTools:.*Skill' agents/sentinel.md` | passed (F-018) |
| 2 | use-loop reviews the loop record with the user before any check runs, encodes predicates in the check, lists the extended denylist without a stale count, and fixes the exact idempotent `.git/info/exclude` line, with docs in sync | `claude plugin validate . && ! grep -qi 'predicate becomes true' skills/use-loop/SKILL.md docs/use-loop.md && grep -q 'grep -qxF' skills/use-loop/SKILL.md && grep -qi 'RemoteTrigger' skills/use-loop/SKILL.md && grep -qi 'RemoteTrigger' docs/use-loop.md && grep -q 'info/exclude' docs/use-loop.md && awk '/^## Procedure/{f=1;next} /^## /{f=0} f && /^[0-9]\. /{n++} END{exit n!=5}' skills/use-loop/SKILL.md` | passed (F-019) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-11-11 — feature 1, round 1: pass — reviewer ran feature chain (snippet suite 7/7), validate, all tests (30/30), fifteen-tool loop, exclusion diff, Han check; condition definition quoted; no body-editing sentence remains; no hunk inside the fenced block.
- 2026-11-11 — feature 2, round 1: pass — reviewer ran feature chain, validate, all tests (30/30), four-file predicate grep, exclude-line grep, exclusion diff, all-files Han check; ordering verified by line (review in step 1, first check run in step 2); five steps; Safety lists fifteen tools in agent order; docs mirror; template changed only in the Condition placeholder.

## Notes

- 2026-11-11 — Opened from the second external review of PR #12. All five items verified and accepted; the user also accepted denying `Skill`. D-011 names eleven denied tools, so D-013 supersedes it at Feature 1's merge moment. The stale "No new `scripts/`" line in the PR description is fixed by the orchestrator after the work unit closes. Branch `research-use-loop-skill-spec`. Implementor and reviewer run as `general-purpose` subagents following `agents/implementor.md` and `agents/reviewer.md`.
- 2026-11-11 — Feature 1 passed review. Merge moment wrote F-018, D-013 (supersedes D-011, moved to archive), and index rows. Feature 2 set to active.
- 2026-11-11 — Feature 2 passed review. Merge moment wrote F-019 and its index row. Both features passed; work unit closed and archived. PR description and reply posted by the orchestrator.
