## Requirements

### Requirement: Spec purpose and type
The Spec step SHALL be defined as a LLM. Purpose: Converge research into a specification stating goals, scope, and acceptance criteria. The spec is the contract for all later stages.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Spec SHALL be typed as LLM

### Requirement: Spec state inputs
Spec SHALL read only the following from state and the environment: the findings and any rejection feedback in the work-unit folder; `.harness/` constraints referenced by the findings.

#### Scenario: Inputs available
- **WHEN** Spec starts
- **THEN** the inputs listed for Spec SHALL be available to it

### Requirement: Spec state outputs
Spec SHALL produce the following: the specification (goals, scope, acceptance criteria) written into the work-unit folder.

#### Scenario: Outputs recorded
- **WHEN** Spec completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Spec outgoing edges
Spec SHALL route only by the following guard conditions:

- submit for review -> Human Gate (spec)
- blocked -> Advisor
- in-node review loop fails a second time -> Advisor

#### Scenario: Submit for review
- **WHEN** submit for review
- **THEN** the next step SHALL be Human Gate (spec)

#### Scenario: Blocked
- **WHEN** blocked
- **THEN** the orchestrator SHALL record `blocked_at` as Spec AND the next step SHALL be Advisor

#### Scenario: Second in-node review failure
- **WHEN** the in-node review loop fails a second time
- **THEN** the next step SHALL be Advisor

### Requirement: Spec mounted skills
The skills mounted on Spec SHALL be: SDD skill. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Spec needs a capability
- **THEN** it SHALL use only the mounted skills: SDD skill

### Requirement: Spec is the downstream contract
The Spec node SHALL write goals, scope, and acceptance criteria into the work-unit folder, and later nodes SHALL treat that spec as their contract.

#### Scenario: Spec written to state
- **WHEN** Spec completes
- **THEN** the work-unit folder SHALL contain goals, scope, and acceptance criteria

### Requirement: Spec is re-entered on contradiction or upgrade
Spec SHALL accept re-entry from Ticket (spec contradiction), Review (fast-path upgrade), and Human Gate (grading, full), and SHALL revise the spec accordingly.

#### Scenario: Re-entry from Ticket
- **WHEN** Ticket reports a spec contradiction
- **THEN** Spec SHALL revise the spec and resubmit to Human Gate (spec)
