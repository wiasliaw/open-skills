## Requirements

### Requirement: Research & Explore purpose and type
The Research & Explore step SHALL be defined as a LLM loop with tools. Purpose: Gather everything needed to judge and specify the work: read the codebase and `.harness/` long-term memory, collect external data, digest external review feedback, and propose a grading of full, small, trivial, or no-op.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Research & Explore SHALL be typed as LLM loop with tools

### Requirement: Research & Explore state inputs
Research & Explore SHALL read only the following from state and the environment: the request and any rejection feedback in the work-unit folder; the codebase; `.harness/` long-term memory; external data; external review feedback.

#### Scenario: Inputs available
- **WHEN** Research & Explore starts
- **THEN** the inputs listed for Research & Explore SHALL be available to it

### Requirement: Research & Explore state outputs
Research & Explore SHALL produce the following: findings written to the work-unit folder, and a grading proposal (one of full, small, trivial, no-op) with its rationale.

#### Scenario: Outputs recorded
- **WHEN** Research & Explore completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Research & Explore outgoing edges
Research & Explore SHALL route only by the following guard conditions:

- grading proposal produced -> Human Gate (grading)
- blocked -> Advisor
- in-node review loop fails a second time -> Advisor

#### Scenario: Grading proposal produced
- **WHEN** grading proposal produced
- **THEN** the next step SHALL be Human Gate (grading)

#### Scenario: Blocked
- **WHEN** blocked
- **THEN** the orchestrator SHALL record `blocked_at` as Research & Explore AND the next step SHALL be Advisor

#### Scenario: Second in-node review failure
- **WHEN** the in-node review loop fails a second time
- **THEN** the next step SHALL be Advisor

### Requirement: Research & Explore mounted skills
The skills mounted on Research & Explore SHALL be: deep-research (external data); receive-code-review (external review feedback). Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Research & Explore needs a capability
- **THEN** it SHALL use only the mounted skills: deep-research (external data); receive-code-review (external review feedback)

### Requirement: Research proposes but never decides grading
Research SHALL propose a grading only after reading the relevant code, because accurate grading requires seeing the code first, and MUST NOT route work past the grading gate on its own.

#### Scenario: Proposal always goes to the gate
- **WHEN** Research finishes
- **THEN** the grading proposal SHALL be written to state AND the only outgoing edge SHALL lead to Human Gate (grading)

### Requirement: Research is re-entered with feedback
Research SHALL accept re-entry from Human Gate (grading), Human Gate (spec), and reject-with-feedback paths, and SHALL read the recorded feedback before resuming.

#### Scenario: Re-entry after rejection
- **WHEN** a gate rejects and routes back to Research
- **THEN** Research SHALL read the rejection feedback from state before further research
