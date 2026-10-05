## Context

`graph.mjs` today reads an optional `skill_state_needs` section from the definition (graph.mjs:675) and cross-checks that every mounting node has the named fields applicable. The facts in that section describe the plugin's own skills (`open-skills:ticket` → tickets/current_ticket/pending_tickets), so each project's definition carries a copy that can go stale. `description` and `run_time_variables` are template prose copied verbatim into every instantiated definition; no script reads either.

## Goals / Non-Goals

**Goals:**
- A project definition contains exactly what runtime consumes; its top level is closed.
- Skill state needs have one source of truth, shipped with the validator, applied at every validation (initial and every Tier 3 edit / resume).
- Upgrades that tighten a skill's needs fail diagnosably, not as generic state errors.

**Non-Goals:**
- No registry for third-party skills' needs (unknown skills stay unchecked, mirroring the profile-less degradation rule).
- No change to `state_fields` semantics or the write gate (`work-unit.mjs` never read `skill_state_needs`).
- No rejection of legacy fields yet — one release of ignore-with-warning first.

## Decisions

- **Map lives as a const inside `graph.mjs`, not a separate JSON file.** The script's contract is zero-dependency and self-contained; a sidecar file adds a load path and a failure mode for no benefit at this size. When the map grows, extraction is mechanical.
- **Warning channel: a top-level `warnings` array in the script's JSON output.** Additive, so existing consumers that branch on `ok`/`errors` are unaffected. Inline `skill_state_needs` is ignored with warning code `SKILL_STATE_NEEDS_INLINE_DEPRECATED`; `description`/`run_time_variables` are unknown keys and stay silently ignored (they were never schema).
- **New error code `SKILL_STATE_NEED_UNMET`** replaces the reuse of `STATE_FIELD_UNDECLARED`/`STATE_FIELD_INAPPLICABLE_AT_NODE` for the skill-via case; message carries skill, field, node, and the hint "edit the definition via graph-build (Tier 3)". Node-via cases keep the existing codes.
- **Template keeps `slots` (consumed at instantiation) and nothing else build-time.** Slot semantics are unchanged; `templates.md` loses its "run-time variables are not slots" section and instead points to `dispatch.md` for the variable catalog.

## Risks / Trade-offs

- [Plugin upgrade blocks a mid-flight unit's resume when a skill's needs tighten] → Dedicated error code plus edit-flow hint; the operator adds the field via Tier 3 and revalidates.
- [Inline map silently diverging from plugin map during the tolerance release] → The inline copy is never read; the warning says so explicitly, so divergence cannot change behavior.
- [Demo definition drift] → Re-instantiate demo/.harness/graph.json in this change and validate it.
