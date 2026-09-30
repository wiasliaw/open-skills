## ADDED Requirements

### Requirement: Human Gate (spec approval) purpose and type
The Human Gate (spec approval) step SHALL be defined as a human. Purpose: Review the spec and either approve it or reject it back to Research with feedback.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Human Gate (spec approval) SHALL be typed as human

### Requirement: Human Gate (spec approval) state inputs
Human Gate (spec approval) SHALL read only the following from state and the environment: the spec in `work-unit.json`.

#### Scenario: Inputs available
- **WHEN** Human Gate (spec approval) starts
- **THEN** the inputs listed for Human Gate (spec approval) SHALL be available to it

### Requirement: Human Gate (spec approval) state outputs
Human Gate (spec approval) SHALL produce the following: the approval decision, or the rejection feedback, recorded in `work-unit.json`.

#### Scenario: Outputs recorded
- **WHEN** Human Gate (spec approval) completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Human Gate (spec approval) outgoing edges
Human Gate (spec approval) SHALL route only by the following guard conditions:

- approved -> Ticket
- rejected or needs more info -> Research & Explore

#### Scenario: Approved
- **WHEN** approved
- **THEN** the next step SHALL be Ticket

#### Scenario: Rejected or needs more info
- **WHEN** rejected or needs more info
- **THEN** the next step SHALL be Research & Explore

### Requirement: Human Gate (spec approval) mounted skills
The skills mounted on Human Gate (spec approval) SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Human Gate (spec approval) needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Spec gate precedes decomposition
No Ticket work SHALL start for a full-graded work unit until the spec is approved at this gate.

#### Scenario: Approved routes to Ticket
- **WHEN** the human approves the spec
- **THEN** the next node SHALL be Ticket

#### Scenario: Rejected routes to Research
- **WHEN** the human rejects the spec
- **THEN** the feedback SHALL be recorded AND the next node SHALL be Research & Explore
