## Purpose

Standalone worktree skill: isolate a line of work in its own git worktree, with the dangerous mechanics owned by a deterministic script. Usable on its own; a graph profile adds the obligations that apply when mounted on a build node.

## Requirements

### Requirement: Core policy

One worktree SHALL serve one line of work (one work unit), opened lazily at first need and reused until its owner removes it. The identifier SHALL be the branch name `wu/<id>` (`<id>` matching `^[a-z0-9][a-z0-9-]*$`), and the worktree path SHALL be deterministic and inside the project: `<worktrees-location>/<id>`, where `<worktrees-location>` is declared in the project config (reference default `.project/worktrees/`). The worktrees area is a namespace of its own, deliberately separate from the work-units location: unit folders are durable records with an archive lifecycle, worktrees are disposable workspaces, and a registered worktree must never sit inside a folder that archival moves whole. Because the area is inside the main checkout's working tree, the script SHALL keep it out of version control by appending it to the repository's `info/exclude` (creating parent directories and the trailing newline as needed, never touching a tracked file). Repository writes SHALL be confined to the worktree; the unit's stage directory in the work-unit folder is the one other write surface (reports, records, draft deltas). A unit whose trigger names an existing branch (a fix unit for already-delivered work) SHALL work on that branch instead of deriving a new one, with the worktree path still derived from its own id.

#### Scenario: Name derived from id
- **WHEN** a worktree is opened for work unit `<id>`
- **THEN** the branch SHALL be `wu/<id>` and the path SHALL be `<worktrees-location>/<id>` inside the project

#### Scenario: Worktree area excluded from git
- **WHEN** the script creates the worktrees area for the first time
- **THEN** it SHALL append the area to `info/exclude` so worktrees never appear as untracked content, and SHALL append nothing when the entry is already present

#### Scenario: Worktrees never live among unit folders
- **WHEN** a unit folder is archived
- **THEN** no worktree SHALL be affected — worktrees live only under the worktrees area, and the close-out step removed the unit's worktree beforehand

#### Scenario: Reuse over reopen
- **WHEN** work resumes and the recorded worktree is still present
- **THEN** it SHALL be reused and no second worktree SHALL be opened for the same unit

### Requirement: Mechanics are script-owned

Creating, reusing, recovering, and setting up worktrees SHALL be delegated to a zero-dependency Node.js script (Node.js >= 20, built-in modules and git only, stdout-JSON plus distinct exit codes per failure class, idempotent subcommands, committed tests). The page carries policy; whoever works inside the worktree never improvises raw `git worktree` commands for creation, reuse, or recovery. Removal is the one operation outside the script: the orchestrator, in the post-review delivery steps (or the user, for read-only pins), removes it directly with `git worktree remove`, which is why the script deliberately ships no `remove`. The script SHALL provide: `ensure --branch <branch>` — default `wu/<id>`, and a fix unit passes the existing branch its trigger names — (create, reuse, reopen on an existing branch, or recover a stale registration whose directory is absent), `ensure --detach <sha>` (a read-only pinned worktree that never runs project code), and `setup --worktree <path>` (run the declared setup commands and copies from the worktree-setup section of the project config). An existing directory that is not the expected worktree is a collision: never removed, never forced. There SHALL be no `remove` subcommand — a scripted remove would hand a destructive operation to workers that must not own it — and the script MUST NEVER run global `git worktree prune`.

#### Scenario: Script fails
- **WHEN** the script exits non-zero or cannot be resolved
- **THEN** the consumer SHALL stop and report blocked with the script's error code, and SHALL NOT fall back to raw `git worktree` commands

#### Scenario: Collision
- **WHEN** the computed path exists but is not a registered worktree on the unit's resolved branch
- **THEN** the script SHALL fail with the collision error and nothing SHALL modify, reuse, or remove that path

#### Scenario: Setup from declared config
- **WHEN** `setup` runs after a worktree is created or reopened
- **THEN** it SHALL execute the setup commands and copies declared in the worktree-setup section of the project config, read from the main checkout, validating against the config's schema version and rejecting traversal paths, and never symlinking a mutable entry

### Requirement: Cleanup belongs to the owner, not the worker

Whoever works inside the worktree MUST NOT remove it. Removal belongs to the deterministic delivery steps the orchestrator executes after close-out passes review (or to the user, for read-only pins). A missing worktree with the branch still present means reopen on the existing branch, not a new branch.

#### Scenario: Reopen after removal
- **WHEN** the recorded worktree is gone but branch `wu/<id>` exists
- **THEN** a fresh worktree SHALL be opened on the existing branch, setup SHALL run again, and no different branch SHALL be created

### Requirement: Graph profile

When mounted on a node that needs repository writes (build, close-out), the skill SHALL additionally require: the orchestrator provisions the worktree (runs `ensure` and `setup`) before dispatching the build worker — on first entry and again whenever the recorded worktree is gone — and passes the path in the dispatch; the build worker performs no VCS operations and confines its repository writes to the given path (its stage directory stays writable), reporting blocked when no usable path is given; the orchestrator owns the VCS operations on the unit's branch (committing accepted build output, pushing); the worker records the branch and path as a worktree record (`worktree.md`) in its dispatched stage directory so the close-out step can find and remove the worktree; and the worktree is reused across all of the unit's tickets.

#### Scenario: Orchestrator provisions
- **WHEN** a repository-writing node is about to start — a unit's first build entry, a fix unit's first entry on its inherited branch, or a close-out whose recorded worktree is gone
- **THEN** the orchestrator SHALL run `ensure` and `setup` first and dispatch the worker with the resulting path

#### Scenario: Worker performs no VCS operations
- **WHEN** the build worker runs
- **THEN** it SHALL NOT invoke the script or any `git worktree`, branch, commit, or staging command, and SHALL work only inside the dispatched path
