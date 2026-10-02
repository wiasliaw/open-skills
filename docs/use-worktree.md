# use-worktree

Gives the Build stage of a work unit an isolated git worktree to write
code in, so the main checkout stays clean. The worktree is named by
the branch `wu/<id>` and lives in a sibling directory of the project.

## Who invokes it

The skill is not a slash command. The orchestrator (the main session)
provisions the worktree before dispatching the
Build actor, on first Build entry and again on every CI-red reopen.
The Build actor never runs the script or any git worktree command; it
only writes inside the path it is handed. Wrap removes the worktree
(not the branch) before opening the PR.

## The script

The mechanics live in `skills/use-worktree/scripts/worktree.mjs`, run
as `node worktree.mjs <subcommand>` with the project as the working
directory:

| Subcommand | What it does |
| -- | -- |
| `ensure --branch wu/<id>` | Creates the worktree and branch from the main checkout's `HEAD`, reuses a live one, or reopens an existing branch whose worktree was removed. Path: `<parent>/<project>.worktrees/wu/<id>`. |
| `setup --worktree <path>` | Runs the commands and copies declared in `.harness/worktree-setup.json` (read from the main checkout). Only `readonly` entries are symlinked; everything else is copied. |
| `ensure --detach <sha>` | Used by codewalk: a hooks-off, LFS-off detached worktree under `.codewalk/worktree/`. Never runs setup. |

Each call prints one JSON object on stdout (`"ok"`, `"action"` or
`"error"` plus `"message"`) and diagnostics on stderr. Each failure
class has a distinct error code in the JSON output; exit codes are
distinct except usage and configuration errors, which share one. All
are documented in the script header.

## Failure behavior

The script never deletes a directory that exists and never removes
registrations globally. A path collision, a registration that is
unusable while its directory exists, and a setup or copy failure stop
Build as blocked; a human or the orchestrator resolves them. There is
deliberately no remove subcommand.

## Requirements

- Node.js >= 20 and `git`. If Node is missing or too old, Build is
  blocked rather than improvising.
- macOS and Linux. Windows is unverified.
- The script has no dependencies and writes nothing into the plugin
  directory.
