## Purpose

Standalone specification skill: converge research findings into a contract — goals, scope, and acceptance criteria — that downstream work treats as binding. Mountable on a spec node.

## Requirements

### Requirement: The spec is the downstream contract

The skill SHALL produce a specification stating goals, scope, and acceptance criteria, and everything downstream SHALL treat that specification as its contract. Acceptance criteria SHALL be concrete enough to verify against.

#### Scenario: Spec produced
- **WHEN** the skill completes
- **THEN** the output SHALL contain goals, scope, and verifiable acceptance criteria

### Requirement: Revision on contradiction

When later work reveals that the specification contradicts itself or cannot be satisfied, the skill SHALL revise the specification rather than let downstream work route around it, and the revision SHALL go back through the same approval its original went through.

#### Scenario: Contradiction reported
- **WHEN** decomposition or implementation reports a contradiction in the spec
- **THEN** the spec SHALL be revised and resubmitted for approval, and the contradiction SHALL be recorded

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: read the findings and rejection feedback from the work unit; write the specification into the dispatched stage directory; and report exactly one of the outcomes `submitted-for-approval` or `blocked` (never inventing missing inputs), leaving routing to the node's declared edges.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** the specification SHALL land in the stage directory, the report SHALL name one declared outcome, and the orchestrator SHALL route by the node's edges
