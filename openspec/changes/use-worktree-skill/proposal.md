## Why

The WOR-33 execution graph mounts a `use-worktree` skill on the Build node, but no such skill exists and nothing specifies what it must say. Build is required to implement in an isolated worktree and Wrap is required to clean it up, yet the rules in between (when to open, what to call it, what Build leaves behind) are unwritten. The missing pieces are a skill page that carries the policy and a small script that owns the dangerous mechanics (worktree creation, stale-registration recovery, setup), because agents misexecute those steps destructively or silently when they run raw `git worktree` commands from prose. The `codewalk` skill has the same mechanics in its detach mode, so the script serves both.

## What Changes

- Add a spec for the `use-worktree` skill: a policy page that delegates mechanics to the script, states Node.js >= 20 as a prerequisite, resolves the script path (`${CLAUDE_PLUGIN_ROOT}` or an orchestrator-passed absolute path), has the orchestrator provision the worktree before dispatching Build, and has Build report blocked rather than improvise raw `git worktree` commands (no Claude Code-specific mechanism).
- Add a spec for the `worktree-script` capability: the contract of the zero-dependency Node.js script `skills/use-worktree/scripts/worktree.mjs` with subcommands `ensure --branch wu/<id>` (Build), `ensure --detach <sha>` (the `codewalk` consumer, preserving its current Step 2 behavior), and `setup --worktree <path>`; a deterministic path rule, per-mode main-checkout resolution, a JSON-plus-exit-code failure contract, and a deliberate absence of any `remove` subcommand.
- Specify when Build opens a worktree and the cadence: one worktree per work unit, reused across that unit's tickets.
- Specify a deterministic naming scheme derived from the work-unit id.
- Specify cleanup ownership: Wrap removes the worktree; neither Build nor the skill does. Specify the handoff artifact Build leaves in its stage directory so Wrap can find the worktree.
- Specs only in this change: no `skills/use-worktree/`, no script, no SKILL.md, no tests, no `skills/codewalk/` edits, and no change to the other changes, docs, or README. The script, the skill page, and the codewalk rewrite are separate later changes and work units.

## Capabilities

### New Capabilities
- `skill-use-worktree`: the policy the `use-worktree` skill page must state: script delegation and resolution, who provisions, failure handling, when and how often Build opens a worktree, naming, the Build handoff record, and Wrap-owned cleanup.
- `worktree-script`: the contract of `skills/use-worktree/scripts/worktree.mjs`: subcommands, path and main-checkout rules, stale recovery, setup config validation, failure contract, platform and runtime limits.

### Modified Capabilities

## Impact

Adds files under `openspec/changes/use-worktree-skill/` only. It is consistent with `graph-node-build` (isolated worktree, writes only code there), `graph-node-wrap` ("Wrap cleans residue"), and the work-unit folder layout in `graph-plugin-work-unit-state`; none of those changes is edited. Later changes will implement the script with `node --test` tests, create `skills/use-worktree/SKILL.md` and the docs entry, and rewrite `skills/codewalk/` Step 2 to call the script's detach mode. This revision supersedes the earlier scripts-free premise of this change.
