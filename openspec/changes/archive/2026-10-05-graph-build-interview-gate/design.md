## Context

The skill text already describes an interview (SKILL.md Tier 1/2, bootstrap.md, templates.md) but nothing makes it binding; "Prefer the project's real commands found in the survey" reads as permission to self-answer. The e2e session did exactly that, and improvised a post_steps rewrite for the no-remote case.

## Goals / Non-Goals

**Goals:**
- Confirmation before writing, for every section and slot, enforced by skill wording (MUST/stop-and-ask), with the Q/A record in the report.
- The no-remote case handled by a declared template variant chosen in the interview.

**Non-Goals:**
- No new file format for interview records (the report carries them; stage artifacts belong to graph-run, not graph-build).
- No validator change: variant application is ordinary definition content and the existing validation accepts either variant.

## Decisions

- **Enforcement is contractual (skill wording), not mechanical.** There is no script that can tell whether a human answered; the fix is the same style the rest of the plugin uses — MUST-level restrictions the session is bound by, plus the stop-and-ask rule at the validation step.
- **Variants live in templates.md, not as template JSON machinery.** Two documented post_steps sets for the wrap node (remote: commit, push, open delivery channel, remove worktree; local: commit, merge `--no-ff` into the default branch, remove worktree). The local variant removes the `open_pr_command` slot together with its only use, so `SLOT_UNFILLED` cannot fire. A JSON variant mechanism (conditional blocks in the template) would need validator support for a one-template problem.
- **Survey keeps its role as recommendation source.** The reworded rule: survey to recommend, interview to decide.

## Risks / Trade-offs

- [A non-compliant session can still self-answer] → Same trust model as every other restriction in the plugin (contractual, reviewer-checked); the report's Q/A record makes the violation visible.
- [Two variants to keep in sync when the wrap node changes] → Both live in one templates.md section next to the slot catalog; a template edit touches them together.
