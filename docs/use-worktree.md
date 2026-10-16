# use-worktree

Isolate a line of work in its own git worktree, with the risky git mechanics handled by a deterministic script.

## What it does

- Opens (or reuses) a worktree on branch `wu/<id>` at `.project/worktrees/<id>` inside your project. It needs no configuration. A new branch starts at the `HEAD` of the main checkout. The location is kept out of version control through `.git/info/exclude`.
- Delegates everything dangerous to `scripts/worktree.mjs` (Node.js >= 20, no dependencies): create, reuse, reopen on an existing branch, recover a stale registration, and create a read-only pin.
- Never removes anything. You remove a worktree with `git worktree remove <path>`.

## When to use it

- You want a task to run in isolation from your main checkout.
- You want a read-only worktree pinned at a commit (`ensure --detach <sha>`).

## How it is invoked

Ask Claude to work in a worktree, or run `/open-skills:use-worktree`. The skill runs:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" ensure --branch wu/<id>
```

Results come back as one JSON object (`ok`, `action`, `path`, or a stable `error` code). If the script fails, work stops and is reported as blocked with the error code. Claude does not fall back to raw `git worktree` commands. A path that already exists but is not the expected worktree is a collision and is never touched.

Preparing a new worktree (installing dependencies and similar) follows your project's own instructions and is outside this skill.
