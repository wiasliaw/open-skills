# Template reference

Load at Tier 2. Templates are build-time starting material shipped in `skills/graph-build/templates/`. There is no default factory: a template never applies at run time by itself, and later plugin updates never change a project's copy.

## Shipped template: coding-factory.json

A software-delivery factory.

- Phases: `feat` (research, spec, ticket, build, review, wrap, ship), `fix` (no spec), `chore` (research, build, review, wrap, ship), and the reserved `maintenance` (memory apply, carries restriction overrides for its build node).
- Nodes: the entry node, then research (carries the phase approval), spec, ticket, build, review, wrap (the close-out node, mounts `open-skills:wrap`), and two terminals: `ship` (success) and `end` (abandonment, reachable only by dispositions).
- Caps: failure, advisor consultations, edge revisit, total failure.
- `state_fields` register the unit state beyond the core contract (contract reference, tickets and their verification commands).

## Command slots

The top-level `slots` object names every placeholder and describes it. The shipped slots are:

| Slot | Meaning |
|---|---|
| `test_command` | The project's test command; also the base of the family covering each ticket's declared test invocation |
| `lint_command` | Static check (lint, type check, format check); use a harmless always-green check when the project has none |
| `open_pr_command` | Opens the delivery channel for the pushed branch; must be idempotent (succeed when already open) |

Always read the template's own `slots` block for the current list rather than trusting this table. Placeholders appear as `{{name}}` inside node mounts, verification commands, and steps.

## Run-time variables are not slots

`run_time_variables` (`CLAUDE_PLUGIN_ROOT`, `WU_ID`, `WU_BRANCH`, `WU_WORKTREE`, and so on) are expanded by the orchestrator at run time. Leave them untouched; do not ask the user for them.

## Interviewing for a slot

Offer a concrete recommendation from the survey (for example `npm test` from package.json scripts), ask for confirmation or a correction, and confirm the command works from a fresh worktree after the config's setup commands. A command that needs an argument pattern (a family, as `test_command` is for ticket tests) stays the base program plus leading arguments, as the template declares it.

## Instantiation checklist

1. Copy to the project definition path; keep the template file unchanged.
2. Fill every slot, then delete the `slots` block (the validator rejects any remaining `{{...}}` with `SLOT_UNFILLED`).
3. Adjust the name or phases only on request; any structural change is a Tier 3 edit and is re-validated.
4. Confirm skill mounts (see SKILL.md step 4).
5. Run `graph.mjs validate <definition> --config .harness/config.json`; accept only on exit 0.
6. Set `graph` in the config through `init.mjs write`.

## Reading validator output

`ok`, `accepted`, `errors[]` (each with `code`, `invariant`, and the node, edge, cycle, outcome, or phase involved), `summary` (nodes, edges, phases, close-out node, terminals, caps), `returning_edges`, `tool_gate` (`status` plus per-tool `probes`). Exit codes: 0 accepted, 1 structure rejected, 2 usage, 3 input unreadable or invalid, 4 tool gate failed, 70 internal. `--no-probe` skips the tool gate for structure-only iteration; a definition is never accepted from a `--no-probe` run alone.
