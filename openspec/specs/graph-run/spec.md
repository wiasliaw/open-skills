## Purpose

The operating phase: running the factory. An orchestrator takes a work unit through the graph; at each node the node's worker does the work and the node's reviewer accepts it; problems go to the advisor first and reach the human last. The plant is not limited to one orchestrator.

## Requirements

### Requirement: The orchestrator owns the run

The orchestrator SHALL be a skill run by the main session. It SHALL refuse to start a run against a graph definition that has not passed graph-build validation. It reads state, constructs each stage's dispatch from the graph definition, dispatches actors, records results, and routes by the node's edge guards. It SHALL be the only writer of the work unit's routing state and event log, and it MUST NOT produce stage deliverables itself.

#### Scenario: Actor reports back
- **WHEN** an actor reports a result for a node
- **THEN** the orchestrator SHALL record the routing-relevant result in state, append the log line, and evaluate the node's outgoing edge guards to select the next node

#### Scenario: Resume after interruption
- **WHEN** a run is interrupted and a new orchestrator session takes over
- **THEN** it SHALL resume from the work-unit folder alone — current node, counters, open escalations, and stage artifacts — with no dependency on the previous session's conversation

### Requirement: Generic actors, node identity as dispatch data

Graph execution SHALL use a fixed set of generic, stage-agnostic actor roles — worker (implementor), reviewer, and advisor — plus the orchestrator. Node identity is data in the dispatch payload: node id, stage instructions, declared mounts, prompt-carried restrictions, verification commands, and the stage directory the actor writes into. There SHALL be no per-node agent definitions.

#### Scenario: Dispatch construction
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the payload SHALL be derived from that node's declaration in the graph definition, and the agent definition SHALL contain nothing node-specific

### Requirement: Universal review gating

Every artifact-producing stage SHALL run worker, then reviewer, then route. The orchestrator SHALL NOT accept a worker's output as final without a reviewer verdict. The reviewer SHALL execute the declared verification commands itself, never relying on the worker's claims, and SHALL check the worker's restriction compliance, failing the review on a violation regardless of command results. Actors write their own reports into the stage directory; the orchestrator records only verdicts and file pointers.

#### Scenario: Worker claims success
- **WHEN** the worker reports its verification passed
- **THEN** the reviewer SHALL still execute every declared verification command itself before a verdict is recorded

#### Scenario: Restriction violation
- **WHEN** the reviewer finds a file changed that the worker's restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence, even if every verification command passed

### Requirement: Tiered escalation

Escalation SHALL happen in place — it is a fallback chain inside the current node, not routing: when a stage is blocked or reaches its declared failure cap with the same error recurring, the orchestrator stays at that node, records the problem, and dispatches the advisor — an analysis-only LLM actor that diagnoses root cause and writes concrete retry guidance into the stage directory as its only write. Advisor consultations on the same problem SHALL be capped at the graph's declared consultation cap; when it is exhausted the orchestrator SHALL stop in place for the human ruling: retry here with the guidance, move back to a named earlier node of the path, or end the work. Because every node carries this fallback chain, no advisor, blocked, or escalation edge SHALL exist in a graph definition. Both caps are declared at graph-build; the plugin's reference default is two for each. Advice does not reset failure counters; only a pass or a human ruling does.

#### Scenario: Failure cap reached
- **WHEN** the same stage or ticket fails up to its declared cap with the same error
- **THEN** the orchestrator SHALL stay at the node, record the problem, and consult the advisor, not dispatch the worker again until advice is issued

#### Scenario: Advisor cap reached
- **WHEN** the advisor has been consulted up to the declared consultation cap on the same problem and the stage still fails
- **THEN** the orchestrator SHALL wait at the node for the human ruling and SHALL NOT consult the advisor again

#### Scenario: Human ruling
- **WHEN** the human rules on an exhausted escalation
- **THEN** the orchestrator SHALL record the disposition — retry with guidance, move back to a named earlier node, or end — and only then act on it

### Requirement: Human approvals are in-place stops, never nodes

A node MAY declare a human approval: its output requires the human's sign-off before the orchestrator routes on it. An approval is a synchronous in-place stop — the orchestrator puts the question to the human in the main session at the current node and records the answer (decision record in that node's stage directory, state entry, log line) before taking any route; it MUST NOT be an agent and MUST NOT be a node. The answer approves the outcome, sends the work back to a named earlier node with feedback, or ends it; when in doubt the human sends it back. The phase approval SHALL be mandatory for every work unit — the approved phase's declared path is itself the thing being signed off, so no phase, however short its path, bypasses it.

#### Scenario: Approval answered
- **WHEN** the human answers an approval question
- **THEN** the orchestrator SHALL record the decision and its feedback in the current node's stage directory and state before dispatching any next node

#### Scenario: Not needed
- **WHEN** the phase approval judges the work not needed
- **THEN** the recorded disposition SHALL end the unit at the abandonment terminal

### Requirement: Deterministic nodes run in the orchestrator

Entry, terminal, and deterministic nodes (creating the work unit, delivery steps, archival) SHALL run as commands or tool calls invoked by the orchestrator, with no LLM actor dispatch. Likewise, in a graph that declares a decomposition stage, selection-only re-entry — picking the next pending ticket from an unchanged list, in declared order — SHALL be a deterministic routing step by the orchestrator, with no actor dispatch.

#### Scenario: Next ticket after a pass
- **WHEN** a ticket passes and pending tickets remain unchanged
- **THEN** the orchestrator SHALL select the next pending ticket in declared order during routing, dispatching no actor

#### Scenario: Delivery
- **WHEN** execution reaches a deterministic delivery node
- **THEN** the orchestrator SHALL run its steps as commands or tools and record the results, dispatching no worker, reviewer, or advisor

### Requirement: Restrictions are contractual

Per-stage permissions SHALL be contractual: written into the dispatch prompt (for example "MUST NOT write long-term memory"), checked by the reviewer, with violations recorded as failures. The plugin MUST NOT rely on per-node tool whitelists or per-node agent definitions for enforcement.

#### Scenario: Converge-stage exception
- **WHEN** the worker is dispatched for the designated converge node
- **THEN** its prompt SHALL permit the long-term memory writes that node owns and still forbid writing routing state

### Requirement: The plant runs more than one orchestrator

Multiple orchestrators MAY run concurrently in one project, each carrying its own work unit, isolated by the per-unit state folder. Writes to shared long-term memory SHALL be serialized at the merge moment: converge-stage delta entries travel with the work unit's own branch, so version control is the serialization point and conflicts surface through the graph's own integration-failure edge rather than corrupting memory in place.

#### Scenario: Two concurrent work units
- **WHEN** two orchestrators run two work units in the same project
- **THEN** each SHALL read and write only its own work-unit folder, and neither run SHALL corrupt the other's routing state

#### Scenario: Concurrent converge
- **WHEN** two work units both reach their converge stage with memory updates
- **THEN** the updates SHALL merge through version control, and a conflict SHALL surface as a failing integration outcome handled by the graph's edges, not as a lost update
