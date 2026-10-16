---
name: use-worktree
description: Use when a line of work needs its own isolated git worktree — before writing code for a line of work, or when the user asks to isolate work in a worktree. Opens or reuses worktree `wu/<id>` through the bundled worktree.mjs script, never raw `git worktree`. Policy only; the script owns the mechanics.
---

# use-worktree

One worktree serves one line of work. This page is the policy: naming, when to open, who removes it, and what to do when provisioning fails. Creating, reusing, recovering, and setting up worktrees belong to `scripts/worktree.mjs`, never to the agent.

Requires Node.js >= 20 and `git`. A missing Node.js >= 20 counts as a script failure.

## Core policy

- Identifier: branch `wu/<id>`, `<id>` matching `^[a-z0-9][a-z0-9-]*$`, created from the base ref in the `vcs` section of `.harness/config.json` (`HEAD` when the file is absent).
- Path: `<worktrees-location>/<id>`, inside the project. The location comes from `.harness/config.json` (default `.project/worktrees/`). Worktrees are disposable workspaces.
- The script keeps the area out of version control by appending it to the repository's `info/exclude`; it never touches a tracked file.
- Open lazily at first need. When work resumes and the worktree is still present, reuse it; never open a second one for the same line of work.
- A line of work continuing on an existing branch works on that branch instead of deriving `wu/<id>`; its path is still derived from its own id.
- Repository writes stay inside the worktree.

## The script

Run with `node` from the project as the working directory, never from the plugin directory. Resolve the script as `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`, or the absolute path given by the user when that variable is unavailable.

```
node "<script>" ensure --branch wu/<id>          # create, reuse, reopen, or recover a stale registration
node "<script>" ensure --branch <existing> --id <id>   # continue on an existing branch
node "<script>" ensure --detach <sha>            # read-only pin at <worktrees-location>/pin-<short-sha>
node "<script>" setup --worktree <path>          # run declared setup commands and copies
```

stdout is one JSON object. `"ok": true` carries `"action"` and `"path"`; `"ok": false` carries a stable `"error"` code and a `"message"`. Branch on the `"error"` code; exit codes are documented in the script header. There is deliberately no `remove` subcommand, and the script never runs global `git worktree prune`.

Run `setup` after every `ensure` that creates or reopens a worktree, before any code is written. It reads the `worktree_setup` section of `.harness/config.json` from the main checkout. Do not modify that config, and never symlink a mutable file or directory between worktrees. An empty or absent section is a no-op.

A pinned worktree is read-only and never runs project code.

## When the script fails

If the script exits non-zero, reports `"ok": false`, cannot be resolved, or Node.js >= 20 is missing: stop and report blocked with the script's `"error"` code and message. Do not fall back to raw `git worktree` commands, do not delete a colliding path, do not create the worktree by any other means.

A collision (the path exists but is not a registered worktree on the expected branch) fails with the collision error; nothing modifies, reuses, or removes that path.

## Cleanup belongs to the user

The agent MUST NOT remove a worktree. The user removes it with `git worktree remove <path>`; this applies to read-only pins too.

A missing worktree with branch `wu/<id>` still present means reopen on the existing branch (`ensure`, then `setup` again), never a new branch.
