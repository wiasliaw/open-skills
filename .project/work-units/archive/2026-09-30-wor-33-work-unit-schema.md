# Work Unit: 2026-09-30-wor-33-work-unit-schema

- **Work-unit identifier**: 2026-09-30-wor-33-work-unit-schema
- **Created**: 2026-09-30
- **Work-unit tool reference**: revision inside `openspec/changes/graph-plugin-architecture/` (capability `graph-plugin-work-unit-state`)

## Contract

### Scope

Deepen the `graph-plugin-work-unit-state` capability of change `graph-plugin-architecture` into a complete field-level schema for `work-unit.json`:

1. Every field defined with: name, JSON type, allowed values (enums spelled out), writer (which actor/node sets it — orchestrator only, per the frozen single-writer rule), and lifecycle (when set, when updated, when cleared).
2. Field inventory must cover at least: `schema_version`, `id`, `created_at`/`updated_at`, `current_node` (13-node enum), `grading` (null | full | small | trivial | no-op), `fast_path`, `blocked_at` (node id | null), `spec_ref` (pointer to the contract, e.g. an OpenSpec change id), `tickets[]` (id, description, status enum pending/in-progress/passed/failed/blocked, verification_command, evidence refs), `fail_counters`, `advisor_consults[]` (problem key, count, advice summaries), `reviews[]` (target, verdict, evidence refs, date), `human_decisions[]` (gate, decision, date), `outcome` (null | shipped | ended + reason), `log[]` (append-only, ts + source + event).
3. One complete normative example document in the change (design.md or an example section).
4. Lifecycle requirements: created by Trigger, archived at Ship/End; consistency invariants (e.g. `fast_path` ⇔ `grading == trivial`; `blocked_at` null unless routed to Advisor/Escalation).

### Verification Standards

1. `openspec validate graph-plugin-architecture --strict --no-interactive` passes.
2. `claude plugin validate .` passes.

### Exclusions

- Only the `graph-plugin-architecture` change is touched; `graph-engineering-node-specs` untouched.
- No changes under `skills/`, `agents/`, `docs/`, README, `.harness/`, `.gitignore`, CLAUDE.md.
- Change stays a proposal. English only (C-001).

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | `graph-plugin-work-unit-state` carries a complete field-level work-unit.json schema (types, enums, writers, lifecycle, invariants, example) | `openspec validate graph-plugin-architecture --strict --no-interactive && claude plugin validate .` | passed (F-010) |

## Review Log

- 2026-09-30 — feature 1, round 1: pass — strict validate + plugin validate re-run pass; field inventory complete; example JSON parsed and invariant-checked; 13-node enum verified; blocked_at retention semantics verified self-consistent across spec + design; C-001/exclusions clean.

## Notes

- 2026-09-30 — Decision: deepen the existing capability rather than open a separate change; the schema's home already exists and fragmentation would drift.
