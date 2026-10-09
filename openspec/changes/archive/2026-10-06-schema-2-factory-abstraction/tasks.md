# Tasks: schema-2-factory-abstraction

## 1. Type catalogs

- [x] 1.1 Define the pure-type schema (six fields; primitives incl. `command`/`evidence-ref`/`pointer`) and the shared catalog loader: merge plugin `templates/types.json` + project `.harness/types.json` in memory, collision rule, parameterized-entry rule, dangling-reference errors; unit tests.
- [x] 1.2 Author the plugin catalog `templates/types.json` (`phase` with `{{phase_values}}` slot, `contract_ref`, `tickets`, `current_ticket`, `pending_tickets`).
- [x] 1.3 Catalog writer path in graph-build: write `.harness/types.json` (new entries, instantiated parameterized entries) with purity enforced at write time; `maintenance` reserved-value check.

## 2. graph.mjs rewrite

- [x] 2.1 2.0 definition parser: top level `schema_version/name/caps/tasks/nodes/edges`; TaskDef contract (uniform `purpose`/`instructions`, `runner`/`run` structural fields with `{command, codes}` run lines, equipment incl. `{source, family}`, `exit`, `params`); node pipeline with `on` maps; reject 1.x definitions with a schema-version error.
- [x] 2.2 Structural invariants: total `on` coverage with closed action vocabulary (`next`/`goto`/outcome/`escalate`, terminal-only `done`), backward-only `goto`, one reference per task per pipeline, no declared `blocked`, script `codes` legality, outcome↔edge coverage both ways, guard exclusivity/exhaustiveness over catalog-resolved fields with per-node phase domains, reachability (entry→every node; every work node→success terminal; a phase-restricted route to success for every phase value), capped goto and returning-edge loops, single success/abandonment terminals with script-only pipelines, outcome-less unconditional entry edge, mandatory phase-approval human task at the shared first node, exactly one close-out-skill mount whose node dominates the success terminal, required exit artifacts, no dangling task/type/param references; delete 1.x path checks (design D8).
- [x] 2.3 Tool gate over every task's equipment (script `run` lines and terminal steps included).
- [x] 2.4 `assemble` subcommand: resolve assembly-graph node references, inline TaskDefs into the catalog, fill slots, instantiate parameterized plugin types through the shared catalog writer, validate in memory, write the self-contained project definition atomically; reject dangling references and unfilled slots; assemble is the only writer of `graph.json`.
- [x] 2.5 Port the committed test suite invariant-by-invariant; use the rebuilt coding-factory as the fixture.

## 3. Template library

- [x] 3.1 Restructure `skills/graph-build/templates/` into `types.json` + `tasks/` + `nodes/` + `graphs/coding-factory.json` + `coding-factory.examples.md`, reproducing the validated reference factory preserved at this change's `reference/` directory (19 tasks; 11 nodes incl. `build-direct` and `maintain` replacing build's prose branches and `restriction_overrides`; 21 edges, 20 after D10 merged the review-fail edges into `build-direct`; `not-needed` edges to `end`).
- [x] 3.2 Validate the assembled reference factory end to end with the new `graph.mjs` (assemble → validate → tool gate).

## 4. work-unit.mjs

- [x] 4.1 Type resolution through the shared catalog loader; write authorization from the dispatched task's `produces` with the re-entry bookkeeping exemption via `re_entry.items_field` (design D9); applicability derived from nodes referencing the producing task; materialization-on-first-dispatch.
- [x] 4.2 Fail-counter scopes renamed to `<node>.<task>` / `<node>.<task>:<item-id>` (re_entry-implied) alongside `edge:<from>-<to>`; pipeline position in core state.
- [x] 4.3 New red-check surface: `land-tests` and `expect-red` subcommands (land declared test files from the mirrored `tests/<ticket-id>/` tree, expect-failure run with 126/127 as defect and exit 11 `already_green` when the test passes, mapped by the red-check run line to `ticket-invalid`), recorded as `step` lines.

## 5. Skills and references

- [x] 5.1 `skills/graph-build/SKILL.md` + references: interview-as-assembly (node-by-node walkthrough, library swaps, type-extension confirmations), assemble step, updated validation flow.
- [x] 5.2 `skills/graph-run/SKILL.md` + references: per-task dispatch construction, `on` routing (incl. exit-artifact enforcement, `goto` counting, `escalate`), script-task execution, human tasks, red-check pipeline, terminal pipelines.

## 6. Docs and verification

- [x] 6.1 Update `docs/file-formats.md` (graph definition 2.0, type catalogs, no state_fields), `docs/graph-build.md`, `docs/graph-run.md`, `docs/project-anatomy.md` (`.harness/types.json`, `graph.examples.md`).
- [x] 6.2 Re-run the todo-backend demo end to end on the new schema; record a retro delta against E2E-RETRO expectations. (Marked complete at archive time by user decision; verification deferred.)
- [x] 6.3 Delete `SCHEMA-2.md` (superseded by this change's artifacts).
