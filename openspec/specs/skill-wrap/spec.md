## Purpose

Standalone convergence skill: close out a finished piece of work — fold durable outcomes into long-term memory, clean execution residue, and hand the result to delivery. Mountable on the graph's designated converge node.

## Requirements

### Requirement: Converge folds durable outcomes into memory

The skill SHALL update long-term memory with the work's durable outcomes (decisions made, features landed), recording static relations between entries as frontmatter references. This is the single memory write point of a run.

#### Scenario: Decision recorded
- **WHEN** convergence records a decision that supersedes an earlier one
- **THEN** the relation SHALL be a frontmatter reference on the entry and no separate graph file SHALL be created

### Requirement: Converge cleans residue

The skill SHALL remove execution residue — the worktree, temp files, intermediate artifacts — before handing to delivery. Transient state is cleaned; durable state has already been externalized.

#### Scenario: Residue removed
- **WHEN** convergence hands to delivery
- **THEN** no residual worktree or temp files SHALL remain

### Requirement: Converge hands to delivery with a verifiable result

The skill SHALL open the pull request and record the integration result. Delivery proceeds only on a mergeable branch with green CI; a red CI result and an unmergeable branch (merge conflict) are both failing outcomes that send the work back to implementation with the failure, never overridden.

#### Scenario: Red CI
- **WHEN** CI is red after the PR is opened
- **THEN** the work SHALL go back to implementation with the failure, and delivery SHALL NOT proceed

#### Scenario: Merge conflict
- **WHEN** the unit's branch cannot be merged
- **THEN** the conflict SHALL be reported as a failing integration outcome handled like red CI, and delivery SHALL NOT proceed

### Requirement: Graph profile

When mounted on the converge node, the skill SHALL additionally: carry its memory updates on the work unit's own branch so concurrent runs serialize through version control; write the handoff record — the unit's closing summary (what was done, what was decided, what remains), written into the work-unit folder before archival; and report exactly one of the outcomes `integration-green`, `integration-failed`, or `blocked`, leaving routing to the node's declared edges.

#### Scenario: Mounted converge
- **WHEN** the skill runs as the converge node of a work unit
- **THEN** its memory updates SHALL travel with the unit's branch, the handoff SHALL be in the work-unit folder, and the orchestrator SHALL route by the node's edges on the reported outcome
