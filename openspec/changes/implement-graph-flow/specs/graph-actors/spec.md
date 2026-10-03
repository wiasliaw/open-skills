## ADDED Requirements

### Requirement: Three generic agents, stage identity as data

The plugin SHALL ship exactly three graph-actor agent definitions — `agents/implementor.md`, `agents/reviewer.md`, `agents/advisor.md` — each stage-agnostic: no node-specific instructions, skills, or tool lists; the dispatch payload carries the node identity and everything stage-specific.

#### Scenario: Agent definitions inspected
- **WHEN** the three agent files are read
- **THEN** none SHALL name or specialize for a graph node, and each SHALL direct its outputs to the stage directory named in its dispatch

### Requirement: Implementor write confinement and report

The implementor SHALL confine its writes to the dispatched stage directory and the deliverables its stage instructions assign, SHALL NOT write `state.json`, `log.ndjson`, or `.harness/` unless the dispatch explicitly permits it, SHALL run the declared verification commands as self-checks, and SHALL end with a structured report whose status is exactly `ready-for-review` or `blocked`.

#### Scenario: Major uncovered decision
- **WHEN** the implementor hits a fork with lasting consequences that the dispatch does not resolve
- **THEN** it SHALL stop and report `blocked` with the options identified

### Requirement: Reviewer independence and single write

The reviewer SHALL execute every declared verification command itself, never relying on the implementor's claims, SHALL check the implementor's restriction compliance and fail the review on a violation regardless of command results, and SHALL write exactly one file: its dimension-scored, evidence-backed `review-<n>.md` in the dispatched stage directory, concluding an explicit pass or fail with WHAT/WHY/FIX per failure.

#### Scenario: Restriction violation found
- **WHEN** the implementor changed a file its restrictions forbade
- **THEN** the reviewer's verdict SHALL be fail with that evidence, even if every verification command passed

### Requirement: Advisor is analysis-only

The advisor SHALL diagnose root cause from the dispatched failure history and write exactly one file: `advice-<n>.md` in the addressed stage directory, containing the problem, the evidence-backed root cause, concrete ordered retry guidance, and what a further failure would prove. It SHALL NOT edit deliverables and SHALL NOT write `state.json`, `log.ndjson`, or `.harness/`.

#### Scenario: Second consultation
- **WHEN** the advisor is dispatched with an earlier consultation on the same problem
- **THEN** its advice SHALL address why the first guidance did not resolve the problem rather than repeat it
