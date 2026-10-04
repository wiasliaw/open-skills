## Purpose

Standalone verification skill: independently verify a piece of work against its declared verification, producing a dimension-scored, evidence-backed verdict. Mountable on a review node; the shipped request-code-review and receive-code-review skills are its external-review companions.

## Requirements

### Requirement: Verification is independent

The reviewer SHALL execute every declared verification command itself and MUST NOT rely on the producer's self-reported results. Every verdict SHALL carry evidence (command output, file references, log references) that a third party can resolve.

#### Scenario: Producer claims success
- **WHEN** the producer reports its checks passed
- **THEN** the reviewer SHALL still run every declared command itself and record its own evidence

### Requirement: Verdicts are dimension-scored with actionable failures

A verdict SHALL be an explicit pass or fail, scored per dimension, and every failure SHALL state WHAT is wrong, WHY it fails the contract, and FIX guidance concrete enough to act on.

#### Scenario: Failing verdict
- **WHEN** any dimension fails
- **THEN** the verdict SHALL be fail and each failure SHALL carry WHAT/WHY/FIX

### Requirement: Restriction compliance is part of the verdict

When the work carries restrictions, the reviewer SHALL check compliance and SHALL fail the review on a violation regardless of command results.

#### Scenario: Violation found
- **WHEN** the producer changed something its restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence even if every command passed

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: write exactly one report file (`review-<n>.md`) into the dispatched stage directory as its only write; feed the failure counters that drive the escalation edges; and on a fast-path failure, trigger the declared upgrade edge instead of a retry loop.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** its single write SHALL be the report in the stage directory, and the orchestrator SHALL record the verdict, counters, and pointer from it
