# use-worktree

Isolate a line of work in its own git worktree, with the risky git mechanics handled by a deterministic script.

## What it does

- Opens (or reuses) a worktree on branch `wu/<id>` at `<worktrees-location>/<id>` inside your project. The default location is `.project/worktrees/`, and it is kept out of version control through `.git/info/exclude`.
- Delegates everything dangerous to `scripts/worktree.mjs` (Node.js >= 20, no dependencies): create, reuse, reopen on an existing branch, recover a stale registration, create a read-only pin, and run your declared setup commands.
- Never removes anything. You remove a worktree with `git worktree remove <path>`.

## When to use it

- You want a task to run in isolation from your main checkout.
- You want a read-only worktree pinned at a commit (`ensure --detach <sha>`).

## How it is invoked

Ask Claude to work in a worktree, or run `/open-skills:use-worktree`. The skill runs:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" ensure --branch wu/<id>
node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs" setup --worktree <path>
```

Results come back as one JSON object (`ok`, `action`, `path`, or a stable `error` code). If the script fails, work stops and is reported as blocked with the error code. Claude does not fall back to raw `git worktree` commands. A path that already exists but is not the expected worktree is a collision and is never touched.

## Configuration

The config file is optional. You write it yourself at `.harness/config.json` in the main checkout. The script reads it on every call.

```json
{
  "schema_version": "1.0.0",
  "vcs": { "default_branch": "main", "remote": "origin" },
  "locations": { "worktrees": ".project/worktrees" },
  "worktree_setup": {
    "setup": ["npm ci"],
    "copy": [{ "path": ".env", "readonly": false }]
  }
}
```

- `schema_version` — required when the file exists. It must be a semver string with major version 1. Any other major version fails with the `config` error.
- `vcs.default_branch` — the base for a new `wu/<id>` branch. The script resolves it as a ref, a local branch, or `<remote>/<default_branch>`. If none resolves, it fails with `base_ref_missing`.
- `vcs.remote` — the remote used to resolve `vcs.default_branch`. The default is `origin`.
- `locations.worktrees` — the worktrees location. It must be a relative path inside the project, without `..` and not under `.git`. The default is `.project/worktrees`.
- `worktree_setup` — read by `setup`. When the file exists, this object is required. Write `{"setup": [], "copy": []}` when you have nothing to declare.
  - `setup` — an array of shell commands. They run in order inside the worktree. A failing command fails with `setup_failed`.
  - `copy` — an array of `{ "path": <repo-relative>, "readonly": <boolean> }` entries. The source must exist in the main checkout. With `readonly: false`, the script copies the file or directory into the worktree. With `readonly: true`, the script links it with a symlink.

When `.harness/config.json` is absent:

- `ensure` branches a new `wu/<id>` from `HEAD`, with the worktree at `.project/worktrees/<id>`.
- `setup` is a no-op.
