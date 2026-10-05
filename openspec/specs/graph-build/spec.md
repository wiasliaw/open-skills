## Purpose

The build phase: constructing the factory. Graph-build defines what every node does and how it is verified, defines the edges that route data to the next stage, declares every capability a node uses, and bootstraps the project so runs can start.

## Requirements

### Requirement: The graph definition is reviewable data

The graph SHALL be defined as reviewable content (a graph definition), not as code inside agents: node behavior changes by changing the definition, and the run-time dispatch is constructed from it. Agent definitions stay generic; nothing stage-specific lives in them.

#### Scenario: Node behavior changed
- **WHEN** a node's work, verification, or mounts change
- **THEN** the change SHALL be made in the graph definition and SHALL take effect through dispatch construction without editing any agent definition

### Requirement: Node declaration contract

Each node in a graph definition SHALL declare: its purpose and type; the state it reads and the state it produces; the routable outcomes it can report; its verification criteria; its outgoing guarded edges; its mounted capabilities — skills, commands, and MCP servers; its restrictions (what it must not write or do); whether its output requires a human approval before routing; and optionally its deterministic pre-steps and post-steps — commands the orchestrator runs before dispatch and after a passing verdict (worktree provisioning, VCS operations, delivery). A node's verification MAY declare its runner: `reviewer` (the default — an independent reviewer dispatch executes the commands) or `orchestrator` — the orchestrator executes the declared verification commands itself after the worker's report and derives the verdict deterministically; the validator accepts only these two values. Terminals and the entry node declare no outcomes, verification, or outgoing guarded edges, but a terminal SHALL declare its deterministic steps — for the success terminal the handoff copy and archival (worktree removal already happened in the close-out node's post-steps), for the abandonment terminal forced worktree removal, the handoff, and archival. Every pre-step, post-step, and terminal-step command counts as a mount for the tool gate, so nothing the orchestrator runs is outside the graph. For deterministic and tool-call nodes the verification is the exit status of their commands, recorded by the orchestrator; on success they report the fixed outcome `pass`, which the edge coverage rule checks like any routable outcome. Declared steps SHALL be idempotent, because a failed step's retry re-runs only that step. A capability not declared at build time SHALL NOT be available to the node at run time.

#### Scenario: Mounts declared at build time
- **WHEN** a node needs a skill, command, or MCP server during a run
- **THEN** that mount SHALL already be named in the node's declaration, and the dispatch SHALL carry only declared mounts

#### Scenario: Unshipped mount degrades to instructions
- **WHEN** a declared skill mount without graph profile obligations is not installed in the running environment
- **THEN** the dispatch SHALL carry the mount's intent as instructions instead, and the degradation SHALL be visible in the dispatch

#### Scenario: Profile-bearing mount never degrades
- **WHEN** a mounted skill that defines a graph profile is unavailable
- **THEN** the stage SHALL report blocked instead of degrading to instructions

#### Scenario: Invalid verification runner rejected
- **WHEN** a node declares a verification runner other than `reviewer` or `orchestrator`
- **THEN** the validator SHALL reject the definition naming the node and the field

### Requirement: Edge declaration contract

Each edge SHALL declare its source node, its target node, and its guard: the condition over state that selects it. For every non-terminal node, the declared outgoing edges SHALL cover every routable outcome the node can report, so that routing is always decided by a declared edge. `blocked` is not a routable outcome: it is universal, handled by the in-place fallback chain, declared nowhere, and excluded from edge coverage.

#### Scenario: Outcome without an edge
- **WHEN** a node reports an outcome no outgoing edge guard matches
- **THEN** graph validation SHALL have rejected the definition before any run

### Requirement: Graph validation gates the first run

Before a graph definition is used, it SHALL be validated: every loop has an exit and a cap, exactly one success terminal exists and is edge-reachable on every phase path, exactly one abandonment terminal exists (disposition-only, no inbound edges), edge coverage of routable outcomes is complete, exactly one node mounts the close-out skill, and every declared phase's path ends at the success terminal through the close-out node. An invalid definition SHALL NOT run.

#### Scenario: Uncapped loop rejected
- **WHEN** a definition contains a cycle with no failure cap or exit guard
- **THEN** validation SHALL reject it and name the cycle

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

### Requirement: Mounts maximize reuse of standalone skills

Node capabilities SHALL be assembled by mounting standalone skills rather than by writing node-specific capability code. A skill mounted on a node remains the same skill that is usable on its own; mounting adds the node's graph profile obligations, never a fork of the skill.

#### Scenario: Same skill, two contexts
- **WHEN** a skill is used standalone in one session and mounted on a node in another
- **THEN** both SHALL use the same skill definition, with the graph profile applying only in the mounted case

### Requirement: The instantiation interview is a hard gate

Graph-build SHALL NOT write a config section or fill a template slot without the user's explicit confirmation of that answer. The repository survey produces recommendations to present — one question at a time, each with the recommended answer and its source — never answers to adopt silently; a session with no user confirmation for a section or slot SHALL stop and ask rather than proceed to validation. The confirmed answers SHALL be recorded in graph-build's final report alongside what was written. The gate scopes to initial builds (bootstrap and template instantiation); an edit to an existing definition confirms only the change being made. Where a template's structure cannot fit the project as shipped (reference: a delivery flow that assumes a remote in a project that has none), the template's documentation SHALL declare the permitted variants, the interview SHALL put that choice to the user, and any deviation outside the declared variants remains a user-requested edit — never an improvisation by the instantiating session.

#### Scenario: Survey answer still asked
- **WHEN** the survey finds an obvious answer for a slot (for example `npm test` in the package manifest)
- **THEN** graph-build SHALL present it as the recommendation and wait for confirmation or correction, and SHALL NOT fill the slot from the survey alone

#### Scenario: No-remote project chooses a declared variant
- **WHEN** the project declares no git remote and the template's delivery steps assume one
- **THEN** the interview SHALL offer the template's declared delivery variants (remote delivery, or local merge into the default branch with the delivery slot and its uses removed together), record the user's choice, and apply exactly the chosen variant before validation

#### Scenario: Unconfirmed build refused
- **WHEN** a session reaches the validation step with a slot or config section that was never put to the user
- **THEN** it SHALL stop and ask instead of validating, because an unconfirmed answer is not an answer
