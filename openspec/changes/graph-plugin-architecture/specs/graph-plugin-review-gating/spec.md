## ADDED Requirements

### Requirement: Universal implementor-reviewer-route loop
Every artifact-producing stage (Research, Spec, Ticket, Build, Wrap) SHALL run implementor, then reviewer, then route. The orchestrator SHALL NOT accept an implementor output as final without a reviewer verdict.

#### Scenario: Spec stage gating
- **WHEN** the Spec implementor reports ready-for-review
- **THEN** the orchestrator SHALL dispatch the reviewer before routing to Human Gate (spec)

### Requirement: Routing follows the graph edges
After the reviewer verdict, the orchestrator SHALL route by the node's outgoing edges in `graph-execution-model`. For Build, the reviewer pass is the graph's Review node and its edges apply. For other stages, a failing verdict SHALL re-dispatch the same stage with the review evidence, and the reviewer pass SHALL NOT add edges to the graph.

#### Scenario: Build fail routing
- **WHEN** the reviewer fails a Build result and the ticket's fail counter is below 2
- **THEN** the orchestrator SHALL route to Build with the review evidence

#### Scenario: Passing verdict
- **WHEN** the reviewer passes a stage
- **THEN** the orchestrator SHALL take the node's success edge

### Requirement: Retry cap and escalation
Each stage loop SHALL be capped: on the second failure of the same stage or ticket the orchestrator SHALL route to Human Escalation. A blocked report from any actor SHALL route to Human Escalation.

#### Scenario: Second failure
- **WHEN** the same ticket fails review a second time
- **THEN** the orchestrator SHALL route to Human Escalation and not dispatch again

### Requirement: Human gates are synchronous orchestrator stops
Human gates SHALL exist only at grading approval and spec approval. Each SHALL be a synchronous orchestrator stop that puts a question to the human in the main session and records the answer; it MUST NOT be an agent.

#### Scenario: Grading approval
- **WHEN** Research passes review and proposes a grading
- **THEN** the orchestrator SHALL stop, ask the human to approve or reject, and route by the answer

#### Scenario: No gate in the build loop
- **WHEN** Build or Review needs human input
- **THEN** the orchestrator SHALL route to Human Escalation and not open a gate

### Requirement: Human Escalation is an orchestrator stop
Human Escalation SHALL be handled by the orchestrator surfacing the blocked state or repeated failure with its evidence to the human and recording the decision (unblocked or cancel); it MUST NOT be an agent.

#### Scenario: Cancel
- **WHEN** the human cancels at Human Escalation
- **THEN** the orchestrator SHALL route to End and record the decision

### Requirement: Human decisions are recorded
Every human answer at a gate or at Human Escalation SHALL be recorded in `work-unit.json` by the orchestrator before routing.

#### Scenario: Recorded before routing
- **WHEN** the human rejects the spec
- **THEN** state SHALL contain the rejection and feedback before Research is dispatched
