---
name: use-worktree
description: Use when the Build stage of a work unit is about to write code, to open or reuse the isolated git worktree `wu/<id>` that Build writes in. The orchestrator provisions it by running the bundled worktree.mjs script before dispatching the Build actor; the Build actor only works inside the path it is given. Policy only: when to open, cadence, naming, the build/worktree.md record, Wrap-owned cleanup, and what to do when the script fails.
---

# use-worktree

Build writes code only inside an isolated git worktree. This page is the policy: when a worktree is opened, how it is named, what is recorded, who removes it, and what happens when provisioning fails. The mechanics (creating, reusing, and recovering the worktree; running setup) belong to the script `worktree.mjs`, never to the agent.

The skill is a capability mounted on Build, not a node. Any agent that can run `node` can use it.

## Prerequisite

Node.js >= 20 and `git`. If Node.js >= 20 is missing, treat it as a script failure (see "When the script fails").

## The script

Run the script with `node`, from the consumer project as the working directory — never from the plugin directory:

```
node "<script>" ensure --branch wu/<id>
node "<script>" setup --worktree <path>
```

Resolve `<script>`:

- When `${CLAUDE_PLUGIN_ROOT}` is available: `${CLAUDE_PLUGIN_ROOT}/skills/use-worktree/scripts/worktree.mjs`.
- Otherwise: the absolute script path the orchestrator passed in the Build dispatch.

The directory `skills/use-worktree/scripts/` is a stable path contract.

Read the result from stdout, which is one JSON object. `"ok": true` carries `"action"` (`created`, `reused`, `reopened`, `recovered-stale`) and `"path"`. `"ok": false` carries a stable `"error"` code and a `"message"`. Branch on the `"error"` code; the exit code is the coarse signal, and the numeric assignments are documented in the script header. Diagnostics are on stderr.

## Who runs it

The orchestrator provisions, not the Build actor. Before dispatching Build, on first Build entry and on every CI-red reopen, the orchestrator runs `ensure --branch wu/<id>`, then `setup --worktree <path>`, and passes the worktree path (and the script's absolute path when `${CLAUDE_PLUGIN_ROOT}` is unavailable) in the dispatch.

The Build actor never runs the script and never runs `git worktree`, branch, commit, or staging operations. It works only inside the path it was given. If the dispatch carries no usable worktree path, the Build actor reports blocked. The Build actor writes `build/worktree.md` from the path and branch it was given.

## When Build opens a worktree

- Build works only inside an isolated worktree. A worktree is opened before Build writes any code whenever no live worktree exists for the work unit. A live worktree exists when `build/worktree.md` records one and it is still present on disk.
- Re-entry after a failed Review or Advisor guidance, with a live worktree: reuse it; never open another.
- Re-entry after red CI, where `build/worktree.md` names a worktree that is gone (Wrap removed it before opening the PR): open a fresh worktree on the existing branch `wu/<id>`, which still carries the work, and rewrite `build/worktree.md`.
- A work unit that never reaches Build, or is graded no-op before Build, has no worktree opened.

`ensure --branch wu/<id>` decides among created, reused, and reopened itself; this page states the policy and reads its result.

## Setup after creation

A fresh worktree has tracked files only. Run `setup --worktree <path>` after every `ensure` that creates or reopens a worktree (first open and CI-red reopen), before the Build actor writes any code. The script owns the mechanics and reads `.harness/worktree-setup.json` from the main checkout.

- Build MUST NOT modify that config file.
- Build MUST NOT symlink a mutable directory or file between worktrees.
- A setup or copy failure means Build is blocked.
- An empty or absent config is a no-op; Build proceeds.

## Cadence

One worktree serves the whole work unit and is reused across all its tickets. There is no worktree per ticket. Build still implements one ticket at a time inside it.

## Naming

The identifier is the branch name `wu/<id>`, where `<id>` is the work-unit id. The worktree is named by that branch name verbatim, so its path ends in `wu/<id>`. The script resolves the exact path; do not prescribe another. For example, work unit `2026-10-01-wor-37-use-worktree-spec` gives branch `wu/2026-10-01-wor-37-use-worktree-spec`. The name never contains a ticket id, a timestamp, or random characters.

## The Build record

When the worktree is opened, Build writes `build/worktree.md` in the work-unit folder's `build/` stage directory, before writing any code. It states the branch name `wu/<id>` and the worktree's filesystem path. It is a stage artifact, not a `state.json` field, and it stays in place after Build completes so Wrap can find the worktree without searching the filesystem.

## Cleanup belongs to Wrap

Wrap removes the worktree (not the branch) before opening the PR. Build never removes the worktree, whether it ends ready-for-review, blocked, or retried, and this skill gives Build no way to do so. Build may discard its own uncommitted changes inside the worktree, but never deletes the worktree itself. When Build ends, the worktree still exists and `build/worktree.md` still names it.

## When the script fails

If the script exits non-zero or reports `"ok": false`, is unavailable (path unresolved or file missing), or Node.js >= 20 is unavailable: the Build stage records blocked with the script's `"error"` code and message. Nobody acting for Build improvises: no raw `git worktree` commands, no deleting a colliding path, no creating the worktree by any other means.

A collision, a stale registration with its directory present, and a setup or copy failure are resolved by a human or the orchestrator, not by Build.

## Scope boundary

Build writes only inside the worktree, and code is the only thing it writes there. The worktree is never used to write `.harness/`. This restriction is contractual and verified by the reviewer; nothing here depends on runtime enforcement.
