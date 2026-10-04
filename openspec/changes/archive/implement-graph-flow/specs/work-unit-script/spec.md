## ADDED Requirements

### Requirement: Work-unit folder mechanics live in one script

The plugin SHALL ship a zero-dependency Node.js script `scripts/work-unit.mjs` (Node.js >= 20, only built-in modules and `scripts/shared/`) with subcommands `create`, `validate`, `write`, and `archive`, following the sibling scripts' conventions: exactly one JSON object on stdout (`"ok"` plus `"action"` or a stable `"error"` code), diagnostics on stderr, documented exit codes.

#### Scenario: Create
- **WHEN** `create --units <dir> --id <id> --source <source> --request <text>` runs for a new id
- **THEN** it SHALL create `<dir>/<id>/` holding a schema-valid initial `state.json` (`current_node` `trigger`, empty lists and counters, null `grading`/`blocked_at`/`spec_ref`/`outcome`) and a `log.ndjson` with a single `create` line

#### Scenario: Duplicate id
- **WHEN** `create` targets an existing folder
- **THEN** it SHALL fail with error `already_exists` and write nothing

### Requirement: write is the validated single write gate

`write --unit <dir> --state <draft.json> --log <lines.json>` SHALL validate the drafted state against the `graph-plugin-work-unit-state` field schema (unknown top-level fields rejected) and consistency invariants, require at least one new log line whose ids and timestamps continue the existing sequence, reject changes to `schema_version`, `id`, `created_at`, and `trigger`, require `updated_at` to equal the newest log timestamp, and verify that every file pointer and folder-relative path evidence reference resolves inside the folder. On success it SHALL append the log lines (never rewriting existing ones) and replace `state.json` atomically; on any violation it SHALL fail with error `state` and write nothing.

#### Scenario: Invariant violation rejected
- **WHEN** a draft sets `fast_path` true while `grading` is `full`
- **THEN** `write` SHALL fail with error `state` and leave both files unchanged

#### Scenario: Dangling pointer rejected
- **WHEN** a draft adds a review whose `file` does not exist in the folder
- **THEN** `write` SHALL fail with error `state`

#### Scenario: Append-only by construction
- **WHEN** `write` succeeds
- **THEN** the previous `log.ndjson` content SHALL be a byte-prefix of the new content

### Requirement: archive freezes a terminal unit

`archive --unit <dir> --to <dir>` SHALL require a valid unit whose `outcome` is set and whose final log line is an `archive` event, and SHALL move the whole folder to `<to>/<id>`, failing with `already_exists` when the target exists.

#### Scenario: Live unit refused
- **WHEN** `archive` runs on a unit with null `outcome`
- **THEN** it SHALL fail with error `state` and move nothing

### Requirement: validate checks a stored unit

`validate --unit <dir>` SHALL run the full schema, log-sequence, and invariant checks against the stored files and report the unit's id, `current_node`, and line count on success.

#### Scenario: Missing folder
- **WHEN** `validate` targets a path that is not a work-unit folder
- **THEN** it SHALL fail with error `not_found`
