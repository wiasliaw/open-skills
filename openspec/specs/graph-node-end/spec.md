## Requirements

### Requirement: End purpose and type
The End step SHALL be defined as a terminal. Purpose: Provide the abandonment exit for work that is not needed, already exists, or was cancelled.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** End SHALL be typed as terminal

### Requirement: End state inputs
End SHALL read only the following from state and the environment: the abandonment reason from Human Gate (grading) or Human Escalation, and the conclusions so far in the work-unit folder.

#### Scenario: Inputs available
- **WHEN** End starts
- **THEN** the inputs listed for End SHALL be available to it

### Requirement: End state outputs
End SHALL produce the following: the conclusions and abort reason recorded in the handoff before ending.

#### Scenario: Outputs recorded
- **WHEN** End completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: End outgoing edges
End SHALL route only by the following guard conditions:

- none: abandonment terminal -> (graph ends)

#### Scenario: None: abandonment terminal
- **WHEN** none: abandonment terminal
- **THEN** the next step SHALL be (graph ends)

### Requirement: End mounted skills
The skills mounted on End SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** End needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: End records before exiting
Before ending, End SHALL record its conclusions and abort reason into the handoff.

#### Scenario: Handoff written
- **WHEN** End runs
- **THEN** the handoff SHALL contain the conclusions and abort reason before the graph terminates

### Requirement: End is a legitimate terminal
End SHALL be treated as a legitimate terminal equal to Ship and not as a failure.

#### Scenario: No outgoing edges
- **WHEN** End completes
- **THEN** it SHALL have no outgoing edges
