## Why

The project's graph definition (`.harness/graph.json`) carries fields no runtime consumer reads: `description` and `run_time_variables` are prose the validator ignores, and `skill_state_needs` is a build-time cross-check whose facts belong to the plugin's skills, not to every project's copy — a stale copy in a definition validates wrongly and fails only at run time. The e2e review agreed the definition should hold exactly what the orchestrator and scripts consume.

## What Changes

- The shipped template drops `description`, `run_time_variables`, and `skill_state_needs`; a project definition's top level is exactly `schema_version`, `name`, `caps`, `phase`, `state_fields`, `nodes`, `edges`.
- The skill-to-state-needs map moves plugin-side: shipped inside `graph.mjs` as the single source of truth, applied at every validation. Skills absent from the map stay unchecked (same degradation rule as profile-less mounts).
- A definition still carrying `skill_state_needs` is accepted with a deprecation warning naming the field (one release of tolerance; the inline copy is ignored, never merged). **BREAKING** later when tolerance ends.
- Skill-needs violations get their own stable error code (`SKILL_STATE_NEED_UNMET`) with a hint pointing at the graph-build edit flow, so a plugin upgrade that blocks a resume is diagnosable.
- `docs/file-formats.md` documents the node `instructions` field and the `state_fields` sub-fields (`scope_kind`, `executes`, `items`, `fields`, and the `command`/`evidence`/`pointer`/`optional` markers) that `work-unit.mjs` consumes; `templates.md` drops its `run_time_variables` section (the variable catalog lives in `dispatch.md`).
- The demo definition is re-instantiated without the three fields.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-definition`: the definition's top-level shape is closed to runtime-consumed sections; skill state needs become plugin-shipped facts applied at validation, with a deprecation path for inline copies.

## Impact

- Scripts: `scripts/graph.mjs` (built-in needs map, warning, new error code).
- Tests: `scripts/graph.test.mjs` (lines 55, 498 area).
- Template: `skills/graph-build/templates/coding-factory.json`.
- Docs: `docs/file-formats.md`, `skills/graph-build/references/templates.md`.
- Fixtures: `demo/.harness/graph.json`.
