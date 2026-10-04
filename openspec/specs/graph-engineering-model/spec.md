## Purpose

The design axis of open-skills: graph engineering, where a node defines what is done and how it is verified, an edge defines the data flow, and the whole system operates in two phases — graph-build (build the factory) and graph-run (run the factory). This spec fixes the vocabulary and the structural invariants every graph must satisfy; it fixes no concrete topology.

## Requirements

### Requirement: Graph vocabulary

The system SHALL use these definitions: a node is a unit of work typed as LLM call, deterministic function, tool call, validator, or human gate, and defines both what is to be done and how it is verified; an edge is data flow, a condition function that reads state and decides what runs next; state is the work-unit folder, shared across the whole graph; a skill is a capability mounted on a node and is never a node.

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

During graph-run, no work on the work unit SHALL happen outside a node, and no routing SHALL happen outside an edge. The orchestrator's own bookkeeping (evaluating guards, transcribing state, appending log lines) is the execution of edges and state, not node work. Work performed during graph-build (including the per-project bootstrap) is outside the graph by definition.

#### Scenario: Ad hoc work rejected
- **WHEN** a change to the work unit's deliverables would happen outside any node's execution
- **THEN** the graph definition SHALL have no place for it and it SHALL be treated as a violation

### Requirement: Static relations are not edges

The term edge SHALL be reserved for data-flow routing. Static relations between long-term-memory entries (supersedes, depends-on, decided-by, verified-by) SHALL be typed references stored as markdown frontmatter fields, not graph edges and not a separate JSON or DOT graph file. Code-structure facts SHALL NOT be persisted and SHALL be queried live with tools.

#### Scenario: Relation storage
- **WHEN** a decision supersedes an earlier one
- **THEN** the relation SHALL be recorded as a frontmatter reference and not as a graph edge

### Requirement: The graph is a superset and skipping is normal

A graph definition SHALL be a superset of any single execution path, and skipping nodes according to an approved routing decision (for example a grading) SHALL be normal execution, not an error.

#### Scenario: Fast path
- **WHEN** a routing decision grades the work as trivial
- **THEN** execution SHALL skip the stages the grading excludes and this SHALL be a legitimate path

### Requirement: Every loop has an exit and a cap

A valid graph SHALL give every loop an exit and a cap: a stage failing repeatedly with the same error SHALL escalate rather than loop again, and every blocked state SHALL have a declared destination. Escalation SHALL be tiered: an LLM advisor absorbs the first escalations, and the human is reached only after the advisor tier is exhausted.

#### Scenario: Repeated failure
- **WHEN** the same failure recurs at a stage up to its declared cap
- **THEN** the graph SHALL route to the advisor tier rather than loop again

#### Scenario: Advisor exhausted
- **WHEN** the advisor tier's consultation cap on the same problem is reached without resolution
- **THEN** the graph SHALL route to human escalation

### Requirement: Legitimate terminals

A valid graph SHALL have at least one success terminal and one abandonment terminal, both legitimate, with no outgoing edges. Abandonment SHALL NOT be treated as failure.

#### Scenario: Terminal reached
- **WHEN** execution reaches a terminal
- **THEN** the graph SHALL stop and the outcome SHALL be recorded

### Requirement: Human intervention is concentrated and last

Human gates SHALL sit in the cheap stages of the graph, so that no synchronous human wait occurs inside the expensive build-and-verify loops. Inside those loops, problems SHALL reach the human only through the advisor tier.

#### Scenario: No human wait in the expensive loop
- **WHEN** an expensive stage is blocked or repeatedly failing
- **THEN** the work SHALL route to the advisor first and to human escalation only after the advisor is exhausted, instead of waiting inline

### Requirement: Single long-term memory write point

Each graph SHALL designate exactly one converge node as the sole writer of long-term memory during a run; every node may read it. The per-project bootstrap (graph-build phase) may write its own one-time configuration before any run starts; within a run, only the converge node writes.

#### Scenario: Non-converge write
- **WHEN** a node other than the designated converge node attempts to write long-term memory
- **THEN** the write SHALL be disallowed by the graph definition
