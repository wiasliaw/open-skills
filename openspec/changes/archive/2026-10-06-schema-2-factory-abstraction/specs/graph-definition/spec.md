## MODIFIED Requirements

### Requirement: One machine-readable document

A graph definition SHALL be a single machine-readable JSON document whose top level is exactly the runtime-consumed sections `schema_version`, `name`, `caps`, `tasks`, `nodes`, `edges`, and nothing else. `caps` declares failure, consultation, edge-revisit, and optionally the signature-independent total (default: twice the failure cap). There SHALL be no `phase` section (routing has exactly one vocabulary: edges + guards; `phase` is an ordinary state field written by the phase-approval human task and typed by the type catalog), no `state_fields` section (types live in the type catalogs; see `type-catalog`), and no `slots` section (slots are template-layer material, filled before the definition exists).

`tasks` SHALL be the task catalog: an object of TaskDefs keyed by task id, the resolution table for every pipeline reference, so a task shared by several nodes has one definition. A TaskDef SHALL declare: `executor` (one of `script | llm | validator | human`); `purpose` (one line for humans); `instructions` (text handed verbatim to whoever executes — the worker's operating prose, the validator's definition of pass, the human's decision ask; one field with the same semantics for every executor, optional for script); `equipment` (`skills`, `commands`, `mcp` — a command may be a plain invocation, a parameterized family `{base, args}`, or a state-sourced entry `{source: "state:<field-path>", family: "<base>"}` declaring that a run-time-generated invocation read from state must fall within the named mounted family); `reads` and `produces` (data-flow declarations; a `produces` entry `state:<field>` is both write authorization and type reference per `type-catalog`); `restrictions` (the task's MUST NOTs, carried into its dispatch); `exit` (`outcomes`: the closed set of outcomes the task can end in — `blocked` is never among them, because it is universal and declared nowhere; `artifact`: a stage-file pattern required for llm, validator, and human tasks — an outcome without its artifact in the stage directory has not happened); structural fields `runner` (`reviewer` | `orchestrator`, validator only, default `reviewer`) and `run` (script only: commands executed in order, stopping at the first non-zero exit; each entry is a command string or `{command, codes}`, where `codes` maps specific non-zero exit statuses of that one command to declared exit outcomes; the script's outcome is `ok` when every command exits zero, the mapped outcome when the failing command's status is mapped, and `failed` otherwise; statuses 126 and 127 can never be mapped, because a command that cannot run is a defect, not an outcome); and optionally `params` (names the referencing node binds via `with`). A TaskDef SHALL carry no type definitions and no per-executor text fields beyond `purpose` and `instructions`.

A node SHALL declare `id`, `kind` (`entry | work | terminal`), `purpose`, and for work nodes an ordered `pipeline` of entries `{use: <task-id>, with?: {param: value}, on: {<task-outcome>: <action>}}` plus `outcomes` (its routable surface) and optionally a `re_entry` rule (list field, order, progress field, items field — the items field is the list of item records `{id, ...}` the selection walks; declaring the rule also refines to per item, `<node>.<task>:<item-id>`, the failure scope of every task that reads the rule's progress field while an item is selected — wherever that task runs, for example the build tasks of a ticketed unit — where the item id names a record of the items field). The `on` map SHALL totally cover the referenced task's exit outcomes, each mapped to exactly one action from the closed vocabulary: `next` (advance the pipeline; illegal on the last entry), `goto:<task-id>` (return to an earlier entry of the same pipeline; counted by fail counters and capped), a declared node outcome (abort the pipeline and surface it for edge routing), `escalate` (hand to the orchestrator's in-place fallback chain; for failures with no earlier task to return to), or — in terminal pipelines only — `done` (the terminal's pipeline is complete and the unit ends; `done` is reserved and never a node outcome). Within one pipeline a task SHALL be referenced at most once, so every `goto` target and every `<node>.<task>` failure scope is unambiguous. Conditions SHALL NOT appear inside a pipeline: state-dependent branching surfaces as a node outcome and is decided by edge guards. The entry node has no pipeline; a terminal node declares `terminal_kind` (`success | abandonment`) and a pipeline of script tasks only, declaring no outcomes and no outgoing edges.

An edge SHALL declare `from`, `to`, `outcome`, and `guard` — the one exception being the entry node's single outgoing edge, which names no outcome and carries the empty guard — where the guard is a structured, machine-evaluable conjunction of (field, operator, value) predicates over state fields resolved through the type catalogs, never prose. The operator set is closed: `eq`, `ne`, `in`, `not-in`, `lt`, `lte`, `gt`, `gte`, and for lists `empty`, `not-empty`, and count comparisons. For any one outcome of a node, the declared guards SHALL be mutually exclusive and jointly exhaustive over the states that can reach that node — the empty conjunction is the legal unconditional guard; for `phase`, the values considered at a node are those from whose phase-restricted route the node is reachable — and a run-time zero-match is a definition defect handled as blocked in place. Human interaction appears only as human tasks inside pipelines; there SHALL be no advisor, blocked, or escalation nodes or edges, because the escalation fallback chain is universal and in place.

#### Scenario: Definition inspected
- **WHEN** a graph definition is read
- **THEN** every task, node, pipeline entry, edge, guard, and cap SHALL be present as structured data, resolvable without parsing prose, and no type definition SHALL be found in it

#### Scenario: Incomplete on-map rejected
- **WHEN** a pipeline entry's `on` map omits one of its task's declared exit outcomes
- **THEN** the validator SHALL reject the definition naming the node, the pipeline entry, and the uncovered outcome

#### Scenario: Forward goto rejected
- **WHEN** an `on` action targets `goto:<task>` where the target is not an earlier entry of the same pipeline
- **THEN** the validator SHALL reject the definition naming the node and both entries

#### Scenario: Overlapping guards rejected
- **WHEN** two guards of the same outcome can both hold for some reachable state
- **THEN** the validator SHALL reject the definition naming the outcome and both edges

### Requirement: No default factory — templates are a build-time layered library

There SHALL be no default graph: a run uses only the definition the project config declares, and a project that declares none cannot run — the orchestrator refuses and points to graph-build. The plugin SHALL ship its build-time material as a layered library mirroring the abstraction: `templates/types.json` (the plugin type catalog), `templates/tasks/` (one TaskDef per file), `templates/nodes/` (composable node examples referencing the task files), `templates/graphs/` (assembly graphs declaring slots, caps, node references, and edges), and a non-normative `examples.md` of canonical phase walks that the validator never reads. graph-build composes from the library at interview time and flattens the result into the project's own self-contained definition — task catalog inlined, slots filled, no library references remaining — which the project owns from then on; later template updates SHALL NOT change it. The flattened definition SHALL be written only by the assemble step; hand-editing it is a violation. Runtime use of a graph definition MUST NOT depend on internal reference material such as `openspec/`.

#### Scenario: Project without its own graph
- **WHEN** a project declares no graph definition
- **THEN** no run SHALL start, and the report SHALL point to graph-build

#### Scenario: Assembly flattens the library
- **WHEN** graph-build instantiates an assembly graph
- **THEN** the written project definition SHALL be self-contained — every referenced task inlined into its `tasks` catalog, every slot filled — and SHALL validate without reading `templates/`

#### Scenario: Library update does not touch projects
- **WHEN** the plugin updates a template task or node file
- **THEN** existing project definitions SHALL be unchanged until the project re-runs graph-build

### Requirement: A deterministic validator gates the definition

Graph validation SHALL be owned by a zero-dependency Node.js script (Node.js >= 20, built-in modules only, one JSON object on stdout, stable error codes, documented exit codes, committed tests) that SHALL also own assembly (`assemble`: flatten a library composition into a project definition), so flattening and validation share one tool. The validator SHALL check: every pipeline entry's `on` map totally covers its task's exit outcomes with actions from the closed vocabulary (`done` only in terminal pipelines, `next` never on the last entry); no task, node outcome, or edge declares `blocked`; script `codes` map only declared outcomes and never 126 or 127; no task is referenced twice in one pipeline; every `goto` targets an earlier entry of the same pipeline; every node outcome is produced by at least one surface action and covered by at least one edge, and every edge's outcome exists on its source node; guards per outcome are mutually exclusive and jointly exhaustive, and every guard field resolves through the merged type catalogs with an operator legal for its type; every `produces: state:<field>` and every state-sourced equipment entry resolves (no dangling type or task references; `with` bindings cover the referenced task's declared params); every `re_entry` rule names fields that resolve and are applicable at its node — a list `list_field`, a `progress_field`, and an `items_field` that is a list of objects carrying an `id` field; llm, validator, and human tasks declare `exit.artifact`; exactly one entry node exists and routes unconditionally to the shared first node, whose pipeline carries the mandatory phase-approval human task; exactly one success terminal and exactly one abandonment terminal exist, terminal pipelines contain script tasks only; every node is reachable from the entry node and the success terminal is reachable from every work node; every loop (goto cycles and returning edges alike) is capped by the declared caps; exactly one task mounts the close-out skill, and the node referencing it dominates the success terminal (every route from the entry node to the success terminal passes through it); the instantiated `phase` type contains the reserved value `maintenance`; for every value of the instantiated `phase` type — `maintenance` included — the success terminal is reachable from the entry node over edges whose guards are satisfiable with `phase` fixed to that value (a phase-restricted route), so no approvable phase can strand a unit; and the tool gate probes every command in every task's equipment (script `run` lines and terminal steps included) for existence and startability. Checks tied to the removed `phase.path` section (path realizability, per-path node membership) SHALL NOT exist. The orchestrator SHALL accept only a definition this validator passed.

#### Scenario: Invalid definition named
- **WHEN** the validator rejects a definition
- **THEN** its output SHALL name each violated invariant and the node, task, pipeline entry, edge, or cycle involved, and no run SHALL start on that definition

#### Scenario: Unreachable node rejected
- **WHEN** a definition contains a work node no edge path from the entry node can reach
- **THEN** the validator SHALL reject it naming the node

#### Scenario: Missing exit artifact rejected
- **WHEN** an llm, validator, or human task declares no `exit.artifact`
- **THEN** the validator SHALL reject the definition naming the task

#### Scenario: Close-out bypass rejected
- **WHEN** some route from the entry node reaches the success terminal without passing through the node that references the close-out task
- **THEN** the validator SHALL reject the definition naming that node and the success terminal

#### Scenario: Stranded phase rejected
- **WHEN** for some value of the instantiated `phase` type no phase-restricted route reaches the success terminal
- **THEN** the validator SHALL reject the definition naming the phase value

#### Scenario: Declared blocked rejected
- **WHEN** a task's exit outcomes, a node's outcomes, or an edge names `blocked`
- **THEN** the validator SHALL reject the definition naming the task, node, or edge, because blocked is universal and handled by the fallback chain
