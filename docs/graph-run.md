# graph-run

Operates the factory that graph-build built. The main session becomes the orchestrator: it takes one work unit through the project's graph, dispatches a worker and an independent reviewer at each node, routes by the node's edge guards, and brings in the human only when needed. The orchestrator never writes the deliverables itself.

## When to use it

- You have a request, an issue, or a CI failure to carry through the project's own graph ("run this through the factory").
- A previous session was interrupted and you want to resume the unit from its folder.
- A run start reports that maintenance is due and you want to create the maintenance unit.

It refuses to start when the project has no graph definition or the definition has not passed the graph validator. In that case run `graph-build` first. There is no default factory.

## How it is invoked

Ask for it in plain words ("start a work unit for ..."), or run `/open-skills:graph-run`. It is not mounted on any node, so it has no graph profile.

Requirements: Node.js >= 20 and the project's `.harness/config.json` and graph definition from `graph-build`.

## What happens

1. **Pre-flight.** The orchestrator validates the graph, then runs `memory.mjs check`. If maintenance is due and no maintenance unit is live, it reports this and creates a `maintenance-due` unit only if you confirm.
2. **Create or resume.** A new unit gets a folder under the configured work-units location (`.project/work-units/<id>/` by default) with `state.json`, `log.ndjson`, and one directory per executed node. Resuming reads that folder alone.
3. **Phase approval.** At the shared first node you approve the proposed phase (for example `feat`, `fix`, `chore`). The phase decides which path of the graph the unit walks and cannot change afterwards; if it was wrong, end the unit and open a new one. You can also send the proposal back with feedback, or judge the work not needed, which ends the unit cleanly.
4. **Node by node.** For an LLM node a generic worker does the work and a generic reviewer re-runs every verification command itself. A failing review retries in place; only a pass lets the unit route on. Deterministic nodes run as commands. Repository-writing nodes get their own git worktree, provisioned by the orchestrator.
5. **Escalation.** A repeated failure first goes to the advisor, which diagnoses the root cause and writes retry guidance. After the declared number of consultations the orchestrator stops in place and asks you to rule: retry with guidance, move back to an earlier node, or end the work. Nothing is routed while a ruling is pending.
6. **Close-out and delivery.** After the close-out stage passes review, the orchestrator commits, pushes, opens the delivery channel, and removes the worktree, then copies the handoff and archives the folder. Red CI after handover arrives as a new unit.

## What you will be asked

- Confirm or decline a due maintenance unit at run start.
- Approve (or send back, or reject as not needed) the phase proposal.
- Approve the output of any other node the graph marks for human approval.
- Rule on an exhausted escalation.

Your answers are recorded by the orchestrator as decision files in the node's stage directory, plus a state entry and a log line. You write nothing in the folder yourself.

## Good to know

- All routing state lives in `state.json` and `log.ndjson`, written only through `scripts/work-unit.mjs`. Nothing is hand-edited.
- Several orchestrators can run at once in one project; each reads and writes only its own unit folder.
- Long-term memory is written only by the close-out stage, as pending delta entries on the unit's own branch.
- The detailed sub-procedures (dispatch construction, escalation bookkeeping, state draft shapes) live in the skill's `references/` directory and are loaded step by step.
