## Why

In the demo e2e, graph-build built the whole factory with zero user participation: it answered its own interview from the survey ("prefer the project's real commands" read as permission to skip asking) and, hitting the unfillable `open_pr_command` slot in a no-remote project, silently rewrote the wrap node's post_steps — a structural edit no one approved. The interview exists in the skill text but has no enforcement and no defined path for the no-remote case.

## What Changes

- The instantiation interview becomes a hard gate: every config section (Tier 1) and every command slot (Tier 2) MUST be confirmed by the user before validation runs; survey findings are recommendations to present, never answers to assume. The confirmed answers are recorded in the final report.
- The no-remote case becomes a declared choice, not an improvisation: `templates.md` documents two delivery variants for the coding-factory template — remote (push + `open_pr_command`, the shipped default) and local (merge the unit branch into the default branch; the `open_pr_command` slot is removed together with its only use). The interview asks which applies; any other structural deviation stays a user-requested Tier 3 edit.
- The hard gate scopes to initial builds (Tier 1/2); a Tier 3 edit confirms only the change being made.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-build`: the template-instantiation behavior gains the interview-as-hard-gate requirement and the declared delivery-variant choice for templates whose delivery assumes a remote.

## Impact

- Docs/skill only: `skills/graph-build/SKILL.md`, `references/bootstrap.md`, `references/templates.md`.
- No script or schema changes.
