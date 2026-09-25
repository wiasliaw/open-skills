# open-skills

Load the `open-skills:harness-flow` skill before producing or modifying any deliverable — code, docs, or configuration.

## Repo Structure

```tree
.
├── .claude-plugin/
│   ├── marketplace.json          # marketplace listing; single plugin with source "./"
│   └── plugin.json               # plugin manifest; carries the released version
├── agents/                       # subagents shipped by the plugin, dispatched by harness-flow
│   ├── implementor.md
│   └── reviewer.md
├── docs/                         # user-facing docs, linked from README's Skills table
│   ├── harness.md                # one page covering init, harness-flow, and handoff
│   ├── receive-code-review.md
│   └── request-code-review.md
├── skills/
│   ├── handoff/
│   │   ├── SKILL.md
│   │   └── templates/
│   │       └── handoff.md.template
│   ├── harness-flow/
│   │   ├── SKILL.md
│   │   └── templates/
│   │       └── WORK-UNIT.md.template
│   ├── init/
│   │   ├── SKILL.md
│   │   └── templates/            # CLAUDE.md, .harness/ files, and D-/F- entry templates
│   ├── receive-code-review/
│   │   └── SKILL.md
│   └── request-code-review/
│       ├── SKILL.md
│       └── reviewer-prompt.md
├── .gitignore
├── LICENSE
└── README.md
```

## Development Environment

- Toolchain: Claude Code CLI (for `claude plugin validate`); no language runtime or package manager.
- External services and environment variables: none.

## Version Control

This project uses GitHub flow — feature branches merged into `main` via pull request — with Conventional Commits commit messages.

## Workflow

| Phase | How |
|---|---|
| edit | Edit `skills/`, `agents/`, `docs/` directly |
| verify | `claude plugin validate .`; eval: TBD |

## Harness

- open-skills plugin version: v0.1.0
- `.harness/ARCHITECTURE.md` — module map, layering, key boundaries; read before making a structural change.
- `.harness/CONSTRAINTS.md` — hard MUST / MUST NOT rules with source and applicability; read before any change that could violate one.
- `.harness/DECISIONS.md` — index of active decisions (details in `.harness/decisions/`); read before revisiting a past call.
- `.harness/FEATURES.md` — passing-only index of verified behavior (details in `.harness/features/`); read to see what already works and how it was verified.
- short-term memory: `.project/work-units/`
- work-unit tool: none
- session memory: `.project/handoff.md`
- `.harness/` is read-anytime and written only by the orchestrator at merge moments — see the harness-flow skill (or run `/open-skills:harness-flow`) for the loop that enforces this.
