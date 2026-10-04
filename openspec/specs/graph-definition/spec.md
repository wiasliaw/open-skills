## Purpose

The graph definition artifact: the machine-readable document that graph-build produces and graph-run consumes — its format, where it lives, and the deterministic validator that gates it.

## Requirements

### Requirement: One machine-readable document

A graph definition SHALL be a single machine-readable JSON document declaring: the graph's nodes and edges (carrying every field the node and edge declaration contracts in `graph-build` require), the declared caps (failure cap, advisor consultation cap) and the phase vocabulary in force — keyed by Conventional Commits semantics (for example `feat`, `fix`, `chore`, `docs`, `refactor`) plus the reserved key `maintenance`, which every definition SHALL declare because the memory apply mechanism depends on it — where each phase declares its meaning, its `path`: the ordered sequence of nodes that phase walks, and optionally its restriction overrides: per-node restriction replacements that apply only while a unit of that phase runs (the maintenance phase uses this to gain its current-truth write rights). The definition SHALL also declare the state fields its nodes and mounted skills read and write beyond the work-unit core contract, each by name, type, allowed values, applicability (the owning node, or the phases it applies to), and default value, so the state write gate can derive, materialize, and validate each unit's concrete schema per its approved path — the declaration is the single registry, with no separate template artifact. All paths SHALL share the same first node — the phase approval point, reached unconditionally from the single entry node. A path is a positive declaration — no skip lists — and SHALL be realizable through the declared edges; the phase approval may still end work that is not needed at the abandonment terminal. Human interaction appears in a definition only as a per-node human-approval flag: there SHALL be no human-gate, advisor, blocked, or escalation nodes or edges, because the escalation fallback chain is universal and in place. An edge guard SHALL be a structured, machine-evaluable predicate — conjunctions of (field, operator, value) over the unit's state fields, the reported outcome, and the approved `phase` — never prose. Per-node prose instructions MAY be markdown strings inside the document or files it references; routing data MUST NOT live in prose. What a node can execute is part of its declaration: project commands live in the node's mounts, a mount MAY be a parameterized command family declared as a base command plus an argument pattern — an invocation is covered when its program and leading arguments equal the family's base — and a node's verification MAY use only commands covered by that node's mounts. A run-time-generated invocation, such as a ticket's declared test, is valid when a mounted family of its executing node covers it: the state field holding such an invocation declares which node executes it, the write gate checks coverage against that node's mounts, and the tool gate (part of this validator script) verifies each family's base command at acceptance. A template definition stays project-agnostic by carrying named command slots instead of concrete commands; graph-build fills the slots from the instantiation interview, and the tool gate verifies every filled command before the definition is accepted.

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

Graph validation SHALL be owned by a zero-dependency Node.js script (Node.js >= 20, built-in modules only, one JSON object on stdout, stable error codes, documented exit codes, committed tests) that checks the structural invariants of `graph-engineering-model` and `graph-build`: every loop has an exit and a declared cap, terminals exist and are reachable, edge coverage is complete per node, no human-gate, advisor, or escalation node or edge exists, exactly one node mounts the close-out skill, every mount and outcome referenced by an edge guard is declared, every command a node's verification uses is in that node's mounts, exactly one entry node exists and routes unconditionally to the shared first node of all paths, which carries the human approval that records the phase; the `maintenance` phase is declared; every phase's path names declared nodes, runs through the close-out node to the success terminal, and is realizable through the declared edges; returning edges (targets earlier on a path) are identified as the revisit-counted kind; terminals and the entry node declare no verification, outcomes, or outgoing guarded edges; every state field an edge guard references is applicable at that edge's source node (an inapplicable reference is a definition defect, not a false evaluation); every state field a node or mounted skill needs is declared with an applicability that names declared nodes or phases; and no unfilled template slot remains. The orchestrator SHALL accept only a definition this validator passed.

#### Scenario: Invalid definition named
- **WHEN** the validator rejects a definition
- **THEN** its output SHALL name each violated invariant and the node, edge, or cycle involved, and no run SHALL start on that definition
