## Purpose

Standalone TDD decomposition skill: split a contract into tickets whose verification is a test defined before any implementation — red first, green when done. Mountable on a ticket node.

## Requirements

### Requirement: A ticket is defined by its test

Every ticket SHALL declare its verification as an executable test (or check) before it is handed to implementation; a ticket without a declared test does not exist. Tickets SHALL be independently verifiable and small enough that one test run settles them.

#### Scenario: Ticket written
- **WHEN** the skill writes a ticket
- **THEN** that ticket SHALL include its scope and an executable test command as its verification

### Requirement: Red before green

A ticket's declared test SHALL fail against the pre-implementation state — proving it tests the actual gap — and SHALL pass when the ticket is done. The test is authored at decomposition as a stage artifact; the build worker lands it in the worktree, runs it red before implementing, and records the red run as evidence, so the reviewer can confirm red-then-green without any execution outside the worktree. A test that already passes before implementation means the ticket is mis-scoped or already satisfied, and SHALL be revised or dropped.

#### Scenario: Red verified in the worktree
- **WHEN** the build worker takes up a ticket
- **THEN** it SHALL land the declared test in the worktree, run it, record the failing result as evidence, and only then implement

#### Scenario: Test already green
- **WHEN** a ticket's declared test passes in the worktree before any implementation
- **THEN** the ticket SHALL be revised or removed, not handed to implementation as-is

### Requirement: Contradictions go back to the contract

When decomposition reveals that the contract contradicts itself or cannot be satisfied, the skill SHALL send the problem back to the contract instead of producing tickets around it.

#### Scenario: Contradiction found
- **WHEN** decomposition finds the contract unsatisfiable
- **THEN** the contradiction SHALL be recorded and the contract revised before tickets are produced

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: write the full ticket text as a stage artifact and hand the routing entries (id, status, verification command) to the orchestrator for state; and report exactly one of the outcomes `tickets-produced` or `spec-contradiction` (never decomposing an unapproved contract) — routable outcomes route by the node's declared edges, while a blocked report engages the universal in-place fallback chain.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** tickets SHALL be recorded in work-unit state with their tests, the report SHALL name one declared outcome, and the orchestrator SHALL route by the node's edges
