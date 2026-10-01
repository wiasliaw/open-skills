# Work Unit: 2026-10-01-wor-33-advisor-wording

- **Work-unit identifier**: 2026-10-01-wor-33-advisor-wording
- **Created**: 2026-10-01
- **Work-unit tool reference**: revision inside `openspec/changes/graph-engineering-node-specs/` (capability `graph-node-advisor`)

## Contract

### Scope

Single wording fix in `openspec/changes/graph-engineering-node-specs/specs/graph-node-advisor/spec.md`: align the advisor's output phrasing with the folder-state design — the analysis report is written by the advisor itself into the addressed stage's directory (`<stage>/advice-<n>.md`), not merely "returned as a report". No semantic change beyond closing this gap with `graph-plugin-architecture`'s actor-model/work-unit-state specs.

### Verification Standards

1. `openspec validate graph-engineering-node-specs --strict --no-interactive` passes.
2. `claude plugin validate .` passes.
3. `grep -n "stage directory" openspec/changes/graph-engineering-node-specs/specs/graph-node-advisor/spec.md` shows the new wording.

### Exclusions

- Only that one spec file (plus tasks/design of the same change only if coherence demands, minimally). No other node specs, no `graph-plugin-architecture`, nothing outside `openspec/changes/`.
- Change stays a proposal. English only (C-001).

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | Advisor node spec states the report is written by the advisor into the addressed stage directory | `openspec validate graph-engineering-node-specs --strict --no-interactive && claude plugin validate . && grep -n "stage directory" openspec/changes/graph-engineering-node-specs/specs/graph-node-advisor/spec.md` | passed (F-012) |

## Review Log

- 2026-10-01 — feature 1, round 1: pass — all 3 commands re-run pass; 4-line wording diff only; alignment with actor-model/review-gating/work-unit-state confirmed; read-only carve-out judged in-scope coherence; C-001/exclusions clean.

## Notes

- 2026-10-01 — Cleanup flagged by reviewer in 2026-10-01-wor-33-work-unit-folder (adjudicated compatible, pass-with-note); user chose immediate fix over batching.
