# open-skills

## Repo Structure

```tree
.
├── .claude/                      # generated opsx commands/skills from `openspec init`
├── .claude-plugin/
│   ├── marketplace.json          # marketplace listing; single plugin with source "./"
│   └── plugin.json               # plugin manifest; carries the released version
├── agents/                       # generic graph actors dispatched by graph-flow; stage-agnostic, node identity is dispatch data
│   ├── advisor.md
│   ├── implementor.md
│   └── reviewer.md
├── docs/                         # user-facing docs, linked from README's Skills table
│   ├── codewalk.md
│   ├── graph-flow.md
│   ├── init.md
│   ├── receive-code-review.md
│   ├── request-code-review.md
│   └── use-worktree.md
├── openspec/                     # OpenSpec spec-driven changes; `changes/` holds proposals, `config.yaml` the schema
├── skills/
│   ├── codewalk/
│   │   ├── SKILL.md
│   │   └── templates/
│   │       └── walkthrough.md.template
│   ├── graph-flow/
│   │   ├── SKILL.md              # the orchestrator loop; successor of harness-flow
│   │   └── references/
│   │       └── nodes.md          # per-node dispatch source derived from the graph-node-* specs
│   ├── init/
│   │   ├── SKILL.md
│   │   └── templates/            # CLAUDE.md and worktree-setup.json templates
│   ├── receive-code-review/
│   │   └── SKILL.md
│   ├── request-code-review/
│   │   ├── SKILL.md
│   │   └── reviewer-prompt.md
│   └── use-worktree/
│       └── SKILL.md
├── scripts/                      # shared plugin-root scripts, resolved via ${CLAUDE_PLUGIN_ROOT}/scripts/
│   ├── shared/                   # modules shared between scripts: definitions.mjs (constants), lib.mjs (mechanics)
│   │   ├── definitions.mjs
│   │   └── lib.mjs
│   ├── init.mjs
│   ├── init.test.mjs
│   ├── work-unit.mjs
│   ├── work-unit.test.mjs
│   ├── worktree.mjs
│   └── worktree.test.mjs
├── .gitignore
├── LICENSE
└── README.md
```

## Development Environment

- Toolchain: Claude Code CLI (for `claude plugin validate`); Node.js >= 20 for skill scripts; no package manager, no package.json.
- External services and environment variables: none.

## Version Control

This project uses GitHub flow — feature branches merged into `main` via pull request — with Conventional Commits commit messages.

## Workflow

| Phase | How |
|---|---|
| edit | Edit `skills/`, `agents/`, `docs/` directly |
| verify | `claude plugin validate .`; `node --test "scripts/*.test.mjs"`; eval: TBD |

## Constraints

- All tracked file content MUST be written in English; the plugin is published for a public audience.
- Every user-facing skill MUST be covered by a `docs/` page and a row in README's Skills table, updated in the same change that adds, renames, removes, or changes the usage of the skill.

## Graph Execution

The orchestrator rebuild landed as the `graph-flow` skill (see `docs/graph-flow.md` and the `graph-node-*` / `graph-plugin-*` specs under `openspec/changes/`): the main session orchestrates a 13-node execution graph, dispatching the generic `agents/` actors per node, with per-work-unit state under `.project/work-units/` validated by `scripts/work-unit.mjs`. `.harness/` remains the long-term memory and config namespace, written only by init (pre-graph) and the Wrap stage. The old `harness-flow`/`handoff` loop and this repo's pre-rebuild `.harness/` memory are retrievable from git history (`git log --oneline -- .harness`).
