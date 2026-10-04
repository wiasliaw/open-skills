## Purpose

The concrete contract of externalized execution state: one folder per work unit records what happened during a run — routing state, an append-only event log, and per-stage artifacts — validated and written through a deterministic script.

## Requirements

### Requirement: Work-unit folder

Each work unit SHALL live in one folder at the work-units location declared in the project config written by the bootstrap, holding: `state.json` (routing state only, bounded size), `log.ndjson` (append-only event log, one JSON object per line), and one `<stage>/` directory per executed node — named by the node's id from the graph definition — holding that stage's artifacts (worker outputs, draft deltas `delta-<n>.md`, reviewer reports `review-<n>.md`, advisor advice `advice-<n>.md`, human decision records `decision-<n>.md`). A skipped node has no directory; advice lives under the stage it addresses. No markdown copy of routing state SHALL exist.

#### Scenario: Routing truth lives in state.json
- **WHEN** a work unit runs under the graph
- **THEN** `state.json` SHALL be the only record of its routing state, and the stage directories SHALL hold content, not routing fields

#### Scenario: Node ids come from the graph
- **WHEN** a stage directory is created or a node id is recorded in state
- **THEN** the id SHALL be one declared by the project's graph definition, not a vocabulary fixed by this spec

### Requirement: Write authority is split by path

`state.json` and `log.ndjson` SHALL be written only by the orchestrator. Stage artifacts SHALL be written by the actor that produced them, directly into the stage directory named in its dispatch, and nowhere else in the folder. Humans write nothing: their answers reach the folder only as orchestrator-recorded decision records, state entries, and log lines.

#### Scenario: Reviewer report
- **WHEN** the reviewer completes a pass
- **THEN** the reviewer SHALL have written its report into the dispatched stage directory itself, and the orchestrator SHALL record only the verdict and a file pointer in `state.json`

### Requirement: Routing state content

`state.json` SHALL be two-layer. The core contract, present for every unit of every graph because it serves the universal machinery (orchestration, the fallback chain, approvals): the unit's identity (an id matching `^[a-z0-9][a-z0-9-]*$`, timestamps, and the captured trigger: its source and the original request verbatim); the current node; the blocked problem tracking when escalation is in flight; failure counters keyed by scope (the scope kind `node:<id>` is universal; further scope kinds, such as `ticket:<id>`, exist only where the graph declares the concept); advisor consultations keyed per problem, capped at the graph's declared consultation cap; review verdicts and human decisions, each with evidence references and a folder-relative file pointer to the full record; and the outcome with its reason. Everything else is graph-declared state: the graph definition declares each further field by name, type, and allowed values — the plugin's template factories declare the approved phase, the fast-path flag, the contract reference, and the ticket list with its current selection — and the write gate validates against the core contract plus the unit's graph declaration. A field belonging to a concept the graph does not have SHALL NOT exist in that graph's units. Full content lives in stage files; `state.json` holds verdicts, counts, enums, dates, and pointers.

#### Scenario: Graph-declared routing field
- **WHEN** a graph definition declares a state field beyond the core contract
- **THEN** validation SHALL accept that field, with its declared type and values, in `state.json` for units running that graph

#### Scenario: Factory without tickets
- **WHEN** a graph declares no decomposition concept
- **THEN** its units' `state.json` SHALL contain no ticket fields and no `ticket:` counter scopes, and validation SHALL reject them if present

#### Scenario: Verdict recorded with pointer
- **WHEN** the orchestrator records a review verdict
- **THEN** the entry SHALL carry at least one evidence reference and a folder-relative pointer to the reviewer's report file

#### Scenario: Counters feed escalation
- **WHEN** a failing verdict is recorded for a scope
- **THEN** the orchestrator SHALL increment that scope's failure counter in the same write, and a counter at its cap SHALL select the advisor edge; advice SHALL NOT reset the counter

### Requirement: Lifecycle

The folder SHALL be created at the graph's entry node and archived at a terminal by moving the whole folder, after the outcome and a final archive log line are recorded. After archival the folder is frozen: no further writes by anyone.

#### Scenario: Archive at a terminal
- **WHEN** execution reaches a terminal and its deterministic steps complete
- **THEN** the orchestrator SHALL set the outcome, append the archive line, and move the folder to the archive, after which nothing SHALL be written

### Requirement: Consistency invariants

Every write SHALL be validated and rejected on violation, at minimum: `log.ndjson` is append-only (previous content is a byte-prefix of the new content, ids strictly increasing, every state change accompanied by a log line); immutable identity fields never change; the blocked node is set if and only if an escalation problem is open; advisor consultation counts never exceed the declared cap; outcome pairs with a terminal current node; every file pointer and folder-relative evidence reference resolves to an existing file inside the folder; top-level fields neither in this contract nor declared by the unit's graph definition are rejected.

#### Scenario: Dangling pointer rejected
- **WHEN** a write would add a pointer to a file that does not exist in the folder
- **THEN** validation SHALL reject the write and change nothing

#### Scenario: Log tampering rejected
- **WHEN** a write would modify or delete an existing log line
- **THEN** validation SHALL reject the write

### Requirement: A deterministic script is the single write gate

Folder mechanics SHALL live in one zero-dependency Node.js script (Node.js >= 20, built-in modules only) with subcommands to create, validate, write, and archive a unit, following the plugin's script conventions: exactly one JSON object on stdout, stable error codes, documented exit codes, committed `node --test` suite. The orchestrator drafts state and log lines; the script validates the draft against this contract and applies it atomically; hand-editing `state.json` or `log.ndjson` is forbidden.

#### Scenario: Rejected draft
- **WHEN** the script rejects a drafted state
- **THEN** nothing SHALL have been written, and the orchestrator SHALL fix the draft and retry rather than edit the files directly
