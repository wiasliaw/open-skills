## ADDED Requirements

### Requirement: Trigger purpose and type
The Trigger step SHALL be defined as a entry. Purpose: Receive the incoming work (user prompt, issue, CI failure, or data analysis request), create the work-unit folder (with `state.json` and `log.ndjson`), and initialize state. It performs no grading.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Trigger SHALL be typed as entry

### Requirement: Trigger state inputs
Trigger SHALL read only the following from state and the environment: the raw trigger payload (prompt, issue, CI failure, or analysis request) and the init report.

#### Scenario: Inputs available
- **WHEN** Trigger starts
- **THEN** the inputs listed for Trigger SHALL be available to it

### Requirement: Trigger state outputs
Trigger SHALL produce the following: a newly created work-unit folder whose `state.json` holds the trigger source, the original request, and initialized empty state (task list, per-item progress, verification results).

#### Scenario: Outputs recorded
- **WHEN** Trigger completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Trigger outgoing edges
Trigger SHALL route only by the following guard conditions:

- new work -> Research & Explore

#### Scenario: New work
- **WHEN** new work
- **THEN** the next step SHALL be Research & Explore

### Requirement: Trigger mounted skills
The skills mounted on Trigger SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Trigger needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Trigger never grades
The Trigger node SHALL always hand off to Research & Explore and MUST NOT assign a grading or skip any node.

#### Scenario: Unconditional hand-off
- **WHEN** Trigger has created the work-unit folder
- **THEN** the only outgoing edge SHALL lead to Research & Explore regardless of task size
