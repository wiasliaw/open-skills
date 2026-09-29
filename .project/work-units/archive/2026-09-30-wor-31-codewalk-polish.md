# Work Unit: 2026-09-30-wor-31-codewalk-polish

- **Work-unit identifier**: 2026-09-30-wor-31-codewalk-polish
- **Created**: 2026-09-30
- **Work-unit tool reference**: none (source: user decisions on the three pending items from `.project/handoff.md` Next Steps at commit 72e1116 — "1. 刪掉 2. Pinned at 去重 3. (a) (b) 都做")

## Contract

### Scope

Four user-decided cleanups on branch `feature/wor-31-codewalk`, touching exactly `skills/codewalk/SKILL.md`, `skills/codewalk/templates/walkthrough.md.template`, and `docs/codewalk.md`. Baseline for this round's diff: commit `72e1116` (HEAD before this work unit opened).

1. **Remove the one-question cap** — in `skills/codewalk/SKILL.md` Step 1, drop the "at most one" numeric cap from "Ask at most one clarifying question, and only when the request is genuinely ambiguous." The restraint survives without the number (e.g. "Ask clarifying questions only when the request is genuinely ambiguous."). The later reference "folded into the clarifying question or the first stop" stays coherent. Sync `docs/codewalk.md` step 1 ("asks at most one clarifying question") to match (C-002).
2. **Deduplicate the per-stop pin** — remove the `- Pinned at: {{commit_pin}}` line from the template's per-stop section (the header `Commit pin:` line is the single pin; within one walk they can never differ). Remove/adjust the SKILL.md Step 5 sentence that references the per-stop `Pinned at:` line, keeping its snapshot-fencing rule. In `docs/codewalk.md` step 5, drop "the pinned SHA" from the per-stop content list (anchor, `file:line`, snapshot remain). The walk-level pin rule in Step 3 and the header pin/drift notice stay untouched.
3. **docs fallback/Requirements dedup** — `docs/codewalk.md`'s fallback paragraph ("Without git, without commits, …pins `unknown`") and its `## Requirements` section repeat the degraded mode. State it once; no information lost: the triggers (no git / no commits / worktree creation or read failure), reading the working tree, pinning `unknown`, and that `git` is the only requirement must all survive. The citation-boundaries sentence (dependencies/vendored/submodules) is not duplication — keep it.
4. **Worktree lifecycle as numbered steps** — convert the `### Worktree lifecycle` bullet list in `skills/codewalk/SKILL.md` to numbered steps in execution order (resolve path → reuse check → create → exclude append → probe-read then pin; stale-registration recovery and the no-cleanup/persistence rule keep their content wherever they read most naturally in the sequence). Content-preserving: every rule, the exact creation invocation, and the NEVER-prune warning survive verbatim-or-equivalent.

### Verification Standards

Run from the repo root, in order; all must succeed:

1. `claude plugin validate .`
2. `! grep -q 'at most one' skills/codewalk/SKILL.md docs/codewalk.md` — numeric cap gone from both.
3. `! grep -q 'Pinned at' skills/codewalk/templates/walkthrough.md.template skills/codewalk/SKILL.md docs/codewalk.md` — per-stop pin line and references gone.
4. `grep -q 'Commit pin: {{commit_pin}}' skills/codewalk/templates/walkthrough.md.template` — header pin survives.
5. `[ "$(grep -c 'unknown' docs/codewalk.md)" -eq 1 ]` — degraded mode stated once in docs.
6. `sed -n '/### Worktree lifecycle/,/^### /p' skills/codewalk/SKILL.md | grep -qE '^[0-9]+\.'` — lifecycle is numbered.
7. `[ "$(git diff 72e1116 --name-only -- ':!.project' | sort | tr '\n' ' ')" = "docs/codewalk.md skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template " ]` — exactly the three files (work-unit state excluded by pathspec).
8. `git diff main --name-only | grep -qx 'skills/request-code-review/reviewer-prompt.md'; [ $? -ne 0 ]`
9. `git diff main --name-only | grep -qx '.claude-plugin/plugin.json'; [ $? -ne 0 ]`
10. Reviewer judgment: every worktree-lifecycle rule survives the renumbering verbatim-or-equivalent (path resolution, reuse conditions, exact creation invocation, exclude-append with newline guard, probe-read-before-pin, stale-registration recovery with NEVER-prune, persistence); the docs dedup loses no fact; the clarifying-question restraint survives without the cap; the template per-stop record is anchor + location + snapshot with the drift notice intact.

### Exclusions

- The header `Commit pin:` line, drift notice (both variants), and Step 3 walk-level pin rule stay as-is.
- The "only when genuinely ambiguous" restraint stays — only the numeric cap is removed.
- No changes to README.md, any other skill, agents, or `.harness/`; no version bump; everything excluded by the parent work units.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk polish: question cap removed, per-stop pin deduplicated to the header, docs degraded mode stated once, worktree lifecycle in execution order — no rule lost | contract checks 1–9 plus reviewer judgment 10 | passed (F-005) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-30 — feature 1, round 1: **pass** — checks 1–9 all exit 0; hunk audit clean (all lifecycle rules survive the renumbering, docs dedup loses no fact, restraint survives without the cap, template record = anchor + location + snapshot, every hunk maps to a scoped change). Scores 5/5, 5/5, 4/5; two non-blocking wrap-width nits (one overlong line each in docs step 1 and SKILL.md Step 5) left unfixed to keep the diff minimal.

## Notes

- 2026-09-30 — Opened on explicit user decisions resolving all three pending items: question cap 刪掉; per-stop Pinned at 去重; deferred minors (a) docs dedup and (b) numbered lifecycle both approved. The Pinned-at removal deviates from WOR-31's literal per-stop content list on user decision — record as a D entry at the merge moment.
- 2026-09-30 — Baseline `72e1116` is the commit before this work unit opened; check 7 excludes `.project/` by pathspec so orchestrator state edits cannot pollute the diff (lesson from the structural round's check-5 caveat).
