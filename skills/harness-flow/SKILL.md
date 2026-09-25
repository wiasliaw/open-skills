---
name: harness-flow
description: Use when a session in a project whose root CLAUDE.md declares harness adoption is about to produce or modify a deliverable — code, docs, or configuration — or when the user runs /open-skills:harness-flow. Turns the main session into an orchestrator that runs the clock-in/dispatch/reviewer-gate/merge/clock-out loop instead of producing deliverables itself. Does not apply in a project that has not declared harness adoption unless the command is invoked explicitly.
---

# harness-flow

Turn the main session into an orchestrator. The orchestrator reads state, decides, dispatches, and records — it never produces a deliverable itself, and it never verifies its own or the implementor's work in place of the reviewer.

## Applicability

This skill loads when either is true:

- The session is in a project whose root CLAUDE.md declares harness adoption, and is about to produce or modify a deliverable.
- The user explicitly invokes `/open-skills:harness-flow`.

If the project's CLAUDE.md does not declare harness adoption and the command was not invoked explicitly, this skill does not apply — do not load it and do not run its loop.

## Orchestrator prohibitions

The main session, once this skill is loaded:

- MUST NOT produce any deliverable itself — no writing or editing code, docs, or configuration directly. If you catch yourself about to make the change directly, stop and dispatch it to the `open-skills:implementor` agent instead.
- MUST NOT verify its own work or the implementor's work in place of the reviewer. A feature is complete only on a `open-skills:reviewer` pass verdict — never on the orchestrator's own judgment or the implementor's self-report.
- MAY write to the project root's `.harness/` — but only as state recording (the merge moment, below), never as a way of producing or patching a deliverable.

## File-access scope

The orchestrator's reads are confined to the project it is running in:

- Project-state paths — the project root's `.harness/`, the declared short-term memory location, the declared work-unit tool's state, the declared session-memory location, and CLAUDE.md — resolve against the consuming project's root: the directory whose root CLAUDE.md declares harness adoption.
- Plugin-bundled assets (skills, templates) are read only via their `${CLAUDE_PLUGIN_ROOT}`-anchored paths.
- MUST NOT locate skills, templates, or project state by filesystem-wide search (e.g. searching under `~/.claude/plugins/` or from the filesystem root). Files that resemble `.harness/` memory files or capability specs but sit outside the project root — for example inside a plugin marketplace clone — are not project state and are not read as such.
- MUST NOT read files outside the project root, except on explicit user direction naming the outside location — and then only that named file, not a widened scope.

## VCS is not prescribed here

This skill prescribes no version-control operations: no commit points, no commit actor, no commit format. Any commits, branches, or checkpoints around dispatch or the merge moment follow the VCS strategy the project declared at init — that declaration governs the how; this loop only requires, at clock-out, that no work is left outside version control. Do not invent a commit convention here or assume one from another workflow. Within the loop, the orchestrator is the only actor that performs VCS operations — the implementor and reviewer never do; the declared strategy governs how and when.

## Clock-in

At the start of the loop:

1. Read the project root's `.harness/`: `ARCHITECTURE.md` and `CONSTRAINTS.md` in full, and the `DECISIONS.md` and `FEATURES.md` indexes. Do not bulk-read `.harness/decisions/` or `.harness/features/`: read a detail file only when the work at hand touches what its index row covers, and never read `archive/` entries unless a detail file points at one.
2. List the short-term memory location (CLAUDE.md Harness section's `short-term memory:` bullet), excluding its `archive/` subdirectory, for work-unit state files. If one is found, offer to resume it before starting anything new — its Features, Review Log, and Notes show where it stopped. If a work-unit tool is declared, also scan it for in-flight work units that have no state file, and offer to adopt one (its state file is written before dispatch). A legacy contract file holding only Scope, Verification Standards, and Exclusions counts as that work unit's state file; add the missing sections from the template at its next write.
3. Check the declared session-memory location (CLAUDE.md Harness section's `session memory:` bullet) for a handoff file. If found, read it and offer resumption informed by its content — in-flight decisions, dead ends, next steps — alongside any in-flight work unit; leave the file in place, since its disposal belongs to the next clock-out, not clock-in. If CLAUDE.md declares no session-memory location, report that no session memory is declared and proceed.
4. Read the whole Workflow table under CLAUDE.md's Workflow heading, and infer from phase names and HOW content which phase(s) verify the work; run the inferred phases' executable commands, in table order, to confirm the starting state is clean. An inferred verification phase whose HOW is a manual prose step or TBD is skipped, never executed as if it were a command, and reported as not auto-checkable. When no phase is inferable as verification, or no inferred phase carries an executable command, skip the clean-state command run and report that no executable project-level verification is declared.

If clock-in finds a dirty starting state — failing build/tests, or an unfinished work unit — report it to the user and propose fixing it as the first work item, rather than layering the planned feature on top of it.

## WIP=1 scheduling and contract-based dispatch

Hold at most one active work unit per session, and within it at most one active feature at a time. If the plan contains multiple independent features, process them strictly one at a time: complete verification and the merge moment for one before activating the next.

Every work unit has one state file at the short-term memory location, following this plugin's template at `${CLAUDE_PLUGIN_ROOT}/skills/harness-flow/templates/WORK-UNIT.md.template`: a Contract (Scope, Verification Standards, Exclusions), a Features table, a Review Log, and Notes. The format is the same whether or not a work-unit tool is declared:

- **No work-unit tool** — the Contract sections are written inline.
- **Work-unit tool declared** — the tool owns what it records (e.g. a change proposal's scope and acceptance criteria, a task checklist) and is written per its own convention. Each Contract section the tool records is a pointer (`path` § heading) to it, never a copy; a section the tool has no home for (e.g. Exclusions) is written inline. The Features table, Review Log, and Notes always live in the state file, never in the tool's files.

Before dispatching the `open-skills:implementor` agent for a feature, ensure the state file exists with Scope, executable Verification Standards, and Exclusions on record, and the feature listed in the Features table with its verification command. If any is missing, write it first and dispatch only afterwards — never dispatch against an implied or remembered scope. Set the feature's Status to `active` at dispatch.

Dispatch to `open-skills:implementor` includes: the contract (Scope, Verification Standards, Exclusions — resolved from pointers), the feature's behavior and verification command, the relevant `CONSTRAINTS.md` entries, and the declared verification commands in their declared order.

When the implementor reports `blocked`, set the feature's Status to `blocked`, record the reason and any options it identified in Notes, and bring the fork to the user.

## Reviewer-gated completion

When the implementor reports `ready-for-review`, dispatch the `open-skills:reviewer` agent with the same contract and the implementor's report. The reviewer executes verification itself and returns a dimension-scored, evidence-backed verdict. Append each verdict to the state file's Review Log.

- **Pass** — proceed to the merge moment for that feature.
- **Fail** — relay the WHAT/WHY/FIX feedback to the `open-skills:implementor` agent for another round. The feature stays active; it is not abandoned or silently reduced in scope.

**Passing-write invariant**: the orchestrator may record a feature as passing — in `FEATURES.md` or as `passed` in the state file — only while holding a reviewer pass verdict with evidence in hand. Never write a passing entry from the implementor's report alone, from partial verification, or from the orchestrator's own read of the diff — the reviewer's independent execution is the only legitimate source of a pass.

### Two consecutive fails

If the same feature fails review twice in a row — as recorded in the Review Log — stop dispatching further rounds for it. Attribute the failure to one of: task spec, context, environment, verification, or state, and record the attribution in Notes. Report the attribution and the round history to the user instead of retrying indefinitely.

## The merge moment

Upon a pass verdict, perform the merge moment — the only point in the loop where the orchestrator writes the project root's `.harness/`:

- Record the verified behavior: write `.harness/features/F-NNN.md` from `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/FEATURE-ENTRY.md.template` — behavior description, the executable verification command, and evidence (at minimum the reviewer verdict date, a verification output summary, and the work-unit identifier; never a commit hash) — and add its row to the `FEATURES.md` index. Allocate the next ID across `features/` and `features/archive/`.
- If the work unit's contract Scope names the removal or replacement of an existing feature, retire that entry: set its Status to `superseded by F-NNN` or `retired in <work-unit identifier>`, move it to `features/archive/`, and remove its index row. Never retire a feature the Scope does not name.
- Record any merge-worthy decision — one where "why is it this way" would not be evident from the code months later: write `.harness/decisions/D-NNN.md` from `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/DECISION-ENTRY.md.template` (dated, with decision, rationale, rejected alternatives) and add its row to the `DECISIONS.md` index. If it reverses an active decision, set that entry's Status to `superseded by D-NNN`, move it to `decisions/archive/`, and remove its index row.
- Never edit a detail file's content beyond these Status and location changes.
- Add any newly surfaced hard constraint to `CONSTRAINTS.md`, phrased MUST/MUST NOT with source and applicability. If `CONSTRAINTS.md` already holds 15 entries, complete the rest of the merge moment without writing the new constraint, and surface the conflict to the user (consolidate or drop an existing entry) — the loop is not blocked by the budget overflow.
- Update `ARCHITECTURE.md` only if the work unit changed the structure it describes (new module, changed dependency boundary). Leave it untouched for a behavior-only change.
- Set the feature's Status in the state file to `passed (F-NNN)`.
- When every feature in the work unit has passed, close it: if a work-unit tool is declared, hand the work unit back to it for closure per its own convention; then move the state file to the short-term memory location's `archive/` subdirectory, so the active location holds only in-flight work units.

All applicable writes above happen together at this one moment — not staggered across the review round. Any VCS checkpointing around the merge moment follows the declared strategy and is not part of this write set.

## Clock-out

Before ending a session, run the five-condition exit checklist:

1. Build passes.
2. All tests pass, including pre-existing ones (not just the ones touched this session).
3. Progress is recorded in the work-unit state file — feature statuses, Review Log, and dated Notes — and, if a work-unit tool is declared, in that tool per its own convention.
4. No stray debug code or temp artifacts remain.
5. The standard startup path works.

Then run the session-memory handoff step by invoking the `open-skills:handoff` skill's procedure: when actionable unfinished next steps exist, it writes the handoff file at the declared location; when none exist, it deletes any stale handoff file and reports there is nothing to hand off.

After the handoff step, check that no work is left outside version control — including the handoff file itself — per the project's declared VCS strategy — this is separate from, and in addition to, the five conditions above.

Do not report the session complete while any condition fails. Fix the failing condition, or explicitly report it to the user as an unclean stop (e.g. a pre-existing test failing for unrelated reasons) — never declare completion over a known-failing condition.

## Context pressure: early clock-out over rushing

When session context is close to exhaustion, prioritize completing clock-out over starting or squeezing in more feature work:

- Record the active feature's exact state and next steps in the work-unit state file (and, if a work-unit tool is declared, in that tool per its own convention).
- Write the session-memory handoff file (invoking the `open-skills:handoff` skill) with the in-flight decisions, dead ends, and next steps — this is the scenario where conversation-level context is most at risk of evaporating.
- Get the work under version control per the declared strategy.
- Run clock-out and stop.

Do not attempt to finish "just one more thing" at the cost of leaving state unrecorded or work outside version control.
