## Requirements

### Requirement: Human Gate (grading approval) purpose and type
The Human Gate (grading approval) step SHALL be defined as a human. Purpose: Review Research's grading proposal and execute the routing. It is a mandatory gate for all work; when in doubt the human rejects the proposal back for further research.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Human Gate (grading approval) SHALL be typed as human

### Requirement: Human Gate (grading approval) state inputs
Human Gate (grading approval) SHALL read only the following from state and the environment: the findings and grading proposal in the work-unit folder.

#### Scenario: Inputs available
- **WHEN** Human Gate (grading approval) starts
- **THEN** the inputs listed for Human Gate (grading approval) SHALL be available to it

### Requirement: Human Gate (grading approval) state outputs
Human Gate (grading approval) SHALL produce the following: the approved grading (full, small, trivial, or end) or the rejection with feedback, recorded in the work-unit folder.

#### Scenario: Outputs recorded
- **WHEN** Human Gate (grading approval) completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Human Gate (grading approval) outgoing edges
Human Gate (grading approval) SHALL route only by the following guard conditions:

- full: needs a new spec -> Spec
- small: existing spec covers it -> Ticket
- trivial (fast path) -> Build
- not needed or already exists -> End
- rejected: research further -> Research & Explore

#### Scenario: Full: needs a new spec
- **WHEN** full: needs a new spec
- **THEN** the next step SHALL be Spec

#### Scenario: Small: existing spec covers it
- **WHEN** small: existing spec covers it
- **THEN** the next step SHALL be Ticket

#### Scenario: Trivial (fast path)
- **WHEN** trivial (fast path)
- **THEN** the next step SHALL be Build

#### Scenario: Not needed or already exists
- **WHEN** not needed or already exists
- **THEN** the next step SHALL be End

#### Scenario: Rejected: research further
- **WHEN** rejected: research further
- **THEN** the next step SHALL be Research & Explore

### Requirement: Human Gate (grading approval) mounted skills
The skills mounted on Human Gate (grading approval) SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Human Gate (grading approval) needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Grading gate is mandatory
The grading gate SHALL run for every work unit, including trivial work, and weight of scrutiny SHALL scale with risk.

#### Scenario: No bypass for trivial work
- **WHEN** the proposed grading is trivial
- **THEN** the work unit SHALL still pass through this gate before Build

### Requirement: Doubt resolves to rejection
The human SHALL reject the proposal back to Research when in doubt.

#### Scenario: Reject when uncertain
- **WHEN** the human cannot confirm the grading
- **THEN** the routing SHALL be Research & Explore with feedback recorded in state
