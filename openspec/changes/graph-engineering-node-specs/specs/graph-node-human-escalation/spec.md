## ADDED Requirements

### Requirement: Human Escalation purpose and type
The Human Escalation step SHALL be defined as a human. Purpose: Serve as advisor and unblocker: clear blocked states, adjudicate repeated failures, and cancel work not worth continuing.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Human Escalation SHALL be typed as human

### Requirement: Human Escalation state inputs
Human Escalation SHALL read only the following from state and the environment: the blocked reason or the repeated-failure review log in `work-unit.json`.

#### Scenario: Inputs available
- **WHEN** Human Escalation starts
- **THEN** the inputs listed for Human Escalation SHALL be available to it

### Requirement: Human Escalation state outputs
Human Escalation SHALL produce the following: the human's resolution (unblock guidance or cancellation) recorded in `work-unit.json`.

#### Scenario: Outputs recorded
- **WHEN** Human Escalation completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Human Escalation outgoing edges
Human Escalation SHALL route only by the following guard conditions:

- unblocked -> Build
- cancel -> End

#### Scenario: Unblocked
- **WHEN** unblocked
- **THEN** the next step SHALL be Build

#### Scenario: Cancel
- **WHEN** cancel
- **THEN** the next step SHALL be End

### Requirement: Human Escalation mounted skills
The skills mounted on Human Escalation SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Human Escalation needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Escalation is the destination of every blocked state
Human Escalation SHALL receive blocked outcomes from Build and repeated failures from Review.

#### Scenario: Inbound routes
- **WHEN** Build is blocked or Review fails at least twice with the same error
- **THEN** the next node SHALL be Human Escalation

### Requirement: Escalation resolves to unblock or cancel
Human Escalation SHALL route to Build when unblocked and to End when cancelled.

#### Scenario: Unblocked
- **WHEN** the human unblocks the work
- **THEN** the next node SHALL be Build

#### Scenario: Cancelled
- **WHEN** the human cancels
- **THEN** the next node SHALL be End
