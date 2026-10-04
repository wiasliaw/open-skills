## Purpose

The design axis of open-skills: graph engineering, where a node defines what is done and how it is verified, an edge defines the data flow, and the whole system operates in two phases — graph-build (build the factory) and graph-run (run the factory). This spec fixes the vocabulary and the structural invariants every graph must satisfy; it fixes no concrete topology.

## Requirements

### Requirement: Graph vocabulary

The system SHALL use these definitions: a node is a unit of work typed as entry, LLM call, deterministic function, tool call, validator, or terminal, and defines both what is to be done and how it is verified; an edge is data flow, a condition function that reads state and decides what runs next; state is the work-unit folder, shared across the whole graph; a skill is a capability mounted on a node and is never a node. Human interaction is never a node: approvals and escalations happen in place at the current node.

#### Scenario: Skills are not nodes
- **WHEN** a capability such as research, review, or worktree handling is attached to a step
- **THEN** it SHALL be specified as a skill mounted on that node and not as a separate node

#### Scenario: Node carries its verification
- **WHEN** a node is defined
- **THEN** its verification criteria SHALL be part of the node definition, not an afterthought of the run

### Requirement: Two phases, build before run

Operating the system SHALL consist of two distinct phases: graph-build constructs the factory (defines nodes, edges, verification, and mounts), and graph-run operates it (an orchestrator carries work units along the edges). No run SHALL execute against a graph that has not been built and validated.

#### Scenario: Run without a graph
- **WHEN** a work unit is triggered in a project with no validated graph definition
- **THEN** the run SHALL NOT start and the missing build step SHALL be reported

### Requirement: No work outside nodes during a run

During graph-run, no work on the work unit SHALL happen outside a node, and routing SHALL happen only through a declared edge — with one bounded exception: a human ruling or approval answer MAY move the unit as a recorded orchestrator override, whose target is restricted to a node already walked on the unit's path or the abandonment terminal. The orchestrator's own bookkeeping (evaluating guards, transcribing state, appending log lines, and the deterministic pre- and post-steps a node's declaration assigns to it — provisioning the worktree, VCS operations on the unit's branch, delivery) is the execution of edges and state, not node work. Work performed during graph-build (including the per-project bootstrap) is outside the graph by definition.

#### Scenario: Ad hoc work rejected
- **WHEN** a change to the work unit's deliverables would happen outside any node's execution
- **THEN** the graph definition SHALL have no place for it and it SHALL be treated as a violation

### Requirement: Static relations are not edges

The term edge SHALL be reserved for data-flow routing. Static relations between long-term-memory entries (supersedes, depends-on, decided-by, verified-by) SHALL be typed references stored as markdown frontmatter fields, not graph edges and not a separate JSON or DOT graph file. Code-structure facts SHALL NOT be persisted and SHALL be queried live with tools.

#### Scenario: Relation storage
- **WHEN** a decision supersedes an earlier one
- **THEN** the relation SHALL be recorded as a frontmatter reference and not as a graph edge

### Requirement: The graph is a superset and skipping is normal

A graph definition SHALL be a superset of any single execution path: each approved phase walks its own declared path through the graph, and nodes outside that path simply do not run — normal execution, not an error.

#### Scenario: Fast path
- **WHEN** the approved phase's path goes straight to implementation
- **THEN** the nodes outside that path SHALL NOT run and this SHALL be a legitimate execution

### Requirement: Every loop has an exit and a cap

A valid graph SHALL give every loop an exit and a cap: a stage failing repeatedly with the same failure signature SHALL escalate rather than loop again, and because alternating signatures must not evade the cap, every scope also carries a signature-independent total failure cap (reference default: twice the failure cap) that engages the same chain regardless of signature. A routable-outcome loop — a declared edge returning to an earlier node of the path — SHALL carry a revisit counter that counts only revisits without progress: the counter resets only on recorded progress — a closed definition: a scope item transitioning to passed, or a graph-declared monotonic progress field advancing, nothing else — and otherwise engages the fallback chain at the graph's declared edge-revisit cap, with no signature involved. Escalation SHALL be tiered and in place — the orchestrator stays at the current node: an LLM advisor absorbs the first escalations there, and the human is reached only after the advisor tier is exhausted. Because this fallback chain is universal, blocked states need no declared edges.

#### Scenario: Repeated failure
- **WHEN** the same failure recurs at a stage up to the graph's declared cap
- **THEN** the stage SHALL escalate to the advisor tier rather than loop again

#### Scenario: Advisor exhausted
- **WHEN** the advisor tier's consultation cap on the same problem is reached without resolution
- **THEN** the stage SHALL escalate to the human

### Requirement: Legitimate terminals

A valid graph SHALL have exactly one success terminal and exactly one abandonment terminal, both legitimate, with no outgoing edges. Abandonment SHALL NOT be treated as failure.

#### Scenario: Terminal reached
- **WHEN** execution reaches a terminal
- **THEN** the graph SHALL stop and the outcome SHALL be recorded

### Requirement: The human is every node's final fallback

The human SHALL be the universal final fallback of every node, reached in place through the advisor tier — the supervisor and the advisor failed, so the higher-up comes to the floor. The orchestrator MUST NOT leave the current node while a human ruling is pending; the ruling decides the disposition: retry here with guidance, move back to an earlier node of the path, or end the work. Routine approvals are declared per node (the human-approval flag) on the nodes whose output needs sign-off, kept in the cheap stages so no synchronous human wait sits inside the expensive build-and-verify loops.

#### Scenario: Escalation stays in place
- **WHEN** a stage is blocked or repeatedly failing and the advisor tier is exhausted
- **THEN** the orchestrator SHALL wait at that node for the human ruling and SHALL NOT route anywhere until it is recorded

#### Scenario: Ruling dispositions
- **WHEN** the human rules on an escalation
- **THEN** the recorded disposition SHALL be one of: retry the current node with guidance, move back to a named earlier node, or end the work

### Requirement: Single long-term memory write point

The memory write point SHALL NOT be a separate designation: the close-out stage — the node that mounts the close-out (wrap) skill — is the sole memory writer of an ordinary unit's run, and exactly one node in a graph SHALL mount that skill; every node may read. The detailed rules, and the maintenance phase's sole exception for current-truth documents, are owned by the memory spec; a violation is a contractual restriction violation, like any other. The per-project bootstrap (graph-build phase) may write its own one-time configuration before any run starts; within a run, only the close-out stage writes the ledger, and the maintenance phase's declared overrides are the sole exception — for current-truth documents and for delta status flips.

#### Scenario: Write outside the close-out stage
- **WHEN** a node that does not mount the close-out skill attempts to write long-term memory
- **THEN** the write SHALL be disallowed by the graph definition
