## MODIFIED Requirements

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

### Requirement: The instantiation interview is a hard gate

Graph-build SHALL NOT write a config section, fill a slot, extend the project type catalog, or compose the assembly without the user's explicit confirmation of each answer. The interview is assembly over the layered library: the survey produces recommendations to present — one question at a time, each with the recommended answer and its source — never answers to adopt silently. The walkthrough SHALL present the composed graph node by node in plain words — each node one line: its pipeline, the executors, the surfaced outcomes — plus the canonical walks from the library's `examples.md`, and ask whether this is how the user wants the factory to run; a rejected node is swapped or edited from the library in the same session (choosing different nodes or tasks, rebinding params, editing edges), and any composition outside the shipped library is a user-requested edit — never an improvisation by the instantiating session. Type extensions (new fields for wrapped external skills, instantiated parameterized types such as the project's phase values) SHALL each be confirmed before being written to `.harness/types.json`. A session with no user confirmation for a section, slot, node, or type SHALL stop and ask rather than proceed to assembly or validation. The confirmed answers SHALL be recorded in graph-build's final report alongside what was written. The gate scopes to initial builds; an edit to an existing definition confirms only the change being made.

#### Scenario: Survey answer still asked
- **WHEN** the survey finds an obvious answer for a slot (for example `npm test` in the package manifest)
- **THEN** graph-build SHALL present it as the recommendation and wait for confirmation or correction, and SHALL NOT fill the slot from the survey alone

#### Scenario: Walkthrough precedes assembly
- **WHEN** the interview reaches the composition step
- **THEN** every node of the proposed graph SHALL have been shown to the user in the one-line form before assemble writes the project definition, and a node the user rejects SHALL be revised before any write

#### Scenario: Unconfirmed build refused
- **WHEN** a session reaches the assembly or validation step with a slot, node, or type entry that was never put to the user
- **THEN** it SHALL stop and ask instead of proceeding, because an unconfirmed answer is not an answer

## ADDED Requirements

### Requirement: Assembly produces the project definition

Instantiation SHALL be performed by the graph script's `assemble` step: it resolves the assembly graph's node references into the library's node files, inlines every referenced TaskDef into the definition's task catalog, fills every slot from the confirmed interview answers, and writes the self-contained project definition atomically. Assemble is the only writer of the project `graph.json`; a hand-edited definition is a violation, and later edits go through graph-build and re-assembly. Assemble SHALL reject a composition whose references dangle or whose slots are unfilled, naming each.

#### Scenario: Self-contained output
- **WHEN** assemble writes the project definition
- **THEN** the file SHALL validate with no access to `templates/`, every `use` resolving inside its own task catalog

#### Scenario: Unfilled slot blocks assembly
- **WHEN** a slot has no confirmed value at assemble time
- **THEN** assemble SHALL reject the composition naming the slot, and nothing SHALL be written
