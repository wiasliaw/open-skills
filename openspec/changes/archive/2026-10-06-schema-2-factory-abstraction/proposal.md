# Proposal: schema-2-factory-abstraction

## Why

The 1.x graph definition has no common abstraction under a node: every node carries five ad-hoc mechanisms (`pre_steps`, `instructions`+`mounts`, `verification`, `post_steps`, `human_approval`), each with its own syntax, and `phase.path` duplicates routing that edge guards already express. The consequences showed up in the first end-to-end run (E2E-RETRO): external skills can only be integrated by editing node prose, prose MUSTs (human approval, retry-in-place, send-back) can be skipped without trace, and the validator must keep two routing vocabularies consistent. Schema 2.0 replaces this with one closed abstraction — graph (廠區) / node (工站) / task (製程) / equipment (設備) / edge (產品路徑) — so that wrapping any external skill, MCP server, or tool is one declarative TaskDef, and every prose mechanism becomes a machine-checkable declaration.

## What Changes

- **BREAKING** Graph definition schema 2.0: a node is an ordered pipeline of task references; a task is one executor (`script | llm | validator | human`) plus equipment plus a machine-checkable exit. The five 1.x node mechanisms become four task executors.
- **BREAKING** `phase.path` is removed. Routing has exactly one vocabulary: edges + guards. `phase` becomes an ordinary state field written by the phase-approval human task; canonical walks move to a non-normative `examples.md`.
- **BREAKING** `state_fields` top-level section is removed. Type definitions live only in two type catalogs keyed by state field name — plugin `templates/types.json` and project `.harness/types.json` — merged in memory at load time, never materialized to disk. TaskDef carries zero type information: `produces: ["state:<field>"]` is both write authorization and type reference.
- **BREAKING** 1.x mechanism-semantics fields are removed from types and relocated: `executes` → the consuming task's equipment (`{source, family}` command entry), `scope_kind` → implied per-item fail scope of `re_entry`, value markers `command`/`evidence`/`pointer` → primitive types.
- TaskDef text surface is uniform across executors: `purpose` (one line for humans) + `instructions` (handed verbatim to whoever executes). `criteria` and `prompt` do not exist.
- In-node control flow is a closed vocabulary: each pipeline entry's `on` maps every task exit outcome to `next`, `goto:<earlier-task>`, a surfaced node outcome, or `escalate`.
- Templates are restructured as a layered library (`types.json` + `tasks/` + `nodes/` + `graphs/` + `examples.md`); graph-build interviews compose from the library and `assemble` flattens into the project's self-contained `.harness/graph.json` (task catalog inlined, no state_fields, no slots).
- `scripts/graph.mjs` gains an `assemble` subcommand and new pipeline invariants; path/edge consistency checks are deleted.
- Human tasks force a decision artifact: skipping a human MUST becomes impossible without forging a file.

## Capabilities

### New Capabilities

- `type-catalog`: the two-tier state-field type catalog (plugin + project), the pure-type schema (six fields: `type/values/nullable/default/items/fields`), primitive types including `command`/`evidence-ref`/`pointer`, slot-parameterized types and their instantiation rule, merge/collision/dangling-reference rules, and the in-memory registry contract (never written to disk).

### Modified Capabilities

- `graph-definition`: **BREAKING** — top level reduced to `schema_version/name/caps/tasks/nodes/edges`; TaskDef, Node pipeline, `on` action vocabulary, edge-only routing; `phase`, `state_fields`, `slots` sections removed from the runtime file.
- `graph-engineering-model`: the conceptual model becomes 廠區/工站/製程/設備/產品路徑; "everything is a task" replaces the five node mechanisms; phases become guard values with non-normative example walks.
- `graph-build`: interview-as-assembly over the layered template library; `assemble` flattening; type extension (new types, parameterized-type instantiation) written to project `.harness/types.json`; attestation requirements unchanged in intent.
- `graph-run`: dispatch is per task (not per node); orchestrator executes script tasks, routes `on` actions, enforces exit artifacts, and handles `escalate`; failure scope becomes `<node>.<task>` (per item under `re_entry`).
- `work-unit-state`: the state write gate resolves types from the merged in-memory catalog; write authorization comes from the dispatched task's `produces`; fail counter scopes renamed.

## Impact

- `scripts/graph.mjs` (major rewrite: pipeline invariants, task catalog, assemble, delete path checks), `scripts/work-unit.mjs` (type resolution, fail scopes, new `land-tests`/`expect-red` surface for the red check), `scripts/init.mjs` (unchanged graph declaration; types.json location).
- `skills/graph-build/` (SKILL + references + templates restructured into the layered library), `skills/graph-run/references/` (dispatch, node-execution, escalation, state-writes).
- `docs/file-formats.md`, `docs/graph-build.md`, `docs/graph-run.md`.
- Any existing project `.harness/graph.json` is incompatible and must be re-assembled (no migration tooling planned; the only consumer is the demo flow).
- E2E-RETRO fixes land after this change on the new schema (#3 maintain node, #1 scaffold variant benefit directly; the rest are orthogonal).
