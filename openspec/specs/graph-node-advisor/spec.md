## Requirements

### Requirement: Advisor purpose and type
The Advisor step SHALL be defined as an LLM. Purpose: Perform root-cause analysis on a blocked or repeatedly failing stage and produce concrete retry guidance. It is the cheap escalation tier that sits before the human, so that human intervention stays a last resort.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Advisor SHALL be typed as LLM and SHALL NOT be typed as human

### Requirement: Advisor state inputs
Advisor SHALL read only the following from state and the environment: the `blocked_at` node, the failure history and review logs for the problem, the blocked stage's node spec, the relevant constraints, and any earlier Advisor consultation records for the same problem in the work-unit folder.

#### Scenario: Inputs available
- **WHEN** Advisor starts
- **THEN** the inputs listed for Advisor SHALL be available to it

### Requirement: Advisor state outputs
Advisor SHALL produce the following: a root-cause analysis and concrete retry guidance, which it SHALL write itself as `advice-<n>.md` in the stage directory of the stage it addresses (the `blocked_at` node's directory). The orchestrator SHALL record the consultation (problem key, consultation count, advice summary) in the work-unit folder.

#### Scenario: Outputs recorded
- **WHEN** Advisor completes
- **THEN** its analysis and guidance SHALL be in `advice-<n>.md` in the `blocked_at` node's stage directory, and the consultation SHALL be recorded by the orchestrator as specified

### Requirement: Advisor outgoing edges
Advisor SHALL route only by the following guard conditions:

- advice issued (consultations on this problem < 2) -> the `blocked_at` node
- 2 consultations on the same problem both failed -> Human Escalation

#### Scenario: Advice issued
- **WHEN** advice is issued and consultations on this problem are fewer than 2
- **THEN** the next step SHALL be the node recorded in `blocked_at`, retrying with the advice

#### Scenario: Two failed consultations
- **WHEN** advice has been given twice on the same problem and the stage still fails
- **THEN** the next step SHALL be Human Escalation

### Requirement: Advisor mounted skills
The skills mounted on Advisor SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Advisor needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Advisor is read-only analysis
Advisor SHALL perform analysis only. It MUST NOT edit deliverables, MUST NOT write `state.json` or `log.ndjson`, and MUST NOT write `.harness/`; its `advice-<n>.md` file in the addressed stage directory is its only write.

#### Scenario: No writes
- **WHEN** Advisor finishes
- **THEN** no deliverable, `state.json`, `log.ndjson`, or `.harness/` file SHALL have been modified by Advisor, and the only file it wrote SHALL be its `advice-<n>.md` in the addressed stage directory

### Requirement: Advisor is the destination of every blocked state and repeated failure
Advisor SHALL receive blocked outcomes from every stage (Research, Spec, Ticket, Build, Review, Wrap), repeated failures from Review, and second failures of the in-node review loops of Research, Spec, Ticket, and Wrap. The orchestrator SHALL record `blocked_at` before routing to Advisor.

#### Scenario: Inbound routes
- **WHEN** a stage is blocked, or Review fails at least twice with the same error, or an in-node review loop fails a second time
- **THEN** the next node SHALL be Advisor AND `blocked_at` SHALL identify the originating node

### Requirement: Advisor consultations are capped
Advisor SHALL be consulted at most twice on the same problem. When both consultations have failed to resolve it, the next node SHALL be Human Escalation.

#### Scenario: Cap reached
- **WHEN** a second Advisor consultation on the same problem has been followed by another failure
- **THEN** the next node SHALL be Human Escalation and Advisor SHALL NOT be consulted a third time
