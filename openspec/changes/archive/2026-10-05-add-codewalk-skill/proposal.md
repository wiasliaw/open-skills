## Why

The plugin rebuild on this branch shipped seven skills but dropped `codewalk`, which exists on `main` as a released, user-facing skill. It is a standalone capability (guided, reader-paced code walkthroughs) that fits the plugin's composable-skills principle and has no dependency on the graph — but its old page hand-writes raw `git worktree` commands, which the current specs forbid: pinned read-only worktrees are the worktree script's detach mode.

## What Changes

- Port `skills/codewalk/` (SKILL.md + walkthrough template) from `main`, adapting the worktree lifecycle to delegate to `scripts/worktree.mjs ensure --detach` (pin path `<worktrees-location>/pin-<short-sha>`, script-owned exclusion and probe) instead of raw `git worktree` commands, and updating the orchestrator reference (harness-flow is gone; codewalk never runs under graph-run dispatch).
- Port `docs/codewalk.md` with the same path and mechanics updates; add the README Skills row and bump the architecture count.
- Add the `skill-codewalk` capability spec: the one shipped skill that is standalone-only — it declares no graph profile and MUST NOT be mounted.

## Capabilities

### New Capabilities

- `skill-codewalk`: interactive, reader-paced walkthrough of real code at a pinned commit — detach-mode worktree via the worktree script, verified stop records, a landed reading record, read-only with no judging.

### Modified Capabilities

(none)

## Impact

- Added: `skills/codewalk/SKILL.md`, `skills/codewalk/templates/walkthrough.md.template`, `docs/codewalk.md`, `openspec/specs/skill-codewalk/` (at archive).
- Edited: `README.md` (Skills row, architecture count).
- No change to scripts, agents, the graph specs, or any existing skill.
