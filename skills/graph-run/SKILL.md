---
name: graph-run
description: Use when the user wants a piece of work carried through the project's graph: "run this through the factory", "start a work unit for <request>", a CI-failure or issue trigger, resuming an interrupted work unit, or when /open-skills:graph-run is invoked. Turns the main session into the orchestrator that creates and routes a work unit along the project's validated graph definition, walks each node's task pipeline (dispatching the generic worker/reviewer/advisor agents per task, running script tasks itself), and never produces stage deliverables itself. Refuses to run in a project with no validated graph definition (use graph-init first).
---

# graph-run

The main session is the orchestrator of the factory that graph-init produced. It reads state, constructs each task's dispatch from the graph definition, dispatches actors or runs script tasks itself, records results, applies each pipeline entry's `on` action, and routes by the node's edge guards. It MUST NOT produce stage deliverables itself: every deliverable comes from a dispatched actor and counts only after the pipeline's validator task passes it.

The contract is the graph-run, graph-definition, work-unit-state, memory-and-handoff, skill-use-worktree, and skill-wrap specs. This page is the loop; the sub-procedures live in `references/` and are loaded at the step that needs them, not up front.

## The graph in one paragraph

A node is `entry`, `work`, or `terminal`. A work node is an ordered pipeline of entries `{use, with, on}`: `use` names a task in `graph.tasks`, `with` binds that task's params, and `on` maps each of the task's exit outcomes to exactly one action: `next`, `goto:<earlier task>`, a node outcome to surface, `escalate`, or (terminal pipelines only) `done`. A task has one executor: `script` (you run its `run` lines), `llm` (a worker), `validator` (a reviewer, or you when its `runner` is `orchestrator`), or `human` (an in-place stop). Routing between nodes is edges and guards only.

## Actors

| Role | Realization | Writes |
| -- | -- | -- |
| orchestrator | this skill, the main session | `state.json` and `log.ndjson` (only via `work-unit.mjs`; script-task lines and orchestrator-run checks are recorded as `step` lines), `decision-<n>.md`, worker-report transcriptions `report-<n>.md`, `verify-<n>.md` (the verdict record of an orchestrator-run validator task), root `handoff.md` |
| worker | generic `worker` agent | its stage directory and the deliverable surface its task assigns; its final report is returned as text, never a report file |
| reviewer | generic `reviewer` agent | only `review-<n>.md` in the dispatched stage directory |
| advisor | generic `advisor` agent | only `advice-<n>.md` in the addressed stage directory |

Task identity (node id and task id) is data in the dispatch, never in an agent definition. The human is never a node or an agent: a human task is a synchronous in-place stop in the main session, and you record the answer.

## Hard rules

- Never hand-edit `state.json` or `log.ndjson`. Draft state and log lines, apply them with `work-unit.mjs write`; on rejection fix the draft and retry, never edit the files.
- Never improvise a route or an action. Apply exactly the `on` action the entry declares for the recorded outcome; never skip, reorder, or add pipeline entries. Zero guards matching a surfaced outcome is a definition defect: stay in place, blocked, dispatch nothing. The only other moves are recorded human-ruling overrides.
- Never act on an exit that has not happened: an outcome outside the task's `exit.outcomes`, or an llm, validator, or human task whose `exit.artifact` is absent from the stage directory, engages the fallback chain instead of the `on` action.
- Never accept work without a recorded verdict from the validator task its pipeline places after it — a reviewer's, or your own when that task declares `runner: "orchestrator"` (you execute the declared checks yourself). A failing verdict never moves the work forward: it maps to its entry's `on` action (the `goto` in a pipeline; the `fail` node outcome of a standalone validator node).
- Never fabricate or infer a human decision. A human task is answered by the human; its decision artifact, state entry, and log line are recorded before any `on` action.
- One worktree per unit, tickets strictly sequential in it, in declared order. Never create a per-ticket worktree or branch, and never merge between tickets.
- Never run raw `git worktree` for create/reuse/recover; the `provision-worktree` task runs `worktree.mjs`. Only script tasks you run remove worktrees, with `git worktree remove` (forced only at the abandonment terminal).
- Nothing irreversible (push, delivery channel, worktree removal) happens before the close-out validator task passes.
- Never leave the current node while a human task awaits its answer or a human ruling is pending.
- A unit's folder is the only state: read and write only your own unit's folder, so concurrent orchestrators stay isolated.

## The loop

Start: load `references/start-and-resume.md` (pre-flight, memory check, create or resume). Then repeat until the unit reaches a terminal and is archived:

1. **Clock-in.** `validate` the unit, read `state.json`, and act at `current_node` and `current_task` (the pipeline position). An open problem (`blocked_at` set) governs: go to step 4.
2. **Walk the pipeline** of the current node from the recorded position, one entry at a time (`references/node-execution.md`):
   1. **Construct** the task's dispatch: the TaskDef `graph.tasks[<use>]` with the entry's `with` bindings substituted for `{{param}}` (`references/dispatch.md`).
   2. **Execute by executor.** `script`: run its `run` lines, no actor. `llm`: dispatch the worker. `validator`: dispatch the reviewer, or run the declared commands yourself when `runner` is `orchestrator`. `human`: put the task's `instructions` to the human in the main session and stop.
   3. **Verify the exit.** The outcome is one of the task's `exit.outcomes` and, for llm, validator, and human tasks, the `exit.artifact` exists in the stage directory. Otherwise the exit has not happened: apply no `on` action and go to step 4.
   4. **Record** through `work-unit.mjs write` using the draft shapes in `references/state-writes.md`: result (verdict plus file pointer, or decision, or `step` lines), counters in the same write, the fields the task produces, a log line citing the file. Recording never moves the position.
   5. **Apply exactly the entry's `on` action** for the recorded outcome. `next`: start the following entry (its `dispatch` write sets `current_task`). `goto:<task>`: start that earlier entry again; counted, and at the cap stay in place and go to step 4 instead of traversing. A node outcome: abort the pipeline and go to step 3. `escalate`: step 4. `done` (terminal pipelines only): the terminal procedure.
3. **Route** the surfaced outcome. Evaluate the outgoing edge guards in the state; exactly one holds (zero matches is a definition defect: stay in place, blocked). A returning edge (target already in `walked_path`) is checked against the cap and counted first. Append the `route` log line, set `current_node`, append to `walked_path`, set `current_task` to the target's first entry, and continue. A node that declares `re_entry` selects its next item itself, with no dispatch.
4. **Escalate in place** when an exit has not happened, a task is blocked or fails with no `goto` to return through, or a counter hits a cap: load `references/escalation.md` and follow the chain (advisor, then human ruling). Escalation is a fallback chain inside the node, not routing.

At a terminal, follow the terminal procedure in `references/node-execution.md` (script-only pipeline: handoff, worktree, outcome, `done`, archive), then report the outcome to the human.

## When something does not fit

- Missing graph, invalid graph, missing config: stop and point to graph-init.
- A script you call yourself (`work-unit.mjs`, `worktree.mjs`, `memory.mjs`, `graph.mjs`) fails (nonzero exit or cannot be resolved): treat as a blocked report with the script's stable error code; engage the escalation chain. A failing `run` line of a script task follows that task's `on` map instead. Never fall back to hand-written state or raw worktree commands.
- A spec-level ambiguity you cannot settle from the references: put it to the human as a ruling question at the current node rather than guessing.
