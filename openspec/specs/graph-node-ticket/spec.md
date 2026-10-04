## Purpose

The decomposition node that splits the spec into independently verifiable tickets with verification defined up front.

## Requirements

### Requirement: Ticket purpose and type
The Ticket step SHALL be defined as a LLM decomposition / fan-out. Purpose: Split the spec into independently verifiable tickets, each with its verification defined up front, and write them to the task list in state.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Ticket SHALL be typed as LLM decomposition / fan-out

### Requirement: Ticket state inputs
Ticket SHALL read only the following from state and the environment: the approved spec and constraints in the work-unit folder; the task list and per-ticket progress.

#### Scenario: Inputs available
- **WHEN** Ticket starts
- **THEN** the inputs listed for Ticket SHALL be available to it

### Requirement: Ticket state outputs
Ticket SHALL produce the following: the task list in the work-unit folder, each ticket carrying its scope and declared verification commands; the selection of the next ticket.

#### Scenario: Outputs recorded
- **WHEN** Ticket completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Ticket outgoing edges
Ticket SHALL route only by the following guard conditions:

- spec contradiction -> Spec
- next ticket -> Build
- blocked -> Advisor
- in-node review loop fails a second time -> Advisor

#### Scenario: Spec contradiction
- **WHEN** spec contradiction
- **THEN** the next step SHALL be Spec

#### Scenario: Next ticket
- **WHEN** next ticket
- **THEN** the next step SHALL be Build

#### Scenario: Blocked
- **WHEN** blocked
- **THEN** the orchestrator SHALL record `blocked_at` as Ticket AND the next step SHALL be Advisor

#### Scenario: Second in-node review failure
- **WHEN** the in-node review loop fails a second time
- **THEN** the next step SHALL be Advisor

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

### Requirement: Selection-only re-entry is deterministic
When Ticket is re-entered from a passing Review with a non-empty ticket list, no spec contradiction, and no need to change the list, the orchestrator SHALL select the next pending ticket in declared order as a deterministic step and SHALL NOT dispatch an LLM actor. An LLM dispatch of Ticket SHALL occur only for the initial decomposition or when the ticket list itself must change.

#### Scenario: Next ticket after a pass
- **WHEN** Review passes a ticket and pending tickets remain unchanged
- **THEN** the orchestrator SHALL set the next pending ticket in declared order as the selection and route to Build without an LLM dispatch

### Requirement: Contradictions go back to Spec
When decomposition reveals that the spec contradicts itself or cannot be satisfied, Ticket SHALL route to Spec instead of producing tickets.

#### Scenario: Contradiction detected
- **WHEN** Ticket finds a spec contradiction
- **THEN** the next node SHALL be Spec AND the contradiction SHALL be recorded in state
