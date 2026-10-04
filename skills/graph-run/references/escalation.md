# Tiered escalation: counters, problems, advisor, human ruling

Load this when a stage fails, is blocked, or a counter cap is reached. Escalation is a fallback chain inside the current node, not routing: the orchestrator stays at the node, records the problem, consults the advisor (capped), then stops for the human ruling. No advisor, blocked, or escalation edge exists in any graph.

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
| Reviewed stage, failing verdict | `dims:<failing dimension names, sorted, comma-joined>\|cmd:<failing verification command, or none>` from the reviewer's verdict |
| Deterministic or tool node, or a failing pre-step/post-step/terminal step | `cmd:<command>\|exit:<status>` |
| Blocked report | `blocked:<reason code>@<node id>` (a script failure contributes its stable error code as the reason code) |
| Edge-revisit cap | `edge-revisit:<from>-<to>` |
| Guard zero-match or path mismatch | `guard-defect:<kind>@<node id>` |

## Scope and counters

`fail_counters[<scope>]` is `{signature, count, total}`; a missing key is zero.

- **Scope.** A failing verdict increments exactly one counter: the finest applicable scope. When the node is working on a selected item of a graph-declared scope kind (reference graph: build with a `current_ticket`), the scope is `<kind>:<id>` (`ticket:<id>`). Otherwise it is `node:<id>`. A `ticket:` scope exists only where tickets exist. Never increment two scopes for one failure.
- **On a failing in-node verdict**: if `counters.signature` equals the new signature, `count += 1`; otherwise `signature` = new, `count = 1` (the per-signature counter restarts at one, for bookkeeping only). Always `total += 1`. Written in the same write that records the verdict.
- **Not counted here:** blocked reports, deterministic/tool/step failures, and guard defects open problems directly and do not increment node counters (they have no verdict). A validator node's failing verdict increments no node counter; its returning edge counter is incremented when the edge is taken (below).
- **Edge scope** `edge:<from>-<to>`: `{signature: null, count: n, total: n}`; count only traversals of a declared returning edge (target earlier on the approved path). Checked before taking the route; at or above E the orchestrator stays and escalates instead of routing. Declared selection-only re-entry never accumulates.

### Progress (the only edge-counter reset)

Progress is a closed definition: (a) a scope item transitioning to passed (reference: a ticket's status becomes `passed`), or (b) a graph-declared monotonic progress field advancing (a node's `re_entry.progress_field`, reference: `current_ticket` moving to the next ticket). When either is recorded, remove every `edge:*` key from `fail_counters` in that same write. Nothing else resets edge counters: not advice, not a pass of an unrelated stage, not a human ruling (a retry ruling leaves them unchanged). A `ticket-invalid` return is no progress.

## The decision procedure

Let a failure event have a signature S and scope X. Update counters first (rules above), then:

**A. No problem is open for this node.**
- Failing in-node verdict: if `count >= F` (the signature recurred up to the cap) open a problem with `opened_by: "signature"`; else if `total >= T` open one with `opened_by: "total"`; else retry in place: re-dispatch the worker with the review evidence (and any advice that still applies). Do not open anything below the caps.
- Blocked report, deterministic/tool/step failure, or guard defect: open a problem immediately (`opened_by: "blocked"`).
- Edge-revisit cap about to be exceeded: open a problem (`opened_by: "edge-revisit"`).

Opening a problem: append to `advisor_consults` `{problem_key: "<scope>#<n>", scope, signature, opened_by, blocked_node: <current node>, inherited: 0, supersedes: null, count: 0, advice: [], status: "open"}` where `<n>` is one more than the number of earlier problems with that scope; set `blocked_at` to the current node; log an orchestrator line (`route`) saying the unit stays in place with the problem. The orchestrator then does not dispatch the worker again until advice is issued.

**B. A problem is already open for this node and a failure arrives (a retry after advice failed, or the stage blocked again).** The chain persists; it never drops back to the plain worker-retry loop:
- Same signature as the open problem, or the open problem was opened by the total cap: the problem stays open (a total-cap problem is never superseded, whatever the new signature). Counters keep counting (`total` too).
- Different signature on a problem not opened by the total cap: close it as superseded (`status: "superseded"`) and open a new one in the same write with `supersedes: <old key>`, `inherited: <old count>`, `count: <old count>`, empty `advice`, status `open`, `opened_by` of the new failure's kind, and the new signature. The orchestrator stays in place and continues at the tier the inherited count dictates.
- Also while a problem is open, a total reaching T opens nothing new.

**C. Choose the next tier for the open problem** (after A or B):
- Consultation count `< C` and the problem is not an edge-revisit problem: **consult the advisor**.
- Consultation count `>= C`: **stop in place for the human ruling**. Do not consult again and do not loop the worker.
- Edge-revisit problems: the advisor is consulted once to diagnose why the loop does not converge, then the orchestrator goes to the human ruling with the advice shown (there is nothing to retry in place at a validator, and a route is exactly what the cap blocks).

**D. Consult the advisor.** Dispatch the `advisor` agent (`dispatch.md`). Read the `advice-<n>.md` it wrote. Write: append to the problem's `advice` `{file: "<node>/advice-<n>.md", date, log_ref: <id of the log line in this same write>}`, `count += 1`, and an `advisor-consultation` log line (source `actor-report`, actor `advisor`, `source_ref` the advice file). Advice does not reset any counter. Then re-dispatch the stage with the advice as retry context: the worker for an LLM node; for a deterministic/tool node or a failed step, re-run only the failed step (steps are idempotent). Failure after advice goes back to B, so with the count below C you consult again, at C you stop for the human.

**E. A pass resolves.** When the stage later passes review (or the failed step finally succeeds), in the same write that records the pass: set the problem `status: "resolved"`, `blocked_at: null`, and remove the node- and concept-scoped counters of that scope (edge counters stay). A later failure on the same scope opens a new problem.

## Human ruling

When consultations are exhausted (or after the edge-revisit advice), the orchestrator stays at the node and puts the question to the human in the main session. It presents: the problem (signature, scope, node), the failure history (review reports), every advice file, and the three dispositions:

1. **retry here with guidance** (the human's guidance becomes retry context),
2. **move back** to a named earlier node on the unit's path,
3. **end** the work.

Never route anywhere while the ruling is pending. Record the ruling before acting on it: write `decision-<n>.md` in the stage directory (disposition, guidance or target or reason, the human's words), then one `write` with the `human_decisions` entry (`kind: "escalation"`, `decision: "retry" | "move-back" | "end"`, `target` for move-back, `file`), a `human-decision` log line (source `human-answer`, `source_ref` the decision file), the problem status (`escalated` for retry/move-back; `abandoned` for end), `blocked_at: null`, and the resets below.

- **Resets.** A ruling resets the node- and concept-scoped counters (remove their keys). Edge counters are untouched.
- **retry:** act in place: re-dispatch the worker (or re-run the failed step) with the guidance plus advice. For an edge-revisit problem, retry means permitting exactly one more traversal of that edge: take the route that the cap was holding, incrementing the edge counter beyond the cap (the counter itself stays until recorded progress resets it). The next arrival at the edge is again at or above the cap, so a new problem opens. If interrupted after the ruling, resume sees an `escalated` problem and a retry decision newer than the last `route` line: act on it.
- **move back / end:** an orchestrator override (see `node-execution.md`, "Overrides"). `move-back` target must already be in `walked_path`. `end` goes to the abandonment terminal: set outcome `ended` with the ruling as `outcome_reason`, and run the terminal procedure (handoff written by the orchestrator, force-removal of the worktree, archive).
- A proposed target that is not a walked node and not the abandonment terminal is refused; ask again.

A later failure on the same scope after a ruling opens a new problem (`<scope>#<n+1>`) with `inherited: 0`.

## Quick reference

| Situation | Action |
| -- | -- |
| In-node verdict fail, `count < F`, `total < T`, no open problem | Counter +1, re-dispatch worker in place |
| `count >= F` (same signature) or `total >= T` | Open problem (`signature` / `total`), advisor |
| Blocked report, step failure, guard defect | Open problem (`blocked`), advisor |
| Open problem, new failure, same signature or total-opened | Stay open, next tier |
| Open problem, new failure, different signature, not total-opened | Supersede, inherit count, next tier |
| Consultation count `< C` | Advisor, then retry stage with advice |
| Consultation count `>= C` | Human ruling in place |
| Validator fail via returning edge at or above E | Edge-revisit problem, advisor once, human ruling |
| Ticket passes / progress field advances | Remove all `edge:*` counters |
