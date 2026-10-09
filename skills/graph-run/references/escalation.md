# Tiered escalation: counters, problems, advisor, human ruling

Load this when a task's exit has not happened, a validator fails, a task is blocked or fails with no `goto` to return through, or a counter cap is reached. Escalation is a fallback chain inside the current node, not routing: the orchestrator stays at the node and at the pipeline position, records the problem, consults the advisor (capped), then stops for the human ruling. The `escalate` action of a pipeline entry is the declared entry into the chain for failures with no earlier task to return to; every other failure reaches it the same way. No advisor, blocked, or escalation edge exists in any graph.

All state changes below go through `work-unit.mjs write` (shapes in `state-writes.md`). The gate enforces: the blocked node is set if and only if a problem is open (`blocked_at == current_node`); at most one problem is open; consultation count never exceeds the declared cap; `count == inherited + advice length`; a problem opened by the total cap is never superseded.

## Caps (from the graph definition)

- `failure` (F): same-signature failures at one scope before the chain engages.
- `total_failure` (T): signature-independent total per scope; default `2 * failure` when not declared.
- `advisor_consultations` (C): consultations per problem.
- `edge_revisit` (E): returning-edge traversals without progress.

## Failure signature

The same error is judged by signature, a stable string you compose:

| Failure | Signature |
| -- | -- |
| Failing validator verdict (reviewer or orchestrator runner) | `dims:<failing dimension names, sorted, comma-joined>\|cmd:<failing verification command, or none>` from the verdict |
| Counted `goto` not driven by a verdict (a human send-back) | `goto:<outcome>@<node id>.<task id>` |
| Script task failure (the `escalate` action, also a terminal's script), or a validator command that cannot run (exit 126/127) | `cmd:<failing command>\|exit:<status>` |
| Blocked report | `blocked:<reason code>@<node id>` (a script failure contributes its stable error code as the reason code; an exit that has not happened contributes `exit-outcome-undeclared` or `exit-artifact-missing`) |
| Edge-revisit cap | `edge-revisit:<from>-<to>` |
| Guard zero-match or ambiguity | `guard-defect:<kind>@<node id>` |

## Scope and counters

`fail_counters[<scope>]` is `{signature, count, total}`; a missing key is zero.

- **Scope.** A failing verdict or a counted `goto` increments exactly one counter: the finest applicable scope of the entry whose outcome triggered it. When that task reads a `re_entry` progress field (`state:<progress_field>`) and an item is selected (reference graph: `verify-build` with a `current_ticket`), the scope is `<node>.<task>:<item-id>` (`build.verify-build:T-2`). Otherwise it is `<node>.<task>`. Nothing clears the progress field after the last item passes, so a ticketed unit's whole-change fix in `build-direct` keeps the last ticket selected: its `verify-build` is scoped `build-direct.verify-build:<last-ticket-id>`. An item scope exists only where the re-entry concept does. Never increment two scopes for one failure.
- **On a failing verdict or counted `goto`**: if `counters.signature` equals the new signature, `count += 1`; otherwise `signature` = new, `count = 1` (the per-signature counter restarts at one, for bookkeeping only). Always `total += 1`. Written in the same write that records the verdict.
- **Not counted here:** blocked reports, script failures (a failing script task, or a terminal's script), exits that have not happened, and guard defects open problems directly and do not increment counters (they have no verdict). An orchestrator-run validator's failing verdict is NOT in that class: it counts like a reviewer's (a check that cannot run — exit 126/127, unresolvable program — is script class instead). A standalone validator node's failing verdict increments no `<node>.<task>` counter; its returning edge counter is incremented when the edge is taken (below).
- **Edge scope** `edge:<from>-<to>`: `{signature: null, count: n, total: n}`; count only traversals of a returning edge (its target is already in `walked_path` at run time). Checked before taking the route; at or above E the orchestrator stays and escalates instead of routing. Declared selection-only re-entry never accumulates.

### Progress (the only edge-counter reset)

Progress is a closed definition: (a) a scope item transitioning to passed (reference: a ticket's status becomes `passed` in the `verify-build` pass write), or (b) a graph-declared monotonic progress field advancing (a node's `re_entry.progress_field`, reference: `current_ticket` moving to the next ticket in the selection step). When either is recorded, remove every `edge:*` key from `fail_counters` in that same write. Nothing else resets edge counters: not advice, not a pass of an unrelated task, not a human ruling (a retry ruling leaves them unchanged). A `ticket-invalid` return is no progress.

## The decision procedure

Let a failure event have a signature S and scope X. Update counters first (rules above), then:

**A. No problem is open for this node.**
- Failing verdict or counted `goto`: if `count >= F` (the signature recurred up to the cap) open a problem with `opened_by: "signature"`; else if `total >= T` open one with `opened_by: "total"`; else retry in place: take the `goto` (start its target with the evidence — the review or verify report, or the human's feedback — and any advice that still applies as retry context). Do not open anything below the caps; at the cap do not traverse.
- Blocked report, script failure, exit that has not happened, or guard defect: open a problem immediately (`opened_by: "blocked"`).
- Edge-revisit cap about to be exceeded: open a problem (`opened_by: "edge-revisit"`).

Opening a problem: append to `advisor_consults` `{problem_key: "<scope>#<n>", scope, signature, opened_by, blocked_node: <current node>, inherited: 0, supersedes: null, count: 0, advice: [], status: "open"}` where `<n>` is one more than the number of earlier problems with that scope; set `blocked_at` to the current node; log an orchestrator line (`route`) saying the unit stays in place with the problem. The scope is the finest scope of the entry at `current_task` (`<node>.<task>`, with `:<item-id>` where that rule applies), or `edge:<from>-<to>` for an edge-revisit problem; at a terminal's script it is `<terminal>.<task>` with `blocked_node` the node being left (the gate forbids an open problem at a terminal). The orchestrator then does not dispatch the producing task again until advice is issued.

**B. A problem is already open for this node and a failure arrives (a retry after advice failed, or the task blocked again).** The chain persists; it never drops back to the plain retry loop:
- Same signature as the open problem, or the open problem was opened by the total cap: the problem stays open (a total-cap problem is never superseded, whatever the new signature). Counters keep counting (`total` too).
- Different signature on a problem not opened by the total cap: close it as superseded (`status: "superseded"`) and open a new one in the same write with `supersedes: <old key>`, `inherited: <old count>`, `count: <old count>`, empty `advice`, status `open`, `opened_by` of the new failure's kind, and the new signature. The orchestrator stays in place and continues at the tier the inherited count dictates.
- Also while a problem is open, a total reaching T opens nothing new.

**C. Choose the next tier for the open problem** (after A or B):
- Consultation count `< C` and the problem is not an edge-revisit problem: **consult the advisor**.
- Consultation count `>= C`: **stop in place for the human ruling**. Do not consult again and do not loop the producing task.
- Edge-revisit problems: the advisor is consulted once to diagnose why the loop does not converge, then the orchestrator goes to the human ruling with the advice shown (there is nothing to retry in place at a validator, and a route is exactly what the cap blocks).

**D. Consult the advisor.** Dispatch the `advisor` agent (`dispatch.md`). Read the `advice-<n>.md` it wrote. Write: append to the problem's `advice` `{file: "<node>/advice-<n>.md", date, log_ref: <id of the log line in this same write>}`, `count += 1`, and an `advisor-consultation` log line (source `actor-report`, actor `advisor`, `source_ref` the advice file). Advice does not reset any counter. Then retry the stage with the advice as retry context: for a verdict problem, take the `goto` the cap held (start the producing task); for a blocked llm task, re-dispatch it; for a script failure or any `escalate`, re-run only that task (script tasks are idempotent). Failure after advice goes back to B, so with the count below C you consult again, at C you stop for the human.

**E. A successful exit resolves.** When the entry whose scope carries the problem later ends in a successful exit (a validator pass, a human approval, or a script `ok`; neither a `goto` retry nor `escalate`, which are failures of the entry), in the same write that records it: set the problem `status: "resolved"`, `blocked_at: null`, and remove the counters of that scope (`<node>.<task>` or `<node>.<task>:<item-id>`; edge counters stay). A later failure on the same scope opens a new problem.

## Human ruling

When consultations are exhausted (or after the edge-revisit advice), the orchestrator stays at the node and puts the question to the human in the main session. It presents: the problem (signature, scope, node), the failure history (review and verify reports), every advice file, and the three dispositions:

1. **retry here with guidance** (the human's guidance becomes retry context),
2. **move back** to a named earlier node on the unit's path (`walked_path`),
3. **end** the work.

Never route anywhere while the ruling is pending. Record the ruling before acting on it: write `decision-<n>.md` in the stage directory (disposition, guidance or target or reason, the human's words), then one `write` with the `human_decisions` entry (`kind: "escalation"`, `decision: "retry" | "move-back" | "end"`, `target` for move-back, `file`), a `human-decision` log line (source `human-answer`, `source_ref` the decision file), the problem status (`escalated` for retry/move-back; `abandoned` for end), `blocked_at: null`, and the resets below.

- **Resets.** A ruling resets the task- and item-scoped counters of the problem's scope (remove their keys). Edge counters are untouched.
- **retry:** act in place: take the `goto` the cap held, re-dispatch the blocked task, or re-run the failed script task, with the guidance plus advice. For an edge-revisit problem, retry means permitting exactly one more traversal of that edge: take the route that the cap was holding, incrementing the edge counter beyond the cap (the counter itself stays until recorded progress resets it). The next arrival at the edge is again at or above the cap, so a new problem opens. If interrupted after the ruling, resume sees an `escalated` problem and a retry decision newer than the last `route` line: act on it.
- **move back / end:** an orchestrator override (see `node-execution.md`, "Overrides"). `move-back` target must already be in `walked_path`. `end` goes to the abandonment terminal: set outcome `ended` with the ruling as `outcome_reason`, and run the terminal procedure (handoff written by the orchestrator, force-removal of the worktree, archive).
- A proposed target that is not a walked node and not the abandonment terminal is refused; ask again.

A later failure on the same scope after a ruling opens a new problem (`<scope>#<n+1>`) with `inherited: 0`.

## Quick reference

| Situation | Action |
| -- | -- |
| Failing verdict (reviewer or orchestrator-run) or counted `goto`, `count < F`, `total < T`, no open problem | Counter +1, take the `goto` |
| `count >= F` (same signature) or `total >= T` | Open problem (`signature` / `total`), advisor; do not traverse |
| Blocked report, script failure, exit not happened, guard defect | Open problem (`blocked`), advisor |
| Open problem, new failure, same signature or total-opened | Stay open, next tier |
| Open problem, new failure, different signature, not total-opened | Supersede, inherit count, next tier |
| Consultation count `< C` | Advisor, then retry the task with advice |
| Consultation count `>= C` | Human ruling in place |
| Validator-node fail via returning edge at or above E | Edge-revisit problem, advisor once, human ruling |
| Ticket passes / progress field advances | Remove all `edge:*` counters |
