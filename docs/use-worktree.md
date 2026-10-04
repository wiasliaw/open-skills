# use-worktree

Isolate a line of work in its own git worktree, with the risky git mechanics handled by a deterministic script.

## What it does

- Opens (or reuses) a worktree on branch `wu/<id>` at `<worktrees-location>/<id>` inside your project. The default location is `.project/worktrees/`, and it is kept out of version control through `.git/info/exclude`.
- Delegates everything dangerous to `scripts/worktree.mjs` (Node.js >= 20, no dependencies): create, reuse, reopen on an existing branch, recover a stale registration, create a read-only pin, and run your declared setup commands.
- Never removes anything. Removal is done by the owner (orchestrator or you) with `git worktree remove`.

## When to use it

- You want a task to run in isolation from your main checkout.
- A graph build node needs to write repository files.
- You want a read-only worktree pinned at a commit (`ensure --detach <sha>`).

## How it is invoked

Ask Claude to work in a worktree for a unit, or let a graph run mount it on a build node. The skill runs:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" ensure --branch wu/<id>
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" setup --worktree <path>
```

Results come back as one JSON object (`ok`, `action`, `path`, or a stable `error` code). If the script fails, work stops and is reported as blocked with the error code. Claude does not fall back to raw `git worktree` commands. A path that already exists but is not the expected worktree is a collision and is never touched.

Setup commands and file copies come from the `worktree_setup` section of `.harness/config.json`, read from the main checkout.

## Graph profile

When mounted on a node that writes to the repository:

- The orchestrator runs `ensure` and `setup` before dispatching the worker, and again whenever the recorded worktree is gone. It passes the path in the dispatch.
- The worker runs no VCS commands and writes only inside that path (plus its stage directory). It records the branch and path in `worktree.md`.
- The orchestrator commits accepted output locally and pushes only in the post-review delivery steps.
- One worktree is reused across all tickets of a unit.
