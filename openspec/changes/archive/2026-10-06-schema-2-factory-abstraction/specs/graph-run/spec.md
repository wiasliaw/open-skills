## MODIFIED Requirements

### Requirement: The orchestrator owns the run

The orchestrator SHALL be a skill run by the main session. It SHALL refuse to start a run against a graph definition that has not passed graph-build validation. At run start it SHALL invoke the memory script; a breached threshold is reported to the human — unless a maintenance unit is already live, in which case nothing is re-proposed — and on the human's confirmation the orchestrator creates the maintenance unit with trigger source `maintenance-due`, never silently. The `maintenance` phase value and the `maintenance-due` trigger bind both ways: the write gate SHALL reject recording the `maintenance` phase on a unit with any other trigger source, and a `maintenance-due` unit SHALL record no other phase. The orchestrator executes each node by walking its pipeline: it constructs each task's dispatch from the TaskDef (resolving `with` bindings), dispatches llm/validator/human executors or runs script tasks itself, verifies the task's exit (outcome plus required artifact) before acting on it, applies the `on` action (`next`, `goto` with its counter, surface, `escalate`, or — at a terminal — `done`), and when an outcome surfaces routes by the node's edge guards. During a run no work on the unit SHALL happen outside the current node's tasks, and routing SHALL happen only through a declared edge — with one bounded exception: a human ruling MAY move the unit as a recorded orchestrator override, whose target is restricted to a node already in the unit's walked history or the abandonment terminal. The orchestrator SHALL be the only writer of the work unit's routing state and event log, and it MUST NOT produce stage deliverables itself.

#### Scenario: Task exit routes the pipeline
- **WHEN** a task ends in a declared exit outcome with its required artifact present
- **THEN** the orchestrator SHALL record it and apply exactly the `on` action the pipeline entry declares for that outcome

#### Scenario: Exit without artifact not routed
- **WHEN** an llm, validator, or human task reports an outcome but its declared exit artifact is absent from the stage directory
- **THEN** the orchestrator SHALL NOT apply the `on` action, treating the exit as not having happened and engaging the fallback chain

#### Scenario: Zero guards match
- **WHEN** a surfaced outcome matches no declared guard at run time
- **THEN** the orchestrator SHALL treat it as a definition defect and stay in place as blocked, never improvising a route

#### Scenario: Resume after interruption
- **WHEN** a run is interrupted and a new orchestrator session takes over
- **THEN** it SHALL resume from the work-unit folder alone — current node, pipeline position, counters, open escalations, and stage artifacts — with no dependency on the previous session's conversation

### Requirement: Generic actors, task identity as dispatch data

Graph execution SHALL use a fixed set of generic, stage-agnostic actor roles — worker (implementor), reviewer, and advisor — plus the orchestrator. Task identity is data in the dispatch payload: node id and task id, the task's `instructions` verbatim, its declared equipment, its prompt-carried restrictions, its declared commands, the stage directory the actor writes into, and — whenever the unit has a worktree — its path, which is the working directory for every verification command any actor executes. There SHALL be no per-node or per-task agent definitions.

#### Scenario: Dispatch construction
- **WHEN** the orchestrator dispatches an actor for a task
- **THEN** the payload SHALL be derived from that TaskDef (with the node's bindings) in the graph definition, and the agent definition SHALL contain nothing task-specific

### Requirement: Universal review gating

Verification SHALL be a validator task placed after the producing task in the same pipeline (or standing alone in a validator-only node such as the whole-change review). A producing task's outcome reaches the edges only through the pipeline: the `on` map sends the work to its validator task (`next`), and the validator's `fail` maps to `goto:<the producing task>` — the declared form of retry-in-place — so the orchestrator SHALL NOT surface a node outcome whose pipeline declares an unvisited validator between the work and that outcome. The verdict comes from the validator task's declared runner. Default (`reviewer`): an independent reviewer dispatch executes the declared commands itself, never relying on the worker's claims, scores per the dimensions the task's `instructions` declare, and checks the worker's restriction compliance, failing the review on a violation regardless of command results. Declared `orchestrator`: the orchestrator executes the declared commands itself and derives the verdict deterministically from their exit statuses plus the mechanical checks the instructions declare (reference: the ticketed build's test-integrity comparison); a command that cannot run (exit 126 or 127, or an unresolvable program) is a defect engaging the fallback chain as blocked, never a failing verdict. Each `goto` traversal from a failing verdict increments the finest applicable failure counter (identical signature form for both runners: failing dimensions plus failing command) and is capped; at the cap the orchestrator stays in place and escalates instead of traversing. A standalone validator node surfaces its verdict as its node outcome — pass and fail route by its declared edges — and its failing verdict increments only the revisit counter of the returning edge it routes through, with cap checks run before the route is taken. Alternative outcomes a worker reports (such as `ticket-invalid` or `spec-contradiction`) surface only with their evidence artifact present, per the exit-artifact rule. Reviewer and advisor write their own reports into the stage directory; the worker's report reaches the folder as text the orchestrator transcribes verbatim into `report-<n>.md` (the execution harness blocks subagent report-file writes), and a reviewer or advisor whose report write is blocked falls back the same way. The orchestrator records verdicts and file pointers; command runs it executed itself are recorded as `step` lines in the event log, cited as evidence.

#### Scenario: Worker claims success
- **WHEN** the worker's task reports done
- **THEN** the pipeline's validator task SHALL still execute every declared command before any node outcome surfaces

#### Scenario: Restriction violation
- **WHEN** the verification finds a file changed that the worker's restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence, even if every command passed

#### Scenario: Goto at the cap escalates
- **WHEN** a validator task's `fail` would traverse its `goto` while the scope's counter is at the declared cap
- **THEN** the orchestrator SHALL stay in place and engage the fallback chain instead of re-dispatching the producing task

#### Scenario: Verification command cannot run
- **WHEN** an orchestrator-run validator command exits 126 or 127
- **THEN** the orchestrator SHALL treat it as a defect (blocked class), not as a red or failing-verdict result

### Requirement: Human approvals are in-place stops, as human tasks

A human task in a pipeline puts its `instructions` to the human in the main session at the current node and SHALL record the answer (decision artifact in the stage directory, state entry, log line) before any `on` action is applied; it MUST NOT be an agent and MUST NOT be a node. Its declared outcomes map through `on` like any task's: approval typically surfaces the node outcome, send-back is `goto:<the authoring task>` (the default disposition whenever approval is not explicitly granted), and `not-needed` MAY surface and route to the abandonment terminal by a declared edge. The phase approval SHALL be mandatory for every work unit and SHALL sit in the pipeline of the shared first node (reached unconditionally from the entry node); its decision records the phase in the core state — and once recorded the phase is immutable: a send-back re-reviews a proposal for the same unit, and changing the phase means ending this unit and opening a new one. Phase values come only from the instantiated `phase` type's vocabulary, never invented at run time.

#### Scenario: Approval answered
- **WHEN** the human answers a human task
- **THEN** the orchestrator SHALL record the decision artifact, state entry, and log line before applying the `on` action

#### Scenario: Phase cannot change
- **WHEN** a send-back re-approval attempts to record a different phase for the same unit
- **THEN** the write SHALL be rejected — the unit ends and a new one opens if the phase was wrong

#### Scenario: Maintenance binding enforced
- **WHEN** an approval would record the `maintenance` phase on a unit whose trigger source is not `maintenance-due`
- **THEN** the write gate SHALL reject it, and the reverse likewise

#### Scenario: Not needed
- **WHEN** a human task ends in `not-needed`
- **THEN** the surfaced outcome SHALL route to the abandonment terminal through its declared edge, and the terminal's script tasks SHALL run

### Requirement: Script tasks run in the orchestrator

Execution maps to executors as follows: script tasks run as commands invoked by the orchestrator, with no LLM actor dispatch, their exit derived from exit statuses (`ok` when every command exits zero, the declared outcome when the failing command's run line maps that status, otherwise `failed`); llm tasks dispatch the worker; validator tasks dispatch the reviewer or run in the orchestrator per their runner; human tasks are synchronous in-place stops. Terminal nodes run their script-only pipelines (success: handoff copy, archival; abandonment: forced worktree removal — permitted since the work is being abandoned — handoff check, archival), so an abandoned unit leaves no residue. Delivery after a passed close-out — commit, push, open the delivery channel, remove the worktree — runs as script tasks at the tail of the close-out node's pipeline. A failing script task engages the fallback chain with command plus exit status as its signature (or follows its declared `on` mapping to `escalate`), any recorded verdicts staying valid, and the retry re-runs only that task — which is why script tasks SHALL be idempotent. Selection-only re-entry is driven by declaration: a node MAY declare a re-entry rule (list field, order, progress field), and where one is declared the orchestrator performs the selection as a deterministic routing step with no actor dispatch, appending the node to the walked history; the advanced progress field is what makes such re-entry count as progress for the revisit counters.

#### Scenario: Next ticket after a pass
- **WHEN** a ticket passes and pending tickets remain
- **THEN** the orchestrator SHALL select the next pending ticket in declared order during routing, dispatching no actor

#### Scenario: Delivery as pipeline tail
- **WHEN** the close-out validator task passes
- **THEN** the orchestrator SHALL run the remaining script tasks of the pipeline (commit, push, delivery channel, worktree removal) as commands, record each as a `step` line, and dispatch no worker, reviewer, or advisor for them

#### Scenario: Abandoned unit leaves no residue
- **WHEN** a unit ends at the abandonment terminal with a live worktree and unmerged draft deltas
- **THEN** the terminal's script tasks SHALL remove the worktree and archive the folder, the handoff naming the unmerged drafts preserved in place

### Requirement: The ticketed build loop is deterministic and sequential

A unit SHALL use exactly one worktree for its whole life: tickets execute sequentially in it, in the decomposition's declared order, and no per-ticket worktree or branch merge between tickets exists. Each ticket SHALL declare its test as stage artifacts with repo-relative target paths: the decomposition stage directory holds each ticket's test files under `tests/<ticket-id>/`, laid out at their repo-relative target paths, so the directory tree is the declaration. The red check SHALL be script tasks in the build pipeline, executed by the orchestrator before the implement task: land the ticket's declared test files in the worktree at their declared paths (`land-tests`), commit them on the unit's branch, and run the ticket's verification command expecting failure (`expect-red`) — a run that exits zero releases `ticket-invalid` deterministically with no worker dispatched (`expect-red` reports already-green with a dedicated exit status, which the red-check run line maps to `ticket-invalid`), an exit of 126 or 127 is a defect, not red, and each run is recorded as a `step` log line. Before a green verdict the orchestrator-run validator task SHALL compare the worktree's test files against the committed red-run versions — a difference is a failing verdict on the test-integrity dimension — and SHALL run the full declared suite in addition to the ticket's command, so a regression in an earlier ticket surfaces at the ticket that introduced it. The write that records a passing green verdict SHALL set the current ticket's status to `passed` in the same write (re-entry bookkeeping on the rule's `items_field`, authorized without a producing task per `work-unit-state`) — including when the pass follows earlier failures on that ticket — and the orchestrator SHALL refuse to enter the whole-change review node while any ticket's status is not `passed`, treating it as a state defect to repair, not route past.

#### Scenario: Red lands before the worker
- **WHEN** a ticket is selected for build
- **THEN** the pipeline's red-check script tasks SHALL land and commit the ticket's declared tests and record the failing run before the implement task is dispatched, so red is the orchestrator's own observation, not the worker's claim

#### Scenario: Already-green ticket short-circuits
- **WHEN** the expect-red run of a freshly landed ticket test exits zero
- **THEN** the pipeline SHALL surface `ticket-invalid` without dispatching a worker, and the outcome routes back to the decomposition node as declared

#### Scenario: Weakened test caught
- **WHEN** the worktree's test files at green time differ from the committed red-run versions
- **THEN** the verdict SHALL be fail on the test-integrity dimension with the differing files named, regardless of the commands' exit statuses

#### Scenario: Retry pass flips the ticket
- **WHEN** a ticket that failed earlier verification passes on a retry
- **THEN** the write recording the pass SHALL set that ticket's status to `passed`, and a unit SHALL never reach the review node or a terminal with a shipped change and a ticket left `failed`

### Requirement: Tiered escalation

Escalation SHALL happen in place — it is a fallback chain inside the current node, not routing; the `escalate` action of a pipeline entry is its declared entry point for failures with no `goto` target. "The same error" SHALL be judged by failure signature: for verified work, the set of failing dimensions plus the failing verification command from the verdict; for script tasks, the failing command plus its exit status; for a blocked report, the blocked reason code plus the node (a script failure contributes its stable error code). A failing verdict increments exactly one counter: the finest applicable scope — `<node>.<task>:<item-id>` where the node's re-entry concept applies, otherwise `<node>.<task>`. Supersession happens only while a problem is already open: a failure with a different signature then closes it as superseded by a new problem that inherits its consultation count and stays inside the escalation chain — the orchestrator remains in place and continues with the advisor or the human per the inherited count, never dropping back to the plain retry loop; the per-signature counter restarts at one for bookkeeping only. A problem opened by the total failure cap SHALL NOT be superseded at all, and the signature-independent total failure cap keeps counting across signatures, so alternating signatures can evade neither escalation nor the human tier. Routable-outcome loops are capped by progress, not signature: each traversal of a declared edge returning to a node earlier in the walked history increments an `edge:<from>-<to>` counter (a core scope kind) that resets only on recorded progress — a closed definition: a scope item transitioning to passed, or a graph-declared monotonic progress field advancing, nothing else — and engages this chain at the graph's declared edge-revisit cap; the deterministic selection-only re-entry of a decomposition node follows recorded progress by definition and therefore never accumulates. A problem opened by an edge-revisit cap takes a shortened advisor tier: the advisor is consulted at most once — a single diagnostic consultation on why the loop does not converge — and the orchestrator then stops in place for the human ruling; advice cannot permit a traversal of the capped edge, only the human ruling's retry disposition can. A problem opens when a stage is blocked or its counter reaches the graph's declared cap with the signature recurring, and closes when the stage passes (resolved) or a human ruling disposes of it (escalated or abandoned); a later failure on the same scope opens a new problem. When a problem opens or persists, the orchestrator stays at that node, records it, and dispatches the advisor — an analysis-only LLM actor that diagnoses root cause and writes concrete retry guidance into the stage directory as its only write. Advisor consultations on the same problem SHALL be capped at the graph's declared consultation cap; when it is exhausted the orchestrator SHALL stop in place for the human ruling: retry here with the guidance, move back to a named node of the walked history, or end the work. Because every node carries this fallback chain, no advisor, blocked, or escalation edge SHALL exist in a graph definition. Both caps are declared at graph-build; the plugin's reference default is two for each. Advice does not reset failure counters; a pass or a human ruling resets the node- and concept-scoped ones, while edge revisit counters reset only on recorded progress, which resets every `edge:<from>-<to>` counter of the unit in the same write that records it — a retry ruling leaves them unchanged.

#### Scenario: Failure cap reached
- **WHEN** the same task scope fails up to its declared cap with the same failure signature
- **THEN** the orchestrator SHALL stay at the node, record the problem, and consult the advisor, not dispatch the worker again until advice is issued

#### Scenario: Supersession inherits the chain
- **WHEN** a different failure signature closes an open problem as superseded
- **THEN** the new problem SHALL carry the inherited consultation count and the orchestrator SHALL continue at the advisor or human tier accordingly, not restart the retry loop

#### Scenario: Total cap cannot be superseded
- **WHEN** a problem opened by the signature-independent total failure cap sees a new failure signature
- **THEN** the problem SHALL remain open and un-superseded, and the chain SHALL proceed to its next tier

#### Scenario: Advisor cap reached
- **WHEN** the advisor has been consulted up to the declared consultation cap on the same problem and the stage still fails
- **THEN** the orchestrator SHALL wait at the node for the human ruling and SHALL NOT consult the advisor again

#### Scenario: Edge-revisit problem reaches the human after one consultation
- **WHEN** a problem opened by an edge revisit counter persists after one advisor consultation
- **THEN** the orchestrator SHALL stop in place for the human ruling, SHALL NOT consult the advisor again on that problem, and SHALL NOT take the capped route on advice alone

#### Scenario: Progress resets every edge counter
- **WHEN** recorded progress occurs — a scope item transitions to passed, or a graph-declared monotonic progress field advances
- **THEN** the write that records the progress SHALL reset every `edge:<from>-<to>` counter of the unit, and no other event SHALL reset any of them

#### Scenario: Human ruling
- **WHEN** the human rules on an exhausted escalation
- **THEN** the orchestrator SHALL record the disposition — retry with guidance, move back, or end — and only then act on it

#### Scenario: Ruling jumps are bounded overrides
- **WHEN** a ruling moves the unit somewhere other than a declared edge's target
- **THEN** the move SHALL be a recorded orchestrator override whose target is a node already in the unit's walked history or the abandonment terminal, and nothing else

### Requirement: Restrictions are contractual

Per-task permissions SHALL be contractual: each task's declared restrictions are written into its dispatch prompt (for example "MUST NOT write long-term memory"), checked by the verification, with violations recorded as failures. The plugin MUST NOT rely on per-task tool whitelists or per-task agent definitions for enforcement.

#### Scenario: Close-out exception
- **WHEN** the worker is dispatched for the task mounting the close-out skill
- **THEN** its prompt SHALL permit the long-term memory writes that task owns and still forbid writing routing state
