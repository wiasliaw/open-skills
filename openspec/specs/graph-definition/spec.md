## Purpose

The graph definition artifact: the machine-readable document that graph-build produces and graph-run consumes — its format, where it lives, and the deterministic validator that gates it.

## Requirements

### Requirement: One machine-readable document

A graph definition SHALL be a single machine-readable JSON document declaring: the graph's nodes and edges (carrying every field the node and edge declaration contracts in `graph-build` require), the declared caps (failure cap, advisor consultation cap), the designated converge node, and the phase vocabulary in force — keyed by Conventional Commits semantics (for example `feat`, `fix`, `chore`, `docs`, `refactor`) — where each phase declares its meaning and its `path`: the ordered sequence of nodes that phase walks. A path is a positive declaration — no skip lists — and SHALL be realizable through the declared edges; the phase gate may still route work that is not needed straight to the abandonment terminal. Per-node prose instructions MAY be markdown strings inside the document or files it references; routing data MUST NOT live in prose. What a node can execute is part of its declaration: project commands live in the node's mounts, and a node's verification MAY use only commands that node mounts. A template definition stays project-agnostic by carrying named command slots instead of concrete commands; graph-build fills the slots from the instantiation interview, and the tool gate verifies every filled command before the definition is accepted.

#### Scenario: Definition inspected
- **WHEN** a graph definition is read
- **THEN** every node, edge, guard, cap, and mount SHALL be present as structured data, resolvable without parsing prose

### Requirement: No default factory — templates are build-time material

There SHALL be no default graph: a run uses only the definition the project config declares, and a project that declares none cannot run — the orchestrator refuses and points to graph-build. The plugin SHALL ship template graph definitions on the external plugin surface as build-time starting material only: graph-build instantiates a template explicitly into the project's own definition, which the project owns and edits from then on; a template never applies at run time by itself. Runtime use of a graph definition MUST NOT depend on internal reference material such as `openspec/`.

#### Scenario: Project without its own graph
- **WHEN** a project declares no graph definition
- **THEN** no run SHALL start, and the report SHALL point to graph-build

#### Scenario: Template instantiated
- **WHEN** graph-build starts a project from a shipped template
- **THEN** the template SHALL be copied into the project's own declared definition, validated, and owned by the project; later template updates in the plugin SHALL NOT change the project's definition

### Requirement: A deterministic validator gates the definition

Graph validation SHALL be owned by a zero-dependency Node.js script (Node.js >= 20, built-in modules only, one JSON object on stdout, stable error codes, documented exit codes, committed tests) that checks the structural invariants of `graph-engineering-model` and `graph-build`: every loop has an exit and a declared cap, every blocked state has a destination, terminals exist and are reachable, edge coverage is complete per node, the converge node is unique, every mount and outcome referenced by an edge guard is declared, every command a node's verification uses is in that node's mounts, every phase's path names declared nodes and is realizable through the declared edges, and no unfilled template slot remains. The orchestrator SHALL accept only a definition this validator passed.

#### Scenario: Invalid definition named
- **WHEN** the validator rejects a definition
- **THEN** its output SHALL name each violated invariant and the node, edge, or cycle involved, and no run SHALL start on that definition
