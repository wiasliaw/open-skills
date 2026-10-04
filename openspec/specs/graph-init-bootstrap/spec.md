## Purpose

The deterministic pre-graph bootstrap that surveys the repository, checks tool availability, and records worktree setup needs.

## Requirements

### Requirement: init bootstrap purpose and type
The init bootstrap step SHALL be defined as a deterministic pre-graph step (not a node). Purpose: Prepare a repository for graph execution by surveying its responsibilities and current state and confirming that the required local tools are available. It runs outside the graph and is never a node.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** init bootstrap SHALL be typed as deterministic pre-graph step (not a node)

### Requirement: init bootstrap state inputs
init bootstrap SHALL read only the following from state and the environment: the repository itself: root CLAUDE.md, `.harness/`, repo structure; local tool availability (CLI, test runner, deploy tooling). It reads no work-unit folder because none exists yet.

#### Scenario: Inputs available
- **WHEN** init bootstrap starts
- **THEN** the inputs listed for init bootstrap SHALL be available to it

### Requirement: init bootstrap state outputs
init bootstrap SHALL produce the following: an init report delivered to the human and to the Trigger node: repo survey summary and tool availability result; and the worktree setup config `.harness/worktree-setup.json`. It creates no work-unit folder.

#### Scenario: Outputs recorded
- **WHEN** init bootstrap completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: init bootstrap outgoing edges
init bootstrap SHALL route only by the following guard conditions:

- init completed and all required tools available -> Trigger (graph starts)
- a required tool is unavailable -> none: the graph does not start and the failure is reported to the human

#### Scenario: Init completed and all required tools available
- **WHEN** init completed and all required tools available
- **THEN** the next step SHALL be Trigger (graph starts)

#### Scenario: A required tool is unavailable
- **WHEN** a required tool is unavailable
- **THEN** the next step SHALL be none: the graph does not start and the failure is reported to the human

### Requirement: init bootstrap mounted skills
The skills mounted on init bootstrap SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** init bootstrap needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Init is outside the graph
The system SHALL treat init as a pre-graph bootstrap and MUST NOT model it as a graph node or give it incoming or outgoing graph edges.

#### Scenario: Graph starts only after init
- **WHEN** init has not completed
- **THEN** the graph SHALL NOT start and Trigger SHALL NOT run

### Requirement: Missing tools block the graph
The system SHALL check local tool availability during init and, if a required tool is unavailable, SHALL NOT start the graph and SHALL report the missing tool to the human.

#### Scenario: Tool missing
- **WHEN** init finds a required CLI, test, or deploy tool unavailable
- **THEN** the graph SHALL NOT start AND the human SHALL receive a report naming the tool

### Requirement: Init records worktree setup needs
During its repository survey, init SHALL investigate what a fresh `git worktree add` lacks, because a new worktree contains tracked files only: (a) the setup command or commands that regenerate dependencies in a fresh worktree; and (b) untracked assets that cannot be cheaply regenerated, such as large data or env files, which must be copied. Init SHALL record its findings in a dedicated machine-readable config file at the fixed path `.harness/worktree-setup.json`, whose minimal schema is `{"version": 1, "setup": [<command string>...], "copy": [{"path": <repo-relative path>, "readonly": <boolean, optional>}...]}`. Init SHALL write the file even when nothing is needed, in which case `setup` and `copy` are explicitly empty lists, so that Build can rely on the file's presence. The config is init bootstrap output: no other actor writes it, and every other actor reads it. This write is the single pre-graph exception to the rule that Wrap alone writes long-term memory: it happens once, before the graph starts, at the init-completion moment, and init is not a node, so no node other than Wrap writes `.harness/`.

#### Scenario: Needs found
- **WHEN** init finds that a fresh worktree needs a dependency install command and an untracked env file
- **THEN** init SHALL write `.harness/worktree-setup.json` with the command in `setup` and the env file path in `copy`

#### Scenario: Nothing needed
- **WHEN** init finds that a fresh worktree needs no setup command and no copied asset
- **THEN** init SHALL still write `.harness/worktree-setup.json` with `setup` and `copy` as empty lists

#### Scenario: Single writer
- **WHEN** any actor other than init bootstrap needs a different setup
- **THEN** it SHALL NOT edit `.harness/worktree-setup.json` and SHALL report the need instead
