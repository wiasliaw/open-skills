## ADDED Requirements

### Requirement: Self-managed, agent-agnostic worktree page
The `use-worktree` skill page SHALL instruct the agent executing Build to create and manage the worktree itself by running plain `git worktree` commands directly. The skill MUST be agent-agnostic: the page MUST NOT rely on any Claude Code-specific mechanism (no native worktree isolation, no `EnterWorktree`, no sandbox) and MUST NOT require any particular agent runtime. The page SHALL state concrete commands and guardrails, at minimum: (1) creating the worktree with `git worktree add` using the single prescribed name `wu/<id>` (the branch name, which also names the worktree); (2) the name-collision handling and the missing-worktree handling specified below; (3) no nested worktrees, so Build MUST NOT create a worktree from inside another worktree of the work unit; (4) Build writes only inside the worktree. The page MAY be longer than one page to carry these commands and guardrails. The skill SHALL be mounted on Build as a capability and MUST NOT be modeled as a node.

#### Scenario: Page states commands, not a platform mechanism
- **WHEN** the skill page is read
- **THEN** it SHALL direct the agent to create the worktree with `git worktree add` and SHALL NOT reference native worktree isolation, `EnterWorktree`, or the sandbox

#### Scenario: Guardrails stated
- **WHEN** the skill page is read
- **THEN** it SHALL state the single prescribed name `wu/<id>`, the collision and missing-worktree handling, the no-nested-worktrees rule, and the write-only-inside-the-worktree rule

#### Scenario: Self-contained
- **WHEN** the skill is implemented from this spec
- **THEN** its page SHALL cover every requirement below without needing supporting scripts

### Requirement: When Build opens a worktree
The page SHALL require Build to work only inside an isolated worktree, and SHALL require Build to open one before writing any code whenever no live worktree exists for the work unit. A live worktree exists when `build/worktree.md` records a worktree and that worktree is still present on disk. When Build is re-entered and a live worktree exists (after a Review failure or Advisor guidance), the page SHALL require Build to reuse it and MUST NOT open another. When the record names a worktree that is no longer present (Wrap removed it before opening the PR, so Build is re-entered on red CI), the page SHALL require Build to open a fresh worktree on the existing branch `wu/<id>`, which still carries the work, and to rewrite `build/worktree.md`. A work unit that never reaches Build SHALL NOT have a worktree opened for it.

#### Scenario: First Build entry
- **WHEN** Build starts a work unit and no worktree is recorded for it
- **THEN** Build SHALL open a worktree before writing code and SHALL write all code there

#### Scenario: Re-entry after failure with a live worktree
- **WHEN** Build is re-entered after a failed Review or Advisor guidance and the recorded worktree is present
- **THEN** Build SHALL continue in the recorded worktree and SHALL NOT open a second one

#### Scenario: Re-entry after CI red
- **WHEN** Build is re-entered after red CI, Wrap has removed the worktree, and `build/worktree.md` names the missing worktree
- **THEN** Build SHALL open a fresh worktree on the existing branch `wu/<id>`, rewrite `build/worktree.md` with the new path, re-run the worktree setup step, and write code there

#### Scenario: No Build, no worktree
- **WHEN** a work unit ends or is graded no-op before Build
- **THEN** no worktree SHALL have been opened for it

### Requirement: Worktree setup after creation
Because a fresh `git worktree add` yields tracked files only, the page SHALL require Build to run the setup step after every `git worktree add`, both on first open and on CI-red reopen, before writing any code. The page SHALL require Build to read `.harness/worktree-setup.json` (written by init bootstrap) from the project's main checkout, not from the new worktree, and Build MUST NOT modify that file. The setup step SHALL run each command in `setup`, in order, inside the new worktree, and SHALL copy each `copy` entry from the main checkout into the same relative path in the worktree. Copying SHALL prefer copy-on-write (`cp -c` on APFS, `cp --reflink=auto` where supported) and SHALL fall back to a plain copy. The page MUST NOT permit symlinking a mutable directory or file between worktrees, because that breaches isolation; a symlink is permitted only for an entry that the config marks `"readonly": true`. If a setup command fails or a copy source is missing, Build SHALL record blocked.

#### Scenario: First open
- **WHEN** Build creates a worktree for a work unit for the first time
- **THEN** Build SHALL run the `setup` commands and copy the `copy` entries into it before writing code

#### Scenario: Reopen after CI red
- **WHEN** Build reopens a fresh worktree on the existing branch after red CI
- **THEN** Build SHALL run the setup step again, because the new worktree has none of the earlier setup

#### Scenario: Copy-on-write preferred
- **WHEN** a `copy` entry is copied
- **THEN** Build SHALL use copy-on-write where the filesystem supports it and a plain copy otherwise

#### Scenario: No mutable symlinks
- **WHEN** a `copy` entry is not marked `"readonly": true`
- **THEN** Build SHALL copy it and SHALL NOT symlink it into the worktree

#### Scenario: Empty config
- **WHEN** `.harness/worktree-setup.json` has empty `setup` and `copy`
- **THEN** Build SHALL perform no setup and proceed

### Requirement: Cadence is per work unit
The page SHALL state that one worktree serves the whole work unit and is reused across all of its tickets, and SHALL NOT require a worktree per ticket. Build SHALL still implement one ticket at a time inside that worktree.

#### Scenario: Second ticket
- **WHEN** Build moves from one ticket to the next within a work unit
- **THEN** it SHALL keep working in the same worktree

### Requirement: Deterministic naming
The page SHALL fix a single identifier for the work unit's worktree: the branch name `wu/<id>`, where `<id>` is the work-unit id. The worktree is named by the branch name verbatim, so its path ends in `wu/<id>`, for example `git worktree add ../wu/<id> wu/<id>`; there is no separate worktree-name rule. For example, work unit `2026-10-01-wor-37-use-worktree-spec` gives branch `wu/2026-10-01-wor-37-use-worktree-spec` and a worktree whose path ends in `wu/2026-10-01-wor-37-use-worktree-spec`. The name MUST NOT contain a ticket id, a timestamp, or random characters. If a worktree at that name already exists and no Build record names it, Build SHALL report blocked instead of reusing or overwriting it.

#### Scenario: Name derived from id
- **WHEN** Build opens a worktree for work unit `<id>`
- **THEN** the branch SHALL be `wu/<id>` and the worktree SHALL be named by that same branch name, its path ending in `wu/<id>`

#### Scenario: Missing worktree, branch still exists
- **WHEN** `build/worktree.md` names a worktree that is no longer present and branch `wu/<id>` still exists
- **THEN** Build SHALL treat this as CI-red re-entry, reopen a worktree on that branch, and SHALL NOT create a different branch or report a collision

#### Scenario: Name collision without a record
- **WHEN** a worktree named `wu/<id>` exists but `build/worktree.md` does not record it
- **THEN** Build SHALL record blocked and SHALL NOT use or remove that worktree

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
