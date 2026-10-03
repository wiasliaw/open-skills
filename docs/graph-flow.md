# graph-flow

The orchestrator of the graph-engineering execution graph, and the successor of `harness-flow`. When a project has adopted graph execution, the main session stops producing deliverables itself and instead runs work units through a fixed graph: 13 nodes, 26 conditional edges, two human gates, an LLM advisor tier, and two legitimate terminals (Ship and End).

## The graph

```
trigger → research-explore → [human gate: grading]
   full    → spec → [human gate: spec] → ticket → build → review
   small   → ticket → …
   trivial → build → … (one review failure upgrades back to the full path)
   no-op   → end

review: pass → next ticket, or wrap when none remain
        fail < 2 → build;  fail ≥ 2 or blocked → advisor

wrap: CI green → ship;  CI red → build

advisor → retry the blocked node (≤ 2 consultations per problem)
        → human-escalation → unblocked: retry / cancel: end
```

Every artifact-producing stage runs implementor → reviewer → route; nothing counts until an independent reviewer passes it. Humans intervene only at the two gates and at escalation — never inside the build loop.

## Actors

Four fixed roles, no per-node agents — node identity is data in the dispatch payload:

- **orchestrator** — the main session running this skill. Reads state, builds each stage's dispatch from `skills/graph-flow/references/nodes.md`, records results, routes. Sole writer of `state.json` and `log.ndjson`, only through `scripts/work-unit.mjs`.
- **implementor** — generic agent that executes one stage and reports `ready-for-review` or `blocked`.
- **reviewer** — generic agent that re-runs every verification command itself and writes a `pass`/`fail` report into the stage directory.
- **advisor** — generic agent that root-causes blocked or repeatedly failing stages and writes retry guidance; consulted at most twice per problem before the human.

## The work-unit folder

Each work unit is a folder at `.project/work-units/<id>/`:

```
<id>/
├── state.json      # routing state — orchestrator-only, schema-validated
├── log.ndjson      # append-only event log — orchestrator-only
└── <stage>/        # one directory per executed node, written by its actors
    ├── …outputs…, review-<n>.md, advice-<n>.md, decision-<n>.md
```

`scripts/work-unit.mjs` owns the mechanics: `create` initializes the folder, `write` applies every state change after validating the schema and ten consistency invariants (rejecting, for example, a review without evidence, a dangling file pointer, or an outcome on a non-terminal node), and `archive` moves the frozen folder at Ship or End.

## Prerequisites

- The `init` skill has run: `.harness/config.json` and `.harness/worktree-setup.json` exist.
- Node.js >= 20.

Within a running graph, long-term memory (`.harness/`) is written only by the Wrap stage.

## Invoking

```
/open-skills:graph-flow
```

or start any deliverable-producing request in a project whose CLAUDE.md declares graph-flow adoption.
