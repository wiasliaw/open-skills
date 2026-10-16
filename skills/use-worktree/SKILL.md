---
name: use-worktree
description: Use when a line of work needs its own isolated git worktree — before writing code for a line of work, or when the user asks to isolate work in a worktree. Opens or reuses worktree `wu/<id>` through the bundled worktree.mjs script, never raw `git worktree`. Policy only; the script owns the mechanics.
---

# use-worktree

One worktree serves one line of work. This page is the policy: naming, when to open, who removes it, and what to do when provisioning fails. Creating, reusing, and recovering worktrees belong to `scripts/worktree.mjs`, never to the agent.

Requires Node.js >= 20 and `git`. A missing Node.js >= 20 counts as a script failure.

## Core policy

- Identifier: branch `wu/<id>`, `<id>` matching `^[a-z0-9][a-z0-9-]*$`, created from the main checkout's `HEAD`.
- Path: `.project/worktrees/<id>`, inside the project. Worktrees are disposable workspaces.
- The script keeps the area out of version control by appending it to the repository's `info/exclude`; it never touches a tracked file.
- Open lazily at first need. When work resumes and the worktree is still present, reuse it; never open a second one for the same line of work.
- A line of work continuing on an existing branch works on that branch instead of deriving `wu/<id>`; its path is still derived from its own id.
- Repository writes stay inside the worktree.

## The script

Run with `node` from the project as the working directory, never from the plugin directory. Resolve the script as `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`, or the absolute path given by the user when that variable is unavailable.

```
node "<script>" ensure --branch wu/<id>          # create, reuse, reopen, or recover a stale registration
node "<script>" ensure --branch <existing> --id <id>   # continue on an existing branch
node "<script>" ensure --detach <sha>            # read-only pin at .project/worktrees/pin-<short-sha>
```

stdout is one JSON object. `"ok": true` carries `"action"` and `"path"`; `"ok": false` carries a stable `"error"` code and a `"message"`. Branch on the `"error"` code; exit codes are documented in the script header. There is deliberately no `remove` subcommand, and the script never runs global `git worktree prune`.

The script reads no config file. Preparing a new worktree (installing dependencies and similar) follows the project's own instructions and is outside this skill. Never symlink a mutable file or directory between worktrees.

A pinned worktree is read-only and never runs project code.

## When the script fails

If the script exits non-zero, reports `"ok": false`, cannot be resolved, or Node.js >= 20 is missing: stop and report blocked with the script's `"error"` code and message. Do not fall back to raw `git worktree` commands, do not delete a colliding path, do not create the worktree by any other means.

A collision (the path exists but is not a registered worktree on the expected branch) fails with the collision error; nothing modifies, reuses, or removes that path.

## Cleanup belongs to the user

The agent MUST NOT remove a worktree. The user removes it with `git worktree remove <path>`; this applies to read-only pins too.

A missing worktree with branch `wu/<id>` still present means reopen on the existing branch (`ensure` again), never a new branch.
