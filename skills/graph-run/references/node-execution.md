# Executing a node, gating, routing, and terminals

Load this when executing a node. Writes use the draft shapes in `state-writes.md`; failures use `escalation.md`; payloads use `dispatch.md`.

## Execution by node type

| Node type | Execution |
| -- | -- |
| entry | The orchestrator creates the unit (done at start) and routes by the single unconditional edge to the shared first node. No actor. |
| llm | Pre-steps, then worker, then reviewer, then gate, then (approval), then route, then post-steps as ordered below. |
| validator | Reviewer only, no worker. Its verdict is the routable outcome (`pass` or `fail`). |
| deterministic | The orchestrator runs the node's mounted commands in declared order. The outcome is fixed: `pass`. No actor. |
| tool | The orchestrator invokes the node's mounted tool(s). The outcome is fixed: `pass`. No actor. |
| terminal | Terminal procedure below. No verification, outcomes, or edges. |

Deterministic and tool nodes: a command failure is not retried automatically. It engages the fallback chain directly with signature `<command> exit <status>` (see `escalation.md`). Success cites the step record in the `route` log line and routes.

## Pre-steps and worktree provisioning

A node that declares `pre_steps` (repository-writing nodes: build, close-out) is provisioned before any dispatch, on first entry and again whenever the unit's worktree directory is gone.

1. Compute the variables (`dispatch.md`). Run each pre-step in order as the orchestrator. For the reference graph these are `worktree.mjs ensure --branch "$WU_BRANCH" --id "$WU_ID"` then `worktree.mjs setup --worktree "$WU_WORKTREE"`.
2. Read the JSON of `ensure`. `reused`: skip `setup`. `created`, `reopened`, `recovered-stale`: run `setup`. A missing worktree whose branch still exists means reopen on the existing branch, never a new branch.
3. A fix unit (trigger names an existing branch) works on that branch: `--branch <trigger.branch> --id <id>`; the path is still derived from its own id.
4. Pass the resulting `path` in the dispatch. The worktree is reused across all of the unit's tickets and by close-out.
5. If a pre-step fails (nonzero exit, unresolvable script): stop and treat as a blocked report with the script's stable `error` code as the reason code. Do not fall back to raw `git worktree` commands and do not dispatch the worker.
6. Record each pre-step result in `steps-<n>.md` in the node's stage directory (what ran, exit status, JSON output).

The build worker performs no VCS operations and confines repository writes to the given path; it records `worktree.md` (branch and path) in its stage directory. The orchestrator derives the authoritative path from the unit id.

## LLM node cycle

1. **Materialization.** The first time a node is dispatched, the write gate materializes the graph-declared fields bound to that node (with defaults) in the write that sets `current_node`/`walked_path`. Never add them by hand.
2. **Dispatch the worker** (`dispatch.md`). Log a `dispatch` line (orchestrator event) before it runs.
3. **Worker report.** Read `report-<n>.md`. Log a `report` line (source `actor-report`, actor `worker`, `source_ref` the report file).
   - Status `blocked`: open or continue an escalation problem (signature = reason code + node; a script failure contributes its stable error code). Go to `escalation.md`. No reviewer.
   - Otherwise it is a claimed routable outcome from `node.outcomes`. An outcome not in that list is a defect: treat as blocked.
4. **Dispatch the reviewer** with the worker's report, effective restrictions, verification commands, and dimensions. Even when the worker's self-check passed, the reviewer re-executes every command itself. A restriction violation fails the review regardless of command results. The reviewer also verifies the basis of an alternative outcome (`ticket-invalid`, `spec-contradiction`, ...).
5. **Record the verdict.** Append a `reviews` entry (id `R-<n>`, node, target, verdict, dimensions, at least one evidence reference, the `review-<n>.md` pointer) plus a `verdict` log line (source `actor-report`, actor `reviewer`).
   - **pass**: the stage's outcome is released. Reset the node- and concept-scoped counters of this scope; resolve an open problem for it (status `resolved`, clear `blocked_at`). If the node's scope concept advances (a ticket reaching passed), that is recorded progress: see "Progress" in `escalation.md`. Continue to approval (if declared), then post-steps and routing.
   - **fail (in-node)**: not a routable outcome. Increment exactly one counter, the finest applicable scope, in the same write (`escalation.md`). Below the cap, re-dispatch the worker in place with the review evidence. At the cap with the signature recurring: open the problem and consult the advisor; do not dispatch the worker until advice exists.
6. **Approval** (if `node.human_approval`): see below.
7. **Route** and run **post-steps**: see below.

## Validator node

Dispatch only the reviewer with the review scope; no worker. Record the verdict as above, but a failing verdict increments no node counter. Route by the node's declared edges on the verdict as the outcome (typically `pass` forward, `fail` to the repairing node). If the selected edge is a returning edge, it carries the revisit counter: increment `edge:<from>-<to>` in the same write that routes, and check the cap before taking the route (see "Edge revisits" below). A blocked report from a validator (it cannot run) engages the chain like any block.

## Human approval: an in-place stop, never a node

When the node declares `human_approval`, after a reviewer pass and before any route:

1. Put the question to the human in the main session at this node: the output (point at the stage files; summarize), what approving means, and the allowed answers. Send-back is the default whenever approval is not explicitly granted.
2. Answers: **approved**; **send-back** with feedback, to a named earlier node already walked on the unit's path (or, at the shared first node where nothing precedes, a re-dispatch of the same node with the feedback); **not-needed** (phase approval only): the work is not needed and ends at the abandonment terminal. At the first node an approval answer must name exactly one phase from the graph's declared vocabulary; never invent one. For a unit whose trigger source is `maintenance-due` the only phase is `maintenance`; for any other unit `maintenance` is not offered.
3. Before dispatching or routing anywhere, write `decision-<n>.md` into the stage directory (the orchestrator writes it; the human writes nothing): the question, the answer, the phase if any, the target if any, and the human's feedback verbatim (mandatory for send-back and not-needed). Then one `write` carrying the `human_decisions` entry (`kind: approval`), the state updates the answer implies, and a `human-decision` log line (source `human-answer`, `source_ref` the decision file).
4. The phase approval is mandatory for every unit at the shared first node and records `phase` in that same write (the gate also materializes phase-bound fields). The phase is immutable once recorded: a later send-back to the first node re-reviews the proposal for the same phase; if the phase was wrong, the unit ends and a new one opens.
5. Send-back or not-needed is a recorded orchestrator override (see "Overrides"), not a declared edge. After it, act on it.
6. Approved: route by the guards, now able to read the recorded `phase`.

## Routing

1. Select the candidate edges: `graph.edges` with `from == current_node` and `outcome` equal to the released outcome.
2. Evaluate each guard, a conjunction of `{field, op, value}` over the unit's state fields and the reported outcome and the approved `phase`. Operators: `eq ne in not-in lt lte gt gte`, and for list fields `empty not-empty` plus count comparisons. The empty conjunction is unconditional.
3. Exactly one guard must hold. Zero matches (or, defensively, more than one): a definition defect. Stay in place as blocked, never improvise a route; open an escalation problem with signature `guard-zero-match@<node>`/`guard-ambiguous@<node>` (blocked-report class).
4. **Path check.** The target must be the next node on the approved phase's `path`, or an earlier path node reached by a declared returning edge (the edge's target index is lower than its source's in that path). Otherwise: definition defect; stay in place, blocked, do not dispatch the target.
5. **Edge revisits.** For a returning edge: before routing, read `edge:<from>-<to>`. At or above the graph's `edge_revisit` cap: do not route; open an edge-revisit problem and go to the advisor tier (`escalation.md`). Below it: increment the counter in the same write that routes. Declared selection-only re-entry (below) does not accumulate.
6. **Write the route**: new `current_node`, `walked_path` append, counters, a `route` log line. Then continue the loop at the new node.

### Selection-only re-entry

A node may declare `re_entry: {list_field, order, progress_field}` (the reference graph: the ticket node over `pending_tickets`, `current_ticket`). When the routing arrives at such a node because the scope item just passed (progress was recorded) and the list is not empty, the orchestrator performs the selection itself with no actor dispatch:

1. Take the first element of `list_field` in the declared `order`; set `progress_field` to it; remove it from `list_field`; set the matching per-item status to `in-progress` if the list's items carry a status.
2. Append the node to `walked_path` and write a `route` log line describing the selection.
3. Treat the node as completed with its ordinary outcome and route onward by the declared edges (reference: to build).

Because `progress_field` advances, this counts as progress and never accumulates against the revisit counters. Arrival at the same node by an alternative outcome (`ticket-invalid`, `spec-contradiction`) is not a re-entry: dispatch the node normally.

The first selection after the decomposition worker's reviewed pass is the same rule applied to the full list the worker handed over.

## Overrides: human rulings and approval answers that jump

A ruling (`escalation.md`) or an approval answer may move the unit somewhere other than a declared edge's target. The move is a recorded orchestrator override and the target is only (a) a node already in `walked_path`, or (b) the abandonment terminal. Anything else: refuse, tell the human why, ask again. Record the override as a `human_decisions` entry with `target`, the decision file, and a `route` log line whose description says "override".

## Post-steps (repository-writing nodes)

After a reviewer pass (and approval, if any) and before the route write, run the node's `post_steps` in declared order as commands. For build this is the local commit of accepted output; for close-out it is commit, push, open the delivery channel, remove the worktree. Nothing leaves the machine before the close-out reviewer pass. No worker, reviewer, or advisor is dispatched for post-steps.

- Record each step (command, exit status, output tail) in `steps-<n>.md` in the node's stage directory. The log vocabulary has no step event, so cite the file in the description of the next orchestrator line (`route`, or `dispatch` when a standalone line is needed); orchestrator events carry `source_ref: null`.
- Steps are idempotent. On resume, re-run only steps not recorded as succeeded.
- A failing post-step is that node's deterministic failure: signature `<command> exit <status>`, the fallback chain engaged in place, the recorded reviewer pass stays valid, and the retry re-runs only the failed step (and the ones after it).
- Worktree removal here is the plain `git worktree remove "$WU_WORKTREE"`, never forced on the success path.

## Close-out node

The node mounting the wrap skill is the unit's only memory writer. Dispatch its worker with the worktree (provisioned by pre-steps even if the recorded one is gone) and the wrap close-out permissions (`dispatch.md`). The worker reads the draft deltas from the stage directories of the main checkout (`<node>/delta-<n>.md`), merges consolidated entries into the ledger inside the worktree so they travel on the unit's branch, writes `handoff.md` in its own stage directory, and reports `handed-off`. The reviewer's verification includes `memory.mjs validate --root "$WU_WORKTREE"`; drafts rejected in any review report must be dropped by the worker. After the pass, run the post-steps. Neither half waits for asynchronous integration results; red CI or a conflict after handover becomes a new unit.

## Terminal procedure

Terminals carry steps instead of verification. Reaching one (success terminal by the close-out route; abandonment terminal only by a disposition: a not-needed approval or a ruling's end) is done in this order so a failing step can still be escalated in place.

1. **Abandonment only:** write `handoff.md` at the folder root yourself: what was concluded, the abandonment reason, and the ids of any unmerged draft deltas (list `delta-<n>.md` files across the stage directories; they stay in place in the folder). On success, the handoff is the reviewed close-out artifact; the terminal's copy step puts it at the root.
2. Run the terminal's `steps` in declared order, except the final archive step, with `current_node` still at the node you are leaving. Record the results in `steps-<n>.md` in the terminal's stage directory. Abandonment's steps remove any live worktree with force permitted (the unit folder already holds the drafts) and check that the handoff exists, so an abandoned unit leaves no residue. A failing step is a deterministic failure at the node you are leaving (the gate forbids an open problem at a terminal), with the failing command and its exit status as the signature; escalate in place per `escalation.md`, retry re-runs from the failed step.
3. One `write` records the arrival: `current_node` to the terminal, `walked_path` append, `outcome` (`shipped` at the success terminal, `ended` at abandonment), `outcome_reason` (required for `ended`: why), a `route` log line, and the final `archive` log line (node = the terminal; the gate requires the outcome set and freezes the folder after it).
4. Run the archive step (`work-unit.mjs archive --graph "$GRAPH" --unit "$WU_FOLDER"`); it moves the whole folder to the archive. After this nothing may be written. The archive gate needs `handoff.md` at the root and the archive line last.
5. If the archive move itself fails, the folder is already frozen and the failure cannot be written to state: retry the archive command once after fixing the reported cause, otherwise report it to the human in the main session.
6. Report the outcome, the handoff summary, and any open follow-ups to the human.
