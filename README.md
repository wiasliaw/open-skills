# open-skills

A Claude Code plugin for graph engineering. `graph-build` builds the factory: it defines nodes, edges, verification, and skill mounts for a project. `graph-run` operates the factory: an orchestrator carries work units along the edges.

## Vocabulary

- **Node**: a unit of work (entry, LLM call, deterministic function, tool call, validator, or terminal) that defines what is done and how it is verified.
- **Edge**: data flow, a condition that reads state and decides what runs next.
- **State**: the work-unit folder, shared across the whole graph.
- **Skill**: a capability mounted on a node; never a node itself.

## Skills

<!-- skills-table -->
|Skill|Description|Docs|
|---|---|---|
|graph-build|Builds the factory: bootstraps the project config, instantiates a template graph definition with command slots filled, and validates it (structure plus tool gate) before any run.|[docs](docs/graph-build.md)|
|graph-run|Operate the factory: the main session orchestrates a work unit through the project's validated graph, dispatching worker, reviewer and advisor and escalating to you only when needed.|[docs](docs/graph-run.md)|
|ticket|Split a contract into small tickets, each defined by an executable test written before implementation (red before green).|[docs](docs/ticket.md)|
|wrap|End a line of work cleanly: verify, consolidate draft deltas into pending memory entries, clean residue, close workflow state, and hand over with a handoff record.|[docs](docs/wrap.md)|
|use-worktree|Isolate a line of work in its own git worktree (`wu/<id>`), with creation, reuse and recovery handled by a script.|[docs](docs/use-worktree.md)|
|request-code-review|Commission an independent code review: the request carries scope, verification commands, restrictions and acceptance criteria, and reviewers verify independently and return a pass/fail verdict with WHAT/WHY/FIX evidence.|[docs](docs/request-code-review.md)|
|receive-code-review|Triage external review feedback into adopt, decline or needs-clarification with recorded reasons, then fold adopted items in with verification|[docs](docs/receive-code-review.md)|

## Architecture

- `skills/`: the seven skills above, each with a compact `SKILL.md` and on-demand `references/` (graph-build also ships `templates/` with the template graph definition).
- `agents/`: `worker`, `reviewer` and `advisor`, the roles dispatched along the graph.
- `scripts/`: zero-dependency Node.js (>= 20) deterministic scripts, each with a `node --test` suite: `graph.mjs` (validator and tool gate), `work-unit.mjs` (write gate), `memory.mjs`, `worktree.mjs`, `init.mjs`.
- `docs/`: one page per user-facing skill, plus reference pages: [file formats](docs/file-formats.md) (config, graph definition, work-unit folder, delta entries) and [project anatomy](docs/project-anatomy.md) (consumer-project layout and write authority).

## Development

```
claude plugin validate .
node --test "scripts/*.test.mjs"
openspec validate --specs --no-interactive
```
