## ADDED Requirements

### Requirement: Review purpose and type
The Review step SHALL be defined as a validator. Purpose: Independently re-run each ticket's declared verification commands and record per-dimension pass/fail with evidence.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Review SHALL be typed as validator

### Requirement: Review state inputs
Review SHALL read only the following from state and the environment: the current ticket's declared verification commands, the spec, and the Build output; the failure counter for the ticket; the grading path (fast path or not); any Advisor guidance issued for the current problem.

#### Scenario: Inputs available
- **WHEN** Review starts
- **THEN** the inputs listed for Review SHALL be available to it

### Requirement: Review state outputs
Review SHALL produce the following: per-dimension pass/fail with evidence, the review log, and the updated failure count, written to `work-unit.json`.

#### Scenario: Outputs recorded
- **WHEN** Review completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Review outgoing edges
Review SHALL route only by the following guard conditions:

- fail count < 2 on a non-fast path (with review log) -> Build
- fail count >= 2 (same error recurring) -> Advisor
- blocked (cannot run or complete verification) -> Advisor
- 1 fail on the fast path (guard: upgrade to full) -> Spec
- pass and tickets remain -> Ticket
- pass and no tickets remain -> Wrap

#### Scenario: Fail count < 2 (with review log)
- **WHEN** fail count < 2 on a non-fast path (with review log)
- **THEN** the next step SHALL be Build

#### Scenario: Fail count >= 2 (same error recurring)
- **WHEN** fail count >= 2 (same error recurring)
- **THEN** the next step SHALL be Advisor

#### Scenario: Blocked
- **WHEN** Review is blocked
- **THEN** the orchestrator SHALL record `blocked_at` as Review AND the next step SHALL be Advisor

#### Scenario: 1 fail on the fast path (guard: upgrade to full)
- **WHEN** 1 fail on the fast path (guard: upgrade to full)
- **THEN** the next step SHALL be Spec

#### Scenario: Pass and tickets remain
- **WHEN** pass and tickets remain
- **THEN** the next step SHALL be Ticket

#### Scenario: Pass and no tickets remain
- **WHEN** pass and no tickets remain
- **THEN** the next step SHALL be Wrap

### Requirement: Review mounted skills
The skills mounted on Review SHALL be: request-code-review skill. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Review needs a capability
- **THEN** it SHALL use only the mounted skills: request-code-review skill

### Requirement: Review verifies independently
Review SHALL execute each ticket's declared verification commands itself and MUST NOT rely on Build's self-reported results.

#### Scenario: Independent execution
- **WHEN** Review runs
- **THEN** every declared verification command SHALL be executed by Review and its evidence recorded

### Requirement: Failure loop is capped
Review SHALL escalate to Advisor when the same failure recurs, so that no loop is uncapped.

#### Scenario: First failure
- **WHEN** Review fails a ticket for the first time on a non-fast path
- **THEN** the review log SHALL be recorded AND the next node SHALL be Build

#### Scenario: Second failure
- **WHEN** a ticket has failed Review at least twice with the same error recurring
- **THEN** the next node SHALL be Advisor

### Requirement: Fast-path guard
A single Review failure on the trivial fast path SHALL force an upgrade to the full path via Spec.

#### Scenario: Fast-path failure
- **WHEN** a fast-path work unit fails Review once
- **THEN** the next node SHALL be Spec

### Requirement: Pass routing depends on remaining tickets
On pass, Review SHALL route to Ticket if tickets remain and to Wrap otherwise.

#### Scenario: Tickets remain
- **WHEN** Review passes AND tickets remain
- **THEN** the next node SHALL be Ticket

#### Scenario: No tickets remain
- **WHEN** Review passes AND no tickets remain
- **THEN** the next node SHALL be Wrap
