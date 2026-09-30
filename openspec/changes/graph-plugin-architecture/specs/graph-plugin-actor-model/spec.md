## ADDED Requirements

### Requirement: Exactly three fixed actor roles
The plugin SHALL realize graph execution with exactly three LLM actor roles: the orchestrator, a generic implementor agent, and a generic reviewer agent. No other LLM actor role SHALL exist for graph execution.

#### Scenario: Actor inventory
- **WHEN** the plugin's graph-execution actors are enumerated
- **THEN** the result SHALL be one orchestrator skill, one implementor agent, and one reviewer agent

### Requirement: Orchestrator owns the graph
The orchestrator SHALL be a skill run by the main session and SHALL be the successor of `harness-flow`. It SHALL read state, evaluate edge guards, dispatch actors, and record results. It MUST NOT produce stage deliverables itself.

#### Scenario: Edge evaluation
- **WHEN** an actor reports back for a node
- **THEN** the orchestrator SHALL record the result in state and evaluate the node's outgoing edge guards to select the next node

### Requirement: Generic implementor and reviewer
The implementor agent and reviewer agent SHALL be stage-agnostic. Neither definition SHALL name, embed, or specialize for any graph node.

#### Scenario: Agent definition content
- **WHEN** an agent definition is inspected
- **THEN** it SHALL contain no node-specific instructions, skills, or tool lists

### Requirement: Node identity is dispatch data
A node's identity SHALL be data carried in the dispatch payload and MUST NOT be a dedicated agent definition. There SHALL be no per-node agents.

#### Scenario: New node behavior
- **WHEN** a node's behavior changes in its `graph-node-*` spec
- **THEN** the change SHALL take effect through the constructed dispatch without adding or editing an agent definition

### Requirement: Deterministic work is not an LLM actor
Ship-type deterministic work (merge the PR, deploy or release, close the issue, archive `work-unit.json`) SHALL run as commands or tools invoked by the orchestrator and MUST NOT be dispatched to an LLM actor.

#### Scenario: Ship execution
- **WHEN** execution reaches Ship
- **THEN** the orchestrator SHALL run the Ship steps as commands or tools with no implementor or reviewer dispatch

### Requirement: init remains the pre-graph bootstrap
The existing `init` skill SHALL remain the pre-graph bootstrap, outside the graph and not an actor role. The orchestrator SHALL NOT absorb init behavior.

#### Scenario: Graph start
- **WHEN** a work unit is triggered in a repository
- **THEN** init SHALL already have produced its report before the graph runs, and the orchestrator SHALL only read it
