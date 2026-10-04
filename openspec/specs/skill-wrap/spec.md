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

The skill SHALL open the pull request and record the CI result; delivery proceeds only on green, and a red result routes back to implementation rather than being overridden.

#### Scenario: Red CI
- **WHEN** CI is red after the PR is opened
- **THEN** the work SHALL go back to implementation with the failure, and delivery SHALL NOT proceed

### Requirement: Graph profile

When mounted on the converge node, the skill SHALL additionally: carry its memory updates on the work unit's own branch so concurrent runs serialize through version control; write the handoff record; and route by the declared edges (green to the success terminal's delivery, red back to build).

#### Scenario: Mounted converge
- **WHEN** the skill runs as the converge node of a work unit
- **THEN** its memory updates SHALL travel with the unit's branch and its routing SHALL follow the declared CI edges
