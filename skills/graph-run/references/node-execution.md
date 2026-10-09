# Executing a node: tasks, `on` actions, routing, and terminals

Load this when executing a node. Writes use the draft shapes in `state-writes.md`; failures use `escalation.md`; payloads use `dispatch.md`.

## Walking a pipeline

A work node is an ordered pipeline of entries `{use, with, on}`. Node kinds are only `entry`, `work`, and `terminal`; nothing branches on a node type, only on the executor of the task at the current entry. The entry node has no pipeline: the orchestrator creates the unit at start and routes by its single unconditional edge to the shared first node. No actor.

`current_task` is the pipeline position: the entry at `current_node` that is about to run or running. A route write sets it to the target's first entry; later, the write with an entry's `dispatch` log line sets it to that entry. Recording a result never moves it. It is null only at the entry node and during a selection step ("Selection-only re-entry").

Per entry, in order:

1. **Materialization.** The write that routes into a node materializes, with catalog defaults, the graph-declared fields that node's pipeline can produce, the first time such a node is reached. The gate does it (the write's JSON lists `materialized`); never add them by hand.
2. **Construct** the task's dispatch: the TaskDef plus the entry's `with` bindings (`dispatch.md`). A leftover `{{...}}` is a definition defect: blocked, nothing dispatched.
3. **Start the entry.** The route write already set a node's first entry. Any other start (the following entry, or a `goto` target, even the first entry) is one write that sets `current_task` to it with a `dispatch` log line (an orchestrator event, also for entries you run yourself). Then execute by executor (below).
4. **Verify the exit.** The exit has happened only if (a) the outcome is one of the task's `exit.outcomes` and (b) for llm, validator, and human tasks, the file named by `exit.artifact` exists in the stage directory (for a `<n>` pattern: a file this execution produced, such as the transcribed `report-<n>.md`). A worker or reviewer reporting `blocked` is not an exit; it opens or continues an escalation problem (`blocked:<reason code>@<node id>`; a script failure contributes its stable error code). An outcome outside `exit.outcomes`, or a missing artifact, means the exit has not happened: treat it as blocked with reason code `exit-outcome-undeclared` or `exit-artifact-missing`, apply no `on` action, and go to `escalation.md`. An alternative outcome (`ticket-invalid`, `spec-contradiction`) counts only with the evidence that justifies it present in the artifact.
5. **Record** through one `write`: the result's log line citing its file, the `state:` fields the task produces (transcribed from its report; the in-flight task is the stored position, so the write is authorized), the verdict with its counters. Record before applying anything.
6. **Apply exactly the `on` action** the entry declares for the recorded outcome ("`on` actions" below).

## Executors

### script

The orchestrator runs the task's `run` lines in declared order, one process per line, with the run-time variables substituted (`dispatch.md`), capturing stdout, stderr, and exit status. A line is a command string or `{command, codes}`. Stop at the first non-zero exit. The task's outcome is `ok` when every line exits zero; the outcome that `codes` maps the failing line's exit status to (the red check maps `expect-red` exit 11 to `ticket-invalid`); otherwise `failed`. Status 126 and 127 are never mapped: a command that cannot run is a defect, so the outcome is `failed`. No actor is dispatched.

Record one `step` line per executed line in the write that records the exit: command, exit status, output tail (truncate to the last ~20 lines); orchestrator events carry `source_ref: null`. Scripts are idempotent: a retry (after advice, a ruling, or a resume) re-runs only that task, from its first line. The entry's `on` map decides what a failure means (library: `failed` goes to `escalate`).

Worktree provisioning is the library's `provision-worktree` task (`worktree.mjs ensure`, then `worktree.mjs setup`), the first entry of every repository-writing node (build, build-direct, maintain, wrap). `$WU_WORKTREE` is derived from the unit id (run-time variable catalog, `dispatch.md`) and passed in every later dispatch; the `path` in `ensure`'s JSON only confirms it and may differ textually (for example `/private/tmp` for `/tmp` on macOS). A missing worktree whose branch still exists reopens on that branch, never a new branch. A fix unit (trigger names an existing branch) works on that branch (`WU_BRANCH`); its path is still derived from its own id. Re-run the task whenever the unit's worktree directory is gone, without moving `current_task`. A failing line (nonzero exit, unresolvable script) is a script failure: no fallback to raw `git worktree` commands, no worker dispatch. The worker performs no VCS operations and confines repository writes to the given path; it records `worktree.md` (branch and path) in its stage directory, and the orchestrator derives the authoritative path from the unit id.

### llm

1. Dispatch the worker (`dispatch.md`).
2. The worker returns its report as text; transcribe it verbatim into `report-<n>.md` in the stage directory (one provenance line on top, nothing edited). Log a `report` line (source `actor-report`, actor `worker`, `source_ref` the report file).
3. Status `blocked`: open or continue an escalation problem (`escalation.md`); no validator runs. Otherwise the status is the claimed outcome, checked as in "Verify the exit". The worker's self-check is feedback, never a verdict: the validator task that follows decides.

### validator

The verdict is `pass` or `fail`, mapped through the entry's `on`. The runner is the task's `runner`.

**Reviewer runner (default).** Dispatch the reviewer with the task's `instructions` (the definition of pass), the commands, the producing task's report and restrictions, and the dimensions (`dispatch.md`). Even when the worker's self-check passed, the reviewer re-executes every command itself. A restriction violation fails the review regardless of command results. An alternative outcome that surfaces (`ticket-invalid`, `spec-contradiction`) is not put to a reviewer: it counts only with its evidence artifact present ("Walking a pipeline", step 4). A reviewer judges it only where the graph maps that outcome to `next` into this validator task, whose `instructions` then say so. Record: a `reviews` entry (id `R-<n>`, node, `scope` = this entry's `<node>.<task>[:<item-id>]`, verdict, dimensions, at least one evidence reference, the `review-<n>.md` pointer) plus a `verdict` log line (source `actor-report`, actor `reviewer`).

**Orchestrator runner (`runner: "orchestrator"`).** No reviewer. Run the mechanical checks the task's `instructions` declare and then its declared commands, in order, each recorded as a `step` line (see "Ticketed build" for the reference checks). Write the verdict record `verify-<n>.md` (the task's exit artifact: checks, exit statuses, failing dimensions, failing command) into the stage directory, then record a `reviews` entry whose `file` is that record and whose evidence references use `kind: "log"` pointing at the `step` lines; the `step` lines are this write's log lines (the `verdict` event is reserved for actor reports). Derive the verdict deterministically: all checks pass is `pass`; any failing check is `fail`, naming the failing dimensions (after the check, in the instructions' words) and the failing command. A command that cannot run (exit 126/127, or an unresolvable program) anywhere is a defect, never a failing verdict and never red: open a problem directly, signature `cmd:<command>|exit:<status>`, no counter.

**Either runner:**

- **pass** — apply `on`. In the same write remove the counters of this scope and resolve an open problem for it (status `resolved`, clear `blocked_at`). If a scope item advances (a ticket reaching `passed`), that is recorded progress: see "Progress" in `escalation.md`.
- **fail** — a failing verdict is never routed on directly. Its `on` action is the declared retry-in-place (`goto:<producing task>`) for a pipeline validator, or a surfaced outcome for a standalone validator node ("Standalone validator node"). For a `goto`, the verdict counts: increment exactly one counter, the finest applicable scope, in the same write (`escalation.md`).

### human

A synchronous in-place stop in the main session at this node. A human task is never an agent and never a node.

1. Put the task's `instructions` to the human: point at the stage files (summarize), say what approving means, and list the allowed answers (the task's `exit.outcomes`). Send-back is the default whenever approval is not explicitly granted.
2. At the phase approval (`approve-phase`, mandatory for every unit at the shared first node) an approval answer must name exactly one phase from the instantiated `phase` type's values; never invent one. For a unit whose trigger source is `maintenance-due` the only phase is `maintenance`; for any other unit `maintenance` is not offered. A fix approval also records the existing contract the proposal names as `contract_ref`.
3. Before applying any `on` action, write `decision-<n>.md` into the stage directory (the orchestrator writes it; the human writes nothing): the question, the answer, the phase if any, and the human's feedback verbatim (mandatory for send-back and not-needed). Then one `write` carrying the `human_decisions` entry (`kind: approval`; `decision` is `approved`, `send-back`, or `not-needed`), the state the answer implies, and a `human-decision` log line (source `human-answer`, `source_ref` the decision file).
4. An approved phase approval records `phase` in that same write, with `approve-phase` in flight (the gate also checks the write carries an approval decision naming that phase). The phase is immutable once recorded: a later send-back re-reviews the proposal for the same phase; if the phase was wrong, the unit ends and a new one opens.
5. Then apply the `on` action: approval typically surfaces the node outcome; send-back is `goto:<the authoring task>`, re-dispatching it with the human's feedback as retry context; `not-needed` surfaces and routes to the abandonment terminal (`end`) by its declared edge.

## `on` actions

- **`next`**: apply by starting the following entry.
- **`goto:<task>`**: return to that earlier entry of the same pipeline. Counted: increment the finest applicable scope of the entry whose outcome triggered it — `<node>.<task>:<item-id>` when that task reads a `re_entry` progress field with an item selected, else `<node>.<task>` — with its failure signature, in the same write that records the outcome (`escalation.md`). Below the caps, start the target with the evidence as retry context (a re-entry never re-runs entries before the target: after a failed `verify-build`, `goto:implement-ticket` leaves the landed tests and the red run untouched). At the cap, stay in place and engage the chain instead of traversing. A traversal the chain orders (advice, ruling) is the one the cap held.
- **A surfaced outcome** (a name in the node's `outcomes`): abort the rest of the pipeline and route ("Routing"). `current_task` stays on the producing entry until the route write.
- **`escalate`**: stay in place and hand the failure to the fallback chain (`escalation.md`): a script failure opens a problem directly with its command and exit status as signature. The retry re-runs only that task.
- **`done`** (terminal pipelines only): the pipeline is complete and the unit ends ("Terminals"). `done` is never a node outcome.

## Ticketed build (library `build` node)

`build` is the pipeline `provision-worktree`, `red-check`, `implement-ticket`, `verify-build`, `commit-work`, for the ticket in `current_ticket`.

1. **`red-check` (script).** Three run lines. `work-unit.mjs land-tests --graph ... --unit "$WU_FOLDER" --worktree "$WU_WORKTREE" --ticket "$WU_CURRENT_TICKET"` copies `<ticket stage>/tests/<ticket-id>/` into the worktree at the mirrored repo-relative paths (a ticket without declared test files fails the line: a decomposition defect, never improvise placements). A `git add -A` / `git commit` line lands them on the unit's branch (idempotent; it commits only when something is staged). `work-unit.mjs expect-red ...` runs the ticket's command in the worktree expecting failure. Exit 11 (`already_green`: the command exited 0, so the ticket is already satisfied or mis-scoped) is mapped to `ticket-invalid`: no worker is dispatched, the red run is the evidence, and the outcome surfaces to route back to the decomposition node. Exit 12 (`not_runnable`: exit 126/127, spawn error, or signal) or any other failure is `failed`, which goes to `escalate`: a command that cannot run is a defect, never red. Record every line as a `step` line (transcription in `state-writes.md`), carrying the red baseline (the worktree's HEAD after the commit line, read with `git -C "$WU_WORKTREE" rev-parse HEAD`) and `land-tests`' `files` in the descriptions so the test-integrity check can find them later.
2. **`implement-ticket` (llm).** The dispatch says the tests are landed and committed with the red run recorded, and must not be modified (`dispatch.md`). Outcomes `done` and `ticket-invalid`.
3. **`verify-build` (validator, orchestrator runner).** After the worker's report run, in order, each recorded as a `step` line: (a) test integrity: `git -C "$WU_WORKTREE" diff --name-only <red-commit> -- <test paths>`: any listed file is a failing verdict on the test-integrity dimension regardless of later results; (b) the ticket's command, expected exit 0; (c) the declared commands (full suite, static checks), expected exit 0, so a regression introduced by this ticket surfaces here, attributed to it. Failing signature `dims:...|cmd:...`; scope `build.verify-build:<ticket-id>`. **On pass: the same write sets that ticket's status to `passed`** (re-entry bookkeeping), including a pass that follows earlier failures; this is recorded progress. A failing verdict sets `failed`; `blocked` while a problem on the ticket's scope is open.
4. **`commit-work` (script)** commits the accepted output on the unit's branch; `ok` surfaces `ticket-done`.

**Review-node entry check.** Before routing into the whole-change review node of a unit that holds `tickets`, every ticket's status must be `passed`. Anything else is a state defect: stay in place, repair the state (the pass that was never flipped), never route past it.

A ticketless build (`build-direct`; `maintain` has the same shape with its own tasks) has no red check and no ticket: `verify-build` runs the declared commands only, and the scope is `<node>.<task>` unless the task reads a `re_entry` progress field with an item selected. A ticketed unit's whole-change fix after a failed review also runs in `build-direct`, and nothing clears `current_ticket` after the last ticket passes: the last ticket stays selected, so that `verify-build` is scoped `build-direct.verify-build:<last-ticket-id>` and also runs that ticket's checks ("Ticketed build", step 3).

## Standalone validator node (`review`)

A node whose pipeline is one validator task, no worker. Dispatch only the reviewer with the review scope; its verdict is the node's outcome: `on` maps `pass` and `fail` to surfaced node outcomes, routed by the node's edges (library: `pass` forward; `fail` to a fixing node selected by `phase`). Record the verdict as above, but a failing verdict increments no `<node>.<task>` counter; only the returning edge it routes through counts, in the same write that routes, and the cap is checked before the route is taken (see "Routing"). A blocked report from a validator (it cannot run) engages the chain like any block.

In the library a failed review routes to `build-direct` for feat, fix, and chore, and to `maintain` for maintenance. `build-direct` is the whole-change fix (`provision-worktree`, `implement-change`, `verify-build`, `commit-work`, then back to `review`); each edge whose target is already in `walked_path` counts its revisit counter. A failed review never re-enters `build`, so `red-check` does not re-run on an implemented ticket.

## Close-out (`wrap`)

`provision-worktree`, `close-out`, `verify-wrap`, `commit-work`, `deliver`. The task mounting the wrap skill (`close-out`) is the unit's only memory writer. Dispatch its worker with the worktree (re-provisioned by the first entry even if the recorded one is gone) and its own restrictions, which carry the close-out memory permissions (`dispatch.md`). The worker reads the draft deltas from the stage directories of the main checkout (`<node>/delta-<n>.md`), merges consolidated entries into the ledger inside the worktree so they travel on the unit's branch, writes `handoff.md` in its own stage directory (its exit artifact), and reports `done`. `verify-wrap` (reviewer) includes `memory.mjs validate --root "$WU_WORKTREE"`; drafts rejected in any review report must be dropped by the worker.

Nothing irreversible happens before `verify-wrap` passes: the pipeline order is the guarantee, so never reorder it and never run `deliver` ahead of it. After the pass, `commit-work` and `deliver` (push, open the delivery channel, remove the worktree with plain `git worktree remove "$WU_WORKTREE"`, never forced on the success path) run as script tasks: record each line as a `step` line and dispatch no worker, reviewer, or advisor for them. A failing script task there is that task's script failure: signature `cmd:<command>|exit:<status>`, the chain engaged in place, the recorded `verify-wrap` pass stays valid, and the retry re-runs only the failed task. Neither half waits for asynchronous integration results; red CI or a conflict after handover becomes a new unit.

## Routing

When an outcome surfaces:

1. Select the candidate edges: `graph.edges` with `from == current_node` and `outcome` equal to the surfaced outcome.
2. Evaluate each guard, a conjunction of `{field, op, value}` over the unit's state fields (`phase` included). Operators: `eq ne in not-in lt lte gt gte`, and for list fields `empty not-empty` plus count comparisons. The empty conjunction is unconditional.
3. Exactly one guard must hold. Zero matches (or, defensively, more than one): a definition defect. Stay in place as blocked, never improvise a route; open an escalation problem with signature `guard-defect:zero-match@<node>` (or `ambiguous`), blocked class.
4. **Edge revisits.** A returning edge is an edge whose target is already in `walked_path`. Before routing, read `edge:<from>-<to>`. At or above the graph's `edge_revisit` cap: do not route; open an edge-revisit problem and go to the advisor tier (`escalation.md`). Below it: increment the counter in the same write that routes. Declared selection-only re-entry (below) does not accumulate.
5. **Write the route**: new `current_node`, `walked_path` append, `current_task` set to the target's first entry, counters, one `route` log line. Then continue the loop at the new node.

### Selection-only re-entry

A node may declare `re_entry: {list_field, order, progress_field, items_field}` (the reference graph: the `ticket` node over `pending_tickets`, `current_ticket`, `tickets`). The orchestrator selects the next item itself, with no actor dispatch, when (a) the node's own pipeline has just surfaced its ordinary outcome (the decomposition task handed over the list), or (b) routing arrives at the node because the scope item just passed (progress was recorded) and `list_field` is not empty. In one write:

1. Take the first element of `list_field` in the declared `order`; set `progress_field` to it; remove it from `list_field`; set the item's status in `items_field` to `in-progress` if its records carry a status. This is re-entry bookkeeping: the gate authorizes it without a producing task.
2. Remove every `edge:*` key from `fail_counters`: the advancing progress field is recorded progress, so the arrival never accumulates against the revisit counters (do not increment the returning edge's counter for it).
3. Append the node to `walked_path` (case b), set `current_task` to null, and write a `route` log line describing the selection.
4. Treat the node as completed with its ordinary outcome and route onward by its declared edges (reference: `tickets-produced`, to build). The two route writes may share one `write`; then `current_task` ends at the second target's first entry.

Arrival by an alternative outcome (`ticket-invalid`, `spec-contradiction`) is not a re-entry: dispatch the node's pipeline normally.

## Overrides: human rulings that jump

A ruling (`escalation.md`) may move the unit somewhere other than a declared edge's target. The move is a recorded orchestrator override and the target is only (a) a node already in `walked_path`, or (b) the abandonment terminal. Anything else: refuse, tell the human why, ask again. Record the override as a `human_decisions` entry with `target`, the decision file, and a `route` log line whose description says "override". A move back sets `current_task` to the target's first entry, so its pipeline runs from the start.

## Terminals

A terminal carries a pipeline of script tasks only (library: `archive-shipped`, `archive-abandoned`), no outcomes, no edges out, each ending in `done`. Reaching one — the success terminal by the close-out route; the abandonment terminal by a `not-needed` outcome's declared edge or by a ruling's end — is done in this order so a failing line can still be escalated in place.

1. **Abandonment only:** write `handoff.md` at the folder root yourself: what was concluded, the abandonment reason, and the ids of any unmerged draft deltas (list `delta-<n>.md` files across the stage directories; they stay in place in the folder). On success, the handoff is the reviewed close-out artifact; the terminal's first run line copies it to the root.
2. Run the terminal pipeline's run lines in declared order, except the final line (the `work-unit.mjs archive` call), with `current_node` still at the node you are leaving. Record each as a `step` line (log `node` = the terminal). Abandonment's lines remove any live worktree with force permitted (the unit folder already holds the drafts) and check that the handoff exists, so an abandoned unit leaves no residue. A failing line is a script failure of the terminal's task (scope `<terminal>.<task>`); the gate forbids an open problem at a terminal, so the problem is opened with `blocked_node` the node you are leaving. Escalate in place per `escalation.md`; the retry re-runs the terminal task from its first line.
3. One `write` records the arrival: `current_node` to the terminal, `walked_path` append, `current_task` to the terminal's final entry, `outcome` (`shipped` at the success terminal, `ended` at abandonment), `outcome_reason` (required for `ended`: why), a `route` log line, and the final `archive` log line (node = the terminal; the gate requires the outcome set and freezes the folder after it).
4. Run the final line (`work-unit.mjs archive --graph "$GRAPH" --unit "$WU_FOLDER"`); it moves the whole folder to the archive. That completes the pipeline (`done`). After this nothing may be written. The archive gate needs `handoff.md` at the root and the archive line last.
5. If the archive move itself fails, the folder is already frozen and the failure cannot be written to state: retry the archive command once after fixing the reported cause, otherwise report it to the human in the main session.
6. Report the outcome, the handoff summary, and any open follow-ups to the human.
