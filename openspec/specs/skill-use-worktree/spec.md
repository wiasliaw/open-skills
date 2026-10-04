## Purpose

Standalone worktree skill: isolate a line of work in its own git worktree, with the dangerous mechanics owned by a deterministic script. Usable on its own; a graph profile adds the obligations that apply when mounted on a build node.

## Requirements

### Requirement: Core policy

One worktree SHALL serve one line of work (one work unit), opened lazily at first need and reused until its owner removes it. The identifier SHALL be the branch name `wu/<id>` (`<id>` matching `^[a-z0-9][a-z0-9-]*$`), and the worktree path SHALL be deterministic: `<parent-of-main-checkout>/<main-checkout-basename>.worktrees/wu/<id>`. All work SHALL happen inside the worktree; nothing outside it is written.

#### Scenario: Name derived from id
- **WHEN** a worktree is opened for work unit `<id>`
- **THEN** the branch SHALL be `wu/<id>` and the path SHALL end in `wu/<id>` under the project's `.worktrees` sibling directory

#### Scenario: Reuse over reopen
- **WHEN** work resumes and the recorded worktree is still present
- **THEN** it SHALL be reused and no second worktree SHALL be opened for the same unit

### Requirement: Mechanics are script-owned

Creating, reusing, recovering, and setting up worktrees SHALL be delegated to a zero-dependency Node.js script (Node.js >= 20, built-in modules and git only, stdout-JSON plus distinct exit codes per failure class, idempotent subcommands, committed tests). The page carries policy; nobody improvises raw `git worktree` commands. The script SHALL provide: `ensure --branch wu/<id>` (create, reuse, reopen on an existing branch, or recover a stale registration whose directory is absent), `ensure --detach <sha>` (a read-only pinned worktree that never runs project code), and `setup --worktree <path>` (run the declared setup commands and copies from the project's worktree setup config). An existing directory that is not the expected worktree is a collision: never removed, never forced. There SHALL be no `remove` subcommand and the script MUST NEVER run global `git worktree prune`.

#### Scenario: Script fails
- **WHEN** the script exits non-zero or cannot be resolved
- **THEN** the consumer SHALL stop and report blocked with the script's error code, and SHALL NOT fall back to raw `git worktree` commands

#### Scenario: Collision
- **WHEN** the computed path exists but is not a registered worktree on `wu/<id>`
- **THEN** the script SHALL fail with the collision error and nothing SHALL modify, reuse, or remove that path

#### Scenario: Setup from declared config
- **WHEN** `setup` runs after a worktree is created or reopened
- **THEN** it SHALL execute the setup commands and copies declared in the project's worktree setup config, read from the main checkout, rejecting unknown keys and traversal paths, and never symlinking a mutable entry

### Requirement: Cleanup belongs to the owner, not the worker

Whoever works inside the worktree MUST NOT remove it. Removal belongs to the converge step (or the user, for read-only pins). A missing worktree with the branch still present means reopen on the existing branch, not a new branch.

#### Scenario: Reopen after removal
- **WHEN** the recorded worktree is gone but branch `wu/<id>` exists
- **THEN** a fresh worktree SHALL be opened on the existing branch, setup SHALL run again, and no different branch SHALL be created

### Requirement: Graph profile

When mounted on a build node, the skill SHALL additionally require: the orchestrator provisions the worktree (runs `ensure` and `setup`) before dispatching the build worker and passes the path in the dispatch; the build worker performs no VCS operations and works only inside the given path, reporting blocked when no usable path is given; the worker records the branch and path as a stage artifact (`build/worktree.md`) so the converge node can find and remove the worktree; and the worktree is reused across all of the unit's tickets.

#### Scenario: Orchestrator provisions
- **WHEN** build is about to start or be re-entered after a red-CI reopen
- **THEN** the orchestrator SHALL run `ensure` and `setup` first and dispatch the worker with the resulting path

#### Scenario: Worker performs no VCS operations
- **WHEN** the build worker runs
- **THEN** it SHALL NOT invoke the script or any `git worktree`, branch, commit, or staging command, and SHALL work only inside the dispatched path
