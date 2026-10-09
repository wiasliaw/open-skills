# Template reference

Load at Tier 2. The library is build-time starting material shipped in `skills/graph-init/templates/`. There is no default factory: the library never applies at run time by itself. The project's `.harness/graph.json` is generated from it by `assemble` and is self-contained, so later library updates never change it (the one exception is `types.json`: runs read the plugin type catalog in place and merge it in memory with the project's).

## Library layout

| Path | Layer |
|---|---|
| `types.json` | Plugin type catalog: state-field types keyed by field name. `phase` is parameterized (`{{phase_values}}`) and unusable until assemble instantiates it into `.harness/types.json` |
| `tasks/<id>.json` | One TaskDef per file: one executor (`script`, `llm`, `validator`, or `human`), equipment (`skills`, `commands`, `mcp`), `reads`, `produces`, `restrictions`, and a machine-checkable exit (`script` tasks declare `run` lines) |
| `nodes/<id>.json` | One node per file: an entry, a work node, or a terminal. A work node is an ordered pipeline of task references plus the outcomes it surfaces |
| `graphs/coding-factory.json` | The assembly graph: slots, caps, node ids, edges |
| `coding-factory.examples.md` | Non-normative canonical walks, copied to `.harness/graph.examples.md`; the validator never reads them |

A pipeline entry is `{use, with?, on}`: `use` names a task; `with` binds the task's params; `on` maps every exit outcome of the task to one action: `next`, `goto:<earlier task of the same pipeline>`, a surfaced node outcome, `escalate`, or (terminal pipelines only) `done`. Conditions never appear in a node: state-dependent branching surfaces as a node outcome that edge guards route.

## Shipped assembly: graphs/coding-factory.json

A software-delivery factory.

- Nodes: the entry `trigger`, then `research` (carries the mandatory phase approval, the only writer of `phase`), `spec`, `ticket`, `build`, `build-direct`, `maintain`, `review`, `wrap` (the close-out node: its `close-out` task mounts `open-skills:wrap`), and two terminals: `ship` (success) and `end` (abandonment, reached by `not-needed` edges).
- Phases are not declared: edges with guards on `phase` route the unit. The reference phase values are `feat` (spec first), `fix` (no spec), `chore` (no tickets: `build-direct`), and the reserved `maintenance` (`maintain`); their canonical walks are in `coding-factory.examples.md`.
- Caps: failure, advisor consultations, edge revisit, total failure.

A walkthrough line shows the pipeline with executors and the surfaced outcomes, for example: `build: provision-worktree (script), red-check (script), implement-ticket (llm), verify-build (validator), commit-work (script); surfaces ticket-done, ticket-invalid`. Read each node file for its pipeline and outcomes; do not recite them from memory.

## Assembly graph format

One JSON object with these keys and no others:

| Key | Content |
|---|---|
| `schema_version`, `name` | Copied from the library assembly |
| `slots` | `{name: description}`: every build-time value the composition still needs |
| `caps` | Positive integers: `failure`, `advisor_consultations`, `edge_revisit`, and optional `total_failure` |
| `nodes` | Each entry a library node id (loaded from `nodes/<id>.json`) or an inline node object |
| `tasks` | Optional `{id: TaskDef}`. A task id resolves here first, then from `tasks/<id>.json`, so an entry adds a task or replaces the library task of the same id for this project. A task no pipeline uses is not inlined (warning `ASSEMBLY_TASK_UNUSED`) |
| `edges` | `{from, to, outcome, guard}`; the entry node's one edge has no outcome and `guard: []`; guards are conjunctions over catalog-typed fields with the operators `eq ne in not-in lt lte gt gte`, and `empty not-empty` on list fields |

An inline node object or a `tasks` entry is how a confirmed swap or edit is expressed. Assemble inlines every referenced TaskDef into the definition's task catalog (one edit point per task), fills the slots, and writes the six-section definition (`schema_version`, `name`, `caps`, `tasks`, `nodes`, `edges`); no `slots` or phase section remains.

## Slots

The assembly's `slots` object names every build-time placeholder and describes it. The shipped slots are:

| Slot | Meaning |
|---|---|
| `phase_values` | The project's phase vocabulary, a list; it MUST include the reserved value `maintenance`. Assemble instantiates the plugin `phase` type from it |
| `test_command` | The project's test command; also the base of the family covering each ticket's declared test invocation |
| `lint_command` | Static check (lint, type check, format check); use a harmless always-green check when the project has none |
| `open_pr_command` | Opens the delivery channel for the pushed branch; must be idempotent (succeed when already open) |

Always read the assembly's own `slots` for the current list rather than trusting this table. The slot values file is a JSON object `{slot: value}` with one value per declared slot: a missing value is `SLOT_UNFILLED` (naming the slot), a value for an undeclared slot is `SLOT_UNDECLARED`, and a value that does not fit its placeholder is `SLOT_VALUE_INVALID`.

The shipped edges route exactly the reference phase values. A different vocabulary needs matching `edges` edits, each a confirmed edit: assemble rejects an added value no edge routes (`GUARD_NOT_EXHAUSTIVE`, `PHASE_ROUTE_MISSING`) and an edge naming a value the vocabulary lacks (`GUARD_UNDECIDABLE`).

## Task params and run-time variables are not slots

- A `{{param}}` inside a TaskDef is bound by the pipeline entry's `with` (the entry binds exactly the params the task declares under `params`; otherwise `PARAM_UNBOUND` or `PARAM_UNDECLARED`). Assemble leaves it in place. Do not ask the user for it; rebinding is a node edit.
- `$`-prefixed run-time variables inside commands and instructions (`CLAUDE_PLUGIN_ROOT`, `WU_ID`, `WU_BRANCH`, `WU_WORKTREE`, and so on) are expanded by the orchestrator at run time. Leave them untouched; do not ask the user for them. The catalog lives in graph-run's `dispatch.md`.
- Any other `{{name}}` in the composition is an undeclared slot (`SLOT_UNDECLARED`).

## Interviewing for a slot

Offer a concrete recommendation from the survey (for example `npm test` from package.json scripts), name its source, ask for confirmation or a correction, and confirm the command works from a fresh worktree after the config's setup commands. For `phase_values` the recommendation is the reference set (source: the library), with `maintenance` kept. A slot is never filled from the survey alone: no confirmation, no fill. A command that needs an argument pattern (a family, as `test_command` is for ticket tests) stays the base program plus leading arguments, as the library declares it.

## Delivery

The library ships only remote delivery: the `deliver` task pushes the unit branch to the configured remote, runs `{{open_pr_command}}`, and removes the worktree. When the config declares no remote, the factory cannot be delivered as shipped. Say so and ask; do not improvise a delivery. The user may request an edit:

- an entry named `deliver` in the assembly's `tasks`: an inline TaskDef that replaces the library task of that id and keeps the exit outcomes `ok` and `failed` the `wrap` node maps;
- the `open_pr_command` entry removed from `slots` together with its only use (and absent from the slot values file), so neither `SLOT_UNFILLED` nor `SLOT_UNDECLARED` can fire.

Show the TaskDef, confirm it, and present the `wrap` line again in the walkthrough. Anything else outside the shipped library is likewise a user-requested edit, re-validated as usual.

## Type extensions

A wrapped external skill that needs a new state field gets an entry in the project catalog `.harness/types.json`, written by `types.mjs write` (assemble writes only the instantiated `phase`). Draft one JSON object in a scratch file outside the repo, `{<field name>: <type entry>}`, confirm each entry with the user (field, type, values, default, and the task that will list `state:<field>` under `produces`), then write:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/types.mjs" write --from <draft.json>
```

- An entry holds only `type`, `values`, `nullable`, `default`, `items`, `fields`. `type` is `string`, `integer`, `number`, `boolean`, `object`, `list`, `command`, `evidence-ref`, or `pointer`; a top-level entry requires `default`. A task carries no type information: its `produces` entry names the field.
- Nothing about a node, task, or mechanism belongs in an entry (`TYPE_ENTRY_IMPURE`). Which task runs a `command`-typed value is declared by that task's equipment entry `{source, family}`.
- A name the plugin catalog already defines is a collision (`TYPE_COLLISION`; core state names: `TYPE_CORE_COLLISION`). `phase` is the one legal same-key entry: assemble writes it from `phase_values`, and a later change of the vocabulary writes a new `phase` entry that keeps `maintenance`.
- The write is all-or-nothing and merges into the existing project catalog. Exit codes: 0 written, 1 rejected (`errors[]` with `code`, `field`, `path`), 2 usage, 3 input unreadable or invalid, 4 write failed, 70 internal.

## Instantiation checklist

1. Copy `graphs/coding-factory.json` to a scratch assembly outside the repo; keep the library unchanged.
2. Confirm every slot and write the slot values file (scratch, outside the repo).
3. Settle delivery (remote present, or a user-requested edit) and confirm any type extensions.
4. Confirm skill mounts (SKILL.md step 6).
5. Walk through the composed graph node by node, plus the walks (updated for any swap or edit); swap or edit rejected nodes from the library and redo steps 3-4 for what changed.
6. Write the confirmed type extensions with `types.mjs write`, only when there are any (an empty draft is rejected with `DRAFT_INVALID`).
7. Run `graph.mjs assemble <assembly> --slots <values>`; accept nothing from a rejected run.
8. Copy `coding-factory.examples.md` to `.harness/graph.examples.md`.
9. Run `graph.mjs validate .harness/graph.json --config .harness/config.json`; accept only on exit 0 with `"accepted": true`.
10. Set `graph` in the config through `init.mjs write`.

## Reading assemble and validate output

Both print one JSON object. Assemble defaults: `--out .harness/graph.json`, `--library` the plugin templates, `--types .harness/types.json`.

- `assemble` success: `ok`, `command`, `file`, `types` (`file`, `written`: the instantiated types), `summary`, `warnings`. Rejection: `ok: false`, `errors`, `warnings`, and nothing is written. Exit codes: 0 wrote, 1 rejected, 2 usage, 3 input unreadable or not JSON, 5 the definition or types file could not be written, 70 internal.
- `validate`: `ok`, `accepted`, `errors[]` (each with `code`, `invariant`, and the node, task, pipeline `entry`, edge, outcome, field, phase, or cycle involved), `warnings` (never affect acceptance), `summary` (nodes, edges, tasks, phases, close-out node, terminals, caps), `returning_edges`, `tool_gate` (`status` plus per-tool `probes`). Exit codes: 0 accepted, 1 structure rejected, 2 usage, 3 input unreadable or invalid, 4 tool gate failed, 70 internal. `--no-probe` skips the tool gate for structure-only iteration; a definition is never accepted from a `--no-probe` run alone.
- Error codes are stable and the full list is in the header of `graph.mjs` (the `invariant` field carries the readable rule). Families, with examples:

| Family | Codes |
|---|---|
| Document, caps | `DEF_FIELD_MISSING`, `SCHEMA_VERSION_UNSUPPORTED`, `SLOT_UNFILLED`, `CAP_MISSING`, `LOOP_NO_CAP` |
| Tasks | `TASK_FIELD_INVALID`, `EQUIPMENT_INVALID`, `EXIT_ARTIFACT_MISSING`, `SCRIPT_CODES_INVALID`, `BLOCKED_DECLARED` |
| Nodes | `NODE_KIND_INVALID`, `ENTRY_COUNT`, `SUCCESS_TERMINAL_COUNT`, `TERMINAL_TASK_NOT_SCRIPT`, `OUTCOME_UNPRODUCED` |
| Pipeline | `TASK_UNDECLARED`, `PARAM_UNBOUND`, `ON_OUTCOME_UNCOVERED`, `ACTION_INVALID`, `GOTO_NOT_BACKWARD` |
| Edges, guards | `EDGE_UNKNOWN_NODE`, `OUTCOME_UNCOVERED`, `GUARD_OVERLAP`, `GUARD_NOT_EXHAUSTIVE` |
| Types | `TYPE_DANGLING`, `TYPE_PARAMETERIZED_UNFILLED`, `TYPE_COLLISION` |
| Phase | `PHASE_MAINTENANCE_MISSING`, `PHASE_APPROVAL_INVALID`, `FIRST_NODE_NO_APPROVAL`, `PHASE_ROUTE_MISSING` |
| Close-out | `CLOSE_OUT_COUNT`, `CLOSE_OUT_NODE_COUNT`, `CLOSE_OUT_NOT_DOMINATING` |
| Graph | `LOOP_NO_EXIT`, `NODE_UNREACHABLE`, `NODE_NO_PATH_TO_SUCCESS` |
| Tool gate | `TOOL_MISSING`, `TOOL_NOT_STARTABLE` |
| Assemble | `ASSEMBLY_INVALID`, `ASSEMBLY_NODE_UNRESOLVED`, `ASSEMBLY_TASK_UNRESOLVED`, `SLOT_UNDECLARED`, `SLOT_VALUE_INVALID`, `WRITE_FAILED` |
