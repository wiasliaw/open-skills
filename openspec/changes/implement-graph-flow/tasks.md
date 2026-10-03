## 1. State mechanics

- [x] 1.1 Implement `scripts/work-unit.mjs` (create, validate, write, archive) enforcing the `graph-plugin-work-unit-state` schema and invariants
- [x] 1.2 Write `scripts/work-unit.test.mjs` covering create, the write gate's rejections (schema, invariants 1/2/4/5/6/7/9/10, log sequence, immutables), archive, and the spec's mid-flight shape

## 2. Orchestrator skill

- [x] 2.1 Write `skills/graph-flow/SKILL.md` — actors, prerequisites, folder contract, loop, gates, escalation, dispatch construction, terminals
- [x] 2.2 Write `skills/graph-flow/references/nodes.md` — per-node dispatch source for all thirteen nodes, derived from the `graph-node-*` specs

## 3. Actors

- [x] 3.1 Rewrite `agents/implementor.md` as the stage-agnostic graph implementor
- [x] 3.2 Rewrite `agents/reviewer.md` as the stage-agnostic graph reviewer (Write tool confined to its report)
- [x] 3.3 Add `agents/advisor.md`

## 4. Docs and repo

- [x] 4.1 Add `docs/graph-flow.md`; add the README Skills row and slash command
- [x] 4.2 Update CLAUDE.md (repo tree; Graph Execution section replacing Harness Rebuild Status)

## 5. Validate

- [x] 5.1 `node --test scripts/*.test.mjs`
- [x] 5.2 `claude plugin validate .`
- [x] 5.3 `openspec validate implement-graph-flow --strict --no-interactive`
- [ ] 5.4 Dry-run the loop on one trivial-graded work unit in a scratch repo (deferred to the first dogfooding unit)
