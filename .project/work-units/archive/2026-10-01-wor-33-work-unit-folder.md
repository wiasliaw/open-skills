# Work Unit: 2026-10-01-wor-33-work-unit-folder

- **Work-unit identifier**: 2026-10-01-wor-33-work-unit-folder
- **Created**: 2026-10-01
- **Work-unit tool reference**: revision inside `openspec/changes/graph-plugin-architecture/` (primary: capability `graph-plugin-work-unit-state`)

## Contract

### Scope

Revise the work-unit state design from a single `work-unit.json` to a per-work-unit folder:

1. **Layout**: `<work-units-location>/<id>/` containing `state.json` (routing state only, bounded), `log.ndjson` (append-only cross-stage event log, one JSON event per line), and one `<stage>/` directory per executed node (named by the node-id enum; skipped stages have no directory). Stage artifacts live in their stage directory: implementor outputs, reviewer reports (`review-<n>.md`), advisor consultations for that stage (`advice-<n>.md`), and human gate decision records.
2. **state.json slimming**: `log[]` moves out to `log.ndjson`; `reviews[]`, `advisor_consults[]`, `human_decisions[]` keep only machine-routing data (verdicts, counts, statuses) plus folder-relative pointers to the stage files holding the full content. Invariants recomputed accordingly (append-only now applies to `log.ndjson`).
3. **Write authority**: `state.json` and `log.ndjson` remain orchestrator-only. `<stage>/**` artifacts are written by the actor that produced them (implementor / reviewer / advisor write their own reports); human decisions are recorded by the orchestrator into the gate's stage directory. Dispatch payloads carry the stage directory path.
4. **Lifecycle**: folder created by Trigger with `state.json` + `log.ndjson`; archive moves the whole folder; frozen afterwards.
5. **Coherence**: update `graph-plugin-actor-model` (single-writer statement scoped to state.json/log.ndjson), `graph-plugin-dispatch-construction` (stage dir in payload), `graph-plugin-review-gating` (reports land in stage dir), design.md (decision + rationale; this amends the "single work-unit.json" element — rejected alternative: single JSON, bloats per stage and rewrites whole file per append). Touch `graph-engineering-node-specs` only where it names the storage form, minimally.

### Verification Standards

1. `openspec validate graph-plugin-architecture --strict --no-interactive` passes.
2. `openspec validate graph-engineering-node-specs --strict --no-interactive` passes.
3. `claude plugin validate .` passes.

### Exclusions

- Specs only; nothing under `skills/`, `agents/`, `docs/`, README, `.harness/`, `.gitignore`, CLAUDE.md.
- Changes stay proposals. English only (C-001).

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | Work-unit state specified as a per-unit folder (state.json + log.ndjson + per-stage artifact dirs) with producer-written artifacts and orchestrator-only routing state | `openspec validate graph-plugin-architecture --strict --no-interactive && openspec validate graph-engineering-node-specs --strict --no-interactive && claude plugin validate .` | passed (F-011) |

## Review Log

- 2026-10-01 — feature 1, round 1: pass — all 3 commands re-run pass; five scope areas covered; example state.json/log.ndjson parsed and pointers resolved; work-unit.json gone from node-specs change; advisor report/file phrasing adjudicated compatible (optional later reword noted); C-001/exclusions clean.

## Notes

- 2026-10-01 — User decision: folder per work unit, stage-keyed subdirectories, producer-written artifacts, root log.ndjson. Amends D-006's "single work-unit.json" element — record superseding decision at merge moment.
