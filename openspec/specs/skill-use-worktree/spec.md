## Requirements

### Requirement: Script-delegated, agent-agnostic worktree page
The `use-worktree` skill page SHALL delegate the worktree mechanics (creating, reusing, and recovering the worktree; running setup) to the script `scripts/worktree.mjs` specified by the `worktree-script` capability, and SHALL keep the policy: when Build opens a worktree, cadence, naming, the Build record `build/worktree.md`, Wrap-owned cleanup, and the scope boundary. The page SHALL state the exact invocations (`ensure --branch wu/<id>`, then `setup --worktree <path>`) and how to read the script's stdout JSON and exit code. The page MUST NOT reproduce raw `git worktree add`/`remove` command sequences as instructions for the agent to run, and MUST NOT rely on any Claude Code-specific mechanism (no native worktree isolation, no `EnterWorktree`, no sandbox). The skill remains agent-agnostic at the dispatch level: any agent that can run `node` can use it. The page SHALL state Node.js >= 20 as an explicit prerequisite. The page MAY be longer than one page to carry these invocations and guardrails. The skill SHALL be mounted on Build as a capability and MUST NOT be modeled as a node.

#### Scenario: Page delegates mechanics
- **WHEN** the skill page is read
- **THEN** it SHALL direct the use of `worktree.mjs` for creating, reusing, and setting up the worktree and SHALL NOT instruct the agent to run raw `git worktree` commands or reference native worktree isolation, `EnterWorktree`, or the sandbox

#### Scenario: Policy and prerequisite stated
- **WHEN** the skill page is read
- **THEN** it SHALL state the name `wu/<id>`, the cadence, the Build record, Wrap-owned cleanup, the write-only-inside-the-worktree rule, and Node.js >= 20 as a prerequisite

### Requirement: Script resolution
The page SHALL state how the script path is resolved: when `${CLAUDE_PLUGIN_ROOT}` is available, the path is `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`; otherwise the orchestrator SHALL pass the absolute path of the script in the Build dispatch, which is the agent-agnostic fallback. The directory `scripts/` at the plugin root SHALL be treated as a stable path contract; the former directory `skills/use-worktree/scripts/` is no longer a contract. The script SHALL always be run with the consumer project as the working directory, never from the plugin directory.

#### Scenario: Plugin root available
- **WHEN** `${CLAUDE_PLUGIN_ROOT}` is available
- **THEN** the page SHALL resolve the script as `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs` and run it with `node` from the consumer project

#### Scenario: Plugin root unavailable
- **WHEN** `${CLAUDE_PLUGIN_ROOT}` is not available
- **THEN** the page SHALL use the absolute script path passed by the orchestrator in the dispatch
### Requirement: Failure handling without improvisation
When the script fails (any non-zero exit or `"ok": false`), is unavailable (path unresolved or missing), or Node.js >= 20 is unavailable, the Build stage SHALL record blocked with the script's `"error"` code and message, and nobody acting for Build MUST improvise with raw `git worktree` commands, delete a colliding path, or create the worktree by any other means. The page SHALL state that a collision, a stale registration with its directory present, and a setup or copy failure are resolved by a human or the orchestrator, not by Build.

#### Scenario: Script fails
- **WHEN** `worktree.mjs ensure` exits non-zero
- **THEN** Build SHALL record blocked with the error code and message and SHALL NOT run raw `git worktree` commands

#### Scenario: Script unavailable
- **WHEN** the script path cannot be resolved or Node.js >= 20 is missing
- **THEN** Build SHALL record blocked and SHALL NOT create the worktree another way

### Requirement: Who runs the script
Provisioning the worktree SHALL be assigned to the orchestrator, not to the dispatched Build actor: the orchestrator SHALL run `ensure --branch wu/<id>` and then `setup --worktree <path>` before dispatching the Build actor (on first Build entry and on every CI-red reopen), and SHALL pass the worktree path (and the script's absolute path when `${CLAUDE_PLUGIN_ROOT}` is unavailable) in the dispatch. This resolves the tension with the implementor rule that the Build actor performs no VCS operations: the Build actor never runs `git worktree`, branch, commit, or staging operations and never invokes the script; it only works inside the path it is given. If the dispatch carries no usable worktree path, the Build actor SHALL report blocked. A script failure at orchestrator time is recorded as Build blocked per the failure-handling requirement. The Build actor writes `build/worktree.md` from the path and branch it was given.

#### Scenario: Orchestrator provisions before dispatch
- **WHEN** Build is about to start or be re-entered after CI red
- **THEN** the orchestrator SHALL run `ensure --branch wu/<id>` and `setup --worktree <path>` first and dispatch the Build actor with the resulting path

#### Scenario: Actor performs no VCS operations
- **WHEN** the Build actor runs
- **THEN** it SHALL NOT run `worktree.mjs` or any `git worktree`, branch, commit, or staging command, and SHALL work only inside the path from the dispatch

#### Scenario: No path in the dispatch
- **WHEN** the Build actor is dispatched without a usable worktree path
- **THEN** it SHALL report blocked

### Requirement: When Build opens a worktree
The page SHALL require Build to work only inside an isolated worktree, and SHALL require a worktree to be opened (by the orchestrator, per the script requirement above) before Build writes any code whenever no live worktree exists for the work unit. A live worktree exists when `build/worktree.md` records a worktree and that worktree is still present on disk. When Build is re-entered and a live worktree exists (after a Review failure or Advisor guidance), the page SHALL require it to be reused and MUST NOT open another. When the record names a worktree that is no longer present (Wrap removed it before opening the PR, so Build is re-entered on red CI), the page SHALL require a fresh worktree to be opened on the existing branch `wu/<id>`, which still carries the work, and `build/worktree.md` to be rewritten. A work unit that never reaches Build SHALL NOT have a worktree opened for it. Opening, reuse, and reopening are performed by `ensure --branch wu/<id>`, which decides among created, reused, and reopened itself; the page states the policy and reads the script's result.

#### Scenario: First Build entry
- **WHEN** Build starts a work unit and no worktree is recorded for it
- **THEN** a worktree SHALL be opened (via the script) before code is written and all code SHALL be written there

#### Scenario: Re-entry after failure with a live worktree
- **WHEN** Build is re-entered after a failed Review or Advisor guidance and the recorded worktree is present
- **THEN** Build SHALL continue in the recorded worktree and SHALL NOT open a second one

#### Scenario: Re-entry after CI red
- **WHEN** Build is re-entered after red CI, Wrap has removed the worktree, and `build/worktree.md` names the missing worktree
- **THEN** a fresh worktree SHALL be opened on the existing branch `wu/<id>`, `build/worktree.md` SHALL be rewritten with the new path, the setup step SHALL run again, and code SHALL be written there

#### Scenario: No Build, no worktree
- **WHEN** a work unit ends or is graded no-op before Build
- **THEN** no worktree SHALL have been opened for it

### Requirement: Worktree setup after creation
Because a fresh worktree has tracked files only, the page SHALL require the setup step, `setup --worktree <path>`, to run after every `ensure --branch` that creates or reopens a worktree (first open and CI-red reopen), before the Build actor writes any code. The mechanics (reading `.harness/worktree-setup.json` from the main checkout, ordered `setup` commands, copy-on-write copies with plain-copy fallback, symlinks only for `"readonly": true` entries, config validation) are owned by the script per the `worktree-script` capability; the page SHALL state the policy: Build MUST NOT modify the config file, MUST NOT symlink a mutable directory or file between worktrees, and a setup or copy failure means Build is blocked.

#### Scenario: First open
- **WHEN** a worktree is created for a work unit for the first time
- **THEN** `setup --worktree <path>` SHALL run before code is written

#### Scenario: Reopen after CI red
- **WHEN** a fresh worktree is opened on the existing branch after red CI
- **THEN** the setup step SHALL run again, because the new worktree has none of the earlier setup

#### Scenario: Setup failure
- **WHEN** `setup` exits non-zero
- **THEN** Build SHALL record blocked and SHALL NOT proceed to write code

#### Scenario: Empty config
- **WHEN** `.harness/worktree-setup.json` has empty `setup` and `copy`
- **THEN** the setup step SHALL do nothing and Build SHALL proceed

### Requirement: Cadence is per work unit
The page SHALL state that one worktree serves the whole work unit and is reused across all of its tickets, and SHALL NOT require a worktree per ticket. Build SHALL still implement one ticket at a time inside that worktree.

#### Scenario: Second ticket
- **WHEN** Build moves from one ticket to the next within a work unit
- **THEN** it SHALL keep working in the same worktree

### Requirement: Deterministic naming
The page SHALL fix a single identifier for the work unit's worktree: the branch name `wu/<id>`, where `<id>` is the work-unit id. The worktree is named by the branch name verbatim, so its path ends in `wu/<id>`; the script resolves the exact path deterministically (`<parent-of-main-checkout>/<main-checkout-basename>.worktrees/wu/<id>`), and the page SHALL NOT prescribe a different path; there is no separate worktree-name rule. For example, work unit `2026-10-01-wor-37-use-worktree-spec` gives branch `wu/2026-10-01-wor-37-use-worktree-spec` and a worktree whose path ends in `wu/2026-10-01-wor-37-use-worktree-spec`. The name MUST NOT contain a ticket id, a timestamp, or random characters. If the computed path exists and is not a worktree on branch `wu/<id>`, the script reports a collision and Build SHALL report blocked instead of reusing or overwriting it.

#### Scenario: Name derived from id
- **WHEN** Build opens a worktree for work unit `<id>`
- **THEN** the branch SHALL be `wu/<id>` and the worktree SHALL be named by that same branch name, its path ending in `wu/<id>`

#### Scenario: Missing worktree, branch still exists
- **WHEN** `build/worktree.md` names a worktree that is no longer present and branch `wu/<id>` still exists
- **THEN** this SHALL be treated as CI-red re-entry, `ensure --branch wu/<id>` SHALL reopen a worktree on that branch, and no different branch SHALL be created and no collision reported

#### Scenario: Name collision
- **WHEN** the script reports a collision for `wu/<id>`
- **THEN** Build SHALL record blocked and nobody SHALL use or remove the colliding path to get past it

### Requirement: Build leaves a record for Wrap
When Build opens the worktree, the page SHALL require Build to write `build/worktree.md` in the work-unit folder's `build/` stage directory, stating the branch name `wu/<id>` (which is also the worktree's name) and the worktree's filesystem path. The record SHALL be written by Build itself as a stage artifact and SHALL NOT be a new `state.json` field. The record SHALL remain in place after Build completes so Wrap can read it.

#### Scenario: Record written
- **WHEN** Build opens a worktree
- **THEN** `build/worktree.md` SHALL exist with the branch name and path before Build writes code

#### Scenario: Wrap finds the worktree
- **WHEN** Wrap starts
- **THEN** it SHALL be able to locate the worktree to remove from `build/worktree.md` without searching the filesystem

### Requirement: Cleanup belongs to Wrap
The page SHALL state that Wrap removes the worktree (not the branch) before opening the PR, consistent with the Wrap node's "Wrap cleans residue" requirement. Build MUST NOT remove the worktree, and the skill MUST NOT instruct or enable Build to remove it, whether Build finishes ready-for-review, blocks, or is retried. Build MAY discard its own uncommitted changes inside the worktree but MUST NOT delete the worktree itself.

#### Scenario: Build leaves the worktree
- **WHEN** Build ends as ready-for-review or blocked
- **THEN** the worktree SHALL still exist and `build/worktree.md` SHALL still name it

#### Scenario: Wrap removes before the PR
- **WHEN** Wrap opens the PR
- **THEN** the worktree named in `build/worktree.md` SHALL already have been removed by Wrap

### Requirement: Scope boundary with long-term memory
The page SHALL restate that Build writes only inside the worktree and that code is the only thing it writes there, consistent with the Build node's writes-only-code rule, and that the worktree MUST NOT be used to write `.harness/`. This restriction is contractual and verified by the reviewer; the skill does not depend on runtime enforcement.

#### Scenario: Harness untouched
- **WHEN** Build finishes in the worktree
- **THEN** no `.harness/` file SHALL have been modified through the worktree
