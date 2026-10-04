## Purpose

Standalone research skill: gather everything needed to judge and specify a piece of work — codebase, long-term memory, external data, review feedback — and propose a graded assessment. Mountable on a research node.

## Requirements

### Requirement: Research reads before it judges

The skill SHALL gather from the codebase, long-term memory, and any external data or review feedback before proposing an assessment, and SHALL propose a grading only after reading the relevant code, with its rationale recorded alongside the findings. The reference grading vocabulary is: `full` — a new contract is needed; `small` — an existing contract covers it; `trivial` — fast path straight to implementation; `no-op` — not needed or already exists, end the work. A graph MAY declare its own vocabulary; each grade's meaning and the stages it skips must be declared with it.

#### Scenario: Grading proposed
- **WHEN** research completes
- **THEN** the findings and a grading proposal with rationale SHALL be written as its output, and the proposal SHALL cite what was actually read

### Requirement: Research proposes but never decides

The skill SHALL only propose; the decision belongs to its consumer (a human, or a human gate when mounted). Research MUST NOT route work past the decision point on its own.

#### Scenario: Proposal handed over
- **WHEN** research finishes
- **THEN** its proposal SHALL go to the deciding party and research SHALL take no action that presumes approval

### Requirement: Re-entry reads the feedback first

When re-entered after a rejection, the skill SHALL read the recorded rejection feedback before resuming research.

#### Scenario: Rejected and re-entered
- **WHEN** a decision rejects the proposal with feedback
- **THEN** the next research pass SHALL address that feedback explicitly

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: write findings and the proposal into the dispatched stage directory; report exactly one of the outcomes `proposal-produced` or `blocked` (never guessing when inputs are unavailable); and leave routing to the node's declared edges — the profile names outcomes, never targets.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** its outputs SHALL land in the stage directory, its report SHALL name one declared outcome, and the orchestrator SHALL route by the node's edges
