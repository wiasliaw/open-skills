# Features

<!--
Purpose: index of active verified behavior — passing-only. A row's presence IS its passing state; there is no other status field here. The full record lives in `features/F-NNN.md`.
Written by: the orchestrator (main session) only, at a merge moment (completion of a verified work unit; never at init, since nothing is verified yet). Never written by implementor or reviewer agents.
Reading: read this index in full; read a detail file only when the work at hand touches what its row covers. Archived entries are not read unless a detail file points at one.
Entry format: each detail file follows the plugin's FEATURE-ENTRY template and MUST record a behavior description, the executable verification command that proves it, and evidence — at minimum the reviewer verdict date, a verification output summary, and the work-unit identifier. Commit hashes are NOT used as evidence references. An entry whose verification is not an executable command is malformed — produce the command first. IDs are allocated sequentially across `features/` and `features/archive/` and never reused.
Rule: entries are never demoted and evidence is never removed; pre-passing states (not_started, active, blocked) live in the work-unit state file (short-term memory), not here. A detail file's content is never edited. The only permitted change is retirement, made at the merge moment of a work unit whose contract Scope names the removal or replacement of that behavior: set the entry's Status to `superseded by F-NNN` or `retired in <work-unit identifier>`, move it to `features/archive/`, and remove its row here.
-->

| ID | Behavior | Work unit |
|---|---|---|
| F-001 | Structure lens carries concrete maintainability standards | 2026-09-27-thicken-lens2 |
| F-002 | codewalk skill ships an interactive anchored walkthrough with docs and README wiring | 2026-09-30-wor-31-codewalk |
| F-003 | codewalk worktree procedure is concrete and safe under linked worktrees, subdirectory launches, and hooked repos | 2026-09-30-wor-31-codewalk-fixes |
| F-004 | codewalk SKILL.md defines the stop record once and carries no duplicate mode/fallback sections | 2026-09-30-wor-31-codewalk-structural |
| F-005 | codewalk skill carries no question cap, no per-stop pin, one docs degraded-mode statement, and an execution-ordered worktree lifecycle | 2026-09-30-wor-31-codewalk-polish |
| F-007 | use-worktree needs no configuration — the script reads no config file and has no setup subcommand, worktrees branch from HEAD at .project/worktrees/<id>, and the skill page, doc, and README say so | 2026-10-16-wor-37-use-worktree-no-config |
| F-008 | pm skill ships a shared human and agent Linear board protocol — SKILL.md at most 100 lines and usable alone, public policy defaults, five references, docs page and README wiring | 2026-10-30-wor-73-pm-skill |
| F-009 | sentinel agent waits for one state change in foreground Bash only, stays read-only, and ends with one fixed-format handoff | 2026-11-10-use-loop-skill |
| F-010 | use-loop skill carries the five-step orchestrator protocol, journal ownership, one-sentinel-per-loop, deadline requirement, clock-out rule, and out-of-scope pointers, with a LOOP journal template | 2026-11-10-use-loop-skill |
| F-011 | use-loop ships a docs page and README wiring, and every tracked agent, skill, docs, and README file is English | 2026-11-10-use-loop-skill |
| F-012 | an orchestrator run with the plugin loaded waits on a shell check through a background sentinel and reports `outcome: changed` after the file appears, writing nothing into the repository | 2026-11-10-use-loop-skill |
| F-013 | use-loop states the default journal location and the override rule in the skill, the template comment, and the docs page, with the sentinel unchanged | 2026-11-10-use-loop-journal-location |
| F-014 | every tracked file is English, including archived work units | 2026-11-10-use-loop-journal-location |
| F-015 | sentinel passes CHECK and BASELINE by heredoc, validates its parameters, exits on sleep failure, carries the failure count across re-arms, requires a read-only check, treats evidence as untrusted, checks first in tool ticks, and denies write and control tools in frontmatter | 2026-11-11-use-loop-review-fixes |
| F-016 | a node:test suite extracts the sentinel wait snippet and proves changed, quoting, bad interval, command missing, three failures across re-arms, counter carry and reset, and unchanged timeout | 2026-11-11-use-loop-review-fixes |
| F-017 | use-loop skill, template, and docs carry the pre-dispatch record review, read-only check rule, untrusted evidence rule, Safety and Version control sections, check-first tick, no duplicated snippet, and a clock-out sentence that does not claim a harness-flow change | 2026-11-11-use-loop-review-fixes |
| F-018 | sentinel defines the condition as "differs from baseline" with predicates encoded in the check output, carries no body-editing instruction, and denies PowerShell, RemoteTrigger, Workflow, and Skill in addition to the previous eleven tools | 2026-11-11-use-loop-review-fixes-2 |
| F-019 | use-loop reviews the loop record with the user before any check runs, encodes predicates in the check, lists the extended denylist without a stale count, and fixes the exact idempotent .git/info/exclude line, with docs in sync | 2026-11-11-use-loop-review-fixes-2 |
| F-020 | sentinel bounds each sleep by the time left, compares stdout only with stderr shown only in failure evidence, documents the env FOO=1 cmd form, and carries a three-state CI example with a terminal-baseline rule | 2026-11-11-use-loop-review-fixes-3 |
| F-021 | the snippet test proves bounded sleep, stderr-insensitive comparison, and stderr evidence ordering on failure, with the earlier seven cases still green | 2026-11-11-use-loop-review-fixes-3 |
| F-022 | use-loop resolves the exclude file with git rev-parse --git-path, carries the three-state CI example and the terminal-baseline rule, states stdout-only comparison and the env form, with docs in sync | 2026-11-11-use-loop-review-fixes-3 |
| F-023 | sentinel carries a CI example that reads an empty result as pending and surfaces a missing tool, a compound-check prefix rule, and stop-word wording for terminal baselines | 2026-11-11-use-loop-review-fixes-4 |
| F-024 | snippet test case 9 varies stderr without date +%N and all ten cases pass | 2026-11-11-use-loop-review-fixes-4 |
| F-025 | use-loop exclude command creates the parent directory, guarantees a trailing newline, and anchors the line; step 2 captures stdout only and stops on a failing check; CI example and stop-word rule match the agent; docs in sync | 2026-11-11-use-loop-review-fixes-4 |
