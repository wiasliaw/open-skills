## ADDED Requirements

### Requirement: Universal implementor-reviewer-route loop
Every artifact-producing stage (Research, Spec, Ticket, Build, Wrap) SHALL run implementor, then reviewer, then route. The orchestrator SHALL NOT accept an implementor output as final without a reviewer verdict.

#### Scenario: Spec stage gating
- **WHEN** the Spec implementor reports ready-for-review
- **THEN** the orchestrator SHALL dispatch the reviewer before routing to Human Gate (spec)

### Requirement: Reports land in the stage directory
Reviewer reports (`review-<n>.md`) and advisor advice (`advice-<n>.md`) SHALL be written by the reviewer and advisor into the stage directory of the stage they address (the Build stage's reviewer pass uses `review/`). `state.json` SHALL record only the verdict, routing data, and a folder-relative file pointer to the report or advice, and the orchestrator SHALL append the corresponding `log.ndjson` line.

#### Scenario: Verdict recorded with pointer
- **WHEN** the reviewer fails a Spec stage output
- **THEN** the report SHALL exist as `spec/review-<n>.md` and the `reviews` entry SHALL carry that path as its `file` pointer

#### Scenario: Advice recorded with pointer
- **WHEN** the advisor advises on a problem blocked at `spec`
- **THEN** the advice SHALL exist as `spec/advice-<n>.md` and the `advisor_consults` advice item SHALL carry that path as its `file` pointer

### Requirement: Routing follows the graph edges
After the reviewer verdict, the orchestrator SHALL route by the node's outgoing edges in `graph-execution-model`. For Build, the reviewer pass is the graph's Review node and its edges apply. For other stages, a failing verdict SHALL re-dispatch the same stage with the review evidence, and the reviewer pass SHALL NOT add edges to the graph.

#### Scenario: Build fail routing
- **WHEN** the reviewer fails a Build result and the ticket's fail counter is below 2
- **THEN** the orchestrator SHALL route to Build with the review evidence

#### Scenario: Passing verdict
- **WHEN** the reviewer passes a stage
- **THEN** the orchestrator SHALL take the node's success edge

### Requirement: Retry cap and Advisor escalation
Each stage loop SHALL be capped: on the second failure of the same stage or ticket (for Build, Review's fail count of 2 or more with the same error; for Research, Spec, Ticket, and Wrap, the second failure of the in-node review loop) the orchestrator SHALL record `blocked_at` and route to the Advisor. A blocked report from any actor SHALL likewise record `blocked_at` and route to the Advisor. The Advisor SHALL be consulted at most twice on the same problem: after the first consultation the orchestrator SHALL retry the `blocked_at` node with the advice, and after two consultations that both failed to resolve the problem the orchestrator SHALL route to Human Escalation.

#### Scenario: Second failure
- **WHEN** the same ticket fails review a second time
- **THEN** the orchestrator SHALL route to the Advisor and not dispatch the implementor again until advice is issued

#### Scenario: Non-Build in-node second failure
- **WHEN** the Spec stage's in-node reviewer fails the Spec implementor's output a second time
- **THEN** the orchestrator SHALL record `blocked_at` as Spec and route to the Advisor

#### Scenario: Advice issued
- **WHEN** the advisor returns guidance and consultations on this problem are fewer than 2
- **THEN** the orchestrator SHALL re-dispatch the `blocked_at` node with the guidance

#### Scenario: Two failed consultations
- **WHEN** the advisor has advised twice on the same problem and the stage still fails
- **THEN** the orchestrator SHALL route to Human Escalation

### Requirement: Human gates are synchronous orchestrator stops
Human gates SHALL exist only at grading approval and spec approval; the Advisor is an LLM actor and not a human gate. Each SHALL be a synchronous orchestrator stop that puts a question to the human in the main session and records the answer; it MUST NOT be an agent.

#### Scenario: Grading approval
- **WHEN** Research passes review and proposes a grading
- **THEN** the orchestrator SHALL stop, ask the human to approve or reject, and route by the answer

#### Scenario: No gate in the build loop
- **WHEN** Build or Review needs human input
- **THEN** the orchestrator SHALL route to the Advisor (and to Human Escalation only after two failed consultations) and not open a gate

### Requirement: Human Escalation is an orchestrator stop
Human Escalation SHALL be reached only from the Advisor after two failed consultations on the same problem. It SHALL be handled by the orchestrator surfacing the blocked state or repeated failure with its evidence and the advisor's consultation records to the human and recording the decision (unblocked or cancel); it MUST NOT be an agent. On unblocked the orchestrator SHALL resume at the `blocked_at` node.

#### Scenario: Unblocked
- **WHEN** the human unblocks at Human Escalation
- **THEN** the orchestrator SHALL record the decision and route to the node recorded in `blocked_at`

#### Scenario: Cancel
- **WHEN** the human cancels at Human Escalation
- **THEN** the orchestrator SHALL route to End and record the decision

### Requirement: Human decisions are recorded
Every human answer at a gate or at Human Escalation SHALL be recorded by the orchestrator before routing: a decision record in the gate's stage directory, a `human_decisions` entry in `state.json` pointing to it, and a log line.

#### Scenario: Recorded before routing
- **WHEN** the human rejects the spec
- **THEN** `human-gate-spec/decision-<n>.md` SHALL hold the rejection and feedback and `state.json` SHALL contain the rejection entry before Research is dispatched
