# Work Unit: 2026-09-30-wor-33-advisor-node

- **Work-unit identifier**: 2026-09-30-wor-33-advisor-node
- **Created**: 2026-09-30
- **Work-unit tool reference**: revisions inside `openspec/changes/graph-engineering-node-specs/` and `openspec/changes/graph-plugin-architecture/`

## Contract

### Scope

Introduce the Advisor into the WOR-33 graph design, revising BOTH existing OpenSpec change proposals coherently:

1. **Graph revision** (`graph-engineering-node-specs`):
   - New node: Advisor — an LLM agent that performs root-cause analysis and produces retry guidance for blocked or repeatedly failing stages. Cheap escalation tier before the human.
   - Escalation rewiring: any stage `blocked` → Advisor (state records `blocked_at`); Review `fail ≥ 2 (same error recurring)` → Advisor; non-Build in-node review loops' 2nd fail → Advisor. Advisor out-edges: `advice (consults < 2)` → the `blocked_at` node (retry with guidance); `2 consultations both failed` → Human Escalation. Human Escalation out-edges become: `unblocked` → the `blocked_at` node (generalized resume — resolves the flagged gap); `cancel` → End.
   - Update the execution-model edge list, loop-cap principle (fail ≥ 2 → Advisor; Advisor ≤ 2 consults → Human), and the Human Escalation node spec accordingly. Human intervention stays concentrated at the two gates + Human Escalation; Advisor is an LLM, not a human stop.
2. **Plugin architecture revision** (`graph-plugin-architecture`):
   - Actor model: four fixed roles (orchestrator, implementor, reviewer, advisor). Advisor is a generic read-only analysis agent; its dispatch carries the failure history, review logs, and the blocked stage's spec.
   - State schema additions: `blocked_at`, `advisor_consults` (per problem), advisor advice entries in the log/consult records.
   - Review-gating/escalation flow updated to insert the Advisor tier.

### Verification Standards

1. `openspec validate graph-engineering-node-specs --strict --no-interactive` passes.
2. `openspec validate graph-plugin-architecture --strict --no-interactive` passes.
3. `claude plugin validate .` passes.

### Exclusions

- Specs only — no changes under `skills/`, `agents/`, `docs/`, README, `.harness/`, `.gitignore`, CLAUDE.md.
- Changes stay proposals — not applied, not archived.
- Linear WOR-33 body and the tldraw whiteboard are updated by the orchestrator after the merge moment, not by the implementor.
- English only (C-001); C-002 not triggered.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | Advisor node/actor integrated coherently across both OpenSpec change proposals (graph edges + plugin realization + state schema) | `openspec validate graph-engineering-node-specs --strict --no-interactive && openspec validate graph-plugin-architecture --strict --no-interactive && claude plugin validate .` | passed (F-009) |

## Review Log

- 2026-09-30 — feature 1, round 1: pass — all 3 commands re-run pass; 26-edge set independently recounted and consistent across 4 stated locations; advisor semantics verified; no direct stage→Human-Escalation edges; C-001/exclusions clean. Non-blocking cosmetic nit: uneven blank lines in graph-plugin-architecture design.md Open Questions section.

## Notes

- 2026-09-30 — User decisions: advisor tier inserted before human (consistent with owner's global working principle); advisor max 2 consultations on the same problem, both failed → Human Escalation; unblocked (advisor advice and human alike) resumes at `blocked_at` node. This supersedes the "exactly three fixed roles" part of D-005 — record D-006 at the merge moment.
