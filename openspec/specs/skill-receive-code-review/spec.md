## Purpose

Standalone skill for digesting review feedback from outside: triage every item, decide adopt or decline with recorded reasons, and fold adopted items into the work. Mountable wherever external feedback arrives.

## Requirements

### Requirement: Every item gets a triage verdict

Each feedback item SHALL be triaged to exactly one of adopt, decline, or needs-clarification, with the reason recorded. No item is silently dropped.

#### Scenario: Item declined
- **WHEN** a feedback item is not adopted
- **THEN** the triage record SHALL state the decline and its reason

### Requirement: Feedback is input, not command

Items SHALL be evaluated against the work's contract and the project's constraints; an item that conflicts with either SHALL be declined with the conflict named. External feedback never overrides the contract by itself — changing the contract goes through the contract's own approval.

#### Scenario: Conflicting suggestion
- **WHEN** an item contradicts an approved contract or a standing constraint
- **THEN** it SHALL be declined naming the conflict, or escalated as a proposed contract change, never silently applied

### Requirement: Adopted items change the work verifiably

An adopted item SHALL be folded into the work and verified like any other change; adoption without a corresponding change is a triage error.

#### Scenario: Adopted item folded in
- **WHEN** an item is adopted
- **THEN** the work SHALL change accordingly and the change SHALL pass the declared verification

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: write the triage record into the dispatched stage directory; and report its outcome (feedback digested, or blocked) leaving routing to the node's declared edges.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** the triage record SHALL land in the stage directory and the orchestrator SHALL route by the node's edges
