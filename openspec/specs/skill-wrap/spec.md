## Purpose

Standalone clean-state skill: end a line of work so the next session can take over cold. Every session leaves the project in a clean state — verification green, durable outcomes externalized, no residual artifacts, no workflow tool mid-flight — because without active cleanup, repositories accrue entropy and successors waste their start diagnosing their predecessor's leftovers. The node that mounts it becomes the unit's close-out stage — the graph's single memory write point, which is why exactly one node per graph mounts it.

## Requirements

### Requirement: The clean-state guarantee

Close-out SHALL leave the project in a state a successor session can pick up with zero knowledge of this session: declared verification passes, progress and outcomes are recorded in versioned files (never only in conversation), no temporary or debugging artifacts remain, no workflow tool is mid-flight, and the standard entry path works. A successor MUST NOT need to diagnose what the previous session left behind or distinguish intentional work from leftover scaffolding.

#### Scenario: Successor cold start
- **WHEN** a new orchestrator session takes over after close-out
- **THEN** it SHALL be able to resume from the externalized records alone, finding no residue whose intent it must guess

#### Scenario: Cleanup is idempotent
- **WHEN** a close-out is interrupted and run again
- **THEN** the repeated cleanup SHALL converge to the same clean state with no additional side effects

### Requirement: Close-out merges durable outcomes into memory

The skill SHALL collect the durable outcomes the line of work produced (decisions made, features landed, proposed constraint or architecture changes — consolidating any draft deltas written along the way: deduplicate, resolve relations, drop drafts the reviews rejected) and merge them into long-term memory as pending delta entries. It MUST NOT edit a current-truth document directly — pending deltas are folded in later by a maintenance apply unit.

#### Scenario: Decision merged
- **WHEN** close-out merges a drafted decision that supersedes an earlier entry
- **THEN** the ledger gains a pending delta whose frontmatter references the superseded entry, no current-truth document SHALL change, and no separate graph file SHALL be created

### Requirement: Close-out cleans residue and closes workflow state

The skill SHALL remove execution residue — the worktree, temp files, intermediate artifacts, and temporary debugging scaffolding (debug output statements, commented-out experiments, dead TODO markers introduced by this line of work) — and SHALL close out the state of the workflow tools the work used, leaving no tool mid-flight (for example, archiving an applied OpenSpec change). Transient state is cleaned; durable state has already been externalized.

#### Scenario: Residue removed
- **WHEN** close-out hands to integration
- **THEN** no residual worktree or temp files SHALL remain

#### Scenario: Workflow tool closed out
- **WHEN** the work was driven through a workflow tool with its own lifecycle
- **THEN** close-out SHALL complete that lifecycle (for example `openspec archive` for the applied change) rather than leave it dangling

### Requirement: Close-out ends at handover

The skill SHALL end the line of work at handover: open the delivery channel the project uses (reference implementation: a pull request), record the handoff, and finish. It MUST NOT wait for asynchronous integration results — no unit holds open state for an external verification. An integration failure discovered after handover (red CI, a merge conflict needing a rebase) re-enters the factory as a new work unit through its own trigger — `ci-failure`, or the human's prompt — typically walking a short phase to fix it.

#### Scenario: Handover finishes the unit
- **WHEN** close-out has opened the delivery channel and written the handoff
- **THEN** the unit SHALL proceed to its terminal and archive, holding no pending-integration state

#### Scenario: CI fails after handover
- **WHEN** CI fails on the delivered branch after the unit is archived
- **THEN** the failure SHALL arrive as a new work unit with trigger source `ci-failure`, and the original unit SHALL NOT be reopened

#### Scenario: Conflict needs a rebase
- **WHEN** the delivered branch develops a merge conflict
- **THEN** the human's prompt SHALL trigger a new short-phase unit to resolve it, not a loop inside the old unit

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: collect the draft deltas from the work unit's stage directories and carry the merged entries on the unit's own branch so concurrent runs serialize through version control; write the handoff record — the unit's closing summary (what was done, what was decided, what remains), written into the work-unit folder before archival; and report exactly one of the outcomes `handed-off` or `blocked`, leaving routing to the node's declared edges.

#### Scenario: Mounted close-out
- **WHEN** the skill runs as the close-out stage of a work unit
- **THEN** its merged deltas SHALL travel with the unit's branch, the handoff SHALL be in the work-unit folder, and the orchestrator SHALL route by the node's edges on the reported outcome
