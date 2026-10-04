## Purpose

The implementation loop that builds one ticket at a time in an isolated worktree.

## Requirements

### Requirement: Build purpose and type
The Build step SHALL be defined as a LLM loop. Purpose: Implement one ticket at a time in an isolated worktree.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Build SHALL be typed as LLM loop

### Requirement: Build state inputs
Build SHALL read only the following from state and the environment: the spec, constraints, and the current ticket in the work-unit folder; any review log from a failed Review or CI failure; any Advisor guidance issued for the current problem; `.harness/worktree-setup.json`, the worktree setup config (read-only). Build reads only the spec and constraints as its contract.

#### Scenario: Inputs available
- **WHEN** Build starts
- **THEN** the inputs listed for Build SHALL be available to it

### Requirement: Build state outputs
Build SHALL produce the following: code changes in the isolated worktree and a status of ready-for-review or blocked recorded in the work-unit folder. Build MUST NOT write `.harness/`.

#### Scenario: Outputs recorded
- **WHEN** Build completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Build outgoing edges
Build SHALL route only by the following guard conditions:

- ready-for-review -> Review
- blocked -> Advisor

#### Scenario: Ready-for-review
- **WHEN** ready-for-review
- **THEN** the next step SHALL be Review

#### Scenario: Blocked
- **WHEN** blocked
- **THEN** the next step SHALL be Advisor

### Requirement: Build mounted skills
The skills mounted on Build SHALL be: use-worktree skill. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Build needs a capability
- **THEN** it SHALL use only the mounted skills: use-worktree skill

### Requirement: Build writes only code
Build SHALL write only code within the isolated worktree and MUST NOT write `.harness/` or any long-term memory.

#### Scenario: Long-term memory untouched
- **WHEN** Build finishes
- **THEN** no `.harness/` file SHALL have been modified by Build

### Requirement: Blocked state has a destination
When Build cannot proceed, it SHALL record blocked, the orchestrator SHALL record `blocked_at` as Build, and Build SHALL route to Advisor.

#### Scenario: Blocked routes to Advisor
- **WHEN** Build is blocked
- **THEN** the next node SHALL be Advisor

### Requirement: Build has no synchronous human wait
Build MUST NOT wait synchronously for a human; human input arises only via Human Escalation, which is reached only through Advisor.

#### Scenario: No inline human wait
- **WHEN** Build needs a human decision
- **THEN** it SHALL route to Advisor (and to Human Escalation only after Advisor is exhausted) instead of pausing
