## Requirements

### Requirement: Script location, invocation, and runtime
The change SHALL define a single zero-dependency Node.js script at `scripts/worktree.mjs` (plugin root) that owns the dangerous worktree mechanics for two consumers: the Build node (through the `use-worktree` skill) and the `codewalk` skill (detach mode). The script MUST use only Node.js built-in modules, sibling modules under `scripts/shared/` (which themselves use only Node.js built-ins), and `git`; it MUST NOT depend on any third-party package, bundled package, or shell other than the one used to run user-declared setup commands. The script SHALL be invoked as `node "<path>/worktree.mjs" <subcommand> ...` and MUST NOT rely on a shebang or the executable bit. The script requires Node.js >= 20 and SHALL check `process.versions.node` at startup, before any other work, exiting with the Node-version exit code and a stderr message when the version is lower. The script file MUST remain parseable on older Node versions up to that check (no syntax newer than the check can guard). Supported platforms are macOS and Linux; Windows is explicitly unverified and the spec makes no claim for it. The script's directory `scripts/` at the plugin root is a stable path contract that consumers may rely on; the former location `skills/use-worktree/scripts/` is no longer a contract.

#### Scenario: Invoked through node
- **WHEN** a consumer runs the script
- **THEN** it SHALL run it as `node "<path>/worktree.mjs" <subcommand> ...` and the script SHALL NOT require the executable bit

#### Scenario: Old Node version
- **WHEN** the script starts under Node.js older than 20
- **THEN** it SHALL print a diagnostic to stderr, print the failure JSON to stdout, and exit with the Node-version exit code before touching git or the filesystem

#### Scenario: No third-party dependency
- **WHEN** the script is inspected
- **THEN** it SHALL import only Node.js built-in modules and SHALL invoke only `git` and the user-declared setup commands as external programs

#### Scenario: Plugin-root location
- **WHEN** the plugin directory is inspected
- **THEN** `worktree.mjs` and its test SHALL live under `scripts/` at the plugin root and no script SHALL remain under `skills/use-worktree/scripts/`
### Requirement: Working directory and non-interactive execution
The script SHALL treat its current working directory as inside the consumer project and SHALL resolve the project from it with git. The script MUST NOT resolve the project from its own location, MUST NOT treat the plugin directory or plugin cache as the project, and MUST NOT write anything into the plugin cache or its own directory. The script SHALL set `GIT_TERMINAL_PROMPT=0` for every git invocation so that no git command waits on interactive input, and SHALL NOT read from stdin.

#### Scenario: Run from the consumer project
- **WHEN** the script is invoked with the working directory inside the consumer project and the script file lives in the plugin cache
- **THEN** it SHALL operate on the consumer project and SHALL NOT create or modify any file under the plugin cache

#### Scenario: No interactive prompt
- **WHEN** any git command would prompt for credentials
- **THEN** it SHALL fail immediately because `GIT_TERMINAL_PROMPT=0` is set, and the script SHALL report the failure through its failure contract

### Requirement: Output and exit-code contract
Every invocation SHALL write exactly one JSON object to stdout and human-readable diagnostics only to stderr. On success the object SHALL contain `"ok": true`, the subcommand's result fields, and `"action"` naming what happened (for example `created`, `reused`, `reopened`, `recovered-stale`). On failure the object SHALL contain `"ok": false`, a stable machine-readable `"error"` code, and a `"message"` string. The exit code SHALL be 0 on success and, on failure, one distinct non-zero code per failure class: collision, stale-registration-with-directory-present, probe failure, not-a-git-repository, Node version mismatch, setup or copy failure, and usage or configuration error. The exact numeric assignment SHALL be fixed in the implementation change and documented in the script's header and the skill page; consumers SHALL branch on the `"error"` code in stdout JSON, with the exit code as the coarse signal. The script MUST NOT print anything else to stdout.

#### Scenario: Success shape
- **WHEN** a subcommand succeeds
- **THEN** stdout SHALL be one JSON object with `"ok": true` and the exit code SHALL be 0

#### Scenario: Failure shape
- **WHEN** a subcommand fails
- **THEN** stdout SHALL be one JSON object with `"ok": false`, an `"error"` code, and a `"message"`, the exit code SHALL be the non-zero code for that failure class, and the diagnostics SHALL appear on stderr

#### Scenario: Distinct classes
- **WHEN** failures of different classes occur (collision, stale-with-directory-present, probe failure, not a git repository, Node version mismatch, setup or copy failure)
- **THEN** each SHALL produce a distinct exit code and a distinct `"error"` value

### Requirement: Idempotency
Every subcommand SHALL be idempotent: running it a second time with the same arguments on an unchanged repository SHALL produce the same filesystem and git state and an equivalent success result (the `"action"` field MAY report `reused` instead of `created`). A rerun after an interrupted earlier run SHALL converge to the same end state or fail with a defined error, and SHALL NOT leave a second worktree for the same branch or SHA.

#### Scenario: Second ensure
- **WHEN** `ensure` is run twice with the same arguments
- **THEN** the second run SHALL succeed, report the same path, and create no additional worktree

### Requirement: Branch mode of ensure
The script SHALL provide `ensure --branch wu/<id>` for the Build node, where `<id>` matches `^[a-z0-9][a-z0-9-]*$`; any other value SHALL fail as a usage error before git is touched.

The main checkout SHALL be resolved in branch mode with `git rev-parse --git-common-dir` (made absolute), taking its parent directory as the main checkout. Branch mode MUST NOT use `git rev-parse --show-toplevel`, because that returns the linked worktree itself when the script is run from inside one. A bare repository has no main checkout and SHALL fail as not-a-git-repository.

The worktree path SHALL be deterministic: `<parent-of-main-checkout>/<main-checkout-basename>.worktrees/wu/<id>`. This is a sibling directory of the main checkout named after it, so two projects never collide on the same path and a worktree is never nested inside the main checkout. The script SHALL NOT use a bare `../wu/<id>` path.

The script SHALL create or reuse the worktree as follows:
- If branch `wu/<id>` does not exist, create the worktree and the branch from the current `HEAD` of the main checkout.
- If branch `wu/<id>` exists and no worktree is registered for it (the CI-red reopen after Wrap removed the worktree), create a worktree on the existing branch without creating a different branch and without resetting it.
- If the computed path is already registered, its directory exists, and it has branch `wu/<id>` checked out, reuse it.
- If the computed path exists on disk but is not a registered worktree of this repository, or is registered with a different branch, or branch `wu/<id>` is checked out in a different existing worktree, fail with the collision error and change nothing.
- Stale-registration recovery SHALL apply only when the registration for the computed path (or for branch `wu/<id>`) refers to a directory that no longer exists on disk. The script SHALL first stat the registered directory; only when it is absent SHALL it remove that single exact registration and retry the add once. When git reports the registration as unusable but the directory still exists, the script SHALL fail with the stale-with-directory-present error. An existing directory is a collision and SHALL NEVER be removed, including with `--force`.
- The script MUST NOT run global `git worktree prune`, in any mode or situation.

#### Scenario: First open
- **WHEN** `ensure --branch wu/<id>` runs and neither the branch nor a worktree exists
- **THEN** the script SHALL create branch `wu/<id>` from the main checkout's `HEAD`, add the worktree at the computed path, and report `"action": "created"` and the path

#### Scenario: Run from inside a linked worktree
- **WHEN** the script runs in branch mode with the working directory inside a linked worktree of the project
- **THEN** it SHALL resolve the main checkout through `git rev-parse --git-common-dir` and compute the same path as when run from the main checkout

#### Scenario: Path is project-scoped and not nested
- **WHEN** two different projects open worktrees for the same `<id>`
- **THEN** their paths SHALL differ, and neither path SHALL lie inside its main checkout

#### Scenario: CI-red reopen
- **WHEN** branch `wu/<id>` exists, no worktree is registered for it, and `ensure --branch wu/<id>` runs
- **THEN** the script SHALL add a worktree on the existing branch, SHALL NOT create or reset any branch, and SHALL report `"action": "reopened"`

#### Scenario: Stale registration, directory absent
- **WHEN** the computed path is registered but its directory does not exist on disk
- **THEN** the script SHALL stat the directory, remove only that exact registration, retry the add once, and report `"action": "recovered-stale"`

#### Scenario: Stale registration, directory present
- **WHEN** git reports the registration for the computed path as unusable but the directory exists on disk
- **THEN** the script SHALL fail with the stale-with-directory-present error and SHALL NOT remove the registration or the directory

#### Scenario: Collision
- **WHEN** the computed path exists on disk but is not a registered worktree on branch `wu/<id>`
- **THEN** the script SHALL fail with the collision error and SHALL NOT modify, reuse, or remove that path

#### Scenario: Invalid id
- **WHEN** `ensure --branch` receives a value that is not `wu/<id>` with `<id>` matching `^[a-z0-9][a-z0-9-]*$`
- **THEN** the script SHALL fail with a usage error before running any git command that changes state

### Requirement: Detach mode of ensure
The script SHALL provide `ensure --detach <sha>` for the `codewalk` skill. The behavior SHALL preserve the "Worktree lifecycle" and "Citation boundaries and fallback" prose of `skills/codewalk/SKILL.md` Step 2 (as of this change) as the oracle; a later codewalk change replaces that prose with a call to this subcommand, and no observable behavior SHALL change.

Detach mode SHALL resolve `<toplevel>` with `git rev-parse --show-toplevel` run from the current working directory, intentionally unlike branch mode: the codewalk worktree lives inside the repository tree being read, and when launched from a linked worktree the walk MUST stay inside that checkout, not the main checkout. `<sha>` is the full SHA of the commit to pin; `<short-sha>` is its abbreviation. The worktree path SHALL be `<toplevel>/.codewalk/worktree/codewalk-<short-sha>`.

Detach mode SHALL:
1. Reuse an existing worktree for the same path, never rebuilding it, only when `git -C <path> rev-parse HEAD` equals the full SHA and the probe-read succeeds. Otherwise the directory is treated as unusable: stale-registration recovery when it applies, else probe failure. An unusable but present directory SHALL NOT be deleted or rebuilt.
2. Otherwise create the worktree with hooks disabled and LFS smudge off, never executing project code, equivalent to `GIT_LFS_SKIP_SMUDGE=1 git -c core.hooksPath=/dev/null worktree add --detach <path> <sha>`.
3. If creation fails because the exact path is already registered to git (a stale registration whose directory was deleted by hand), remove that exact registration only (`git worktree remove --force` on that exact path), then retry the add once. The script MUST NEVER run global `git worktree prune`.
4. On creation, append the line `.codewalk/worktree/` to the file reported by `git rev-parse --git-path info/exclude`: create its parent directory if missing, skip the append when that exact line is already present, and when the file's last line lacks a trailing newline add one first. The script SHALL NOT touch any tracked file.
5. Probe-read one tracked file inside the worktree, on reuse as well as on creation, before reporting the pin.
6. Report the pin as the full SHA on success. When the worktree cannot be created for any reason other than the exact-path stale registration of step 3 (any other `git worktree add` failure, including a failed retry), the result SHALL report the probe-failure error with pin `"unknown"`. When the probe fails, or no git repository, no commit, or no usable worktree exists, the result SHALL report the pin `"unknown"` together with the probe-failure or not-a-git-repository error, so the consumer can fall back to reading the working tree directly.

Detach mode SHALL NOT remove worktrees except through step 3's exact-path stale recovery, SHALL have no automatic cleanup, and SHALL NEVER run setup: its code path MUST NOT read `.harness/worktree-setup.json` or execute any project-declared command.

#### Scenario: Create pinned worktree
- **WHEN** `ensure --detach <sha>` runs and no worktree exists at `<toplevel>/.codewalk/worktree/codewalk-<short-sha>`
- **THEN** the script SHALL create a detached worktree there with hooks disabled and LFS smudge off, append the exclude line, and report the full SHA as the pin

#### Scenario: Reuse by SHA
- **WHEN** a worktree at that path exists, its `HEAD` equals the full SHA, and the probe-read succeeds
- **THEN** the script SHALL reuse it without rebuilding and report the pin

#### Scenario: Reuse check fails
- **WHEN** a worktree at that path exists but its `HEAD` differs from the full SHA or the probe-read fails
- **THEN** the script SHALL NOT delete or rebuild it, SHALL report the probe-failure error with pin `"unknown"`, and the consumer SHALL fall back to reading the working tree

#### Scenario: Generic creation failure
- **WHEN** `git worktree add` fails for a reason other than the exact-path stale registration
- **THEN** the script SHALL report the probe-failure error with pin `"unknown"` so the consumer falls back to reading the working tree

#### Scenario: Stale registration with the directory deleted by hand
- **WHEN** adding fails because the exact path is registered but its directory is gone
- **THEN** the script SHALL remove only that exact registration, retry the add once, and never run global prune

#### Scenario: Exclude file newline handling
- **WHEN** the `info/exclude` file's last line lacks a trailing newline and the exclude line is not yet present
- **THEN** the script SHALL add the newline first, then append `.codewalk/worktree/`; when the line is already present it SHALL append nothing; when the parent directory is missing it SHALL create it

#### Scenario: Launched from a linked worktree
- **WHEN** `ensure --detach` runs inside a linked worktree
- **THEN** `<toplevel>` SHALL be that linked worktree's top level, not the main checkout

#### Scenario: Detach never runs setup
- **WHEN** `ensure --detach` runs in a project that has `.harness/worktree-setup.json`
- **THEN** the script SHALL NOT read it and SHALL NOT execute any project command

#### Scenario: Not a git repository
- **WHEN** `ensure --detach` runs outside a git repository or in a repository with no commits
- **THEN** the script SHALL report the not-a-git-repository error with pin `"unknown"` and create nothing

### Requirement: Setup subcommand
The script SHALL provide `setup --worktree <path>` for the Build node, separate from `ensure`: `ensure` never runs setup, and `setup` never creates or removes a worktree. The subcommand SHALL resolve the main checkout with `git rev-parse --git-common-dir` and read `.harness/worktree-setup.json` from the main checkout, never from the worktree, and MUST NOT modify that file. It SHALL refuse a `--worktree` path that is not a registered worktree of this repository, and SHALL refuse the main checkout itself, a detached-HEAD worktree, and any path under `.codewalk/worktree/`, so detach-mode worktrees structurally never receive setup.

The script SHALL validate the config before executing anything and fail with a configuration error when: the file contains a key other than the documented ones (top-level `version`, `setup`, and `copy`; per `copy` entry `path` and `readonly`); `version` is present with a value other than the supported integer `1`; a `copy` path is absolute or contains a `..` segment (path traversal); a field has the wrong type; or the JSON is invalid. A missing file or empty `setup` and `copy` SHALL be a successful no-op. A missing `copy` source in the main checkout SHALL fail with the setup-or-copy failure error.

Execution SHALL run the `setup` commands in listed order inside the worktree, then process each `copy` entry from the main checkout to the same relative path in the worktree. Copying SHALL prefer copy-on-write (`cp -c` on APFS, `cp --reflink=auto` where supported) and SHALL fall back to a plain copy when copy-on-write is unavailable. A symlink into the worktree SHALL be created only for an entry with `"readonly": true`; every other entry SHALL be copied, never symlinked, because a shared mutable path breaches worktree isolation. The first failing command or copy SHALL stop the run and fail with the setup-or-copy failure error, naming the failing step. Re-running SHALL converge to the same state (copies overwrite with the same content; setup commands are as idempotent as the commands the project declares).

#### Scenario: Setup runs in order
- **WHEN** `setup --worktree <path>` runs with a valid config
- **THEN** the script SHALL run each `setup` command in order inside the worktree and then copy each `copy` entry from the main checkout

#### Scenario: Config read from the main checkout
- **WHEN** `.harness/worktree-setup.json` exists only in the main checkout and not in the worktree
- **THEN** the script SHALL read it from the main checkout

#### Scenario: Unknown key rejected
- **WHEN** the config contains a key outside the documented set (for example `env`; `version`, `setup`, and `copy` are documented)
- **THEN** the script SHALL fail with a configuration error and SHALL execute nothing

#### Scenario: Version accepted and checked
- **WHEN** the config is `{"version": 1, "setup": [], "copy": []}`
- **THEN** the script SHALL accept it, and for any other `version` value (for example `2`) it SHALL fail with a configuration error and execute nothing

#### Scenario: Path traversal rejected
- **WHEN** a `copy` path is absolute or contains `..`
- **THEN** the script SHALL fail with a configuration error and SHALL copy nothing

#### Scenario: Missing copy source
- **WHEN** a `copy` source does not exist in the main checkout
- **THEN** the script SHALL fail with the setup-or-copy failure error naming that path

#### Scenario: Copy-on-write with fallback
- **WHEN** a `copy` entry is copied on a filesystem that supports copy-on-write
- **THEN** the script SHALL use it, and SHALL use a plain copy otherwise

#### Scenario: Symlink only when readonly
- **WHEN** a `copy` entry is marked `"readonly": true`
- **THEN** the script MAY symlink it; for any other entry it SHALL copy and SHALL NOT symlink

#### Scenario: Setup refused for a detach worktree
- **WHEN** `setup --worktree` is given a path under `.codewalk/worktree/` or a detached-HEAD worktree
- **THEN** the script SHALL refuse with a usage error and run nothing

#### Scenario: Empty config
- **WHEN** the config has empty `setup` and `copy`, or does not exist
- **THEN** the script SHALL succeed and do nothing

### Requirement: Deliberately omitted operations
The script SHALL NOT provide a `remove` subcommand or any other operation that deletes a worktree or branch on request. This omission is deliberate: worktree cleanup belongs to Wrap (Wrap removes the worktree, not the branch) and, for codewalk, to the user; a scripted remove would invite Build or other actors to delete worktrees they do not own. The script's only removals are the exact-path stale-registration recoveries defined above, each conditioned on its specific preconditions. The script MUST NEVER run global `git worktree prune`.

#### Scenario: No remove subcommand
- **WHEN** the script is invoked with `remove` or any unknown subcommand
- **THEN** it SHALL fail with a usage error and change nothing

#### Scenario: No global prune
- **WHEN** the script's source is inspected
- **THEN** it SHALL contain no invocation of `git worktree prune`
