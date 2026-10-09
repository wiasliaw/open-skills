# open-skills

A Claude Code plugin for graph engineering. `graph-init` builds the factory: it defines nodes, edges, tasks, and equipment for a project. `graph-run` operates the factory: an orchestrator carries work units along the edges.

## Vocabulary

- **Node**: a station (entry, work, or terminal) whose work is an ordered pipeline of tasks; it surfaces outcomes for the edges to route.
- **Task**: the unit of execution — one executor (`script`, `llm`, `validator`, or `human`) plus its equipment and a machine-checkable exit.
- **Edge**: data flow, a condition that reads state and decides what runs next.
- **State**: the work-unit folder, shared across the whole graph.
- **Skill**: equipment mounted on a task; never a node or a task itself.

## Skills

<!-- skills-table -->
|Skill|Description|Docs|
|---|---|---|
|graph-init|Builds the factory: bootstraps the project config, composes the project's graph from the shipped template library through an interview, assembles it, and validates it (structure plus tool gate) before any run.|[docs](docs/graph-init.md)|
|graph-run|Operate the factory: the main session orchestrates a work unit through the project's validated graph, dispatching worker, reviewer and advisor and escalating to you only when needed.|[docs](docs/graph-run.md)|
|ticket|Split a contract into small tickets, each defined by an executable test written before implementation (red before green).|[docs](docs/ticket.md)|
|wrap|End a line of work cleanly: verify, consolidate draft deltas into pending memory entries, clean residue, close workflow state, and hand over with a handoff record.|[docs](docs/wrap.md)|
|use-worktree|Isolate a line of work in its own git worktree (`wu/<id>`), with creation, reuse and recovery handled by a script.|[docs](docs/use-worktree.md)|
|request-code-review|Commission an independent code review: the request carries scope, verification commands, restrictions and acceptance criteria, and reviewers verify independently and return a pass/fail verdict with WHAT/WHY/FIX evidence.|[docs](docs/request-code-review.md)|
|receive-code-review|Triage external review feedback into adopt, decline or needs-clarification with recorded reasons, then fold adopted items in with verification|[docs](docs/receive-code-review.md)|
|codewalk|Interactive, reader-paced walkthrough of code you don't know: one verified stop at a time, anchored to file:line at a pinned commit, landing a reading record.|[docs](docs/codewalk.md)|

## Architecture

- `skills/`: the eight skills above, each with a compact `SKILL.md` and on-demand `references/` (graph-init also ships `templates/`, the layered library: type catalog, tasks, nodes, assembly graphs, and example walks).
- `agents/`: `worker`, `reviewer` and `advisor`, the roles dispatched along the graph.
- `scripts/`: zero-dependency Node.js (>= 20) deterministic scripts, each with a `node --test` suite: `graph.mjs` (assemble, validator, and tool gate), `types.mjs` (type catalogs), `work-unit.mjs` (write gate and red check), `memory.mjs`, `worktree.mjs`, `init.mjs`.
- `docs/`: one page per user-facing skill, plus reference pages: [file formats](docs/file-formats.md) (config, graph definition, work-unit folder, delta entries) and [project anatomy](docs/project-anatomy.md) (consumer-project layout and write authority).

## Development

```
claude plugin validate .
node --test "scripts/*.test.mjs"
openspec validate --specs --no-interactive
```
