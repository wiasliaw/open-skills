# Run start, resume, and isolation

Load this at the start of a run or when taking over an interrupted unit.

## Conventions used throughout

- `CFG` is `.harness/config.json` in the main checkout. `GRAPH` is the path in its `graph` key. `UNITS` is `locations.work_units` (default `.project/work-units`); `WORKTREES` is `locations.worktrees` (default `.project/worktrees`); `REMOTE` is `vcs.remote` (default `origin`).
- Scripts run as `node "$CLAUDE_PLUGIN_ROOT/scripts/<script>.mjs" ...` with the consumer project as cwd. Every script prints exactly one JSON object on stdout; branch on `ok` and `error`, not on prose.
- The type catalogs (the plugin's `templates/types.json` and the project's `.harness/types.json`) are merged in memory by the scripts; their defaults need no flags. Never write either by hand at run time.
- Node.js >= 20 is required. A missing or old Node counts as a script failure.

## Pre-flight (every run start, in order)

1. **Config and graph exist.** If `CFG` is missing, or has no `graph` key, or the file at `GRAPH` is missing: do not start. Report that the project has no built factory and point to the graph-init skill. There is no default graph and no template is ever used at run time. Never depend on `openspec/` at run time.
2. **Definition validated.** Run `node "$CLAUDE_PLUGIN_ROOT/scripts/graph.mjs" validate "$GRAPH"`. Accept only exit 0 with `accepted: true`. Otherwise do not start: report each violated invariant from `errors` and point to graph-init. A 1.x definition is rejected here (`SCHEMA_VERSION_UNSUPPORTED`): it must be re-assembled by graph-init.
3. **Memory check.** Run `node "$CLAUDE_PLUGIN_ROOT/scripts/memory.mjs" check`. A `maintenance_due: true` result is a report, never a blocker: the run proceeds either way.
   - If a maintenance unit is already live (a folder directly under `UNITS`, not under `archive/`, whose `state.json` has `trigger.source` of `maintenance-due`), say so and propose nothing.
   - Otherwise tell the human which `reasons` breached and ask whether to create a maintenance unit. Create it only on an explicit yes, with trigger source `maintenance-due` and the reasons as the request text. Never create it silently. The human may decline; then continue with the requested work.
4. **Intent.** Determine what to run: resume an existing live unit (a folder under `UNITS` whose id the human names, or the only live one), or create a new unit from a trigger.

## Creating a unit

The trigger is captured verbatim: `source` is one of `prompt`, `issue`, `ci-failure`, `maintenance-due`; `request` is the original text unchanged; `branch` is set only when a fix unit targets an existing delivered branch.

1. Generate an id matching `^[a-z0-9][a-z0-9-]*$`, convention `<yyyy-mm-dd>-<short-topic>`.
2. Run:
   `node "$CLAUDE_PLUGIN_ROOT/scripts/work-unit.mjs" create --graph "$GRAPH" --units "$UNITS" --id <id> --source <source> --request <text> [--branch <existing-branch>] [--remote "$REMOTE"]`
3. On `id_collision`, regenerate with a random suffix (for example `-x7k2`) and retry. On `remote_unreachable`, treat as a script failure (report to the human; the remote check is part of the create gate, not skippable by the orchestrator on its own judgment).
4. The create gate leaves the unit at the entry node with the core contract only and `current_task: null` (no pipeline position). Route the entry node to the shared first node through its unconditional edge (a normal route write, see `state-writes.md`: it sets `current_task` to the first node's first entry and materializes the declared fields that node reaches) and continue the loop.

A maintenance-due unit records no phase except `maintenance`; a `maintenance` phase is recordable only on a maintenance-due unit. The write gate enforces both (`maintenance-binding`); offer the human only the legal phase set at the phase approval.

## Resume from the folder alone

A new orchestrator session takes over with no memory of the previous conversation. Everything needed is in the unit folder.

1. `node "$CLAUDE_PLUGIN_ROOT/scripts/work-unit.mjs" validate --graph "$GRAPH" --unit "$UNITS/<id>"`. A failure means the folder is inconsistent: report it to the human; do not repair it by hand.
2. Read `state.json`: `current_node`, `current_task` (the pipeline position), `phase`, `walked_path`, `fail_counters`, `advisor_consults` (open problem, consultation counts), `blocked_at`, `reviews`, `human_decisions`, and any graph-declared fields.
3. Read the tail of `log.ndjson` (last 10-20 lines, `step` lines included) and list the current node's stage directory to find the latest `report-<n>.md`, `review-<n>.md`, `verify-<n>.md`, `advice-<n>.md`, `decision-<n>.md`.
4. Re-derive the position from `current_node`, `current_task`, and what the log and stage files record for that entry:
   - `blocked_at` set: an escalation is open. Continue at the escalation chain (`escalation.md`) using the open problem's consultation count; if the count equals the cap, the human ruling is pending: ask it again.
   - `current_task` names an entry with no result recorded since it started (the last line is its `dispatch` or the `route` that set it): execute it — re-run a script task from its first line (scripts are idempotent), dispatch the worker or reviewer again, re-run the orchestrator-run checks, or put the human task to the human again.
   - A result is recorded for that entry (a `report`, `verdict`, `step` lines, or a `human-decision` line, with its file) but its `on` action was not applied: apply it now to the recorded outcome — start the next entry for `next`, the `goto` target below the cap, route a surfaced outcome (evaluate guards and route), or continue the chain for `escalate`. A worker report whose validator has not run is this case with `next`.
   - `current_task` is null at a work node that declares `re_entry`: the selection is recorded; route onward by the node's ordinary outcome.
   - Worktree recorded or required but absent: re-run the `provision-worktree` task (`node-execution.md`, script executor) before any dispatch.
   - Terminal reached but folder not archived (`current_node` is a terminal and the `archive` line is last): re-run the terminal's archive line. If the unit is still at the node being left, finish the terminal procedure from the first line not yet recorded.
5. Never trust the previous session's conversation, and never redo work whose result is already recorded.

## Multi-orchestrator isolation

Several orchestrators may run in one project at once, each with its own unit.

- Read and write only your own unit folder. Never open another live unit's `state.json`, log, or stage directories (the maintenance-live check above reads only `trigger.source` of other units to avoid double-proposing).
- Shared long-term memory is never written in place during a run. Close-out delta entries travel on the unit's own branch inside its own worktree, so version control is the serialization point.
- A merge conflict on memory or code surfaces after handover as a new unit (trigger `ci-failure` or the human's prompt). Never reopen the archived unit and never repair memory in place.
