## Purpose

The graph definition artifact: the machine-readable document that graph-build produces and graph-run consumes — its format, where it lives, and the deterministic validator that gates it.

## Requirements

### Requirement: One machine-readable document

A graph definition SHALL be a single machine-readable JSON document declaring: the graph's nodes and edges (carrying every field the node and edge declaration contracts in `graph-build` require), the declared caps (failure cap, advisor consultation cap), the designated converge node, and the grading vocabulary in force with each grade's meaning and skipped stages (the reference vocabulary: `full` — a new contract is needed; `small` — an existing contract covers it; `trivial` — fast path straight to implementation; `no-op` — not needed, end the work). Per-node prose instructions MAY be markdown strings inside the document or files it references; routing data MUST NOT live in prose.

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

Graph validation SHALL be owned by a zero-dependency Node.js script (Node.js >= 20, built-in modules only, one JSON object on stdout, stable error codes, documented exit codes, committed tests) that checks the structural invariants of `graph-engineering-model` and `graph-build`: every loop has an exit and a declared cap, every blocked state has a destination, terminals exist and are reachable, edge coverage is complete per node, the converge node is unique, and every mount and outcome referenced by an edge guard is declared. The orchestrator SHALL accept only a definition this validator passed.

#### Scenario: Invalid definition named
- **WHEN** the validator rejects a definition
- **THEN** its output SHALL name each violated invariant and the node, edge, or cycle involved, and no run SHALL start on that definition
