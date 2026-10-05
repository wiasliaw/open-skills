# skill-use-worktree delta

## MODIFIED Requirements

### Requirement: Mechanics are script-owned

Creating, reusing, recovering, and setting up worktrees SHALL be delegated to a zero-dependency Node.js script (Node.js >= 20, built-in modules and git only, stdout-JSON plus distinct exit codes per failure class, idempotent subcommands, committed tests). The page carries policy; whoever works inside the worktree never improvises raw `git worktree` commands for creation, reuse, or recovery. Removal is the one operation outside the script: the orchestrator, in the post-review delivery steps (or the user, for read-only pins), removes it directly with `git worktree remove`, which is why the script deliberately ships no `remove`. The script SHALL provide: `ensure --branch <branch>` — default `wu/<id>`, and a fix unit passes the existing branch its trigger names — (create, reuse, reopen on an existing branch, or recover a stale registration whose directory is absent), `ensure --detach <sha>` (a read-only pinned worktree at `<worktrees-location>/pin-<short-sha>`, excluded from version control like the rest of the area, coexisting with unit worktrees, and never running project code), and `setup --worktree <path>` (run the declared setup commands and copies from the worktree-setup section of the project config). An existing directory that is not the expected worktree is a collision: never removed, never forced. There SHALL be no `remove` subcommand — a scripted remove would hand a destructive operation to workers that must not own it — and the script MUST NEVER run global `git worktree prune`. When an underlying git invocation fails for an environmental reason (broken configuration, incompatible git version, unreachable repository state), the script SHALL report the git failure class with git's own error output in the message, and SHALL NOT misreport it as a usage error.

#### Scenario: Script fails
- **WHEN** the script exits non-zero or cannot be resolved
- **THEN** the consumer SHALL stop and report blocked with the script's error code, and SHALL NOT fall back to raw `git worktree` commands

#### Scenario: Collision
- **WHEN** the computed path exists but is not a registered worktree on the unit's resolved branch
- **THEN** the script SHALL fail with the collision error and nothing SHALL modify, reuse, or remove that path

#### Scenario: Setup from declared config
- **WHEN** `setup` runs after a worktree is created or reopened
- **THEN** it SHALL execute the setup commands and copies declared in the worktree-setup section of the project config, read from the main checkout, validating against the config's schema version and rejecting traversal paths, and never symlinking a mutable entry

#### Scenario: Branch-name validation failure is classified
- **WHEN** `ensure --branch` validates the branch name and `git check-ref-format` exits non-zero
- **THEN** the script SHALL report the usage error only when git states the name is invalid, and SHALL report the git failure class with git's stderr in the message for any other cause, so an environmental failure is never masked as an invalid branch name
