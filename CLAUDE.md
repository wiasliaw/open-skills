# open-skills

## Repo Structure

```tree
.
├── .claude/                      # generated opsx commands/skills from `openspec init`
├── .claude-plugin/
│   ├── marketplace.json          # marketplace listing; single plugin with source "./"
│   └── plugin.json               # plugin manifest; carries the released version
├── agents/                       # subagents awaiting the orchestrator rebuild; not dispatched by any shipped skill
│   ├── implementor.md
│   └── reviewer.md
├── docs/                         # user-facing docs, linked from README's Skills table
│   ├── codewalk.md
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

## Harness Rebuild Status

The harness loop (`harness-flow`, `handoff`) and this repo's `.harness/` memory were removed pending a ground-up redesign — see `openspec/changes/remove-harness-and-relocate-scripts/`. `agents/` and the orchestrator wording in `skills/use-worktree/SKILL.md` intentionally await that rebuild. Pre-removal memory is retrievable from git history (`git log --oneline -- .harness`).
