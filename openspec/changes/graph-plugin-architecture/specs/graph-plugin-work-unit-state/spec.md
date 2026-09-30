## ADDED Requirements

### Requirement: Single state file
Graph execution SHALL keep its work-unit state in a single file `work-unit.json`. It SHALL replace markdown work-unit state for graph execution, and no markdown copy of the same state SHALL exist.

#### Scenario: Single source of truth
- **WHEN** a work unit runs under the graph
- **THEN** `work-unit.json` SHALL be the only record of its execution state

### Requirement: Orchestrator is the only writer
Only the orchestrator SHALL write `work-unit.json`. The implementor and reviewer SHALL read state and return their results in their reports, and MUST NOT write it.

#### Scenario: Actor result recorded
- **WHEN** the implementor returns a report
- **THEN** the orchestrator SHALL transcribe the result into state and no actor SHALL have written the file

### Requirement: Required schema fields
`work-unit.json` SHALL contain at least these fields:

- `schema_version`: schema version string.
- `id`: work-unit identifier.
- `current_node`: id of the node currently executing or awaiting a human.
- `grading`: one of `full`, `small`, `trivial`, `no-op`, or null before approval.
- `fast_path`: boolean, true when grading is `trivial`.
- `tickets`: ordered list; each entry has `id`, `title`, `status` (`pending`, `in-progress`, `passed`, `failed`, `blocked`), and `verification_command`.
- `fail_counters`: map from ticket or node id to a non-negative integer failure count.
- `reviews`: list of verdicts; each entry has `node`, `target` (ticket or artifact id), `verdict` (`pass` or `fail`), per-dimension results, and `evidence_refs` (paths, command outputs, or log entry ids).
- `human_decisions`: list of gate and escalation answers with node, decision, and feedback.
- `log`: append-only execution log.

#### Scenario: Minimal valid state
- **WHEN** Trigger creates `work-unit.json`
- **THEN** it SHALL contain every required field, with empty lists and zero counters where no data exists

### Requirement: Append-only execution log
`log` SHALL be append-only. Each entry SHALL have a timestamp, the node, the event (dispatch, report, verdict, human decision, or route), and a reference to its source (actor report or human answer). Entries MUST NOT be edited or removed.

#### Scenario: Route recorded
- **WHEN** the orchestrator routes from Build to Review
- **THEN** it SHALL append a route entry and leave earlier entries unchanged

### Requirement: Counters and verdicts are updated by the orchestrator only
Fail counters SHALL be incremented by the orchestrator when it records a failing verdict, and reviews SHALL be added by the orchestrator from the reviewer's report. Each review SHALL carry at least one evidence reference.

#### Scenario: Failing verdict
- **WHEN** the reviewer reports a failing verdict for a ticket
- **THEN** the orchestrator SHALL append a review with evidence refs and increment that ticket's counter

### Requirement: State is readable by actors and consistent with the graph
Dispatches SHALL give actors read access to the state they need per their node spec, and the orchestrator SHALL keep `current_node`, `grading`, and `fast_path` consistent with the graph's routing (for example a `trivial` grading sets `fast_path` true).

#### Scenario: Trivial grading
- **WHEN** the human approves a trivial grading
- **THEN** the orchestrator SHALL set `grading` to `trivial` and `fast_path` to true before routing to Build
