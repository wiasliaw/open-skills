# File formats

The machine-readable files the plugin reads and writes in a consumer project. Each format has exactly one writing script; the script's `--help` and header comment are the authoritative contract, this page is the overview. See [project anatomy](project-anatomy.md) for where these files live and who may write what.

## `.harness/config.json` — project config

Written only by the bootstrap through `scripts/init.mjs` (`validate` / `write` / `read`); every other script and actor only reads it, each consuming only its own section. A hand-written config is a violation. The harness writers (`init.mjs write`, `types.mjs write`, `graph.mjs assemble`) run only in the main checkout: invoked inside a linked worktree they refuse with the stable error code `in_worktree` (`IN_WORKTREE` in `types.mjs`/`graph.mjs`), exit nonzero, and write nothing, so `.harness/` can never diverge between a worktree and the main checkout.

```jsonc
{
  "schema_version": "1.0.0",            // validated against the script's supported versions
  "vcs": {                              // required
    "default_branch": "main",
    "remote": "origin"                  // optional
  },
  "locations": {                        // required; all repo-relative, no ".." segments
    "work_units": ".project/work-units",
    "archive":    ".project/work-units/archive",
    "worktrees":  ".project/worktrees"
  },
  "graph": ".harness/graph.json",       // optional; omitted = no graph = no run
  "worktree_setup": {                   // required even when empty (explicit empty lists)
    "setup": ["npm ci"],                // commands run in a fresh worktree, in order
    "copy":  [                          // untracked assets copied from the main checkout
      { "path": ".env", "readonly": false }   // readonly: true may be symlinked; mutable entries are copied
    ]
  },
  "memory": {                           // optional section
    "ledger": ".harness/deltas",        // required when the section is present
    "budgets": { "ARCHITECTURE.md": 200, "CONSTRAINTS.md": 100 },  // bare file names (resolved under .harness/), line budget each
    "pending_delta_threshold": 10,      // optional maintenance thresholds
    "budget_pressure_threshold": 0.8
  }
}
```

There is no command catalog in the config: what a task can execute is declared on that task in the graph definition.

## Graph definition — the factory

Produced by graph-init — assembled from the shipped template library by `scripts/graph.mjs assemble`, then owned by the project — and accepted only after `scripts/graph.mjs validate` passes, structure plus tool gate. `.harness/graph.json` is written only by `assemble`; hand-editing it is a violation, and an edit is a re-assembly. Top-level shape (full field list and stable error codes in the `graph.mjs` header):

- `schema_version` (`2.x.y`), `name`, `caps`, `tasks`, `nodes`, `edges` — and nothing else at the top level: the definition holds only what runtime consumes. Routing is edges and guards only (`phase` is an ordinary state field), types live in the type catalogs (below), and slots are filled before the definition exists. A 1.x definition is rejected (`SCHEMA_VERSION_UNSUPPORTED`) and must be re-assembled.
- `caps` — `failure`, `advisor_consultations`, `edge_revisit`, optional `total_failure` (default: twice `failure`)
- `tasks` — the task catalog, `{ <task-id>: TaskDef }`; every pipeline entry resolves in it, so a task shared by several nodes has one definition. A TaskDef is one executor plus its equipment and a machine-checkable exit:
  - `executor` — `script | llm | validator | human`: the orchestrator runs a script task as commands, dispatches a worker for an llm task, dispatches a reviewer (or runs the checks itself) for a validator task, and puts a human task to the human in the session
  - `purpose` — one line for humans; `instructions` — text handed verbatim to whoever carries out the task (the worker's operating prose, the validator's definition of pass, the human's decision ask), required except for script tasks
  - `equipment` — `{ skills, commands, mcp }`, everything the task may use. A command is a plain invocation, a parameterized family (`{base, args}`), or a state-sourced entry `{source: "state:<field-path>", family: "<base>"}`: a run-time-generated command read from that state path must fall within the named family
  - `reads`, `produces` — data flow. A `produces` entry `state:<field>` is both the authorization to write that field and its type reference (the field name is the catalog key); other entries name stage artifacts
  - `restrictions` — the task's MUST NOTs, written into its dispatch and checked by the verification
  - `exit` — `{ outcomes, artifact }`: the closed set of outcomes the task can end in (`blocked` is never declared; it is universal) and, required for llm, validator, and human tasks, the stage file that must exist for the exit to count
  - `runner` — validator only: `reviewer` (default) or `orchestrator`
  - `run` — script only: commands run in order, stopping at the first non-zero exit. An entry is a command string or `{command, codes}`, where `codes` maps specific non-zero exit statuses of that one command to declared outcomes (126 and 127 are never mappable); the task's outcome is `ok`, the mapped outcome, or `failed`
  - `params` — names the referencing pipeline entry binds through `with`; each `{{param}}` in the task is replaced by that binding
- `nodes` — `{ id, kind, purpose, pipeline, outcomes, re_entry?, terminal_kind? }`; `kind` is one of `entry | work | terminal`:
  - a work node's `pipeline` is an ordered list of entries `{ use, with?, on }`: `use` names a catalog task, `with` binds its params, and `on` maps every exit outcome of that task to exactly one action (below). A task appears at most once per pipeline. `outcomes` is the node's routable surface
  - `re_entry` — optional `{ list_field, order, progress_field, items_field }`: the orchestrator selects the next item of the list field itself, with no dispatch, and the failure scope of every task that reads the progress field becomes per item while one is selected. `items_field` is the list of `{id, ...}` records the selection walks
  - the entry node has no pipeline; a terminal declares `terminal_kind` (`success | abandonment`) and a pipeline of script tasks only, with no outcomes and no outgoing edges
- `edges` — `{ from, to, outcome, guard: [{field, op, value?}] }`; a guard is a conjunction over state fields resolved through the type catalogs (`phase` is an ordinary state field), `[]` is the unconditional guard, and the operator set is closed (`eq ne in not-in lt lte gt gte`, plus `empty`/`not-empty` and count comparisons for lists). For one outcome the guards must be mutually exclusive and jointly exhaustive over the states that can reach the node. The entry node's single outgoing edge names no outcome and carries `[]`

The `on` actions are a closed vocabulary; conditions never appear inside a node, because state-dependent branching surfaces as a node outcome and edge guards decide it:

- `next` — advance to the following entry (illegal on the last entry)
- `goto:<earlier task>` — return to an earlier entry of the same pipeline: the declared form of retry-in-place and send-back, counted by the fail counters and capped
- a node outcome — leave the pipeline and surface that outcome for edge routing
- `escalate` — hand the failure to the in-place fallback chain, for failures with no earlier task to return to
- `done` — complete a terminal pipeline (legal only there, and never a node outcome)

A skill's state needs are not a separate map: the task that mounts the skill declares them in its `reads` and `produces`.

## Type catalogs — state-field types

State-field types live in exactly two JSON catalogs, each an object keyed by state field name: the plugin catalog `skills/graph-init/templates/types.json` (shipped, read-only for projects) and the project catalog `.harness/types.json` (written only by graph-init, through `scripts/types.mjs write`; `assemble` writes the instantiated `phase` entry through the same writer). The graph definition has no type section and a TaskDef carries no type information: a `produces: ["state:<field>"]` entry names the catalog key, and a name no catalog defines is a dangling reference (`TYPE_DANGLING`).

```jsonc
{
  "tickets": {                          // keyed by state field name
    "type": "list",
    "default": [],                      // required on top-level entries only
    "items": {
      "type": "object",
      "fields": {
        "id": { "type": "string" },
        "status": { "type": "string", "values": ["pending", "in-progress", "passed", "failed", "blocked"] },
        "verification_command": { "type": "command" },
        "evidence_refs": { "type": "list", "items": { "type": "evidence-ref" } }
      }
    }
  }
}
```

- An entry holds only the six pure keys `type`, `values`, `nullable`, `default`, `items` (lists), and `fields` (objects). Nothing about a node, task, or mechanism belongs in a type: `types.mjs write` rejects such a key (`TYPE_ENTRY_IMPURE`). Which task may run a stored command is declared by that task's `{source, family}` equipment entry, and per-item failure scoping by the node's `re_entry`
- The primitive types are `string`, `integer`, `number`, `boolean`, `object`, `list`, and three that stand for values the write gate checks specially: `command` (a run-time-generated invocation), `evidence-ref` (`{kind, ref}`), and `pointer` (a folder-relative file pointer)
- A plugin entry carrying a `{{slot}}` is parameterized: unusable until graph-init instantiates it into the project catalog under the same key. The reference is `phase`, whose `values` is `{{phase_values}}`; the instance must contain the reserved value `maintenance`. That is the only legal same-key overlap between the catalogs; any other collision is rejected (`TYPE_COLLISION`)
- The registry is the in-memory merge of the two catalogs, built at load by `graph.mjs` and `work-unit.mjs` through the shared loader (`types.mjs`). It is never written to a file: a written registry would be a second definition that drifts. Because runs read the plugin catalog in place, a plugin update can change type truth for units in flight

## Assembly graph — the input of `assemble`

The template library is `skills/graph-init/templates/`: `types.json` (the plugin catalog), `tasks/<id>.json` (one TaskDef per file), `nodes/<id>.json` (one node per file), `graphs/coding-factory.json` (the assembly graph), and `coding-factory.examples.md` (canonical phase walks, non-normative: the validator never reads them; graph-init copies them to `.harness/graph.examples.md`). The assembly graph is a JSON object with exactly these keys:

- `schema_version`, `name`, `caps`, `edges` — as in the definition
- `slots` — `{ <name>: <description> }`, every build-time value the composition still needs (reference: `phase_values`, `test_command`, `lint_command`, `open_pr_command`). `assemble --slots <values.json>` fills them from a `{slot: value}` object; a missing value is `SLOT_UNFILLED`
- `nodes` — each entry a library node id or an inline node object
- `tasks` — optional `{ <task-id>: TaskDef }`: a task id resolves here first, then from `tasks/<id>.json`, so a project adds or replaces a task here

`assemble` inlines every referenced TaskDef into the definition's task catalog, fills the slots (task `{{param}}`s stay for their pipeline entry's `with`), instantiates the parameterized plugin types into the project catalog, validates the composition in memory, and only then writes the instantiated types and the definition. The written definition is self-contained: six sections, no `slots`, no reference to the library, and later library updates never change it.
## Work-unit folder — execution state

One folder per unit under the config's `work_units` location, written only by the orchestrator through `scripts/work-unit.mjs` (`create` / `validate` / `write` / `archive`). Contents:

- `state.json` — routing truth only (`schema_version` `2.0.0`). Core fields, present for every unit: `schema_version`, `id`, `created_at`, `updated_at`, `trigger` (`source` ∈ `prompt | issue | ci-failure | maintenance-due`, `request`, `branch`), `current_node`, `current_task` (the pipeline position: a task of the current node's pipeline, or null), `phase`, `walked_path`, `blocked_at`, `fail_counters` (`{<scope>: {signature, count, total}}`), `advisor_consults`, `reviews`, `human_decisions`, `outcome`, `outcome_reason`. A counter scope is `<node>.<task>`, `<node>.<task>:<item-id>` (where the node's `re_entry` rule applies: the id names a record of its `items_field`), or `edge:<from>-<to>`; a review's `scope` is one of the first two forms. Everything else is graph-declared: a field exists because some task lists `produces: ["state:<field>"]`, with its type resolved from the merged type catalogs by field name. The write gate materializes it with its catalog default the moment its applicability becomes true (a node whose pipeline references the producing task is first reached), rejects a field outside its applicability, and accepts a change only while the producing task is in flight (plus bounded re-entry bookkeeping).
- `log.ndjson` — append-only event log, one JSON object per line, strictly increasing ids; the gate requires existing bytes to be a byte-prefix of any full-log draft. The `step` event records every command the orchestrator runs itself (script-task lines, terminal pipelines and the red check included, and orchestrator-run validator checks): command, exit status, truncated output tail — there are no step-record or run-dump files.
- `<node-id>/` — one directory per executed node (skipped nodes have none), shared by the node's tasks and holding stage artifacts: worker deliverables, `report-<n>.md` (the worker's returned report, transcribed verbatim by the orchestrator), `review-<n>.md`, `verify-<n>.md` (the verdict record of an orchestrator-run validator task), `advice-<n>.md`, `decision-<n>.md`, draft deltas `delta-<n>.md`, `worktree.md`, and in the decomposition stage each ticket's test files under `tests/<ticket-id>/`.
- `handoff.md` — the closing summary at the folder root, present once the unit reaches a terminal.

A rejected draft writes nothing; archival moves the whole folder to the archive location and freezes it.

## Delta entries and the memory index

Long-term memory lives under `.harness/`: budgeted current-truth documents plus a ledger of delta entries (one markdown file per entry, ordinarily merged only by the close-out stage). `scripts/memory.mjs` owns the mechanics: `index` generates the index from frontmatter (never written to disk, never committed), `validate` checks entry shape and budgets, `check` evaluates maintenance thresholds.

Entry frontmatter, all required: `id` (`<unit-id>.<node-id>.<n>`, dot-separated), `target` (the current-truth document it proposes to change), `date` (ISO-8601 UTC), `title`, `type` (e.g. `decision`, `feature`, `constraint-change`, `architecture-change`), `status` (`pending | applied | rejected` — only the maintenance apply unit flips it). Optional relation fields, each a list of entry ids: `supersedes`, `depends-on`, `decided-by`, `verified-by`. The body states the outcome and its rationale. Draft deltas (`<stage>/delta-<n>.md` inside a work unit) use the same format.
