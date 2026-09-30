## ADDED Requirements

### Requirement: Human Escalation purpose and type
The Human Escalation step SHALL be defined as a human. Purpose: Serve as the last-resort unblocker after Advisor has been exhausted: clear blocked states, adjudicate problems that survived two Advisor consultations, and cancel work not worth continuing.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Human Escalation SHALL be typed as human

### Requirement: Human Escalation state inputs
Human Escalation SHALL read only the following from state and the environment: the `blocked_at` node, the blocked reason or repeated-failure review log, and the Advisor consultation records for the problem in `work-unit.json`.

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

- unblocked -> the `blocked_at` node
- cancel -> End

#### Scenario: Unblocked
- **WHEN** unblocked
- **THEN** the next step SHALL be the node recorded in `blocked_at`

#### Scenario: Cancel
- **WHEN** cancel
- **THEN** the next step SHALL be End

### Requirement: Human Escalation mounted skills
The skills mounted on Human Escalation SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Human Escalation needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Escalation is reached only through Advisor
Human Escalation SHALL receive work only from Advisor, when two consultations on the same problem have both failed. No stage SHALL route to Human Escalation directly.

#### Scenario: Inbound route
- **WHEN** Advisor has given advice twice on the same problem and the stage still fails
- **THEN** the next node SHALL be Human Escalation

#### Scenario: No direct inbound route
- **WHEN** a stage is blocked or fails at least twice
- **THEN** the next node SHALL be Advisor and not Human Escalation

### Requirement: Escalation resolves to unblock or cancel
Human Escalation SHALL route to the `blocked_at` node when unblocked and to End when cancelled.

#### Scenario: Unblocked
- **WHEN** the human unblocks the work
- **THEN** the next node SHALL be the node recorded in `blocked_at`

#### Scenario: Cancelled
- **WHEN** the human cancels
- **THEN** the next node SHALL be End
