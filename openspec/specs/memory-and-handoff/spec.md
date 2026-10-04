## Purpose

The durable records of a run: long-term memory entries (what the project now knows) and the handoff record (how a work unit ended) — their formats, locations, and writers.

## Requirements

### Requirement: Memory layout is one entry per file

Long-term memory SHALL live under the project's `.harness/` namespace with one entry per file, grouped by entry type in subdirectories (reference types: `decisions/` and `features/`; a graph MAY declare more). One-entry-per-file is required so that concurrent converge stages serialize through version control as whole-file additions rather than conflicting in-place edits.

#### Scenario: Two units record decisions concurrently
- **WHEN** two work units each add a decision entry on their own branches
- **THEN** each SHALL be a new file and the merge SHALL succeed without in-place conflict

### Requirement: Entry format is markdown with typed frontmatter

A memory entry SHALL be a markdown file with YAML frontmatter carrying at minimum: `id` (unique, stable), `title`, `date`, and `type`; relations SHALL be the frontmatter fields `supersedes`, `depends-on`, `decided-by`, and `verified-by`, each a list of entry ids. The body is free prose. Relations SHALL reference existing entry ids; no other relation vocabulary and no separate relation graph file SHALL exist.

#### Scenario: Superseding decision
- **WHEN** a new decision replaces an old one
- **THEN** the new entry's frontmatter SHALL list the old entry's id under `supersedes`, and the old file SHALL remain in place unedited

### Requirement: Read by all, written at converge

Every node and actor MAY read long-term memory; during a run only the designated converge node SHALL write it, carrying its new entries on the work unit's branch. The bootstrap's one-time configs are the only pre-run writes in the namespace.

#### Scenario: Mid-run write attempt
- **WHEN** a non-converge stage tries to add or edit a memory entry
- **THEN** the write SHALL be a restriction violation recorded as a failure

### Requirement: The handoff record closes a work unit

Every work unit that reaches a terminal SHALL have a handoff record written into its work-unit folder before archival: what was done, what was decided (the ids of memory entries it created), what remains or why it was abandoned. The converge node writes it on success; the orchestrator writes it at the abandonment terminal. Its reader is the next session or human picking up the project.

#### Scenario: Abandoned unit still hands off
- **WHEN** a work unit ends through a no-op grading or a cancellation
- **THEN** the handoff record SHALL state the conclusions and the abandonment reason before the folder is archived
