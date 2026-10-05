## MODIFIED Requirements

### Requirement: Project bootstrap

Graph-build SHALL include a per-project bootstrap (the init tier) run before any graph-run: survey the repository (structure, conventions, how things are executed) and record the project's facts machine-readably in one project config (`.harness/config.json`), written through a deterministic script, never by hand. The config SHALL carry a schema version and hold every project fact as a section — at minimum VCS (default branch and optional remote; no free-form prose fields), the work-units, archive, and worktrees locations, the worktree-setup section (setup commands and copy entries), the memory section (the current-truth documents with their budgets, the ledger location, and optionally the maintenance thresholds), and optionally the graph definition path. Every config field SHALL have a runtime consumer; a fact that only a human reads belongs in the project's own documentation, not the config. Budget keys in the memory section SHALL be bare file names (no path separators), resolved under `.harness/`, and the config writer SHALL enforce this at validation time with the same grammar the memory script applies. The config holds no command catalog: what a node can execute is declared on that node in the graph definition. After writing a config whose memory section declares budgets, the bootstrap SHALL create each budgeted current-truth document that does not yet exist as a minimal skeleton under `.harness/`, and SHALL never overwrite one that exists. The tool-availability gate SHALL run before a graph definition is accepted: every command and CLI mounted by any of its nodes (steps included) and every command in the config's worktree-setup section is probed for existence and startability only — PATH resolution plus a harmless invocation such as `--version` or `--help`, never executing the command's real effect — and a missing required tool blocks acceptance and is reported by name. The bootstrap is the single writer of this config; every other actor only reads it. A consuming script SHALL validate the config against its declared schema version and consume only its own section, so one section's evolution is caught by versioning rather than silently breaking another consumer.

#### Scenario: Tool missing
- **WHEN** the gate finds that a command mounted by a node of the definition cannot run
- **THEN** the definition SHALL NOT be accepted, no run SHALL start, and the human SHALL receive a report naming the tool

#### Scenario: Worktree needs recorded
- **WHEN** the bootstrap finds that a fresh worktree needs a dependency install command and an untracked env file
- **THEN** it SHALL record the command and the copy entry in the config's worktree-setup section, and SHALL write the section even when nothing is needed (explicitly empty lists)

#### Scenario: A node executes only what it mounts
- **WHEN** a node's work or verification needs to run a project command
- **THEN** that command SHALL be declared in the node's mounts, and a command no node mounts is not part of the graph

#### Scenario: Config written through the script
- **WHEN** the bootstrap writes a config file
- **THEN** it SHALL draft the JSON and write it via the deterministic script, which validates the schema and writes atomically; a hand-written config file is a violation

#### Scenario: Budget key with a path separator rejected
- **WHEN** a config draft declares a memory budget under a key containing a path separator (such as `.harness/ARCHITECTURE.md`)
- **THEN** the config writer SHALL reject the draft at validation time, naming the key and the bare-file-name rule, instead of accepting a config the memory script will later refuse

#### Scenario: Skeleton created at bootstrap
- **WHEN** the bootstrap writes a config whose memory section declares a budget for a document that does not exist under `.harness/`
- **THEN** it SHALL create that document as a minimal skeleton so the memory layer is operative from the first run, and SHALL leave any existing document untouched

#### Scenario: Retired config field rejected with its name
- **WHEN** a config draft carries a field the schema no longer declares (such as a prose branching-strategy description)
- **THEN** validation SHALL reject the draft naming the unknown key, and the remedy is re-drafting the config without it
