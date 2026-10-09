## Purpose

The design axis of open-skills: graph engineering, where a node defines what is done and how it is verified, an edge defines the data flow, and the whole system operates in two phases — graph-init (build the factory) and graph-run (run the factory). This spec fixes the vocabulary and the structural invariants every graph must satisfy; it fixes no concrete topology.

## Requirements

### Requirement: Graph vocabulary

The system SHALL use these definitions: a **graph** (廠區) is nodes plus edges, and routing reads only edge guards; a **node** (工站) is an ordered pipeline of task references plus the routable outcomes it surfaces, typed only as entry, work, or terminal; a **task** (製程) is the unit of execution — one executor (`script`, `llm`, `validator`, or `human`) plus mounted equipment plus a machine-checkable exit — and everything that happens in a run is a task: deterministic steps, LLM work, verification, and human decisions are the four executors of one abstraction, not separate node mechanisms; **equipment** (設備) is what a task may use — skills, commands, MCP servers — declared on the task; an **edge** (產品路徑) is data flow, a guard over state that decides what runs next; **state** is the work-unit folder, shared across the whole graph. A skill is equipment mounted on a task and is never a node or a task by itself; wrapping an external skill means authoring one TaskDef. Human interaction is a human task inside a pipeline whose exit requires a recorded decision artifact — skipping a required human confirmation is impossible without forging a file; escalations still happen in place at the current node, outside the graph.

#### Scenario: Skills are not nodes
- **WHEN** a capability such as research, review, or worktree handling is attached to a step
- **THEN** it SHALL be equipment on a task that a node's pipeline references, not a separate node

#### Scenario: Verification is a task
- **WHEN** a node's work must be verified
- **THEN** the verification SHALL be a validator task in that node's pipeline (or a standalone validator-task node), not a special section outside the task abstraction

#### Scenario: Human gate leaves an artifact
- **WHEN** a human task's outcome is recorded
- **THEN** a decision artifact SHALL exist in the stage directory, and an outcome without its artifact SHALL NOT be routed on

### Requirement: Static relations are not edges

The term edge SHALL be reserved for data-flow routing. Static relations between long-term-memory entries (supersedes, depends-on, decided-by, verified-by) SHALL be typed references stored as markdown frontmatter fields, not graph edges and not a separate JSON or DOT graph file. Code-structure facts SHALL NOT be persisted and SHALL be queried live with tools.

#### Scenario: Relation storage
- **WHEN** a decision supersedes an earlier one
- **THEN** the relation SHALL be recorded as a frontmatter reference and not as a graph edge

### Requirement: The graph is a superset and skipping is normal

A graph definition SHALL be a superset of any single execution path: edge guards over state (the approved `phase` value above all) decide which nodes a unit walks, and nodes the guards never select simply do not run — normal execution, not an error. No path declaration exists; canonical walks MAY be documented as non-normative examples that no validator reads.

#### Scenario: Fast path
- **WHEN** the guards route an approved unit straight to implementation
- **THEN** the nodes the guards never select SHALL NOT run and this SHALL be a legitimate execution

### Requirement: Every loop has an exit and a cap

A valid graph SHALL give every loop an exit and a cap — both loop kinds: an in-node `goto` (a pipeline entry returning to an earlier task, the declared form of retry-in-place and send-back) and a returning edge (an edge targeting a node earlier in the unit's walked history). A stage failing repeatedly with the same failure signature SHALL escalate rather than loop again, and because alternating signatures must not evade the cap, every scope also carries a signature-independent total failure cap (reference default: twice the failure cap) that engages the same chain regardless of signature. A returning edge SHALL carry a revisit counter that counts only revisits without progress: the counter resets only on recorded progress — a closed definition: a scope item transitioning to passed, or a graph-declared monotonic progress field advancing, nothing else — and otherwise engages the fallback chain at the graph's declared edge-revisit cap, with no signature involved. The `escalate` action is the declared entry into this chain for failures with no earlier task to return to. Escalation SHALL be tiered and in place — the orchestrator stays at the current node: an LLM advisor absorbs the first escalations there, and the human is reached only after the advisor tier is exhausted. Because this fallback chain is universal, blocked states need no declared edges.

#### Scenario: Repeated failure
- **WHEN** the same failure recurs at a stage up to the graph's declared cap
- **THEN** the stage SHALL escalate to the advisor tier rather than loop again

#### Scenario: Goto loops are capped
- **WHEN** a validator task's `fail` maps to `goto:<implementing task>` and the loop repeats to the declared cap
- **THEN** the orchestrator SHALL engage the fallback chain instead of another traversal

#### Scenario: Advisor exhausted
- **WHEN** the advisor tier's consultation cap on the same problem is reached without resolution
- **THEN** the stage SHALL escalate to the human

### Requirement: Legitimate terminals

A valid graph SHALL have exactly one success terminal and exactly one abandonment terminal, both legitimate, with no outgoing edges. Abandonment SHALL NOT be treated as failure.

#### Scenario: Terminal reached
- **WHEN** execution reaches a terminal
- **THEN** the graph SHALL stop and the outcome SHALL be recorded

### Requirement: The human is every node's final fallback

The human SHALL be the universal final fallback of every node, reached in place through the advisor tier. The orchestrator MUST NOT leave the current node while a human ruling is pending; the ruling decides the disposition: retry here with guidance, move back to an earlier node of the walked history, or end the work. Routine approvals are human tasks declared in the pipelines whose output needs sign-off, kept in the cheap stages so no synchronous human wait sits inside the expensive build-and-verify loops; a human task's `not-needed` outcome MAY surface and route to the abandonment terminal by a declared edge.

#### Scenario: Escalation stays in place
- **WHEN** a stage is blocked or repeatedly failing and the advisor tier is exhausted
- **THEN** the orchestrator SHALL wait at that node for the human ruling and SHALL NOT route anywhere until it is recorded

#### Scenario: Ruling dispositions
- **WHEN** the human rules on an escalation
- **THEN** the recorded disposition SHALL be one of: retry the current node with guidance, move back to a named node of the walked history, or end the work

### Requirement: Single long-term memory write point

The memory write point SHALL NOT be a separate designation: the close-out stage — the node whose pipeline references the task mounting the close-out (wrap) skill — is the sole memory writer of an ordinary unit's run, and exactly one task in a graph SHALL mount that skill; every task may read. The detailed rules, and the maintenance flow's sole exception for current-truth documents, are owned by the memory spec; a violation is a contractual restriction violation, like any other. The maintenance exception is carried by the maintenance node's own tasks and their restrictions (selected by guards), not by overrides. The per-project bootstrap (graph-init phase) may write its own one-time configuration before any run starts.

#### Scenario: Write outside the close-out stage
- **WHEN** a task that does not mount the close-out skill attempts to write long-term memory
- **THEN** the write SHALL be disallowed by that task's restrictions in the graph definition
