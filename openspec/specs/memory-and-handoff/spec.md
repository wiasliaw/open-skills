## Purpose

The durable records of a run, managed the way specs are managed: current-truth documents change only through an apply step, runs only accumulate deltas, and the handoff record closes every work unit.

## Requirements

### Requirement: Memory is current truth plus accumulated deltas

Long-term memory SHALL live under the project's `.harness/` namespace in two layers: a declared set of current-truth documents (reference set: architecture, constraints), each with a declared size budget and loaded whole at every run; and a delta ledger — one file per delta entry (reference types: decision, feature, constraint-change, architecture-change) recording a durable outcome as a proposed change to current truth. Deltas accumulate append-only; current-truth documents are never the direct target of a run-time write.

#### Scenario: Current truth stays bounded
- **WHEN** a current-truth document would exceed its declared budget
- **THEN** that SHALL be a validation failure that demands distillation, not a silent growth

#### Scenario: History grows, the read surface does not
- **WHEN** the delta ledger grows over the project's life
- **THEN** the always-loaded set SHALL remain the budgeted current-truth documents plus a generated index, never the ledger itself

### Requirement: Delta entry format

A delta entry SHALL be a markdown file with YAML frontmatter carrying at minimum: `id` (unique, stable), `title`, `date`, `type`, `status` (`pending`, `applied`, or `rejected`), and the current-truth target it proposes to change; relations SHALL be the frontmatter fields `supersedes`, `depends-on`, `decided-by`, and `verified-by`, each a list of entry ids referencing existing entries. The body states the outcome and its rationale. One entry per file is required so concurrent runs merge as whole-file additions, never as in-place conflicts.

#### Scenario: Superseding decision
- **WHEN** a new decision replaces an earlier one
- **THEN** the new delta's frontmatter SHALL list the old entry's id under `supersedes`, and the old file SHALL remain in place unedited

### Requirement: Deltas originate in the work unit and merge back at converge

A durable outcome SHALL be drafted where and when it happens: the stage whose work produced it writes a draft delta (`delta-<n>.md`, same format as a ledger entry) into its own stage directory in the work-unit folder, and `.harness/` stays untouched. Every node and actor MAY read long-term memory, but the ledger is written only at converge: the converge stage SHALL collect the unit's draft deltas, consolidate them (deduplicate, resolve relations, drop drafts the reviews rejected), and merge them into `.harness/` as pending delta entries carried on the work unit's branch. A ledger write by any stage other than converge, or a direct run-time edit to a current-truth document by anyone, SHALL be a restriction violation recorded as a failure. The bootstrap's one-time config is the only pre-run write in the namespace.

#### Scenario: Drafted at the moment of decision
- **WHEN** a stage makes a lasting decision mid-run
- **THEN** it SHALL write a draft delta into its own stage directory, and no `.harness/` path SHALL change

#### Scenario: Merged at converge
- **WHEN** the work unit reaches converge
- **THEN** the drafted deltas SHALL be consolidated and merged into the ledger as pending entries on the unit's branch

#### Scenario: Mid-run direct edit
- **WHEN** any stage writes the ledger before converge or edits a current-truth document during a run
- **THEN** the write SHALL be a restriction violation recorded as a failure

### Requirement: Apply is a maintenance work unit

Pending deltas SHALL be folded into the current-truth documents only by an apply step that runs as a normal work unit through the graph — reviewed, converged, and serialized through version control like any other work. Cleanup is dual-mode: close-out performs each session's immediate cleanup, and the maintenance unit is the periodic comprehensive pass over accumulated state. Applying marks each folded delta `applied` (the file stays as history); a delta judged wrong is marked `rejected` with the reason. The project config MAY declare thresholds (pending-delta count, current-truth budget pressure) whose breach is reported at run start as a due maintenance unit.

#### Scenario: Distillation run
- **WHEN** the pending-delta threshold is breached
- **THEN** the next run start SHALL report a due maintenance unit, which folds pending deltas into current truth, marks them applied, and passes review like any work unit

#### Scenario: Applied delta is history
- **WHEN** a delta is applied
- **THEN** its file SHALL remain with status `applied`, and the default index view SHALL stop listing it as pending

### Requirement: The index is generated, never hand-written

A deterministic script SHALL generate the memory index from entry frontmatter (id, title, date, type, status, relations); the index SHALL NOT be hand-edited and SHALL be regenerable at any time, including after a merge. The default view lists current-truth documents and pending deltas; applied and rejected entries appear only on request. Readers follow progressive disclosure: load the current truth and the index, pull individual entries on demand.

#### Scenario: Index after a merge
- **WHEN** two branches each added delta entries and are merged
- **THEN** regenerating the index SHALL reflect both sides with no manual reconciliation

### Requirement: The handoff record closes a work unit

Every work unit that reaches a terminal SHALL have a handoff record written into its work-unit folder before archival: what was done, what was decided (the ids of delta entries it created), what remains or why it was abandoned. The converge node writes it on success; the orchestrator writes it at the abandonment terminal. Its reader is the next session or human picking up the project.

#### Scenario: Abandoned unit still hands off
- **WHEN** a work unit ends because the phase approval judged it not needed, or through a cancellation
- **THEN** the handoff record SHALL state the conclusions and the abandonment reason before the folder is archived
