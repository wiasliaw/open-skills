---
name: use-worktree
description: Use when a line of work needs its own isolated git worktree — before writing code for a work unit, when the user asks to isolate work in a worktree, or when a graph build node needs repository writes. Opens or reuses worktree `wu/<id>` through the bundled worktree.mjs script, never raw `git worktree`. Policy only; the script owns the mechanics.
---

# use-worktree

One worktree serves one line of work (one work unit). This page is the policy: naming, when to open, who removes it, and what to do when provisioning fails. Creating, reusing, recovering, and setting up worktrees belong to `scripts/worktree.mjs`, never to the agent.

Requires Node.js >= 20 and `git`. A missing Node.js >= 20 counts as a script failure.

## Core policy

- Identifier: branch `wu/<id>`, `<id>` matching `^[a-z0-9][a-z0-9-]*$`, created from the base ref in the project config's VCS section.
- Path: `<worktrees-location>/<id>`, inside the project. The location comes from the project config (reference default `.project/worktrees/`). It is a separate namespace from the work-units location: unit folders are durable records that get archived, worktrees are disposable workspaces, and a worktree never sits inside a folder that archival moves.
- The script keeps the area out of version control by appending it to the repository's `info/exclude`; it never touches a tracked file.
- Open lazily at first need. When work resumes and the recorded worktree is still present, reuse it; never open a second one for the same unit.
- A unit whose trigger names an existing branch (a fix unit for delivered work) works on that branch instead of deriving `wu/<id>`; its path is still derived from its own id.
- Repository writes stay inside the worktree. The unit's stage directory in the work-unit folder is the only other write surface (reports, records, draft deltas).

## The script

Run with `node` from the consumer project as the working directory, never from the plugin directory. Resolve the script as `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`, or the absolute path given in the dispatch when that variable is unavailable.

```
node "<script>" ensure --branch wu/<id>          # create, reuse, reopen, or recover a stale registration
node "<script>" ensure --branch <existing> --id <id>   # fix unit on an existing branch
node "<script>" ensure --detach <sha>            # read-only pin at <worktrees-location>/pin-<short-sha>
node "<script>" setup --worktree <path>          # run declared setup commands and copies
```

stdout is one JSON object. `"ok": true` carries `"action"` and `"path"`; `"ok": false` carries a stable `"error"` code and a `"message"`. Branch on the `"error"` code; exit codes are documented in the script header. There is deliberately no `remove` subcommand, and the script never runs global `git worktree prune`.

Run `setup` after every `ensure` that creates or reopens a worktree, before any code is written. It reads the worktree-setup section of the project config from the main checkout. Do not modify that config, and never symlink a mutable file or directory between worktrees. An empty or absent section is a no-op.

A pinned worktree is read-only and never runs project code.

## When the script fails

If the script exits non-zero, reports `"ok": false`, cannot be resolved, or Node.js >= 20 is missing: stop and report blocked with the script's `"error"` code and message. Do not fall back to raw `git worktree` commands, do not delete a colliding path, do not create the worktree by any other means.

A collision (the path exists but is not a registered worktree on the unit's branch) fails with the collision error; nothing modifies, reuses, or removes that path.

## Cleanup belongs to the owner

Whoever works inside the worktree MUST NOT remove it. Removal is done directly with `git worktree remove` by the orchestrator in its deterministic steps (post-review delivery on success; the abandonment terminal on abandonment, where forced removal is permitted), or by the user for read-only pins.

A missing worktree with branch `wu/<id>` still present means reopen on the existing branch (`ensure`, then `setup` again), never a new branch.

## Graph profile

Applies when the skill is mounted on a node that needs repository writes (build, close-out).

- The orchestrator provisions: it runs `ensure` and `setup` before dispatching the worker, on a unit's first build entry, a fix unit's first entry on its inherited branch, and whenever the recorded worktree is gone (for example a close-out). It passes the resulting path in the dispatch; that path is also the working directory for every verification command.
- The worker performs no VCS operations: it does not invoke the script or any `git worktree`, branch, commit, or staging command. It works only inside the dispatched path, with its stage directory still writable, and reports blocked when no usable path is given.
- The orchestrator owns VCS on the unit's branch: it commits accepted build output locally as it passes review and pushes only in the post-review delivery steps, so nothing leaves the machine before close-out passes review.
- The worker records the branch and path in `worktree.md` in its dispatched stage directory, a human-readable reference. The orchestrator's post-review steps derive the authoritative path from the unit id when removing.
- One worktree is reused across all of the unit's tickets; there is no worktree per ticket.
- These restrictions are contractual and checked by the reviewer; nothing depends on runtime enforcement.
