## Requirements

### Requirement: Wrap purpose and type
The Wrap step SHALL be defined as a LLM merge moment. Purpose: Consolidate passing work at the single merge moment: update long-term memory, write the handoff, clean residual files, open the PR, and run CI.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Wrap SHALL be typed as LLM merge moment

### Requirement: Wrap state inputs
Wrap SHALL read only the following from state and the environment: all verified results, decisions, and progress in the work-unit folder; the worktree and temporary artifacts; `.harness/` current contents.

#### Scenario: Inputs available
- **WHEN** Wrap starts
- **THEN** the inputs listed for Wrap SHALL be available to it

### Requirement: Wrap state outputs
Wrap SHALL produce the following: updates to `.harness/` (DECISIONS, FEATURES), the handoff record, a cleaned workspace (worktree, temp files, intermediate artifacts removed), an opened PR, and the CI result recorded in the work-unit folder.

#### Scenario: Outputs recorded
- **WHEN** Wrap completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Wrap outgoing edges
Wrap SHALL route only by the following guard conditions:

- CI green -> Ship
- CI red -> Build
- blocked -> Advisor
- in-node review loop fails a second time -> Advisor

#### Scenario: CI green
- **WHEN** CI green
- **THEN** the next step SHALL be Ship

#### Scenario: CI red
- **WHEN** CI red
- **THEN** the next step SHALL be Build

#### Scenario: Blocked
- **WHEN** blocked
- **THEN** the orchestrator SHALL record `blocked_at` as Wrap AND the next step SHALL be Advisor

#### Scenario: Second in-node review failure
- **WHEN** the in-node review loop fails a second time
- **THEN** the next step SHALL be Advisor

### Requirement: Wrap mounted skills
The skills mounted on Wrap SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Wrap needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Wrap is the only long-term memory writer
Wrap SHALL be the only node permitted to write long-term memory (`.harness/`), and this SHALL be the single write point for it.

#### Scenario: Single write point
- **WHEN** any node other than Wrap runs
- **THEN** it SHALL NOT write `.harness/`

### Requirement: Static relations live in long-term memory
Static relations (supersedes, depends-on, decided-by, verified-by) SHALL be typed references between long-term-memory entries stored as markdown with explicit frontmatter fields, written only by Wrap, and SHALL NOT be graph edges or stored in a separate JSON/DOT graph file.

#### Scenario: Relations as frontmatter
- **WHEN** Wrap records a decision that supersedes another
- **THEN** the relation SHALL be a frontmatter field on the entry AND no separate graph file SHALL be created

### Requirement: Wrap cleans residue
Wrap SHALL remove the worktree, temp files, and intermediate artifacts before opening the PR.

#### Scenario: Cleanup done
- **WHEN** Wrap opens the PR
- **THEN** no residual worktree or temp files SHALL remain
