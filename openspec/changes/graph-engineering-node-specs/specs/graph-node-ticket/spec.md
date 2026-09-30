## ADDED Requirements

### Requirement: Ticket purpose and type
The Ticket step SHALL be defined as a LLM decomposition / fan-out. Purpose: Split the spec into independently verifiable tickets, each with its verification defined up front, and write them to the task list in state.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Ticket SHALL be typed as LLM decomposition / fan-out

### Requirement: Ticket state inputs
Ticket SHALL read only the following from state and the environment: the approved spec and constraints in `work-unit.json`; the task list and per-ticket progress.

#### Scenario: Inputs available
- **WHEN** Ticket starts
- **THEN** the inputs listed for Ticket SHALL be available to it

### Requirement: Ticket state outputs
Ticket SHALL produce the following: the task list in `work-unit.json`, each ticket carrying its scope and declared verification commands; the selection of the next ticket.

#### Scenario: Outputs recorded
- **WHEN** Ticket completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Ticket outgoing edges
Ticket SHALL route only by the following guard conditions:

- spec contradiction -> Spec
- next ticket -> Build

#### Scenario: Spec contradiction
- **WHEN** spec contradiction
- **THEN** the next step SHALL be Spec

#### Scenario: Next ticket
- **WHEN** next ticket
- **THEN** the next step SHALL be Build

### Requirement: Ticket mounted skills
The skills mounted on Ticket SHALL be: TDD skill. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Ticket needs a capability
- **THEN** it SHALL use only the mounted skills: TDD skill

### Requirement: Verification is defined before build
Each ticket SHALL declare its verification before it is handed to Build, and tickets SHALL be independently verifiable.

#### Scenario: Ticket has verification
- **WHEN** Ticket writes a ticket to the task list
- **THEN** that ticket SHALL include verification commands or criteria

### Requirement: Contradictions go back to Spec
When decomposition reveals that the spec contradicts itself or cannot be satisfied, Ticket SHALL route to Spec instead of producing tickets.

#### Scenario: Contradiction detected
- **WHEN** Ticket finds a spec contradiction
- **THEN** the next node SHALL be Spec AND the contradiction SHALL be recorded in state
