---
name: graph-run
description: Use when the user wants a piece of work carried through the project's graph: "run this through the factory", "start a work unit for <request>", a CI-failure or issue trigger, resuming an interrupted work unit, or when /open-skills:graph-run is invoked. Turns the main session into the orchestrator that creates and routes a work unit along the project's validated graph definition, dispatches the generic worker/reviewer/advisor agents per node, and never produces stage deliverables itself. Refuses to run in a project with no validated graph definition (use graph-build first).
---

# graph-run

The main session is the orchestrator of the factory that graph-build produced. It reads state, constructs each stage's dispatch from the graph definition, dispatches actors, records results, and routes by the node's edge guards. It MUST NOT produce stage deliverables itself: every deliverable comes from a dispatched actor and counts only after an independent reviewer passes it.

The contract is the graph-run, graph-definition, work-unit-state, memory-and-handoff, skill-use-worktree, and skill-wrap specs. This page is the loop; the sub-procedures live in `references/` and are loaded at the step that needs them, not up front.

## Actors

| Role | Realization | Writes |
| -- | -- | -- |
| orchestrator | this skill, the main session | `state.json` and `log.ndjson` (only via `work-unit.mjs`), `decision-<n>.md`, deterministic-step records `steps-<n>.md`, root `handoff.md` |
| worker | generic `worker` agent | its stage directory and the deliverable surface its node assigns |
| reviewer | generic `reviewer` agent | only `review-<n>.md` in the dispatched stage directory |
| advisor | generic `advisor` agent | only `advice-<n>.md` in the addressed stage directory |

Node identity is data in the dispatch, never in an agent definition. Humans are never nodes or agents: approvals and rulings are synchronous stops in the main session, recorded by the orchestrator.

## Hard rules

- Never hand-edit `state.json` or `log.ndjson`. Draft state and log lines, apply them with `work-unit.mjs write`; on rejection fix the draft and retry, never edit the files.
- Never improvise a route. Zero guards matching, or a guard target that is neither the next node of the approved phase's path nor an earlier path node reached by a declared returning edge, is a definition defect: stay in place, blocked, dispatch nothing.
- Never accept worker output without a reviewer verdict. Never route on a failing in-node verdict.
- Never run raw `git worktree` for create/reuse/recover; use `worktree.mjs`. The orchestrator alone removes worktrees, with `git worktree remove`.
- Nothing irreversible (push, delivery channel, worktree removal) happens before the reviewer's pass on close-out.
- Never leave the current node while a human ruling is pending.
- A unit's folder is the only state: read and write only your own unit's folder, so concurrent orchestrators stay isolated.

## The loop

Start: load `references/start-and-resume.md` (pre-flight, memory check, create or resume). Then repeat until the unit reaches a terminal and is archived:

1. **Clock-in.** `validate` the unit, read `state.json`, and act at `current_node`. An open problem (`blocked_at` set) governs: go to step 6.
2. **Pre-steps.** If the node declares `pre_steps` (worktree provisioning), run them first. See `references/node-execution.md`.
3. **Execute by node type** (`references/node-execution.md`; build payloads with `references/dispatch.md`):
   - LLM node: worker, then reviewer.
   - Validator node: reviewer only; its verdict is the routable outcome.
   - Deterministic / tool node: the orchestrator runs the command; no LLM actor.
   - Declared re-entry (selection-only): the orchestrator selects, no dispatch.
4. **Record.** Apply the result through `work-unit.mjs write` using the draft shapes in `references/state-writes.md`: verdict plus file pointer, counters in the same write, log line citing the report file.
5. **Gate and route.** Only a reviewer pass releases a routable outcome (a failing in-node verdict retries in place below the cap). If the node declares a human approval, stop and ask before routing. Then evaluate the outgoing edge guards in the state, verify the target against the approved path, run the node's `post_steps`, append the `route` log line, set `current_node`, append to `walked_path`, and continue.
6. **Escalate in place** when a stage is blocked or its counters hit a cap: load `references/escalation.md` and follow the chain (advisor, then human ruling). Escalation is a fallback chain inside the node, not routing.

At a terminal, follow the terminal procedure in `references/node-execution.md` (handoff, steps, outcome, archive), then report the outcome to the human.

## When something does not fit

- Missing graph, invalid graph, missing config: stop and point to graph-build.
- A script fails (nonzero exit or cannot be resolved): treat as a blocked report with the script's stable error code; engage the escalation chain. Never fall back to hand-written state or raw worktree commands.
- A spec-level ambiguity you cannot settle from the references: put it to the human as a ruling question at the current node rather than guessing.
