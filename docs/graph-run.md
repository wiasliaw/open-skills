# graph-run

Operates the factory that graph-init built. The main session becomes the orchestrator: it takes one work unit through the project's graph, walks each node's pipeline of tasks (dispatching a worker, an independent reviewer, or the advisor per task, and running script tasks itself), routes between nodes by edge guards, and brings in the human only when needed. The orchestrator never writes the deliverables itself.

## When to use it

- You have a request, an issue, or a CI failure to carry through the project's own graph ("run this through the factory").
- A previous session was interrupted and you want to resume the unit from its folder.
- A run start reports that maintenance is due and you want to create the maintenance unit.

It refuses to start when the project has no graph definition or the definition has not passed the graph validator; a definition from before schema 2.0 fails that check and must be re-assembled. In that case run `graph-init` first. There is no default factory.

## How it is invoked

Ask for it in plain words ("start a work unit for ..."), or run `/open-skills:graph-run`. It is not mounted on any task, so it has no graph profile.

Requirements: Node.js >= 20 and the project's `.harness/config.json` and graph definition from `graph-init`.

## What happens

1. **Pre-flight.** The orchestrator validates the graph, then runs `memory.mjs check`. If maintenance is due and no maintenance unit is live, it reports this and creates a `maintenance-due` unit only if you confirm.
2. **Create or resume.** A new unit gets a folder under the configured work-units location (`.project/work-units/<id>/` by default) with `state.json`, `log.ndjson`, and one directory per executed node. Resuming reads that folder alone, including the recorded position in the node's pipeline.
3. **Phase approval.** At the shared first node, the mandatory phase-approval human task asks you to approve the proposed phase (for example `feat`, `fix`, `chore`). The approval records `phase` in the unit's state, and edge guards on it decide which nodes the unit walks: there is no path declaration, and a node no guard selects simply does not run. The phase cannot change afterwards; if it was wrong, end the unit and open a new one. You can also send the proposal back with feedback, or judge the work not needed, which routes by a declared edge to the abandonment terminal and ends the unit cleanly.
4. **Task by task.** A node is an ordered pipeline of tasks, walked one entry at a time. What happens depends on the task's executor:
   - `llm`: a generic worker does the work.
   - `validator`: an independent reviewer dispatch gates the work by default; where the task declares `runner: "orchestrator"`, as the reference `verify-build` does, the orchestrator runs the declared checks itself.
   - `script`: the orchestrator runs the task's commands itself, with no actor (worktree provisioning, commits, delivery, terminal archival, the red check).
   - `human`: the orchestrator puts the task's question to you in the session and records your answer.

   Every task ends in one outcome from its declared set, and an llm, validator, or human task's exit counts only when its artifact (the worker's report, the review, the decision file) is in the stage directory. The pipeline entry's `on` map then applies exactly one action to that outcome: `next` starts the following task; `goto:<earlier task>` returns to it, which is how a failing verdict retries in place (the producing task runs again with the evidence, counted and capped); a node outcome leaves the pipeline and is routed by the node's edge guards; `escalate` hands a failure with no earlier task to return to over to the fallback chain (step 7). Only a pass lets the work move forward. The unit gets exactly one git worktree, provisioned by the orchestrator through the `provision-worktree` script task.
5. **Red check.** In the reference `build` node (`provision-worktree`, `red-check`, `implement-ticket`, `verify-build`, `commit-work`), the `red-check` script task runs before any worker is dispatched: it lands the ticket's declared test files in the worktree (`work-unit.mjs land-tests`), commits them, and runs the ticket's command expecting failure (`work-unit.mjs expect-red`), so red is the orchestrator's own observation. A test that already passes makes `expect-red` exit 11, which the task maps to `ticket-invalid`: the node surfaces it and the unit returns to decomposition with no worker dispatched. Otherwise an implement-only worker works against the landed tests, and the orchestrator-run `verify-build` checks that the tests are unchanged since the red commit, then runs the ticket command and the full suite. Tickets run sequentially inside the one worktree.
6. **Whole-change review.** `review` is a node holding one validator task, so its verdict is the node's outcome: a pass moves on to close-out; a fail routes by guard to the fixing node, `build-direct` for `feat`, `fix`, and `chore` and `maintain` for `maintenance`, and then back to `review`. A failed review never re-enters `build`: its `red-check` would run against an already implemented ticket and send the unit back to decomposition instead of fixing it. A returning edge is counted and capped.
7. **Escalation.** A repeated failure (counted per task, and per ticket in a ticketed build), a blocked task, a failing script task, or an exit that did not happen first goes to the advisor, which diagnoses the root cause and writes retry guidance. After the declared number of consultations the orchestrator stops in place and asks you to rule: retry with guidance, move back to an earlier node, or end the work. Nothing is routed while a ruling is pending.
8. **Close-out and delivery.** Close-out is the `wrap` node's pipeline: provisioning, the close-out worker, an independent check, then script tasks that commit, push, open the delivery channel, and remove the worktree. Nothing irreversible runs before the check passes. The node then surfaces `handed-off` and the success terminal, a pipeline of script tasks only, copies the handoff and archives the folder (the abandonment terminal first force-removes any live worktree). Red CI after handover arrives as a new unit.

## What you will be asked

- Confirm or decline a due maintenance unit at run start.
- Approve (or send back, or reject as not needed) the phase proposal.
- Answer any other human task the graph declares (the reference graph asks you to approve the contract in `spec`).
- Rule on an exhausted escalation.

Your answers are recorded by the orchestrator as decision files in the node's stage directory, plus a state entry and a log line; a human task cannot be skipped, because its answer counts only once the decision file exists. You write nothing in the folder yourself.

## Good to know

- All routing state lives in `state.json` and `log.ndjson`, written only through `scripts/work-unit.mjs`. Nothing is hand-edited.
- Several orchestrators can run at once in one project; each reads and writes only its own unit folder.
- Long-term memory is written only by the close-out task, as pending delta entries on the unit's own branch.
- The detailed sub-procedures (dispatch construction, escalation bookkeeping, state draft shapes) live in the skill's `references/` directory and are loaded step by step.
