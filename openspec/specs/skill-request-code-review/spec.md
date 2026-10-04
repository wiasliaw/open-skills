## Purpose

Standalone skill for commissioning an independent code review: package the work and its declared verification into a request an independent reviewer can verify without trusting the author, and get back an evidence-backed verdict. Mountable on a review node.

## Requirements

### Requirement: The request carries the contract

A review request SHALL carry everything needed for independent verification: the scope of the work, the declared verification commands, the restrictions in force, and the acceptance criteria. The reviewer MUST NOT need the author's claims to verify.

#### Scenario: Request assembled
- **WHEN** a review is requested for a piece of work
- **THEN** the request SHALL include the scope, verification commands, restrictions, and acceptance criteria

### Requirement: The reviewer verifies independently

The commissioned reviewer SHALL execute every declared verification command itself, never relying on the author's self-reported results, and SHALL check restriction compliance, failing the review on a violation regardless of command results.

#### Scenario: Author claims success
- **WHEN** the author reports its checks passed
- **THEN** the reviewer SHALL still run every declared command itself and record its own evidence

#### Scenario: Violation found
- **WHEN** the author changed something its restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence even if every command passed

### Requirement: Verdict shape

A verdict SHALL be an explicit pass or fail, scored per dimension, with evidence references a third party can resolve, and every failure SHALL state WHAT is wrong, WHY it fails the contract, and FIX guidance concrete enough to act on.

#### Scenario: Failing verdict
- **WHEN** any dimension fails
- **THEN** the verdict SHALL be fail and each failure SHALL carry WHAT/WHY/FIX with evidence

### Requirement: Graph profile

When mounted on a review node, the skill SHALL additionally: write exactly one report file (`review-<n>.md`) into the dispatched stage directory as the reviewer's only write; and report a verdict whose recorded outcome feeds the failure counters and the node's declared edges, leaving routing to the orchestrator.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** the report SHALL be the single write in the stage directory, and the orchestrator SHALL record the verdict, counters, and pointer and route by the node's edges
