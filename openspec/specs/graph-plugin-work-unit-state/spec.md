## Requirements

### Requirement: Work-unit folder
Graph execution SHALL keep each work unit in one folder at the declared work-units location, `<work-units-location>/<id>/`, laid out as:

- `state.json`: routing state only, with a bounded size.
- `log.ndjson`: the append-only cross-stage event log, one JSON object per line.
- `<stage>/`: one directory per executed node, named by the node-id enum (`research-explore/`, `spec/`, `build/`, and so on), holding that stage's actor artifacts: implementor outputs, reviewer reports `review-<n>.md`, advisor advice `advice-<n>.md` addressed to that stage, and, for a gate stage, the human decision record `decision-<n>.md`.

This layout SHALL replace markdown work-unit state for graph execution, and no markdown copy of the routing state SHALL exist. A node that was skipped SHALL have no directory. Advisor advice SHALL live under the stage it addresses, and there SHALL be no top-level advisor directory. `<n>` SHALL be a 1-based sequence number, strictly increasing within one stage directory for that file kind. The orchestrator SHALL create a stage directory when it first dispatches that node's actor or first records a decision for that node; a node that produces no artifact (for example the deterministic Trigger, Ship, or End) needs none.

#### Scenario: Routing truth lives in state.json
- **WHEN** a work unit runs under the graph
- **THEN** `state.json` SHALL be the only record of its routing state, and the stage directories SHALL hold content and not routing fields

#### Scenario: Skipped stage
- **WHEN** a `trivial` work unit never executes Spec
- **THEN** the folder SHALL contain no `spec/` directory

#### Scenario: Advice location
- **WHEN** the advisor is consulted for a problem blocked at `build`
- **THEN** its advice file SHALL be `build/advice-<n>.md` and no top-level advisor directory SHALL exist

### Requirement: Write authority is split by path
`state.json` and `log.ndjson` SHALL be written only by the orchestrator, and every field in the `state.json` schema SHALL have the orchestrator as its writer. Humans and actors (implementor, reviewer, advisor) MUST NOT write either file. Files under `<stage>/` SHALL be written by the actor that produced the artifact: the implementor, reviewer, and advisor each SHALL write their own outputs and reports directly into the stage directory their dispatch names, and MUST NOT write anywhere else in the work-unit folder. Humans write nothing: a human's input at a gate or at Human Escalation SHALL reach the folder only as an orchestrator-recorded decision file in the gate's stage directory, a `human_decisions` entry in `state.json`, and a log event. This replaces the earlier rule that the orchestrator writes everything.

#### Scenario: Actor artifact written by the actor
- **WHEN** the reviewer completes a pass for the `spec` stage
- **THEN** the reviewer SHALL have written `spec/review-<n>.md` itself, and the orchestrator SHALL record only the verdict and the file pointer in `state.json`

#### Scenario: Actor result routed by the orchestrator
- **WHEN** the implementor returns a report
- **THEN** the orchestrator SHALL transcribe the routing-relevant result into `state.json` and append the log line, and no actor SHALL have written either file

#### Scenario: Human answer recorded
- **WHEN** the human answers a gate question
- **THEN** the orchestrator SHALL write the decision record into the gate's stage directory, append the `human_decisions` entry and log event, and the human SHALL NOT have edited any file

### Requirement: Document lifecycle
The work-unit folder SHALL be created by the Trigger node, through the orchestrator, when new work arrives, containing `state.json` and `log.ndjson`, and SHALL be archived at Ship or End by moving the entire folder. Immediately before archiving, the orchestrator SHALL set `outcome` (and `outcome_reason` for `ended`), set `current_node` to `ship` or `end`, and append a final `archive` log line. After the archive step the folder SHALL be frozen: no further writes by anyone, including no new log lines and no new stage artifacts.

#### Scenario: Creation at Trigger
- **WHEN** Trigger receives new work
- **THEN** the orchestrator SHALL create the folder with `state.json` (`current_node` set to `trigger`, every required field present, empty lists, empty `fail_counters`, `grading` null, `fast_path` false, `blocked_at` null, `spec_ref` null, `outcome` null) and `log.ndjson` holding a `create` line

#### Scenario: Archive at Ship
- **WHEN** execution reaches Ship and the deterministic delivery steps complete
- **THEN** the orchestrator SHALL set `outcome` to `shipped`, `current_node` to `ship`, append the `archive` line, and move the whole folder to the archive, after which nothing SHALL be written

#### Scenario: Archive at End
- **WHEN** execution reaches End through a no-op grading or a Human Escalation cancel
- **THEN** the orchestrator SHALL set `outcome` to `ended` with a non-empty `outcome_reason`, `current_node` to `end`, append the `archive` line, and move the whole folder to the archive

### Requirement: Field definition conventions
Every field SHALL be defined by name, JSON type, allowed values, writer, and lifecycle. Timestamps SHALL be ISO-8601 UTC date-time strings (for example `2026-09-30T09:00:00Z`). Node ids SHALL be exactly the thirteen lowercase kebab-case identifiers `trigger`, `research-explore`, `human-gate-grading`, `spec`, `human-gate-spec`, `ticket`, `build`, `review`, `wrap`, `ship`, `end`, `advisor`, `human-escalation`, matching the suffixes of the `graph-node-*` specs. An evidence reference SHALL be an object `{ "kind": "path" | "command" | "log", "ref": string }` where `path` is a file path, `command` is a command line together with a pointer to its recorded output, and `log` is a log event id (`L-<n>`) from `log.ndjson`. A file pointer SHALL be a string path relative to the work-unit folder (for example `review/review-2.md`) and SHALL NOT be absolute or escape the folder. A `path` evidence reference SHALL be folder-relative when it points inside the work-unit folder; a path outside the folder SHALL be repo-root-relative and prefixed `repo:`. Unknown top-level fields in `state.json` SHALL be rejected by validation.

#### Scenario: Node id vocabulary
- **WHEN** any field holds a node id (`current_node`, `blocked_at`, the `node` of each `log.ndjson` line, `reviews[].node`, `human_decisions[].node`, `advisor_consults[].blocked_node`)
- **THEN** its value SHALL be one of the thirteen node ids listed above

### Requirement: Identity and time fields
`state.json` SHALL contain these fields, each written only by the orchestrator:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `schema_version` | string | semver `MAJOR.MINOR.PATCH`; initial value `1.0.0` | Set at creation; never changed for the life of the work unit |
| `id` | string | unique work-unit identifier matching `^[a-z0-9][a-z0-9-]*$` | Set at creation; never changed |
| `created_at` | string | ISO-8601 UTC | Set at creation; never changed |
| `updated_at` | string | ISO-8601 UTC, not earlier than `created_at` | Set at creation and on every write, equal to the timestamp of the newest `log.ndjson` line |
| `trigger` | object | `{ "source": "prompt" \| "issue" \| "ci-failure" \| "analysis-request", "request": string }` | Set at creation from the raw trigger payload; never changed |

#### Scenario: Timestamps advance with writes
- **WHEN** the orchestrator writes any change to state
- **THEN** it SHALL append a `log.ndjson` line and set `updated_at` to that line's timestamp

### Requirement: Routing fields
`state.json` SHALL contain these routing fields, each written only by the orchestrator:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `current_node` | string | one of the thirteen node ids | Set to `trigger` at creation; updated on every route to the target node id; final value is `ship` or `end` |
| `grading` | string or null | `full`, `small`, `trivial`, `no-op`, or null | Null from creation until the grading gate approves; then set to the approved value; set to `full` when a fast-path failure upgrades the path; reset to null when a rejection routes back to Research |
| `fast_path` | boolean | `true` only when `grading` is `trivial` | False at creation; set with `grading` at every change of `grading` |
| `blocked_at` | string or null | `research-explore`, `spec`, `ticket`, `build`, `review`, `wrap`, or null | Null at creation; set to the originating node id before routing to Advisor; retained across the Advisor retry and any Human Escalation; cleared to null when the retried node passes or execution ends |

For a Review failure with fail count of 2 or more, `blocked_at` SHALL be `build` (the node that repairs the failure and is retried with the advice). For a Review that cannot run or complete verification, `blocked_at` SHALL be `review`. For a blocked or in-node-review-loop failure of Research, Spec, Ticket, Build, or Wrap, `blocked_at` SHALL be that node.

#### Scenario: Trivial grading approved
- **WHEN** the human approves a trivial grading
- **THEN** the orchestrator SHALL set `grading` to `trivial` and `fast_path` to true before routing to Build

#### Scenario: Fast-path failure upgrades the path
- **WHEN** a fast-path work unit fails Review once and the orchestrator routes to Spec
- **THEN** the orchestrator SHALL set `grading` to `full` and `fast_path` to false in the same write as the route

#### Scenario: Rejection returns to Research
- **WHEN** the human rejects at the grading gate or the spec gate and the orchestrator routes to Research
- **THEN** the orchestrator SHALL set `grading` to null and `fast_path` to false, because Research is always followed by a new grading approval

#### Scenario: Review failure blocks at Build
- **WHEN** Review records a second failure of the same error for a ticket and routes to Advisor
- **THEN** `blocked_at` SHALL be `build`

### Requirement: Contract reference and delivery fields
`state.json` SHALL contain these fields, each written only by the orchestrator:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `spec_ref` | object or null | `{ "kind": "openspec-change" \| "path" \| "url", "ref": string }` or null | Null at creation; for `full` grading set when the Spec stage's review passes (the spec is produced); for `small` grading set at the grading gate approval to the existing spec being reused; stays null for `trivial` and `no-op`; replaced only if Spec is re-entered and produces a different reference |
| `current_ticket` | string or null | an id present in `tickets`, or null | Null until Ticket selects the first ticket; updated at each ticket selection; null after the last ticket passes |
| `refs` | object | `{ "issue": string or null, "pr": string or null }` | Both null at creation; `issue` set from the trigger when present; `pr` set when Build opens or updates the pull request |
| `ci_status` | string or null | `pending`, `green`, `red`, or null | Null until Wrap starts CI; set from the deterministic CI command result; Wrap routes to Ship only on `green` |

#### Scenario: Spec produced
- **WHEN** the Spec stage's review passes for a `full` grading
- **THEN** the orchestrator SHALL set `spec_ref` to the produced contract before routing to the spec gate

#### Scenario: Small grading reuses a spec
- **WHEN** the human approves a `small` grading
- **THEN** the orchestrator SHALL set `spec_ref` to the existing spec named in the Research report before routing to Ticket

### Requirement: Ticket schema
`tickets` SHALL be an ordered list, empty until Ticket completes, and each entry SHALL have these fields, written only by the orchestrator:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `id` | string | unique within `state.json`, for example `T-1` | Set when Ticket writes the list; never changed |
| `title` | string | non-empty short name | Set with the entry; never changed |
| `description` | string | non-empty scope of the ticket | Set with the entry; never changed |
| `status` | string | `pending`, `in-progress`, `passed`, `failed`, `blocked` | `pending` when created; `in-progress` when Build starts or retries it; `failed` when Review records a failing verdict; `blocked` when the ticket's stage is routed to Advisor as blocked; `passed` when Review records a passing verdict; a `passed` ticket never changes again unless Spec is re-entered and Ticket rewrites the list |
| `verification_command` | string | non-empty executable command line, declared before the ticket is handed to Build | Set with the entry; never changed |
| `evidence_refs` | list of evidence references | may be empty while `pending` | Appended by the orchestrator from Review reports; non-empty once `passed` or `failed` |

#### Scenario: Ticket declared with verification
- **WHEN** Ticket completes
- **THEN** every entry SHALL have a non-empty `verification_command` and status `pending`, and `current_ticket` SHALL name the first ticket

#### Scenario: Ticket passes
- **WHEN** Review reports a passing verdict for a ticket
- **THEN** the orchestrator SHALL set that ticket's `status` to `passed`, append the evidence references, and reset that ticket's fail counter to 0

### Requirement: Fail counter schema
`fail_counters` SHALL be an object mapping a scope key to a non-negative integer, written only by the orchestrator. A key SHALL be `ticket:<ticket-id>` for failing Review verdicts on a ticket (the Build and Review loop, feeding the Review "fail count of 2 or more" edge), `node:<node-id>` with node id `research-explore`, `spec`, `ticket`, or `wrap` for failing verdicts of that node's in-node review loop (feeding the "second failure of the in-node review loop" edge), or `node:build` for a failing Review verdict on the trivial fast path, where no ticket exists yet. A `node:build` entry records the upgrade-triggering failure for audit; it feeds no Advisor edge (the fast-path failure edge routes to Spec) and is reset when a later Review passes the Build output. A key SHALL be created at value 1 on the first failure of its scope, and an absent key SHALL mean 0. The orchestrator SHALL increment a counter when it records a failing verdict for that scope, SHALL reset it to 0 when that scope passes or when a human decision of `unblocked` resolves the problem for that scope, and SHALL NOT reset it when the Advisor issues advice. A counter value of 2 or more SHALL select the edge to Advisor.

#### Scenario: Failing Review verdict
- **WHEN** the reviewer reports a failing verdict for ticket `T-2`
- **THEN** the orchestrator SHALL increment `fail_counters["ticket:T-2"]` in the same write that appends the review

#### Scenario: In-node loop failure
- **WHEN** the in-node review loop of Spec fails
- **THEN** the orchestrator SHALL increment `fail_counters["node:spec"]`, and on the second failure SHALL record `blocked_at` as `spec` and route to Advisor

#### Scenario: Advice does not reset the counter
- **WHEN** the Advisor issues advice for a problem on `ticket:T-2` whose counter is 2
- **THEN** the counter SHALL remain 2 until the ticket passes or a human unblocks it

#### Scenario: Fast-path failure has a counter scope
- **WHEN** a trivial fast-path work unit fails Review once, with no ticket in `tickets`
- **THEN** the orchestrator SHALL record `fail_counters["node:build"]` as 1 in the same write that upgrades the grading and routes to Spec

### Requirement: Advisor consultation schema
`advisor_consults` SHALL be a list with one entry per problem, written only by the orchestrator. It SHALL hold routing data and file pointers only; the advice text lives in the advice file, which the advisor writes. Each entry SHALL have:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `problem_key` | string | `<scope-key>#<n>` where scope key is a `fail_counters` key and `n` is the 1-based ordinal of the problem on that scope, for example `ticket:T-2#1` | Set when the entry is created; never changed |
| `blocked_node` | string | the node id recorded in `blocked_at` for this problem | Set at creation |
| `count` | integer | 0, 1, or 2; always equal to the length of `advice` | Created at 0 when the orchestrator first routes the problem to Advisor; incremented on each consultation |
| `advice` | list | each item `{ "file": string, "date": ISO-8601, "log_ref": string }` where `file` is the folder-relative pointer to the advice file `<blocked_node>/advice-<n>.md` (the advice is addressed to the stage it blocks) and `log_ref` is the id of the advisor-consultation log event | Appended on each consultation |
| `status` | string | `open`, `escalated`, `resolved`, `abandoned` | `open` at creation; `escalated` when routed to Human Escalation and the human answers `unblocked`; `resolved` when the retried node passes; `abandoned` when the human answers `cancel` |

The orchestrator SHALL create a new entry (with the next ordinal) when a scope fails again after its previous entry became `resolved` or `escalated`. The Advisor SHALL NOT be consulted when the open entry's `count` is already 2; the orchestrator SHALL route to Human Escalation instead.

#### Scenario: Consultation recorded
- **WHEN** the advisor returns guidance for a blocked Build
- **THEN** the orchestrator SHALL set `blocked_at` to `build`, increment `count` for that problem key and append an `advice` item whose `file` points to `build/advice-<n>.md`, and append an advisor-consultation log line citing that file

#### Scenario: Cap reached
- **WHEN** a problem's entry has `count` 2 and the retried node fails again
- **THEN** the orchestrator SHALL NOT consult the Advisor a third time and SHALL route to Human Escalation

#### Scenario: Problem resolved
- **WHEN** the retried stage passes after advice
- **THEN** the orchestrator SHALL set the entry's `status` to `resolved` and `blocked_at` to null

#### Scenario: New problem on same scope
- **WHEN** ticket `T-2` fails again after a human unblocked `ticket:T-2#1`
- **THEN** the orchestrator SHALL create entry `ticket:T-2#2` with `count` 0 and `status` `open`

### Requirement: Review schema
`reviews` SHALL be an append-only-by-convention list of verdict records written only by the orchestrator from the reviewer's report; entries MUST NOT be edited or removed. An entry SHALL hold the verdict and routing data plus a pointer to the full report, which the reviewer writes into the stage directory. Each entry SHALL have:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | unique within `state.json`, for example `R-1` |
| `node` | string | `research-explore`, `spec`, `ticket`, `review`, or `wrap` (the stage whose reviewer pass produced the verdict; the Build stage's reviewer pass is recorded as `review`) |
| `target` | object | `{ "type": "ticket" \| "stage", "id": string }` where a `ticket` id is in `tickets` and a `stage` id is a node id |
| `verdict` | string | `pass` or `fail` |
| `dimensions` | list | each item `{ "name": string, "result": "pass" \| "fail" }`; a `pass` verdict SHALL have no failing dimension |
| `evidence_refs` | list of evidence references | at least one |
| `file` | string | folder-relative pointer to the full reviewer report `<dir>/review-<n>.md`, where `<dir>` is the stage directory of the reviewed pass (`review/` for the Build stage's reviewer pass, otherwise the stage's own directory) |
| `date` | string | ISO-8601 UTC |

#### Scenario: Failing verdict
- **WHEN** the reviewer reports a failing verdict for a ticket
- **THEN** the orchestrator SHALL append a review with at least one evidence reference and increment that ticket's counter

#### Scenario: Review without evidence
- **WHEN** a review would be appended with an empty `evidence_refs`
- **THEN** validation SHALL reject the write

### Requirement: Human decision schema
`human_decisions` SHALL be a list of recorded human answers, written only by the orchestrator before it routes on the answer. An entry SHALL hold the decision enum and a pointer to the decision record the orchestrator writes into the gate's stage directory. Each entry SHALL have:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | unique within `state.json`, for example `H-1` |
| `gate` | string | `grading`, `spec`, or `escalation` |
| `node` | string | `human-gate-grading` for `grading`, `human-gate-spec` for `spec`, `human-escalation` for `escalation` |
| `decision` | string | `approved` or `rejected` for `grading` and `spec`; `unblocked` or `cancel` for `escalation` |
| `grading` | string or null | the approved grading value (`full`, `small`, `trivial`, `no-op`) when `gate` is `grading` and `decision` is `approved`; null otherwise |
| `date` | string | ISO-8601 UTC |
| `file` | string | folder-relative pointer to the decision record `<gate-node>/decision-<n>.md` holding the human's feedback; the record SHALL carry non-empty feedback when `decision` is `rejected` or `cancel` |

#### Scenario: Grading approval recorded
- **WHEN** the human approves a grading of `small`
- **THEN** the orchestrator SHALL append a `human_decisions` entry with `gate` `grading`, `decision` `approved`, `grading` `small`, a `file` pointer to `human-gate-grading/decision-<n>.md`, set top-level `grading` to `small`, and only then route

#### Scenario: Escalation unblocked
- **WHEN** the human answers `unblocked` at Human Escalation
- **THEN** the orchestrator SHALL record the decision, set the problem entry's `status` to `escalated`, reset the scope's fail counter to 0, and resume at the `blocked_at` node

### Requirement: Append-only execution log
The execution log SHALL be the file `log.ndjson` in the work-unit folder: one JSON object per line, append-only. Existing lines MUST NOT be modified, reordered, or deleted, and only the orchestrator SHALL append. Each line SHALL have these fields:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | `L-<n>` with a zero-padded sequence number, strictly increasing |
| `timestamp` | string | ISO-8601 UTC, not earlier than the previous line |
| `source` | string | `actor-report`, `human-answer`, or `orchestrator` |
| `actor` | string or null | `implementor`, `reviewer`, or `advisor` when `source` is `actor-report`; null otherwise |
| `node` | string | a node id |
| `event_type` | string | `create`, `dispatch`, `report`, `verdict`, `advisor-consultation`, `human-decision`, `route`, `archive` |
| `description` | string | non-empty event description |
| `source_ref` | string or null | identifier of the actor report or human answer the line cites, a folder-relative file pointer when that report or answer is a file in a stage directory; required when `source` is `actor-report` or `human-answer`, null for orchestrator-originated events |

Event types SHALL map to sources as follows: `report`, `verdict`, and `advisor-consultation` come from an `actor-report`; `human-decision` comes from a `human-answer`; `create`, `dispatch`, `route`, and `archive` are `orchestrator` events.

#### Scenario: Route recorded
- **WHEN** the orchestrator routes from Build to Review
- **THEN** it SHALL append a `route` line to `log.ndjson` and leave earlier lines unchanged

#### Scenario: Log line edited
- **WHEN** a write would modify or delete an existing `log.ndjson` line
- **THEN** validation SHALL reject the write

### Requirement: Outcome fields
`state.json` SHALL contain `outcome` (null, `shipped`, or `ended`) and `outcome_reason` (string or null), written only by the orchestrator. Both SHALL be null at creation. At archive time `outcome` SHALL be `shipped` (with `outcome_reason` null) when execution reached Ship, or `ended` with a non-empty `outcome_reason` (for example "grading no-op: already exists" or "human cancelled at escalation") when execution reached End.

#### Scenario: Ended with reason
- **WHEN** a grading of `no-op` routes to End
- **THEN** the orchestrator SHALL set `outcome` to `ended` and `outcome_reason` to a non-empty reason

### Requirement: Counters and verdicts are updated by the orchestrator only
Fail counters SHALL be incremented by the orchestrator when it records a failing verdict, and `reviews` entries SHALL be added by the orchestrator from the reviewer's report, which the reviewer itself writes into the stage directory. Each review SHALL carry at least one evidence reference.

#### Scenario: Failing verdict
- **WHEN** the reviewer reports a failing verdict for a ticket
- **THEN** the orchestrator SHALL append a review with evidence refs and increment that ticket's counter

### Requirement: State is readable by actors and consistent with the graph
Dispatches SHALL give actors read access to the work-unit folder content they need per their node spec, and the orchestrator SHALL keep `current_node`, `grading`, and `fast_path` consistent with the graph's routing.

#### Scenario: Actor reads state
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the dispatch SHALL make available the `state.json` fields and stage artifacts that node's spec lists as inputs

### Requirement: Blocked and advisor state is maintained by the orchestrator
The orchestrator SHALL set `blocked_at` to the originating node id before routing to the Advisor, and SHALL clear it to null when the blocked problem is resolved. It SHALL update `advisor_consults` on each Advisor consultation (increment the count for the problem key and append the advice file pointer) and SHALL append an advisor-consultation line to the append-only `log.ndjson`.

#### Scenario: Blocked stage routed
- **WHEN** any stage reports blocked
- **THEN** the orchestrator SHALL set `blocked_at` to that stage, set the current ticket's `status` to `blocked` when the stage works on a ticket, create the problem entry if no open entry exists for the scope, and route to Advisor

### Requirement: Consistency invariants
The orchestrator SHALL validate every write to `state.json` and `log.ndjson` against these invariants and MUST reject a write that violates any of them:

1. `fast_path` is true if and only if `grading` is `trivial`.
2. `blocked_at` is non-null if and only if `outcome` is null and at least one `advisor_consults` entry has `status` `open` or `escalated`; while `current_node` is `advisor` or `human-escalation`, `blocked_at` is non-null.
3. `log.ndjson` is append-only: its previous content is a prefix of the new content (existing lines never modified or deleted), ids strictly increase, and every `state.json` change is accompanied by at least one new line.
4. `state.json` and `log.ndjson` are written only by the orchestrator, and `updated_at` equals the newest log timestamp.
5. `outcome` is non-null if and only if `current_node` is `ship` or `end`; `shipped` pairs with `ship`, `ended` pairs with `end`.
6. Each `advisor_consults[].count` equals the length of its `advice` and never exceeds 2.
7. `current_ticket` is null or an id in `tickets`; at most one ticket has `status` `in-progress` or `blocked`.
8. `spec_ref` is non-null whenever `current_node` is `ticket`, `build`, `review`, `wrap`, or `ship` and `grading` is `full` or `small`.
9. Every `fail_counters` key refers to an existing ticket id or to one of `research-explore`, `spec`, `ticket`, `wrap`, `build` (the `node:build` scope is the fast-path Build failure).
10. Every file pointer in `state.json` (`reviews[].file`, `human_decisions[].file`, `advisor_consults[].advice[].file`) and every folder-relative `path` evidence reference resolves to an existing file inside the work-unit folder.

#### Scenario: fast_path implies trivial
- **WHEN** a write sets `fast_path` to true while `grading` is `full`
- **THEN** validation SHALL reject the write

#### Scenario: blocked_at outside the escalation flow
- **WHEN** a write leaves `blocked_at` non-null although no `advisor_consults` entry is `open` or `escalated`
- **THEN** validation SHALL reject the write

#### Scenario: Single writer
- **WHEN** a change to `state.json` or `log.ndjson` is detected that did not originate from an orchestrator write
- **THEN** it SHALL be treated as a violation, and the orchestrator SHALL restore consistency by appending a log line and rewriting `state.json` from its last validated state

#### Scenario: Dangling pointer
- **WHEN** a write would add a `reviews[].file` pointer to a file that does not exist in the work-unit folder
- **THEN** validation SHALL reject the write

#### Scenario: Terminal pairing
- **WHEN** `outcome` is `shipped`
- **THEN** `current_node` SHALL be `ship`

### Requirement: Normative example document
This spec SHALL carry one complete normative example of a work-unit folder; the example is placed here rather than in `design.md` because only spec content is synced to the long-term specs at archive time. It shows a `full` work unit mid-flight: ticket `T-2` failed Review twice, the Advisor was consulted once, and Build is retrying with the advice. The folder is:

```
2026-09-30-wor-33-example/
├── state.json
├── log.ndjson
├── research-explore/
│   └── findings.md
├── human-gate-grading/
│   └── decision-1.md
├── spec/
│   ├── spec.md
│   └── review-1.md
├── human-gate-spec/
│   └── decision-1.md
├── ticket/
│   └── tickets.md
├── build/
│   ├── T-2-run-2.txt
│   └── advice-1.md
└── review/
    ├── review-1.md
    ├── review-2.md
    └── review-3.md
```

The `state.json` of the example is:

```json
{
  "schema_version": "1.0.0",
  "id": "2026-09-30-wor-33-example",
  "created_at": "2026-09-30T09:00:00Z",
  "updated_at": "2026-09-30T11:20:00Z",
  "trigger": {
    "source": "issue",
    "request": "WOR-33: add a schema for state.json"
  },
  "current_node": "build",
  "grading": "full",
  "fast_path": false,
  "blocked_at": "build",
  "spec_ref": {
    "kind": "openspec-change",
    "ref": "wor-33-example-change"
  },
  "current_ticket": "T-2",
  "refs": {
    "issue": "WOR-33",
    "pr": null
  },
  "ci_status": null,
  "tickets": [
    {
      "id": "T-1",
      "title": "Parse schema",
      "description": "Load state.json and validate its top-level fields.",
      "status": "passed",
      "verification_command": "npm test -- parse-schema",
      "evidence_refs": [
        {
          "kind": "log",
          "ref": "L-0010"
        },
        {
          "kind": "command",
          "ref": "npm test -- parse-schema (output in review/review-1.md)"
        }
      ]
    },
    {
      "id": "T-2",
      "title": "Validate invariants",
      "description": "Reject writes that violate the consistency invariants.",
      "status": "in-progress",
      "verification_command": "npm test -- invariants",
      "evidence_refs": [
        {
          "kind": "log",
          "ref": "L-0012"
        },
        {
          "kind": "path",
          "ref": "build/T-2-run-2.txt"
        }
      ]
    },
    {
      "id": "T-3",
      "title": "Archive on terminal",
      "description": "Freeze and archive the work-unit folder at Ship or End.",
      "status": "pending",
      "verification_command": "npm test -- archive",
      "evidence_refs": []
    }
  ],
  "fail_counters": {
    "ticket:T-1": 0,
    "ticket:T-2": 2
  },
  "advisor_consults": [
    {
      "problem_key": "ticket:T-2#1",
      "blocked_node": "build",
      "count": 1,
      "advice": [
        {
          "file": "build/advice-1.md",
          "date": "2026-09-30T11:10:00Z",
          "log_ref": "L-0015"
        }
      ],
      "status": "open"
    }
  ],
  "reviews": [
    {
      "id": "R-1",
      "node": "spec",
      "target": {
        "type": "stage",
        "id": "spec"
      },
      "verdict": "pass",
      "dimensions": [
        {
          "name": "correctness",
          "result": "pass"
        },
        {
          "name": "constraints",
          "result": "pass"
        }
      ],
      "evidence_refs": [
        {
          "kind": "log",
          "ref": "L-0007"
        }
      ],
      "file": "spec/review-1.md",
      "date": "2026-09-30T09:38:00Z"
    },
    {
      "id": "R-2",
      "node": "review",
      "target": {
        "type": "ticket",
        "id": "T-1"
      },
      "verdict": "pass",
      "dimensions": [
        {
          "name": "correctness",
          "result": "pass"
        },
        {
          "name": "constraints",
          "result": "pass"
        }
      ],
      "evidence_refs": [
        {
          "kind": "log",
          "ref": "L-0010"
        }
      ],
      "file": "review/review-1.md",
      "date": "2026-09-30T10:20:00Z"
    },
    {
      "id": "R-3",
      "node": "review",
      "target": {
        "type": "ticket",
        "id": "T-2"
      },
      "verdict": "fail",
      "dimensions": [
        {
          "name": "correctness",
          "result": "fail"
        },
        {
          "name": "constraints",
          "result": "pass"
        }
      ],
      "evidence_refs": [
        {
          "kind": "log",
          "ref": "L-0012"
        }
      ],
      "file": "review/review-2.md",
      "date": "2026-09-30T10:45:00Z"
    },
    {
      "id": "R-4",
      "node": "review",
      "target": {
        "type": "ticket",
        "id": "T-2"
      },
      "verdict": "fail",
      "dimensions": [
        {
          "name": "correctness",
          "result": "fail"
        },
        {
          "name": "constraints",
          "result": "pass"
        }
      ],
      "evidence_refs": [
        {
          "kind": "path",
          "ref": "build/T-2-run-2.txt"
        }
      ],
      "file": "review/review-3.md",
      "date": "2026-09-30T11:05:00Z"
    }
  ],
  "human_decisions": [
    {
      "id": "H-1",
      "gate": "grading",
      "node": "human-gate-grading",
      "decision": "approved",
      "grading": "full",
      "file": "human-gate-grading/decision-1.md",
      "date": "2026-09-30T09:15:00Z"
    },
    {
      "id": "H-2",
      "gate": "spec",
      "node": "human-gate-spec",
      "decision": "approved",
      "grading": null,
      "file": "human-gate-spec/decision-1.md",
      "date": "2026-09-30T09:40:00Z"
    }
  ],
  "outcome": null,
  "outcome_reason": null
}
```

The `log.ndjson` of the example is shown as an excerpt (the first two and last five of its sixteen lines; one JSON object per line):

```ndjson
{"id": "L-0001", "timestamp": "2026-09-30T09:00:00Z", "source": "orchestrator", "actor": null, "node": "trigger", "event_type": "create", "description": "Created work-unit folder from issue WOR-33.", "source_ref": null}
{"id": "L-0002", "timestamp": "2026-09-30T09:01:00Z", "source": "orchestrator", "actor": null, "node": "trigger", "event_type": "route", "description": "Routed trigger to research-explore.", "source_ref": null}
{"id": "L-0012", "timestamp": "2026-09-30T10:45:00Z", "source": "actor-report", "actor": "reviewer", "node": "review", "event_type": "verdict", "description": "Review R-3 fail for T-2; counter ticket:T-2 is 1; routed to build.", "source_ref": "review/review-2.md"}
{"id": "L-0013", "timestamp": "2026-09-30T11:05:00Z", "source": "actor-report", "actor": "reviewer", "node": "review", "event_type": "verdict", "description": "Review R-4 fail for T-2, same error; counter ticket:T-2 is 2.", "source_ref": "review/review-3.md"}
{"id": "L-0014", "timestamp": "2026-09-30T11:06:00Z", "source": "orchestrator", "actor": null, "node": "review", "event_type": "route", "description": "Recorded blocked_at build; routed review to advisor.", "source_ref": null}
{"id": "L-0015", "timestamp": "2026-09-30T11:10:00Z", "source": "actor-report", "actor": "advisor", "node": "advisor", "event_type": "advisor-consultation", "description": "Advisor consultation 1 for ticket:T-2#1 recorded.", "source_ref": "build/advice-1.md"}
{"id": "L-0016", "timestamp": "2026-09-30T11:20:00Z", "source": "orchestrator", "actor": null, "node": "advisor", "event_type": "route", "description": "Routed advisor to blocked_at node build with advice.", "source_ref": null}
```

#### Scenario: Example satisfies the schema
- **WHEN** the example folder is validated against this spec
- **THEN** every `state.json` field SHALL match its defined type and allowed values, every consistency invariant SHALL hold (including that every file pointer resolves to a file in the tree above), with `blocked_at` `build` justified by the open entry `ticket:T-2#1`
