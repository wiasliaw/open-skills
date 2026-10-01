## Why

The WOR-33 execution graph mounts a `use-worktree` skill on the Build node, but no such skill exists and nothing specifies what it must say. Build is required to implement in an isolated worktree and Wrap is required to clean it up, yet the rules in between (when to open, what to call it, what Build leaves behind) are unwritten. The missing piece is a skill page that tells the agent to create and manage the worktree itself with plain `git worktree` commands, so it works for any agent that runs Build.

## What Changes

- Add a spec for the `use-worktree` general skill: an agent-agnostic page that instructs the agent to create and manage the worktree itself with plain `git worktree` commands, with concrete commands and guardrails (no Claude Code-specific mechanism).
- Specify when Build opens a worktree and the cadence: one worktree per work unit, reused across that unit's tickets.
- Specify a deterministic naming scheme derived from the work-unit id.
- Specify cleanup ownership: Wrap removes the worktree; neither Build nor the skill does. Specify the handoff artifact Build leaves in its stage directory so Wrap can find the worktree.
- Specs only: no `skills/use-worktree/`, no SKILL.md, and no change to the existing changes, docs, or README.

## Capabilities

### New Capabilities
- `skill-use-worktree`: the content the `use-worktree` skill page must state: self-managed `git worktree` shape and guardrails, when and how often Build opens a worktree, naming, the Build handoff record, and Wrap-owned cleanup.

### Modified Capabilities

## Impact

Adds files under `openspec/changes/use-worktree-skill/` only. It is consistent with `graph-node-build` (isolated worktree, writes only code there), `graph-node-wrap` ("Wrap cleans residue"), and the work-unit folder layout in `graph-plugin-work-unit-state`; none of those changes is edited. A later implementation change will create `skills/use-worktree/SKILL.md` and the docs entry.
