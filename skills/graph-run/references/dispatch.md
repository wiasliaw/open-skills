# Constructing a dispatch

Load this before dispatching any actor or running any task's commands. A dispatch is derived entirely from one task's declaration in the graph definition (`graph.tasks[<use>]`, with the node's pipeline entry bindings) plus the unit's state; the agent definitions (`worker`, `reviewer`, `advisor`) contain nothing task-specific, so everything task-specific must be in the payload. Never put task-specific text anywhere else, and never rely on tool whitelists for enforcement: restrictions are contractual, written into the prompt and checked by the validator task.

## Common payload fields

Build these from the TaskDef `graph.tasks[<entry.use>]` of the pipeline entry being executed and `state.json`:

| Field | Source |
| -- | -- |
| node id, task id | the node being executed, and the entry's `use` |
| task instructions | the task's `purpose`, `instructions` (verbatim, params bound), `reads`, `produces` (a `state:<field>` entry means: the actor reports that data to the orchestrator in its report; it never writes state; other entries name stage artifacts) |
| exit | `exit.outcomes`: the actor reports exactly one of them, or `blocked`; `exit.artifact`: the stage file the exit requires, `<n>` resolved by the numbering rule below |
| equipment | `equipment.skills` (the actor may use only these), `equipment.commands`, `equipment.mcp`: see "Equipment" |
| restrictions | the task's `restrictions`, verbatim (see the rules below) |
| scoring dimensions | validator tasks only: the dimensions named in the task's `instructions` (for example correctness, contract coverage, restriction compliance, clean state); pass the instructions verbatim and ask the reviewer to name each dimension it scores |
| stage directory | `<unit folder>/<node id>/`, created by the orchestrator before the dispatch; every task of a node shares it |
| worktree path | `<WORKTREES>/<id>` whenever the unit has a worktree; omit otherwise. It is the working directory for every command any actor runs |
| memory | when `reads` includes `memory`: tell the actor to load the current-truth documents under `.harness/` whole and run `node "$CLAUDE_PLUGIN_ROOT/scripts/memory.mjs" index` for the index, pulling single entries on demand |
| retry context | on a retry: the failing `review-<n>.md` / `verify-<n>.md` path(s), the human's send-back feedback (`decision-<n>.md`), and any `advice-<n>.md` for the open problem |

**Params.** A `{{param}}` inside the TaskDef is legal only for a declared `params` name; substitute the pipeline entry's `with` value. Any other `{{...}}` still present, or a param with no `with` binding, means the definition was never completed: stop as blocked (definition defect), dispatch nothing.

**Run-time variables.** Substitute these `$`-prefixed variables (`$NAME` or `${NAME}`) in every command before putting it in a payload or running it; actors get concrete commands, not placeholders. The catalog:

| Variable | Value |
| -- | -- |
| `CLAUDE_PLUGIN_ROOT` | the plugin's install root (where `scripts/` lives) |
| `WU_ID` | the unit id |
| `WU_BRANCH` | `wu/<id>`, or `trigger.branch` for a fix unit that names one |
| `WU_WORKTREE` | `<WORKTREES>/<id>` (derived from the unit's own id, also for a fix unit; the single source of the worktree path: `worktree.mjs ensure`'s returned `path` only confirms it and may differ textually, for example `/private/tmp` vs `/tmp` on macOS) |
| `WU_FOLDER` | `<UNITS>/<id>` |
| `WU_REMOTE` | `vcs.remote` (default `origin`) |
| `WU_COMMIT_MESSAGE` | composed by the orchestrator as a Conventional Commits message: type from the approved phase (`feat`, `fix`, `chore`, `docs`, `refactor`; `chore` for `maintenance`), a short imperative subject derived from the trigger request, and the unit id in the body |
| `WU_CURRENT_TICKET` | the selected item's id: state `current_ticket`. Meaningful only while an item is selected |

A variable outside this catalog is a definition defect: stop as blocked.

File numbering: `<n>` is one more than the highest existing `<prefix>-<k>.md` in that stage directory (prefixes `report`, `review`, `verify`, `decision`, `advice`), so retries and revisits never overwrite earlier files.

## Equipment

Everything the actor may use is on the task. A capability the task does not declare is not available to it.

- **Skills.** List them: the actor may use only these. Check each against the skills the session has installed. An unavailable skill with no graph profile does not block: carry its intent (its name and what the task's `instructions` use it for) as instructions in the payload and mark it `Degraded mount: <skill>` so the degradation is visible. An unavailable skill that defines a graph profile never degrades: dispatch nothing and report the task blocked with reason code `skill-unavailable` (every `open-skills:*` mount of the library defines one).
- **Commands.** A plain command string is carried as is. A family `{base, args}` is carried as its base with the permitted args. A state-sourced entry `{source: "state:<path>", family}` is resolved to the current item's value: the command stored at that path in the record whose `id` is the selected item (for `tickets.verification_command`: the current ticket's `verification_command`); the write gate has already checked that it falls within the mounted family. With no item selected, omit the entry. All commands run in declared order, with the worktree path as cwd whenever the unit has one.
- **MCP.** List the servers: the actor may use only these.

## Worker dispatch

Send to the `worker` agent (an `llm` task). Prompt layout:

```
Task: <task id>   Node: <node id>
Stage directory: <abs path>/<node id>/   (stage artifacts go here; return your report as text)
Worktree path: <abs path>                (only when the unit has one)
Purpose / instructions / reads / produces: <verbatim from the task, params bound>
Exit: report exactly one of <outcomes>, or blocked with a stable reason code. Required artifact: <exit.artifact>
Equipment: skills (use only these): <list>; commands (run in declared order, cwd = worktree path when given): <list>; mcp: <list>
Restrictions (binding, checked at verification): <list, verbatim>
Retry context: <review/verify reports, send-back feedback, advice paths, or "none">
```

Rules for the restrictions block:

- Always carry the task's list verbatim. They already forbid writing routing state (`state.json`, `log.ndjson`); if a task's list somehow omits that, add it.
- For a repository-writing task (a worktree path is given), if the list omits them add: perform no VCS operations, confine repository writes to the given worktree path, stage directory stays writable, report `blocked` when no usable path is given, never remove the worktree.
- Close-out exception: the task that mounts the wrap skill carries the long-term memory writes it owns (merging pending delta entries into the ledger inside the worktree) in its own restrictions, and still forbids writing routing state and current-truth documents. Carry exactly what its list says.
- No overrides. Each task's list is the whole list: a flow that needs different permissions is a different task selected by guards (reference: `fold-deltas` in `maintain`, which may edit the current-truth documents). Never merge another task's list in.
- A ledger or current-truth write outside what the task's own list permits is a restriction violation, whichever task it is.

The worker returns its final report as text and writes no report file (the execution harness blocks subagent report-file writes). The orchestrator transcribes the returned report verbatim into `report-<n>.md` in the stage directory — one fixed provenance line at the top ("Transcribed verbatim by the orchestrator from the worker's returned report."), nothing else edited — and uses that file as the log line's `source_ref`.

## Reviewer dispatch

Send to the `reviewer` agent for a validator task whose `runner` is `reviewer` (the default). A validator task declaring `runner: "orchestrator"` dispatches no reviewer: the orchestrator runs the declared commands itself (`node-execution.md`). Carry:

- Node id, task id, and the validator task's `instructions` verbatim: they are the definition of pass and name the dimensions.
- The task whose work is verified — the entry the validator's `fail` `goto`s to: its `instructions` exactly as given to the worker, its restrictions (so the reviewer can check compliance), and its report path (a claim to check, not evidence). A standalone validator task has no worker report and no such task; its own `instructions` name what to review.
- The validator task's commands in declared order and the scoring dimensions; the reviewer runs them itself, with the worktree path as cwd whenever the unit has one.
- The outcome the worker reported (a claim to check, like its report). An alternative outcome such as `ticket-invalid` or `spec-contradiction` is not verified here: it surfaces only with its evidence artifact present (the exit-artifact rule, `node-execution.md`), and a reviewer judges it only where the graph maps that outcome to `next` into this validator task.
- The stage directory and filename `review-<n>.md` (the task's `exit.artifact`). A standalone validator task: the reviewer also names the review scope (the whole change against the approved contract) and reports `pass` or `fail`, which is the node's routable outcome.
- A reviewer MAY reject a draft delta by naming its id and the reason in its report; tell it so when the task reads or produces drafts.

Ask the reviewer to name, at the end of its report, the failing dimensions and the failing verification command (if any) in a stable form, because the orchestrator derives the failure signature from them (see `escalation.md`).

Reviewer and advisor write their own files (`review-<n>.md`, `advice-<n>.md`). If the harness blocks that write, the actor returns the full report text instead and the orchestrator transcribes it verbatim under the intended filename, with the same one-line provenance note as a worker report.

## Advisor dispatch

Send to the `advisor` agent only from the escalation chain. Carry: the problem (key, scope, signature, blocked node), the failure history (review and verify reports, worker reports, counters, any earlier `advice-<n>.md` on the same problem, which did not resolve it), the failing task's dispatch reference (task id, instructions, restrictions, commands, worktree path), and the stage directory plus `advice-<n>.md` filename. The advisor analyses only; its single write is the advice file.

## Dispatch for a ticketed unit

When the graph declares a re-entry concept (the library's `tickets`, `current_ticket`), add to the payload of every task that reads `state:current_ticket` and has an item selected (build and verification tasks) the current ticket's routing entry (id, verification command) and the pointer to its full text in the decomposition stage directory. The ticket's `verification_command` is a run-time invocation: it is valid only when the task mounts a state-sourced command family covering it (the write gate checks this, `command-not-mounted`; include the resolved command in the commands list). The implement task's dispatch states that the ticket's test files are already landed and committed in the worktree at their declared paths with the red run recorded — the worker implements only and must not modify them (`node-execution.md`, "Ticketed build").

## Orchestrator-run commands (not dispatches)

Script tasks (`run` lines, terminal pipelines included) and the commands of a validator task whose runner is `orchestrator` are run by the orchestrator with the same variable substitution, one process per line, in declared order, with the line's stdout/stderr and exit status captured for the step record (`node-execution.md`). A human task is not a dispatch either: the orchestrator puts the task's `instructions` to the human in the main session.
