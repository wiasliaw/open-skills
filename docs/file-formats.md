# File formats

The machine-readable files the plugin reads and writes in a consumer project. Each format has exactly one writing script; the script's `--help` and header comment are the authoritative contract, this page is the overview. See [project anatomy](project-anatomy.md) for where these files live and who may write what.

## `.harness/config.json` — project config

Written only by the bootstrap through `scripts/init.mjs` (`validate` / `write` / `read`); every other script and actor only reads it, each consuming only its own section. A hand-written config is a violation.

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

There is no command catalog in the config: what a node can execute is declared on that node in the graph definition.

## Graph definition — the factory

Produced by graph-build (instantiated from a shipped template, then owned by the project) and accepted only after `scripts/graph.mjs validate` passes, structure plus tool gate. Top-level shape (full field list in the `graph.mjs` header):

- `schema_version`, `name` — and nothing else at the top level beyond the sections below: the definition holds only what runtime consumes (build-time prose such as a template description never lands in a project definition)
- `caps` — `failure`, `advisor_consultations`, `edge_revisit`, optional `total_failure` (default: twice `failure`)
- `phase` — `{ <key>: { meaning, path: [nodeId...], restriction_overrides? } }`; the reserved key `maintenance` is required; every path starts at the shared phase-approval node and ends at the success terminal through the close-out node
- `state_fields` — `{ <name>: { type, values?, nullable?, default, node | phases, executes?, scope_kind?, items?, fields? } }`; the single registry of per-unit state beyond the core contract, bound to exactly one of an owning `node` or a list of `phases`. The sub-fields are consumed by the state write gate (`work-unit.mjs`): `executes` names the node whose mounted command families must cover each command-marked value; `scope_kind` on a list of `{id}` objects declares a failure-counter scope kind `<scope_kind>:<id>`; `items`/`fields` describe element and object shape, where a value spec may carry the markers `command` (run-time-generated invocation), `evidence` (evidence ref `{kind, ref}`), `pointer` (folder-relative file pointer), and `optional`
- `nodes` — `{ id, type, purpose, instructions, reads, produces, verification, outcomes, mounts, restrictions, human_approval, pre_steps?, post_steps?, re_entry?, terminal_kind, steps }`; `type` is one of `entry | llm | deterministic | tool | validator | terminal`; `instructions` is the node's operational prose, handed verbatim to the dispatched actor as part of the stage instructions; `mounts` is `{ skills, commands, mcp }`, and a command may be a parameterized family (`{base, args}` or a string with a placeholder token)
- `edges` — `{ from, to, outcome, guard: [{field, op, value?}] }`; a guard is a conjunction over declared state fields and `phase`, `[]` is the unconditional guard, and the operator set is closed (`eq ne in not-in lt lte gt gte`, plus `empty`/`not-empty` and count comparisons for lists)

The state fields a mounted skill reads or writes are not declared in the definition: the validator ships the skill-needs map (plugin-side source of truth) and checks it at every validation; a definition still carrying the retired `skill_state_needs` section validates with a deprecation warning and the inline copy is ignored.

A shipped template (`skills/graph-build/templates/`) carries `{{slot}}` placeholders instead of concrete project commands; graph-build fills them at instantiation, and an unfilled slot is a validation error.

## Work-unit folder — execution state

One folder per unit under the config's `work_units` location, written only by the orchestrator through `scripts/work-unit.mjs` (`create` / `validate` / `write` / `archive`). Contents:

- `state.json` — routing truth only. Core fields, present for every unit: `schema_version`, `id`, `created_at`, `updated_at`, `trigger` (`source` ∈ `prompt | issue | ci-failure | maintenance-due`, `request`, `branch`), `current_node`, `phase`, `walked_path`, `blocked_at`, `fail_counters` (`{<scope>: {signature, count, total}}`), `advisor_consults`, `reviews`, `human_decisions`, `outcome`, `outcome_reason`. Everything else is graph-declared: the write gate materializes each `state_fields` declaration with its default the moment its applicability becomes true, and rejects a field outside its applicability.
- `log.ndjson` — append-only event log, one JSON object per line, strictly increasing ids; the gate requires existing bytes to be a byte-prefix of any full-log draft. The `step` event records every deterministic command the orchestrator runs (pre/post/terminal steps, orchestrator-run verification checks): command, exit status, truncated output tail — there are no step-record or run-dump files.
- `<node-id>/` — one directory per executed node (skipped nodes have none), holding stage artifacts: worker deliverables, `report-<n>.md` (the worker's returned report, transcribed verbatim by the orchestrator), `review-<n>.md`, `advice-<n>.md`, `decision-<n>.md`, draft deltas `delta-<n>.md`, `worktree.md`.
- `handoff.md` — the closing summary at the folder root, present once the unit reaches a terminal.

A rejected draft writes nothing; archival moves the whole folder to the archive location and freezes it.

## Delta entries and the memory index

Long-term memory lives under `.harness/`: budgeted current-truth documents plus a ledger of delta entries (one markdown file per entry, ordinarily merged only by the close-out stage). `scripts/memory.mjs` owns the mechanics: `index` generates the index from frontmatter (never written to disk, never committed), `validate` checks entry shape and budgets, `check` evaluates maintenance thresholds.

Entry frontmatter, all required: `id` (`<unit-id>.<node-id>.<n>`, dot-separated), `target` (the current-truth document it proposes to change), `date` (ISO-8601 UTC), `title`, `type` (e.g. `decision`, `feature`, `constraint-change`, `architecture-change`), `status` (`pending | applied | rejected` — only the maintenance apply unit flips it). Optional relation fields, each a list of entry ids: `supersedes`, `depends-on`, `decided-by`, `verified-by`. The body states the outcome and its rationale. Draft deltas (`<stage>/delta-<n>.md` inside a work unit) use the same format.
