## Purpose

The design axis of open-skills: a claude-plugin built on graph engineering, where nodes define what is done and edges define the data flow — operated in two phases, graph-build (build the factory) and graph-run (run the factory), over freely composable standalone skills.

## Requirements

### Requirement: Nodes define work, edges define data flow

The plugin's execution model SHALL be a graph in which each node defines what is to be done and how it is verified, and each edge defines the data flow: the condition over state that selects the next stage. No work SHALL happen outside a node, and no routing SHALL happen outside an edge.

#### Scenario: New stage added
- **WHEN** the execution model gains a new kind of work
- **THEN** it SHALL be added as a node with its own verification, and its routing SHALL be added as guarded edges, not as ad hoc control flow

### Requirement: graph-build constructs the factory

Building the graph SHALL be a distinct phase, performed before any run (the init tier): it defines what every node does and how it is verified, defines the edges that route to the next stage, and declares the capabilities each node uses — skills, commands, and MCP servers — as mounts written into the graph definition. A capability not declared at build time SHALL NOT be available to a node at run time.

#### Scenario: Node mounts declared at build time
- **WHEN** a node needs a skill, command, or MCP server during a run
- **THEN** that mount SHALL already be named in the node's definition from graph-build, and the dispatch SHALL carry only declared mounts

#### Scenario: Verification defined with the node
- **WHEN** graph-build defines a node
- **THEN** the node's verification criteria SHALL be defined with it, before any run executes the node

### Requirement: graph-run operates the factory

Running the graph SHALL be the operating phase: an orchestrator takes a work unit into the factory and walks it along the edges. At each node the orchestrator SHALL call that node's worker to do the work and that node's reviewer to accept it. A problem SHALL be taken to the advisor first; only a problem the advisor cannot resolve SHALL reach the human.

#### Scenario: Node executed
- **WHEN** the orchestrator enters a node with a work unit
- **THEN** the worker SHALL produce the node's output, the reviewer SHALL verify it, and the orchestrator SHALL route by the node's edges on the verdict

#### Scenario: Escalation order
- **WHEN** a node is blocked or repeatedly failing
- **THEN** the advisor SHALL be consulted before the human, and the human SHALL be reached only after the advisor is exhausted

### Requirement: The factory is not limited to one orchestrator

The plant SHALL support more than one orchestrator running at the same time, each carrying its own work unit. Work-unit state SHALL be isolated per unit (one folder per work unit) so that concurrent orchestrators do not contend on each other's routing state.

#### Scenario: Two concurrent work units
- **WHEN** two orchestrators run two work units in the same project
- **THEN** each SHALL read and write only its own work-unit folder, and neither run SHALL corrupt the other's state

### Requirement: Standalone skills compose freely

The plugin SHALL be three things at once: graph-build, graph-run, and a set of independent skills. Every skill shipped by the plugin SHALL remain usable on its own, outside any graph; mounting a skill on a node MUST NOT be the only way to use it.

#### Scenario: Skill used without the graph
- **WHEN** a user invokes a shipped skill directly in a session with no graph running
- **THEN** the skill SHALL work with no dependency on graph state, the orchestrator, or a work-unit folder
