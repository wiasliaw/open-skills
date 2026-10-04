## Purpose

The implementation principles every capability of the open-skills claude-code-plugin follows: progressive disclosure, the external/internal surface split, deterministic work as native Node.js scripts, and externalized state.

## Requirements

### Requirement: Progressive disclosure

Every skill SHALL present a compact entry page first and defer detail to reference files loaded only when the task needs them. A consumer session MUST NOT be required to load the full body of knowledge of a capability up front.

#### Scenario: Reference loaded on demand
- **WHEN** the orchestrator needs the dispatch data for one node
- **THEN** it SHALL load that node's section of the graph definition at that point, not as a precondition of starting the skill

### Requirement: External plugin surface is distinct from internal reference

The repository SHALL distinguish the external plugin surface published for consumers (skills, agents, docs, plugin-root scripts at stable path contracts) from internal reference material (the openspec spec set, repo-internal memory and configuration). Consumer-facing behavior MUST NOT depend on internal reference material being present in an installed plugin.

#### Scenario: Consumer install
- **WHEN** the plugin is installed into a consumer project
- **THEN** every path a skill or agent resolves at runtime SHALL lie on the external surface, and no runtime behavior SHALL require reading `openspec/` or other internal reference content

### Requirement: Outsource what the factory need not own

A node capability MAY be fulfilled by an external skill — another plugin's skill or a platform command — mounted at graph-build exactly like an in-house one: equipment the plant does not own is bought, not rebuilt. The plugin SHALL ship its own skill only where the capability is core to the factory's own contracts (state, memory, isolation, convergence, verification) or no adequate external option exists. An external mount that is unavailable at run time degrades per the graph-build rule.

#### Scenario: Research outsourced
- **WHEN** a research node needs deep investigation
- **THEN** it MAY mount an external research or explore skill, and the dispatch SHALL carry that mount like any other

#### Scenario: Specification via OpenSpec
- **WHEN** a spec stage runs with OpenSpec mounted
- **THEN** the stage's contract artifact SHALL be an OpenSpec change, and no in-house specification skill is required

### Requirement: Deterministic work is a native Node.js script

Any step that needs a deterministic result or deterministic execution SHALL be implemented as a zero-dependency native Node.js script (Node.js >= 20, built-in modules only), with one JSON object on stdout, stable error codes, documented exit codes, and a committed `node --test` suite. Deterministic mechanics MUST NOT be left to LLM prose.

#### Scenario: New deterministic mechanic
- **WHEN** a capability acquires a step whose outcome must be exact and repeatable (state validation, worktree mechanics, config writing)
- **THEN** that step SHALL be added to a plugin-root script following the shared stdout-JSON / exit-code conventions, and the skill page SHALL delegate to it

### Requirement: State is externalized

Settings for scripts and agents SHALL be recorded in config (the sectioned, schema-versioned `.harness/config.json`), written once by its declared producer and read by everyone else. What happens during execution SHALL be recorded in files (the work-unit folder: `state.json`, `log.ndjson`, stage artifacts), not held in conversation context. The close-out stage (the node mounting the close-out skill) SHALL converge this execution state at the end: record durable results into long-term memory as accumulated deltas and clean the residue.

#### Scenario: Execution record outlives the session
- **WHEN** a session running the graph ends mid-flight
- **THEN** the work unit's routing state, event log, and stage artifacts SHALL be fully recoverable from its folder without replaying the conversation

#### Scenario: Close-out converges
- **WHEN** a work unit reaches its close-out stage
- **THEN** durable outcomes SHALL be written to long-term memory, and temporary execution residue (worktree, intermediate artifacts) SHALL be removed
