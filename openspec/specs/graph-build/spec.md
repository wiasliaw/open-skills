## Purpose

The build phase: constructing the factory. Graph-build defines what every node does and how it is verified, defines the edges that route data to the next stage, declares every capability a node uses, and bootstraps the project so runs can start.

## Requirements

### Requirement: The graph definition is reviewable data

The graph SHALL be defined as reviewable content (a graph definition), not as code inside agents: node behavior changes by changing the definition, and the run-time dispatch is constructed from it. Agent definitions stay generic; nothing stage-specific lives in them.

#### Scenario: Node behavior changed
- **WHEN** a node's work, verification, or mounts change
- **THEN** the change SHALL be made in the graph definition and SHALL take effect through dispatch construction without editing any agent definition

### Requirement: Node declaration contract

Each node in a graph definition SHALL declare: its purpose and type; the state it reads and the state it produces; its verification criteria; its outgoing guarded edges; its mounted capabilities — skills, commands, and MCP servers; its restrictions (what it must not write or do); and whether its output requires a human approval before routing. A capability not declared at build time SHALL NOT be available to the node at run time.

#### Scenario: Mounts declared at build time
- **WHEN** a node needs a skill, command, or MCP server during a run
- **THEN** that mount SHALL already be named in the node's declaration, and the dispatch SHALL carry only declared mounts

#### Scenario: Unshipped mount degrades to instructions
- **WHEN** a declared skill mount is not installed in the running environment
- **THEN** the dispatch SHALL carry the mount's intent as instructions instead, and the degradation SHALL be visible in the dispatch

### Requirement: Edge declaration contract

Each edge SHALL declare its source node, its target node, and its guard: the condition over state that selects it. For every non-terminal node, the declared outgoing edges SHALL cover every outcome the node can report, so that routing is always decided by a declared edge.

#### Scenario: Outcome without an edge
- **WHEN** a node reports an outcome no outgoing edge guard matches
- **THEN** graph validation SHALL have rejected the definition before any run

### Requirement: Graph validation gates the first run

Before a graph definition is used, it SHALL be validated: every loop has an exit and a cap, every blocked state has a destination, at least one success and one abandonment terminal exist and are reachable, edge coverage is complete, and exactly one node mounts the close-out skill. An invalid definition SHALL NOT run.

#### Scenario: Uncapped loop rejected
- **WHEN** a definition contains a cycle with no failure cap or exit guard
- **THEN** validation SHALL reject it and name the cycle

### Requirement: Project bootstrap

Graph-build SHALL include a per-project bootstrap (the init tier) run before any graph-run: survey the repository (structure, conventions, how things are executed) and record the project's facts machine-readably in one project config (`.harness/config.json`), written through a deterministic script, never by hand. The config SHALL carry a schema version and hold every project fact as a section — at minimum VCS, the work-units and worktrees locations, the worktree-setup section (setup commands and copy entries), and optionally the graph definition path. The config holds no command catalog: what a node can execute is declared on that node in the graph definition. The tool-availability gate SHALL run before a graph definition is accepted: every command and CLI mounted by any of its nodes is verified to actually run — a missing required tool blocks acceptance and is reported by name. The bootstrap is the single writer of this config; every other actor only reads it. A consuming script SHALL validate the config against its declared schema version and consume only its own section, so one section's evolution is caught by versioning rather than silently breaking another consumer.

#### Scenario: Tool missing
- **WHEN** the gate finds that a command mounted by a node of the definition cannot run
- **THEN** the definition SHALL NOT be accepted, no run SHALL start, and the human SHALL receive a report naming the tool

#### Scenario: Worktree needs recorded
- **WHEN** the bootstrap finds that a fresh worktree needs a dependency install command and an untracked env file
- **THEN** it SHALL record the command and the copy entry in the config's worktree-setup section, and SHALL write the section even when nothing is needed (explicitly empty lists)

#### Scenario: A node executes only what it mounts
- **WHEN** a node's work or verification needs to run a project command
- **THEN** that command SHALL be declared in the node's mounts, and a command no node mounts is not part of the graph

#### Scenario: Config written through the script
- **WHEN** the bootstrap writes a config file
- **THEN** it SHALL draft the JSON and write it via the deterministic script, which validates the schema and writes atomically; a hand-written config file is a violation

### Requirement: Mounts maximize reuse of standalone skills

Node capabilities SHALL be assembled by mounting standalone skills rather than by writing node-specific capability code. A skill mounted on a node remains the same skill that is usable on its own; mounting adds the node's graph profile obligations, never a fork of the skill.

#### Scenario: Same skill, two contexts
- **WHEN** a skill is used standalone in one session and mounted on a node in another
- **THEN** both SHALL use the same skill definition, with the graph profile applying only in the mounted case
