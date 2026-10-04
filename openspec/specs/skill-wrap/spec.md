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

The skill SHALL remove the execution residue inside the working copy — temp files, intermediate artifacts, and temporary debugging scaffolding (debug output statements, commented-out experiments, dead TODO markers introduced by this line of work) — and SHALL close out the state of the workflow tools the work used, leaving no tool mid-flight (for example, archiving an applied OpenSpec change). The worktree itself is not the skill's to remove: that is the deterministic delivery half's job. Transient state is cleaned; durable state has already been externalized.

#### Scenario: Residue removed
- **WHEN** the delivery steps complete after close-out passes review
- **THEN** no residual worktree or temp files SHALL remain

#### Scenario: Workflow tool closed out
- **WHEN** the work was driven through a workflow tool with its own lifecycle
- **THEN** close-out SHALL complete that lifecycle (for example `openspec archive` for the applied change) rather than leave it dangling

### Requirement: Close-out ends at handover

The skill SHALL end the line of work at handover, in two halves. The LLM half (this skill) produces the close-out deliverables: the consolidated delta entries and the handoff record. After those pass review, the deterministic half — committing, pushing, opening the delivery channel the project uses (reference implementation: a pull request), and removing the worktree — is executed by the orchestrator as commands, so nothing irreversible happens before the reviewer's verdict. Neither half waits for asynchronous integration results — no unit holds open state for an external verification. An integration failure discovered after handover (red CI, a merge conflict needing a rebase) re-enters the factory as a new work unit through its own trigger — `ci-failure`, or the human's prompt — typically walking a short phase to fix it.

#### Scenario: Handover finishes the unit
- **WHEN** the close-out deliverables pass review and the orchestrator completes the delivery steps
- **THEN** the unit SHALL proceed to its terminal and archive, holding no pending-integration state

#### Scenario: Reviewer rejects close-out
- **WHEN** the reviewer fails the close-out deliverables
- **THEN** no delivery step SHALL have run — no commit pushed, no channel opened, the worktree intact — and the stage retries like any failing stage

#### Scenario: CI fails after handover
- **WHEN** CI fails on the delivered branch after the unit is archived
- **THEN** the failure SHALL arrive as a new work unit with trigger source `ci-failure`, and the original unit SHALL NOT be reopened

#### Scenario: Conflict needs a rebase
- **WHEN** the delivered branch develops a merge conflict
- **THEN** a `ci-failure` trigger or the human's prompt SHALL open a new short-phase unit to resolve it, not a loop inside the old unit

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: work inside a worktree the orchestrator provisions for the close-out node exactly as for a build node (lazily, reusing the unit's worktree when one is live); read the draft deltas from the work unit's stage directories in the main checkout and merge the entries into the ledger inside the worktree, so they travel on the unit's own branch and concurrent runs serialize through version control; write the handoff record — the unit's closing summary (what was done, what was decided, what remains) — as a deliverable in its own stage directory, copied to the folder root by the terminal's deterministic steps; and report the outcome `handed-off` — routable outcomes route by the node's declared edges, while a blocked report engages the universal in-place fallback chain.

#### Scenario: Mounted close-out
- **WHEN** the skill runs as the close-out stage of a work unit
- **THEN** its merged deltas SHALL travel with the unit's branch, the handoff SHALL be in the work-unit folder, and the orchestrator SHALL route by the node's edges on the reported outcome
