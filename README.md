# open-skills

An open collection of Claude Code skills, packaged as a single plugin.

## Installation

Inside Claude Code:

```
/plugin marketplace add wiasliaw/open-skills
/plugin install open-skills@open-skills
```

## Skills

| Skill | What it does |
| -- | -- |
| [request-code-review](./docs/request-code-review.md) | Reviews your changes: three lens reviewers in parallel, adversarial verification of every finding, and an explicit verdict on the overall design. |
| [receive-code-review](./docs/receive-code-review.md) | Processes review feedback you received: verifies every comment against the code, fixes what holds up, drafts evidence-backed rebuttals for what doesn't. |
| [codewalk](./docs/codewalk.md) | Interactive guided walkthrough of a codebase or one execution path, one verified `file:line` stop at a time, pinned to a commit and landed as a reading record. |
| [harness](./docs/harness.md) | Project harness: `init` scaffolds a CLAUDE.md plus `.harness/` long-term memory, `harness-flow` runs a reviewer-gated implementor/reviewer loop, `handoff` persists in-flight context across sessions. |
| [use-worktree](./docs/use-worktree.md) | Gives the Build stage an isolated git worktree `wu/<id>`, provisioned by the orchestrator through a bundled Node script that never deletes existing directories. |

Invoke by slash command or by asking in plain words:

```
/open-skills:request-code-review
/open-skills:receive-code-review #91
/open-skills:codewalk
/open-skills:init
/open-skills:harness-flow
/open-skills:handoff
```

### External tools

- `git` — used by request-code-review to detect the review scope;
  without it you are asked which files to review. Also used by
  codewalk to pin a walkthrough to a commit in a worktree; without it
  the pin is recorded as `unknown`.
- `gh` (GitHub) or `glab` (GitLab) — used by receive-code-review to
  fetch PR/MR comments; without them, paste the review text instead.

## Updating

Installed plugins from third-party marketplaces do not auto-update by default.
To get the latest version:

```
/plugin update open-skills
```

Or enable auto-update for this marketplace under `/plugin` → Marketplaces.

## License

[MIT](./LICENSE)
