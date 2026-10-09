## Purpose

The init phase: constructing the factory. Graph-init scaffolds an empty project, defines what every node does and how it is verified, defines the edges that route data to the next stage, declares every capability a node uses, and bootstraps the project so runs can start.

## Requirements

### Requirement: The graph definition is reviewable data

The graph SHALL be defined as reviewable content (a graph definition), not as code inside agents: node behavior changes by changing the definition, and the run-time dispatch is constructed from it. Agent definitions stay generic; nothing stage-specific lives in them.

#### Scenario: Node behavior changed
- **WHEN** a node's work, verification, or mounts change
- **THEN** the change SHALL be made in the graph definition and SHALL take effect through dispatch construction without editing any agent definition

### Requirement: Node declaration contract

Each work node in a graph definition SHALL declare its purpose and an ordered pipeline of task references, each entry naming a catalog task (`use`), optionally binding its params (`with`), and totally mapping the task's exit outcomes to actions (`on`): `next`, `goto:<earlier task>`, a surfaced node outcome, or `escalate` (and, in terminal pipelines only, `done`). The node SHALL declare the outcomes it surfaces; its outgoing guarded edges route them. Everything executable belongs to the referenced tasks: a task declares its executor, equipment (skills, commands, MCP servers — a command may be a parameterized family, and a state-sourced entry `{source, family}` covers run-time-generated invocations), reads and produces, restrictions, exit outcomes with a required artifact for llm/validator/human executors, and uniform text (`purpose`, `instructions`). A validator task declares its runner: `reviewer` (the default — an independent reviewer dispatch executes the commands) or `orchestrator` (the orchestrator executes the declared commands itself and derives the verdict deterministically); the validator accepts only these two values. There are no node-level pre-steps, post-steps, instructions, mounts, verification sections, or human-approval flags — each of those is a task in the pipeline. Terminals declare a pipeline of script tasks only (success: handoff copy and archival; abandonment: forced worktree removal, handoff check, archival); the entry node declares no pipeline. Every command any task can run — script `run` lines and terminal steps included — counts as a mount for the tool gate, so nothing the orchestrator runs is outside the graph. A script `run` line MAY map specific exit statuses of its command to declared outcomes (`{command, codes}`; never 126 or 127), which is how a deterministic check such as the red check surfaces an alternative outcome without an actor. Script tasks SHALL be idempotent, because a failed script's retry re-runs only that task. A capability not declared on a task at build time SHALL NOT be available to it at run time.

#### Scenario: Mounts declared at build time
- **WHEN** a task needs a skill, command, or MCP server during a run
- **THEN** that mount SHALL already be named in the task's equipment, and the dispatch SHALL carry only declared equipment

#### Scenario: Unshipped mount degrades to instructions
- **WHEN** a declared skill mount without graph profile obligations is not installed in the running environment
- **THEN** the dispatch SHALL carry the mount's intent as instructions instead, and the degradation SHALL be visible in the dispatch

#### Scenario: Profile-bearing mount never degrades
- **WHEN** a mounted skill that defines a graph profile is unavailable
- **THEN** the task SHALL report blocked instead of degrading to instructions

#### Scenario: Invalid verification runner rejected
- **WHEN** a validator task declares a runner other than `reviewer` or `orchestrator`
- **THEN** the validator SHALL reject the definition naming the task and the field

### Requirement: Edge declaration contract

Each edge SHALL declare its source node, its target node, the surfaced node outcome it routes, and its guard: the condition over state that selects it. The entry node's single outgoing edge is the one exception: it names no outcome and carries the empty guard. For every work node, the declared outgoing edges SHALL cover every outcome the node surfaces, so that routing is always decided by a declared edge. `blocked` is not a routable outcome: it is universal, handled by the in-place fallback chain (the `escalate` action is its declared entry), declared nowhere, and excluded from edge coverage.

#### Scenario: Outcome without an edge
- **WHEN** a node surfaces an outcome no outgoing edge guard matches
- **THEN** graph validation SHALL have rejected the definition before any run

### Requirement: Graph validation gates the first run

Before a graph definition is used, it SHALL be validated per the `graph-definition` validator contract: total `on` coverage with the closed action vocabulary, backward-only `goto`, outcome/edge coverage both ways, guard exclusivity and exhaustiveness over catalog-resolved fields, reachability (every node from entry; the success terminal from every work node), capped loops of both kinds, exactly one success and one abandonment terminal, exactly one task mounting the close-out skill with its node dominating the success terminal, required exit artifacts, no declared `blocked`, no dangling task/type/param references, the instantiated `phase` type carrying `maintenance`, a phase-restricted route to the success terminal for every phase value, and the tool gate over every task's equipment. An invalid definition SHALL NOT run.

#### Scenario: Uncapped loop rejected
- **WHEN** a definition contains a cycle — goto or returning-edge — with no cap
- **THEN** validation SHALL reject it and name the cycle

### Requirement: Project bootstrap

Graph-init SHALL include a per-project bootstrap (the init tier) run before any graph-run: survey the repository (structure, conventions, how things are executed) and record the project's facts machine-readably in one project config (`.harness/config.json`), written through a deterministic script, never by hand. The config SHALL carry a schema version and hold every project fact as a section — at minimum VCS (default branch and optional remote; no free-form prose fields), the work-units, archive, and worktrees locations, the worktree-setup section (setup commands and copy entries), the memory section (the current-truth documents with their budgets, the ledger location, and optionally the maintenance thresholds), and optionally the graph definition path. Every config field SHALL have a runtime consumer; a fact that only a human reads belongs in the project's own documentation, not the config. Budget keys in the memory section SHALL be bare file names (no path separators), resolved under `.harness/`, and the config writer SHALL enforce this at validation time with the same grammar the memory script applies. The config holds no command catalog: what a node can execute is declared on that node in the graph definition. After writing a config whose memory section declares budgets, the bootstrap SHALL create each budgeted current-truth document that does not yet exist as a minimal skeleton under `.harness/`, and SHALL never overwrite one that exists. The tool-availability gate SHALL run before a graph definition is accepted: every command and CLI mounted by any of its nodes (steps included) and every command in the config's worktree-setup section is probed for existence and startability only — PATH resolution plus a harmless invocation such as `--version` or `--help`, never executing the command's real effect — and a missing required tool blocks acceptance and is reported by name. The bootstrap is the single writer of this config; every other actor only reads it. A consuming script SHALL validate the config against its declared schema version and consume only its own section, so one section's evolution is caught by versioning rather than silently breaking another consumer. In an empty project the bootstrap survey runs only after the scaffold phase, so the recorded facts describe the scaffolded project.

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

Graph-init SHALL NOT write a config section, fill a slot, extend the project type catalog, or compose the assembly without the user's explicit confirmation of each answer. The interview is assembly over the layered library: the survey produces recommendations to present — one question at a time, each with the recommended answer and its source — never answers to adopt silently. The walkthrough SHALL present the composed graph node by node in plain words — each node one line: its pipeline, the executors, the surfaced outcomes — plus the canonical walks from the library's `examples.md`, and ask whether this is how the user wants the factory to run; a rejected node is swapped or edited from the library in the same session (choosing different nodes or tasks, rebinding params, editing edges), and any composition outside the shipped library is a user-requested edit — never an improvisation by the instantiating session. Type extensions (new fields for wrapped external skills, instantiated parameterized types such as the project's phase values) SHALL each be confirmed before being written to `.harness/types.json`. A session with no user confirmation for a section, slot, node, or type SHALL stop and ask rather than proceed to assembly or validation. The confirmed answers SHALL be recorded in graph-init's final report alongside what was written. The gate scopes to initial builds; an edit to an existing definition confirms only the change being made.

#### Scenario: Survey answer still asked

- **WHEN** the survey finds an obvious answer for a slot (for example `npm test` in the package manifest)
- **THEN** graph-init SHALL present it as the recommendation and wait for confirmation or correction, and SHALL NOT fill the slot from the survey alone

#### Scenario: Walkthrough precedes assembly

- **WHEN** the interview reaches the composition step
- **THEN** every node of the proposed graph SHALL have been shown to the user in the one-line form before assemble writes the project definition, and a node the user rejects SHALL be revised before any write

#### Scenario: Unconfirmed build refused

- **WHEN** a session reaches the assembly or validation step with a slot, node, or type entry that was never put to the user
- **THEN** it SHALL stop and ask instead of proceeding, because an unconfirmed answer is not an answer

### Requirement: Assembly produces the project definition

Instantiation SHALL be performed by the graph script's `assemble` step: it resolves the assembly graph's node references into the library's node files, inlines every referenced TaskDef into the definition's task catalog, fills every slot from the confirmed interview answers, and writes the self-contained project definition atomically. Assemble is the only writer of the project `graph.json`; a hand-edited definition is a violation, and later edits go through graph-init and re-assembly. Assemble SHALL reject a composition whose references dangle or whose slots are unfilled, naming each.

#### Scenario: Self-contained output

- **WHEN** assemble writes the project definition
- **THEN** the file SHALL validate with no access to `templates/`, every `use` resolving inside its own task catalog

#### Scenario: Unfilled slot blocks assembly

- **WHEN** a slot has no confirmed value at assemble time
- **THEN** assemble SHALL reject the composition naming the slot, and nothing SHALL be written

### Requirement: Empty-project scaffold precedes the factory

When the survey finds an empty project — no commit resolvable at HEAD, or no project sources or manifests beyond VCS and harness metadata — graph-init SHALL run a scaffold phase before the bootstrap and assembly tiers: interview the project type and the scaffold command, present the recommendation with its source, and execute only commands the user has explicitly confirmed, one at a time. Scaffolding SHALL never be improvised, SHALL never run in a non-empty project, and SHALL complete before the survey that feeds the bootstrap and slot interviews, so every recorded fact and every confirmed slot answer describes a project that exists.

#### Scenario: Empty project detected

- **WHEN** graph-init starts in a repository with no commits and no project manifests
- **THEN** it SHALL offer the scaffold phase first, and SHALL NOT proceed to the slot interview (such as `test_command`) before the scaffold has produced the project the answers would describe

#### Scenario: Scaffold command requires confirmation

- **WHEN** the project-type interview recommends a scaffold command (for example `cargo init`)
- **THEN** the command SHALL be executed only after the user confirms it, and a session with an unconfirmed scaffold command SHALL stop and ask

#### Scenario: Non-empty project skips scaffold

- **WHEN** graph-init starts in a repository that already has project sources or manifests
- **THEN** the scaffold phase SHALL be skipped and no scaffold command SHALL be offered or run

### Requirement: Initialization ends worktree-able

Graph-init SHALL NOT perform VCS write operations (no staging, no commits). At close-out it SHALL prompt the user to commit the scaffolded skeleton and the `.harness/` files, and SHALL then verify with read-only VCS queries that the repository is worktree-able: HEAD resolves to a commit and the `.harness/` files are tracked. Until both hold, the final report SHALL NOT name graph-run as the next step; it SHALL repeat the commit prompt and name what is missing instead, because the worktree provisioner refuses a repository with no commits and the delta mechanism depends on `.harness/` being carried on unit branches.

#### Scenario: User has not committed

- **WHEN** graph-init reaches close-out and HEAD resolves to no commit, or `.harness/` files are untracked
- **THEN** the report SHALL state what is missing and prompt the user to commit, and SHALL NOT point to graph-run as the next step

#### Scenario: Commit verified

- **WHEN** the user has committed and HEAD resolves to a commit with `.harness/` tracked
- **THEN** the report SHALL name graph-run as the next step

### Requirement: Harness writers refuse linked worktrees

The deterministic writers of the harness namespace — the config writer, the type-catalog writer, and assemble — SHALL detect execution inside a linked worktree and refuse to write with a stable error code, so `.harness/` is only ever written in the main checkout and cannot diverge between a worktree and the main checkout. Read-only commands (validation, probing) remain usable anywhere.

#### Scenario: Write refused in a worktree

- **WHEN** the config writer, the type-catalog writer, or assemble is invoked with its working directory inside a linked worktree
- **THEN** it SHALL exit nonzero with a stable error code naming the worktree condition, and SHALL write nothing
