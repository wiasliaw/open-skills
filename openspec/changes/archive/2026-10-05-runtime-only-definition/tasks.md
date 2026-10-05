## 1. graph.mjs — plugin-side skill-needs map

- [x] 1.1 Add `SKILL_STATE_NEEDS` const (source of truth: `open-skills:ticket` → `tickets`, `current_ticket`, `pending_tickets`); use it instead of `def.skill_state_needs` in the mounted-skill cross-check
- [x] 1.2 Add warning output: top-level `warnings` array; when a definition carries `skill_state_needs`, append `SKILL_STATE_NEEDS_INLINE_DEPRECATED` (inline copy ignored) and drop the old per-entry shape validation
- [x] 1.3 Add error code `SKILL_STATE_NEED_UNMET` (skill, field, node, graph-build Tier 3 hint) for skill-via violations; node-via keeps existing codes
- [x] 1.4 Update the header comment: definition shape loses `skill_state_needs?`, documents the warning channel and the new error code

## 2. Template and fixtures

- [x] 2.1 coding-factory.json: remove `description`, `run_time_variables`, `skill_state_needs`
- [x] 2.2 demo/.harness/graph.json: remove the same three fields; run `node scripts/graph.mjs validate demo/.harness/graph.json --config demo/.harness/config.json` (accepted, no warnings)

## 3. Tests

- [x] 3.1 graph.test.mjs: fixture drops inline `skill_state_needs` (line 55); the needs-violation test (line 498) becomes a plugin-map test expecting `SKILL_STATE_NEED_UNMET`; add a test that an inline section yields the deprecation warning and is ignored
- [x] 3.2 `node --test scripts/*.test.mjs` green

## 4. Docs

- [x] 4.1 docs/file-formats.md graph section: closed top-level list; document node `instructions`; document `state_fields` sub-fields (`scope_kind`, `executes`, `items`, `fields`, `command`/`evidence`/`pointer`/`optional` markers, consumed by work-unit.mjs); note skill needs are plugin-shipped
- [x] 4.2 templates.md: drop the "Run-time variables are not slots" section, point to dispatch.md for the variable catalog; instantiation checklist unchanged otherwise
