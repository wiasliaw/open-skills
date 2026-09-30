## ADDED Requirements

### Requirement: Exactly four fixed actor roles
The plugin SHALL realize graph execution with exactly four LLM actor roles: the orchestrator, a generic implementor agent, a generic reviewer agent, and a generic advisor agent. No other LLM actor role SHALL exist for graph execution, and there SHALL be no per-node advisors. This requirement amends the earlier "exactly three roles" decision (D-005) to four.

#### Scenario: Actor inventory
- **WHEN** the plugin's graph-execution actors are enumerated
- **THEN** the result SHALL be one orchestrator skill, one implementor agent, one reviewer agent, and one advisor agent

### Requirement: Orchestrator owns the graph
The orchestrator SHALL be a skill run by the main session and SHALL be the successor of `harness-flow`. It SHALL read state, evaluate edge guards, dispatch actors, and record results. It MUST NOT produce stage deliverables itself.

#### Scenario: Edge evaluation
- **WHEN** an actor reports back for a node
- **THEN** the orchestrator SHALL record the result in state and evaluate the node's outgoing edge guards to select the next node

### Requirement: Generic implementor, reviewer, and advisor
The implementor agent, reviewer agent, and advisor agent SHALL be stage-agnostic. Neither definition SHALL name, embed, or specialize for any graph node.

#### Scenario: Agent definition content
- **WHEN** an agent definition is inspected
- **THEN** it SHALL contain no node-specific instructions, skills, or tool lists

### Requirement: Advisor is a read-only analysis actor
The advisor agent SHALL perform root-cause analysis on a blocked or repeatedly failing stage and return analysis plus concrete retry guidance in its report. Its dispatch payload SHALL contain the failure history, the review logs and verdicts, the blocked stage's node spec, and the relevant constraints. It MUST NOT edit deliverables and MUST NOT write `work-unit.json` or `.harness/`.

#### Scenario: Advisor dispatch
- **WHEN** the orchestrator dispatches the advisor for a blocked stage
- **THEN** the payload SHALL include the failure history, review logs and verdicts, that stage's node spec, and relevant constraints, and the advisor SHALL return analysis and retry guidance without writing any file

### Requirement: Node identity is dispatch data
A node's identity SHALL be data carried in the dispatch payload and MUST NOT be a dedicated agent definition. There SHALL be no per-node agents.

#### Scenario: New node behavior
- **WHEN** a node's behavior changes in its `graph-node-*` spec
- **THEN** the change SHALL take effect through the constructed dispatch without adding or editing an agent definition

### Requirement: Deterministic work is not an LLM actor
Ship-type deterministic work (merge the PR, deploy or release, close the issue, archive `work-unit.json`) SHALL run as commands or tools invoked by the orchestrator and MUST NOT be dispatched to an LLM actor.

#### Scenario: Ship execution
- **WHEN** execution reaches Ship
- **THEN** the orchestrator SHALL run the Ship steps as commands or tools with no implementor, reviewer, or advisor dispatch

### Requirement: init remains the pre-graph bootstrap
The existing `init` skill SHALL remain the pre-graph bootstrap, outside the graph and not an actor role. The orchestrator SHALL NOT absorb init behavior.

#### Scenario: Graph start
- **WHEN** a work unit is triggered in a repository
- **THEN** init SHALL already have produced its report before the graph runs, and the orchestrator SHALL only read it
