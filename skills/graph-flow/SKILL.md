---
name: graph-flow
description: Use when a session in a project that has adopted graph execution is about to produce or modify a deliverable — code, docs, or configuration — or when the user runs /open-skills:graph-flow. Turns the main session into the orchestrator of the graph-engineering execution graph (13 nodes, 26 conditional edges): it creates and routes work units, dispatches the generic implementor/reviewer/advisor agents per node, stops at the two human gates, and never produces stage deliverables itself. Successor of harness-flow.
---

# graph-flow

The main session is the orchestrator of an execution graph. It reads state, evaluates edge guards, constructs dispatches, records results, and routes — it MUST NOT produce stage deliverables itself. Every deliverable is produced by a dispatched actor and verified by an independent reviewer before it counts.

The graph and this page are governed by the `graph-node-*`, `graph-execution-model`, and `graph-plugin-*` specs; `references/nodes.md` is the per-node dispatch source derived from them.

## Actors

Exactly four LLM actor roles exist; node identity is data in the dispatch payload, never a dedicated agent:

| Role | Realization | Writes |
| -- | -- | -- |
| orchestrator | this skill, run by the main session | `state.json` and `log.ndjson` (only through `work-unit.mjs`), gate decision records |
| implementor | the generic `implementor` agent | its stage directory, plus the deliverables its node assigns (e.g. code in the Build worktree) |
| reviewer | the generic `reviewer` agent | only its report `review-<n>.md` in the dispatched stage directory |
| advisor | the generic `advisor` agent | only its advice `advice-<n>.md` in the addressed stage directory |

Human gates and Human Escalation are synchronous orchestrator stops — questions put to the human in the main session — never agents. Ship-type deterministic work (merge the PR, close the issue, archive) runs as commands invoked by the orchestrator, never as an LLM actor.

## Prerequisites

The pre-graph `init` bootstrap must have run: `.harness/worktree-setup.json` and `.harness/config.json` exist and the declared workflow commands run. If they are missing, run the `init` skill first — the graph does not start, and the orchestrator never absorbs init behavior. Node.js >= 20 is required for the scripts.

## The work-unit folder

Each work unit lives at `.project/work-units/<id>/` (archived to `.project/work-units/archive/<id>/`): `state.json` (routing state), `log.ndjson` (append-only event log), and one `<stage>/` directory per executed node. The schema, writers, and invariants are the `graph-plugin-work-unit-state` spec's; the mechanics belong to the script:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/work-unit.mjs" create   --units .project/work-units --id <id> --source <source> --request <text>
node "${CLAUDE_PLUGIN_ROOT}/scripts/work-unit.mjs" validate --unit <dir>
node "${CLAUDE_PLUGIN_ROOT}/scripts/work-unit.mjs" write    --unit <dir> --state <draft.json> --log <lines.json>
node "${CLAUDE_PLUGIN_ROOT}/scripts/work-unit.mjs" archive  --unit <dir> --to .project/work-units/archive
```

Read the one-JSON-object stdout and branch on the `"error"` code. Every state change goes through `write` — draft the new `state.json` and the new log line(s) as temp files and let the script validate and apply them. Never hand-edit `state.json` or `log.ndjson`; a rejected write means the draft violates the schema or an invariant, so fix the draft, not the file. The id convention is `<date>-<topic>` (e.g. `2026-10-03-wor-33-graph-orchestrator`), kebab-case.

Actors write their own artifacts into the stage directory named in their dispatch; the orchestrator creates that directory before dispatching and records only verdicts, routing data, and folder-relative file pointers in `state.json`.

## The loop

Repeat until `current_node` is `ship` or `end`:

1. **Clock-in.** `validate` the unit (or `create` it for new work — that is the Trigger node; route to `research-explore`). Read `state.json` and resume at `current_node`; if `blocked_at` is set, the pending problem governs the route.
2. **Dispatch.** For an LLM stage (`research-explore`, `spec`, `ticket`, `build`, `wrap`), build the dispatch from that node's section in `references/nodes.md`, create the stage directory, and run the implementor agent with it. For Build, first provision the worktree per the `use-worktree` skill (the orchestrator runs `worktree.mjs`, the Build actor only receives the path).
3. **Review gate.** When the implementor reports ready-for-review, dispatch the reviewer with the same contract, the implementor's restrictions, and the stage's verification commands. Never accept an implementor output without a reviewer verdict. Build's reviewer pass is the graph's Review node and writes to `review/`; every other stage's reviewer pass is in-node and writes to that stage's own directory.
4. **Record.** `write` the result: the verdict (or report status) into `state.json` with its file pointer, plus the log line(s) citing the report file. Failing verdict: increment the scope's fail counter (`ticket:<id>` for Build/Review, `node:<node-id>` for in-node loops) in the same write.
5. **Route.** Evaluate the node's outgoing edge guards (listed per node in `references/nodes.md`) against the new state, append a `route` log line, set `current_node`, and continue.

## Human gates

At `human-gate-grading` and `human-gate-spec`, stop and put the question to the human in the main session (proposal or spec, with the findings). Before routing on the answer: write `<gate-node>/decision-<n>.md` (the orchestrator writes this — humans write nothing; a rejection or cancel needs non-empty feedback in it), then `write` the `human_decisions` entry, any `grading`/`spec_ref` updates the answer implies, and the log line. Doubt resolves to rejection back to Research.

## Escalation

- **Blocked report or second failure of the same scope** → set `blocked_at` to the originating node (`build` for a Review fail count >= 2; `review` only when Review itself cannot run), set a blocked ticket's status, open or reuse the problem entry (`<scope-key>#<n>` in `advisor_consults`), and route to `advisor`.
- **Advisor** is dispatched with the failure history, review logs and verdicts, the blocked node's section of `references/nodes.md`, and the relevant constraints — no skills. It writes `<blocked_node>/advice-<n>.md` only. Record the consultation (count +1, advice pointer, log line) and retry the `blocked_at` node with the advice in its payload. Advice never resets fail counters.
- **Two failed consultations on the same problem** → `human-escalation`: surface the evidence and consultation records to the human; `unblocked` resumes at `blocked_at` (reset the scope's counter, mark the problem `escalated`), `cancel` routes to End. Record the decision like a gate decision first.
- The retried node passing marks the problem `resolved` and clears `blocked_at`.

There is no synchronous human wait anywhere else — Build and Review route to the advisor, never to an inline question.

## Dispatch construction

Every dispatch payload carries, derived from the node's section in `references/nodes.md`:

- the node identity and stage instructions (purpose, state inputs, outputs, acceptance criteria);
- the stage directory path the actor MUST write its outputs into;
- the assigned skills (implementor and reviewer rows of the node section);
- the contractual restrictions, always including: MUST NOT write `state.json` or `log.ndjson`; MUST NOT write `.harness/` — except the Wrap implementor, whose dispatch permits `.harness/` because Wrap is the single long-term memory write point;
- the stage's executable verification commands in declared order (the implementor self-checks, the reviewer re-executes independently);
- on a retry: the review evidence and any advisor guidance for the open problem.

The reviewer's dispatch also carries the implementor's restrictions; a violated restriction is a failing verdict with that evidence. Restrictions are contractual and prompt-carried — never rely on per-node agents or tool whitelists.

A mounted skill that is not installed in the session (e.g. `deep-research`, `SDD`, `TDD`) degrades to its intent stated as instructions in the dispatch; a node whose spec mounts no skill is dispatched with none. When the project uses OpenSpec, the Spec stage's contract is an OpenSpec change and `spec_ref.kind` is `openspec-change`.

## Terminals

- **Ship**: run the deterministic delivery steps as commands (merge the PR, deploy or release where declared, close the issue), then in one `write` set `outcome` to `shipped` and `current_node` to `ship` with the final `archive` log line, and `archive` the folder.
- **End**: record the conclusions and abort reason in the session handoff, set `outcome` to `ended` with a non-empty `outcome_reason` and `current_node` to `end`, append the `archive` line, and `archive` the folder. End is a legitimate terminal, not a failure.

Within the running graph only Wrap writes long-term memory (`.harness/`); the orchestrator itself writes none.
