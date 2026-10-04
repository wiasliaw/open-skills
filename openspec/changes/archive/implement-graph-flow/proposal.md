## Why

The two spec changes `graph-engineering-node-specs` and `graph-plugin-architecture` define the WOR-33 execution graph and its plugin realization, but nothing ships: there is no orchestrator skill (harness-flow was deleted in `remove-harness-and-relocate-scripts` to clear the ground), no advisor agent, and no mechanics for the schema-validated work-unit folder. This change implements the core of that design.

## What Changes

- Add `skills/graph-flow/` — the orchestrator skill, successor of `harness-flow`: the clock-in/dispatch/review-gate/route loop over the 13-node graph, the two synchronous human gates, the advisor escalation tier, and the Ship/End terminals. `references/nodes.md` carries the per-node dispatch source (purpose, inputs, outputs, edges, skills, restrictions) derived from the `graph-node-*` specs, so the plugin ships the dispatch data it needs at runtime.
- Add `scripts/work-unit.mjs` (+ tests) — zero-dependency mechanics for the work-unit folder: `create`, `validate`, `write` (the single state-write gate, enforcing the `graph-plugin-work-unit-state` schema and its consistency invariants), and `archive`. The orchestrator drafts JSON; the script is the only writer of `state.json` and `log.ndjson`.
- **BREAKING** Rewrite `agents/implementor.md` and `agents/reviewer.md` as stage-agnostic graph actors driven by the dispatch payload (node identity as data), replacing the harness-flow sprint-contract wording. The reviewer gains the Write tool, confined by contract to its `review-<n>.md` report, because the architecture makes actors write their own reports into the stage directory.
- Add `agents/advisor.md` — the fourth generic actor: analysis-only root-cause advisor whose only write is `advice-<n>.md`.
- Add `docs/graph-flow.md`, a README Skills row, and CLAUDE.md updates (repo tree, Graph Execution section replacing Harness Rebuild Status).
- Decide the open memory-namespace question from `remove-harness-and-relocate-scripts`: `.harness/` stays the long-term memory and config namespace (scripts already pin `.harness/worktree-setup.json` and `.harness/config.json`; Wrap writes `.harness/`), and work units live at `.project/work-units/` with `archive/` beneath it.
- Out of scope: deep-research/SDD/TDD skills (unshipped mounts degrade to dispatch instructions), an eval suite for the loop, and re-adopting graph-flow for this repo's own CLAUDE.md.

## Capabilities

### New Capabilities

- `skill-graph-flow`: the orchestrator skill page — loop shape, dispatch construction, review gating, human gates, escalation, terminals, and the node dispatch reference.
- `work-unit-script`: the zero-dependency Node.js script owning work-unit folder mechanics with the same stdout-JSON / exit-code conventions as the sibling scripts.
- `graph-actors`: the three generic, stage-agnostic agent definitions (implementor, reviewer, advisor) and their write confinement.

### Modified Capabilities

(none — `openspec/specs/` holds no synced capabilities yet; the realized requirements live in the unarchived changes `graph-engineering-node-specs` and `graph-plugin-architecture`)

## Impact

- Added: `skills/graph-flow/` (2 files), `agents/advisor.md`, `scripts/work-unit.mjs`, `scripts/work-unit.test.mjs`, `docs/graph-flow.md`.
- Rewritten: `agents/implementor.md`, `agents/reviewer.md`.
- Edited: `README.md`, `CLAUDE.md`.
- Depends on: `graph-engineering-node-specs`, `graph-plugin-architecture` (the contracts), `remove-harness-and-relocate-scripts` (the cleared ground; merged).
