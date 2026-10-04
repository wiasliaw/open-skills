## Purpose

The operating phase: running the factory. An orchestrator takes a work unit through the graph; at each node the node's worker does the work and the node's reviewer accepts it; problems go to the advisor first and reach the human last. The plant is not limited to one orchestrator.
## Requirements
### Requirement: The orchestrator owns the run

The orchestrator SHALL be a skill run by the main session. It SHALL refuse to start a run against a graph definition that has not passed graph-build validation. At run start it SHALL invoke the memory script; a breached threshold is reported to the human — unless a maintenance unit is already live, in which case nothing is re-proposed — and on the human's confirmation the orchestrator creates the maintenance unit with trigger source `maintenance-due`, never silently. The `maintenance` phase and the `maintenance-due` trigger bind both ways: the write gate SHALL reject recording the `maintenance` phase on a unit with any other trigger source, and a `maintenance-due` unit SHALL record no other phase. It reads state, constructs each stage's dispatch from the graph definition, dispatches actors, records results, and routes by the node's edge guards. It SHALL be the only writer of the work unit's routing state and event log, and it MUST NOT produce stage deliverables itself.

#### Scenario: Actor reports back
- **WHEN** an actor reports a result for a node
- **THEN** the orchestrator SHALL record the routing-relevant result in state, append the log line, and evaluate the node's outgoing edge guards to select the next node

#### Scenario: Zero guards match
- **WHEN** a reported routable outcome matches no declared guard at run time
- **THEN** the orchestrator SHALL treat it as a definition defect and stay in place as blocked, never improvising a route

#### Scenario: Route checked against the path
- **WHEN** a guard selects a target that is neither the next node on the approved phase's path nor an earlier path node reached by a declared returning edge
- **THEN** the orchestrator SHALL treat it as a definition defect, stay in place as blocked, and NOT dispatch the target

#### Scenario: Resume after interruption
- **WHEN** a run is interrupted and a new orchestrator session takes over
- **THEN** it SHALL resume from the work-unit folder alone — current node, counters, open escalations, and stage artifacts — with no dependency on the previous session's conversation

### Requirement: Generic actors, node identity as dispatch data

Graph execution SHALL use a fixed set of generic, stage-agnostic actor roles — worker (implementor), reviewer, and advisor — plus the orchestrator. Node identity is data in the dispatch payload: node id, stage instructions, declared mounts, prompt-carried restrictions, verification commands, the stage directory the actor writes into, and — whenever the unit has a worktree — its path, which is the working directory for every verification command any actor executes, so verification always runs against the unit's code, never the main checkout. There SHALL be no per-node agent definitions.

#### Scenario: Dispatch construction
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the payload SHALL be derived from that node's declaration in the graph definition, and the agent definition SHALL contain nothing node-specific

### Requirement: Universal review gating

Every artifact-producing stage SHALL run worker, then reviewer, then route. The orchestrator SHALL NOT accept a worker's output as final without a reviewer verdict. In the in-node review of an artifact-producing stage, a failing verdict is not a routable outcome: below the failure cap the orchestrator re-dispatches the worker in place with the review evidence, and only a pass releases a routable outcome for the edges. A standalone validator node is different: it has no worker, so its verdict is its routable outcome — pass and fail route by its declared edges (typically fail returns to the repairing node). Its failing verdict increments only the revisit counter of the returning edge it routes through (never a node counter on top), and cap checks run before the route is taken: at the cap the orchestrator stays in place and escalates instead of routing. A deterministic or tool-call node's command failure is not retried automatically: it engages the fallback chain directly, with the command and exit status as its signature. The reviewer SHALL execute the declared verification commands itself, never relying on the worker's claims, score per the dimensions the node's verification criteria declare, and SHALL check the worker's restriction compliance, failing the review on a violation regardless of command results. Any routable outcome the worker reports — the ordinary completion or an alternative such as `ticket-invalid` or `spec-contradiction` — passes through the reviewer, which verifies the outcome's basis (for an alternative outcome, the evidence that justifies it) before the orchestrator routes on it. Actors write their own reports into the stage directory; the orchestrator records only verdicts and file pointers.

#### Scenario: Worker claims success
- **WHEN** the worker reports its verification passed
- **THEN** the reviewer SHALL still execute every declared verification command itself before a verdict is recorded

#### Scenario: Restriction violation
- **WHEN** the reviewer finds a file changed that the worker's restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence, even if every verification command passed

### Requirement: Tiered escalation

Escalation SHALL happen in place — it is a fallback chain inside the current node, not routing. "The same error" SHALL be judged by failure signature: for reviewed stages, the set of failing dimensions plus the failing verification command from the reviewer's verdict; for deterministic and tool-call nodes, the failing command plus its exit status; for a blocked report, the blocked reason code plus the node (a script failure contributes its stable error code). A failing verdict increments exactly one counter: the finest applicable scope (a graph-declared scope such as `ticket:<id>` when its concept applies, otherwise `node:<id>`). Supersession happens only while a problem is already open: a failure with a different signature then closes it as superseded by a new problem that inherits its consultation count and stays inside the escalation chain — the orchestrator remains in place and continues with the advisor or the human per the inherited count, never dropping back to the plain worker-retry loop; the per-signature counter restarts at one for bookkeeping only. A problem opened by the total failure cap SHALL NOT be superseded at all, and the signature-independent total failure cap keeps counting across signatures, so alternating signatures can evade neither escalation nor the human tier. Routable-outcome loops are capped by progress, not signature: each traversal of a declared edge returning to an earlier path node increments an `edge:<from>-<to>` counter (a core scope kind) that resets only on recorded progress — a closed definition: a scope item transitioning to passed, or a graph-declared monotonic progress field advancing, nothing else — and engages this chain at the graph's declared edge-revisit cap; the deterministic selection-only re-entry of a decomposition stage follows recorded progress by definition and therefore never accumulates. A problem opened by an edge-revisit cap takes a shortened advisor tier: the advisor is consulted at most once — a single diagnostic consultation on why the loop does not converge — and the orchestrator then stops in place for the human ruling; advice cannot permit a traversal of the capped edge, only the human ruling's retry disposition can. A problem opens when a stage is blocked or its counter reaches the graph's declared cap with the signature recurring, and closes when the stage passes (resolved) or a human ruling disposes of it (escalated or abandoned); a later failure on the same scope opens a new problem. When a problem opens or persists, the orchestrator stays at that node, records it, and dispatches the advisor — an analysis-only LLM actor that diagnoses root cause and writes concrete retry guidance into the stage directory as its only write. Advisor consultations on the same problem SHALL be capped at the graph's declared consultation cap; when it is exhausted the orchestrator SHALL stop in place for the human ruling: retry here with the guidance, move back to a named earlier node of the path, or end the work. Because every node carries this fallback chain, no advisor, blocked, or escalation edge SHALL exist in a graph definition. Both caps are declared at graph-build; the plugin's reference default is two for each. Advice does not reset failure counters; a pass or a human ruling resets the node- and concept-scoped ones, while edge revisit counters reset only on recorded progress, which resets every `edge:<from>-<to>` counter of the unit in the same write that records it — a retry ruling leaves them unchanged.

#### Scenario: Failure cap reached
- **WHEN** the same stage or ticket fails up to its declared cap with the same failure signature
- **THEN** the orchestrator SHALL stay at the node, record the problem, and consult the advisor, not dispatch the worker again until advice is issued

#### Scenario: Supersession inherits the chain
- **WHEN** a different failure signature closes an open problem as superseded
- **THEN** the new problem SHALL carry the inherited consultation count and the orchestrator SHALL continue at the advisor or human tier accordingly, not restart the worker-retry loop

#### Scenario: Total cap cannot be superseded
- **WHEN** a problem opened by the signature-independent total failure cap sees a new failure signature
- **THEN** the problem SHALL remain open and un-superseded, and the chain SHALL proceed to its next tier

#### Scenario: Failure after advice
- **WHEN** the worker fails again after advice while the counter is at or above its cap
- **THEN** the orchestrator SHALL take the next tier — a further consultation while the consultation cap allows, otherwise the human ruling — and SHALL NOT loop the worker

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

#### Scenario: Ruling on an edge-revisit cap
- **WHEN** the human rules on a problem opened by an edge revisit counter
- **THEN** retry means permitting one more traversal of that edge, and the other dispositions remain move back or end — the counter itself stays until recorded progress resets it

#### Scenario: Ruling jumps are bounded overrides
- **WHEN** a ruling or an approval answer moves the unit somewhere other than a declared edge's target
- **THEN** the move SHALL be a recorded orchestrator override whose target is a node already walked on the unit's path or the abandonment terminal, and nothing else

### Requirement: Human approvals are in-place stops, never nodes

A node MAY declare a human approval: its output requires the human's sign-off before the orchestrator routes on it. An approval is a synchronous in-place stop — the orchestrator puts the question to the human in the main session at the current node and records the answer (decision record in that node's stage directory, state entry, log line) before taking any route; it MUST NOT be an agent and MUST NOT be a node. The answer approves the outcome, sends the work back with feedback — to a named earlier node, or, at the shared first node where nothing precedes it, re-dispatching the same node with the feedback — or ends it; send-back is the default disposition whenever approval is not explicitly granted. The phase approval SHALL be mandatory for every work unit and SHALL sit at the shared first node of all declared paths (reached unconditionally from the entry node), which carries a human approval whose answer records the phase in the core state — and once recorded the phase is immutable: a send-back to the first node re-reviews a proposal for the same unit, and changing the phase means ending this unit and opening a new one, so materialized fields and walked history never have to be unwound; phases come only from the definition's declared vocabulary, never invented at run time. The approved phase's declared path is itself the thing being signed off, so no phase, however short its path, bypasses it.

#### Scenario: Approval answered
- **WHEN** the human answers an approval question
- **THEN** the orchestrator SHALL record the decision and its feedback in the current node's stage directory and state before dispatching any next node

#### Scenario: Phase cannot change
- **WHEN** a send-back re-approval attempts to record a different phase for the same unit
- **THEN** the write SHALL be rejected — the unit ends and a new one opens if the phase was wrong

#### Scenario: Maintenance binding enforced
- **WHEN** an approval would record the `maintenance` phase on a unit whose trigger source is not `maintenance-due`
- **THEN** the write gate SHALL reject it, and the reverse likewise

#### Scenario: Not needed
- **WHEN** the phase approval judges the work not needed
- **THEN** the recorded disposition SHALL end the unit at the abandonment terminal

### Requirement: Deterministic nodes run in the orchestrator

Node types SHALL map to execution as follows: entry, terminal, and deterministic nodes run as commands invoked by the orchestrator, with no LLM actor dispatch; tool-call nodes run as orchestrator tool invocations; validator nodes dispatch the reviewer only (no worker); LLM nodes run worker then reviewer. Terminals carry no verification, no outcomes, and no edges. The delivery steps after a passed close-out — committing, pushing, opening the delivery channel, removing the worktree — run as the close-out node's post-steps, and the abandonment terminal's deterministic steps SHALL likewise remove any live worktree — forced removal is permitted there, since the work is being abandoned and the unit folder already holds the drafts and records — and write the handoff before archival, so an abandoned unit leaves no residue. A failing pre-step, post-step, or terminal step is treated as that node's deterministic failure: command plus exit status as the signature, the in-place fallback chain engaged, any recorded reviewer pass staying valid, and the retry re-running only the failed step — which is why steps SHALL be idempotent. Likewise, selection-only re-entry is driven by declaration, not convention: a node MAY declare a re-entry rule (the list field selected from, the order, and the progress field it advances), and where one is declared the orchestrator performs the selection as a deterministic routing step with no actor dispatch, appending the node to the walked history; the advanced progress field is what makes such re-entry count as progress for the revisit counters.

#### Scenario: Next ticket after a pass
- **WHEN** a ticket passes and pending tickets remain unchanged
- **THEN** the orchestrator SHALL select the next pending ticket in declared order during routing, dispatching no actor

#### Scenario: Delivery as post-steps
- **WHEN** close-out passes review
- **THEN** the orchestrator SHALL run the close-out node's declared post-steps as commands, record each result, and dispatch no worker, reviewer, or advisor for them

#### Scenario: Abandoned unit leaves no residue
- **WHEN** a unit ends at the abandonment terminal with a live worktree and unmerged draft deltas
- **THEN** the orchestrator SHALL remove the worktree, write the handoff naming the unmerged drafts, and archive the folder with the drafts preserved in place

### Requirement: Restrictions are contractual

Per-stage permissions SHALL be contractual: written into the dispatch prompt (for example "MUST NOT write long-term memory"), checked by the reviewer, with violations recorded as failures. The plugin MUST NOT rely on per-node tool whitelists or per-node agent definitions for enforcement.

#### Scenario: Close-out exception
- **WHEN** the worker is dispatched for the node mounting the close-out skill
- **THEN** its prompt SHALL permit the long-term memory writes that node owns and still forbid writing routing state

### Requirement: The plant runs more than one orchestrator

Multiple orchestrators MAY run concurrently in one project, each carrying its own work unit, isolated by the per-unit state folder. Writes to shared long-term memory SHALL be serialized at the merge moment: close-out delta entries travel with the work unit's own branch, so version control is the serialization point, and a conflict surfaces as a new fix unit (a `ci-failure` trigger or the human's prompt) rather than corrupting memory in place.

#### Scenario: Two concurrent work units
- **WHEN** two orchestrators run two work units in the same project
- **THEN** each SHALL read and write only its own work-unit folder, and neither run SHALL corrupt the other's routing state

#### Scenario: Concurrent close-out
- **WHEN** two work units both reach their close-out stage with memory updates
- **THEN** the updates SHALL merge through version control, and a conflict SHALL surface as a new fix unit through its own trigger, not as a lost update or a reopened unit

