## ADDED Requirements

### Requirement: Single state file
Graph execution SHALL keep its work-unit state in a single file `work-unit.json`. It SHALL replace markdown work-unit state for graph execution, and no markdown copy of the same state SHALL exist.

#### Scenario: Single source of truth
- **WHEN** a work unit runs under the graph
- **THEN** `work-unit.json` SHALL be the only record of its execution state

### Requirement: Orchestrator is the only writer
Only the orchestrator SHALL write `work-unit.json`, and every field in the schema SHALL have the orchestrator as its writer. The implementor, reviewer, and advisor SHALL read state and return their results in their reports, and MUST NOT write it. Humans MUST NOT write it either: a human's input at a gate or at Human Escalation SHALL reach state only as an orchestrator-recorded `human_decisions` entry and log event.

#### Scenario: Actor result recorded
- **WHEN** the implementor returns a report
- **THEN** the orchestrator SHALL transcribe the result into state and no actor SHALL have written the file

#### Scenario: Human answer recorded
- **WHEN** the human answers a gate question
- **THEN** the orchestrator SHALL append the `human_decisions` entry and log event, and the human SHALL NOT have edited the file

### Requirement: Document lifecycle
`work-unit.json` SHALL be created by the Trigger node, through the orchestrator, when new work arrives, and SHALL be archived at Ship or End. Immediately before archiving, the orchestrator SHALL set `outcome` (and `outcome_reason` for `ended`), set `current_node` to `ship` or `end`, and append a final `archive` log entry. After the archive step the document SHALL be frozen: no further writes, including no new log entries.

#### Scenario: Creation at Trigger
- **WHEN** Trigger receives new work
- **THEN** the orchestrator SHALL create `work-unit.json` with `current_node` set to `trigger`, every required field present, empty lists, empty `fail_counters`, `grading` null, `fast_path` false, `blocked_at` null, `spec_ref` null, `outcome` null, and a `create` log entry

#### Scenario: Archive at Ship
- **WHEN** execution reaches Ship and the deterministic delivery steps complete
- **THEN** the orchestrator SHALL set `outcome` to `shipped`, `current_node` to `ship`, append the `archive` entry, and archive the file, after which it SHALL NOT be written

#### Scenario: Archive at End
- **WHEN** execution reaches End through a no-op grading or a Human Escalation cancel
- **THEN** the orchestrator SHALL set `outcome` to `ended` with a non-empty `outcome_reason`, `current_node` to `end`, append the `archive` entry, and archive the file

### Requirement: Field definition conventions
Every field SHALL be defined by name, JSON type, allowed values, writer, and lifecycle. Timestamps SHALL be ISO-8601 UTC date-time strings (for example `2026-09-30T09:00:00Z`). Node ids SHALL be exactly the thirteen lowercase kebab-case identifiers `trigger`, `research-explore`, `human-gate-grading`, `spec`, `human-gate-spec`, `ticket`, `build`, `review`, `wrap`, `ship`, `end`, `advisor`, `human-escalation`, matching the suffixes of the `graph-node-*` specs. An evidence reference SHALL be an object `{ "kind": "path" | "command" | "log", "ref": string }` where `path` is a file path, `command` is a command line together with a pointer to its recorded output, and `log` is a `log[].id`. Unknown top-level fields SHALL be rejected by validation.

#### Scenario: Node id vocabulary
- **WHEN** any field holds a node id (`current_node`, `blocked_at`, `log[].node`, `reviews[].node`, `human_decisions[].node`, `advisor_consults[].blocked_node`)
- **THEN** its value SHALL be one of the thirteen node ids listed above

### Requirement: Identity and time fields
The document SHALL contain these fields, each written only by the orchestrator:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `schema_version` | string | semver `MAJOR.MINOR.PATCH`; initial value `1.0.0` | Set at creation; never changed for the life of the document |
| `id` | string | unique work-unit identifier matching `^[a-z0-9][a-z0-9-]*$` | Set at creation; never changed |
| `created_at` | string | ISO-8601 UTC | Set at creation; never changed |
| `updated_at` | string | ISO-8601 UTC, not earlier than `created_at` | Set at creation and on every write, equal to the timestamp of the newest log entry |
| `trigger` | object | `{ "source": "prompt" \| "issue" \| "ci-failure" \| "analysis-request", "request": string }` | Set at creation from the raw trigger payload; never changed |

#### Scenario: Timestamps advance with writes
- **WHEN** the orchestrator writes any change to state
- **THEN** it SHALL append a log entry and set `updated_at` to that entry's timestamp

### Requirement: Routing fields
The document SHALL contain these routing fields, each written only by the orchestrator:

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
The document SHALL contain these fields, each written only by the orchestrator:

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
| `id` | string | unique within the document, for example `T-1` | Set when Ticket writes the list; never changed |
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
`fail_counters` SHALL be an object mapping a scope key to a non-negative integer, written only by the orchestrator. A key SHALL be `ticket:<ticket-id>` for failing Review verdicts on a ticket (the Build and Review loop, feeding the Review "fail count of 2 or more" edge), or `node:<node-id>` with node id `research-explore`, `spec`, `ticket`, or `wrap` for failing verdicts of that node's in-node review loop (feeding the "second failure of the in-node review loop" edge). A key SHALL be created at value 1 on the first failure of its scope, and an absent key SHALL mean 0. The orchestrator SHALL increment a counter when it records a failing verdict for that scope, SHALL reset it to 0 when that scope passes or when a human decision of `unblocked` resolves the problem for that scope, and SHALL NOT reset it when the Advisor issues advice. A counter value of 2 or more SHALL select the edge to Advisor.

#### Scenario: Failing Review verdict
- **WHEN** the reviewer reports a failing verdict for ticket `T-2`
- **THEN** the orchestrator SHALL increment `fail_counters["ticket:T-2"]` in the same write that appends the review

#### Scenario: In-node loop failure
- **WHEN** the in-node review loop of Spec fails
- **THEN** the orchestrator SHALL increment `fail_counters["node:spec"]`, and on the second failure SHALL record `blocked_at` as `spec` and route to Advisor

#### Scenario: Advice does not reset the counter
- **WHEN** the Advisor issues advice for a problem on `ticket:T-2` whose counter is 2
- **THEN** the counter SHALL remain 2 until the ticket passes or a human unblocks it

### Requirement: Advisor consultation schema
`advisor_consults` SHALL be a list with one entry per problem, written only by the orchestrator. Each entry SHALL have:

| Field | Type | Allowed values | Lifecycle |
|---|---|---|---|
| `problem_key` | string | `<scope-key>#<n>` where scope key is a `fail_counters` key and `n` is the 1-based ordinal of the problem on that scope, for example `ticket:T-2#1` | Set when the entry is created; never changed |
| `blocked_node` | string | the node id recorded in `blocked_at` for this problem | Set at creation |
| `count` | integer | 0, 1, or 2; always equal to the length of `advice` | Created at 0 when the orchestrator first routes the problem to Advisor; incremented on each consultation |
| `advice` | list | each item `{ "summary": string, "date": ISO-8601, "log_ref": string }` where `log_ref` is the id of the advisor-consultation log entry | Appended on each consultation |
| `status` | string | `open`, `escalated`, `resolved`, `abandoned` | `open` at creation; `escalated` when routed to Human Escalation and the human answers `unblocked`; `resolved` when the retried node passes; `abandoned` when the human answers `cancel` |

The orchestrator SHALL create a new entry (with the next ordinal) when a scope fails again after its previous entry became `resolved` or `escalated`. The Advisor SHALL NOT be consulted when the open entry's `count` is already 2; the orchestrator SHALL route to Human Escalation instead.

#### Scenario: Consultation recorded
- **WHEN** the advisor returns guidance for a blocked Build
- **THEN** the orchestrator SHALL set `blocked_at` to `build`, increment `count` for that problem key and append the advice summary, and append an advisor-consultation log entry citing the advisor report

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
`reviews` SHALL be an append-only-by-convention list of verdict records written only by the orchestrator from the reviewer's report; entries MUST NOT be edited or removed. Each entry SHALL have:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | unique within the document, for example `R-1` |
| `node` | string | `research-explore`, `spec`, `ticket`, `review`, or `wrap` (the stage whose reviewer pass produced the verdict; the Build stage's reviewer pass is recorded as `review`) |
| `target` | object | `{ "type": "ticket" \| "stage", "id": string }` where a `ticket` id is in `tickets` and a `stage` id is a node id |
| `verdict` | string | `pass` or `fail` |
| `dimensions` | list | each item `{ "name": string, "result": "pass" \| "fail" }`; a `pass` verdict SHALL have no failing dimension |
| `evidence_refs` | list of evidence references | at least one |
| `date` | string | ISO-8601 UTC |

#### Scenario: Failing verdict
- **WHEN** the reviewer reports a failing verdict for a ticket
- **THEN** the orchestrator SHALL append a review with at least one evidence reference and increment that ticket's counter

#### Scenario: Review without evidence
- **WHEN** a review would be appended with an empty `evidence_refs`
- **THEN** validation SHALL reject the write

### Requirement: Human decision schema
`human_decisions` SHALL be a list of recorded human answers, written only by the orchestrator before it routes on the answer. Each entry SHALL have:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | unique within the document, for example `H-1` |
| `gate` | string | `grading`, `spec`, or `escalation` |
| `node` | string | `human-gate-grading` for `grading`, `human-gate-spec` for `spec`, `human-escalation` for `escalation` |
| `decision` | string | `approved` or `rejected` for `grading` and `spec`; `unblocked` or `cancel` for `escalation` |
| `grading` | string or null | the approved grading value (`full`, `small`, `trivial`, `no-op`) when `gate` is `grading` and `decision` is `approved`; null otherwise |
| `date` | string | ISO-8601 UTC |
| `note` | string or null | optional human feedback; required (non-empty) when `decision` is `rejected` or `cancel` |

#### Scenario: Grading approval recorded
- **WHEN** the human approves a grading of `small`
- **THEN** the orchestrator SHALL append a `human_decisions` entry with `gate` `grading`, `decision` `approved`, `grading` `small`, set top-level `grading` to `small`, and only then route

#### Scenario: Escalation unblocked
- **WHEN** the human answers `unblocked` at Human Escalation
- **THEN** the orchestrator SHALL record the decision, set the problem entry's `status` to `escalated`, reset the scope's fail counter to 0, and resume at the `blocked_at` node

### Requirement: Append-only execution log
`log` SHALL be an append-only list; entries MUST NOT be edited, reordered, or removed. Each entry SHALL have these fields:

| Field | Type | Allowed values |
|---|---|---|
| `id` | string | `L-<n>` with a zero-padded sequence number, strictly increasing |
| `timestamp` | string | ISO-8601 UTC, not earlier than the previous entry |
| `source` | string | `actor-report`, `human-answer`, or `orchestrator` |
| `actor` | string or null | `implementor`, `reviewer`, or `advisor` when `source` is `actor-report`; null otherwise |
| `node` | string | a node id |
| `event_type` | string | `create`, `dispatch`, `report`, `verdict`, `advisor-consultation`, `human-decision`, `route`, `archive` |
| `description` | string | non-empty event description |
| `source_ref` | string or null | identifier of the actor report or human answer the entry cites; required when `source` is `actor-report` or `human-answer`, null for orchestrator-originated events |

Event types SHALL map to sources as follows: `report`, `verdict`, and `advisor-consultation` come from an `actor-report`; `human-decision` comes from a `human-answer`; `create`, `dispatch`, `route`, and `archive` are `orchestrator` events.

#### Scenario: Route recorded
- **WHEN** the orchestrator routes from Build to Review
- **THEN** it SHALL append a `route` entry and leave earlier entries unchanged

#### Scenario: Log entry edited
- **WHEN** a write would modify or remove an existing log entry
- **THEN** validation SHALL reject the write

### Requirement: Outcome fields
The document SHALL contain `outcome` (null, `shipped`, or `ended`) and `outcome_reason` (string or null), written only by the orchestrator. Both SHALL be null at creation. At archive time `outcome` SHALL be `shipped` (with `outcome_reason` null) when execution reached Ship, or `ended` with a non-empty `outcome_reason` (for example "grading no-op: already exists" or "human cancelled at escalation") when execution reached End.

#### Scenario: Ended with reason
- **WHEN** a grading of `no-op` routes to End
- **THEN** the orchestrator SHALL set `outcome` to `ended` and `outcome_reason` to a non-empty reason

### Requirement: Counters and verdicts are updated by the orchestrator only
Fail counters SHALL be incremented by the orchestrator when it records a failing verdict, and reviews SHALL be added by the orchestrator from the reviewer's report. Each review SHALL carry at least one evidence reference.

#### Scenario: Failing verdict
- **WHEN** the reviewer reports a failing verdict for a ticket
- **THEN** the orchestrator SHALL append a review with evidence refs and increment that ticket's counter

### Requirement: State is readable by actors and consistent with the graph
Dispatches SHALL give actors read access to the state they need per their node spec, and the orchestrator SHALL keep `current_node`, `grading`, and `fast_path` consistent with the graph's routing.

#### Scenario: Actor reads state
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the dispatch SHALL make available the state fields that node's spec lists as inputs

### Requirement: Blocked and advisor state is maintained by the orchestrator
The orchestrator SHALL set `blocked_at` to the originating node id before routing to the Advisor, and SHALL clear it to null when the blocked problem is resolved. It SHALL update `advisor_consults` on each Advisor consultation (increment the count for the problem key and append the advice summary) and SHALL append an advisor-consultation entry to the append-only `log`.

#### Scenario: Blocked stage routed
- **WHEN** any stage reports blocked
- **THEN** the orchestrator SHALL set `blocked_at` to that stage, set the current ticket's `status` to `blocked` when the stage works on a ticket, create the problem entry if no open entry exists for the scope, and route to Advisor

### Requirement: Consistency invariants
The orchestrator SHALL validate every write against these invariants and MUST reject a write that violates any of them:

1. `fast_path` is true if and only if `grading` is `trivial`.
2. `blocked_at` is non-null if and only if `outcome` is null and at least one `advisor_consults` entry has `status` `open` or `escalated`; while `current_node` is `advisor` or `human-escalation`, `blocked_at` is non-null.
3. `log` is append-only: the previous `log` is a prefix of the new `log`, ids strictly increase, and every state change is accompanied by at least one new entry.
4. Every field is written only by the orchestrator, and `updated_at` equals the newest log timestamp.
5. `outcome` is non-null if and only if `current_node` is `ship` or `end`; `shipped` pairs with `ship`, `ended` pairs with `end`.
6. Each `advisor_consults[].count` equals the length of its `advice` and never exceeds 2.
7. `current_ticket` is null or an id in `tickets`; at most one ticket has `status` `in-progress` or `blocked`.
8. `spec_ref` is non-null whenever `current_node` is `ticket`, `build`, `review`, `wrap`, or `ship` and `grading` is `full` or `small`.
9. Every `fail_counters` key refers to an existing ticket id or to one of `research-explore`, `spec`, `ticket`, `wrap`.

#### Scenario: fast_path implies trivial
- **WHEN** a write sets `fast_path` to true while `grading` is `full`
- **THEN** validation SHALL reject the write

#### Scenario: blocked_at outside the escalation flow
- **WHEN** a write leaves `blocked_at` non-null although no `advisor_consults` entry is `open` or `escalated`
- **THEN** validation SHALL reject the write

#### Scenario: Single writer
- **WHEN** a change to `work-unit.json` is detected that did not originate from an orchestrator write
- **THEN** it SHALL be treated as a violation, and the orchestrator SHALL restore consistency by appending a log entry and rewriting from its last validated state

#### Scenario: Terminal pairing
- **WHEN** `outcome` is `shipped`
- **THEN** `current_node` SHALL be `ship`

### Requirement: Normative example document
This spec SHALL carry one complete normative example of `work-unit.json`; the example is placed here rather than in `design.md` because only spec content is synced to the long-term specs at archive time. It shows a `full` work unit mid-flight: ticket `T-2` failed Review twice, the Advisor was consulted once, and Build is retrying with the advice.

```json
{
  "schema_version": "1.0.0",
  "id": "2026-09-30-wor-33-example",
  "created_at": "2026-09-30T09:00:00Z",
  "updated_at": "2026-09-30T11:20:00Z",
  "trigger": {
    "source": "issue",
    "request": "WOR-33: add a schema for work-unit.json"
  },
  "current_node": "build",
  "grading": "full",
  "fast_path": false,
  "blocked_at": "build",
  "spec_ref": { "kind": "openspec-change", "ref": "wor-33-example-change" },
  "current_ticket": "T-2",
  "refs": { "issue": "WOR-33", "pr": null },
  "ci_status": null,
  "tickets": [
    {
      "id": "T-1",
      "title": "Parse schema",
      "description": "Load work-unit.json and validate its top-level fields.",
      "status": "passed",
      "verification_command": "npm test -- parse-schema",
      "evidence_refs": [
        { "kind": "log", "ref": "L-0010" },
        { "kind": "command", "ref": "npm test -- parse-schema (output in review R-1)" }
      ]
    },
    {
      "id": "T-2",
      "title": "Validate invariants",
      "description": "Reject writes that violate the consistency invariants.",
      "status": "in-progress",
      "verification_command": "npm test -- invariants",
      "evidence_refs": [
        { "kind": "log", "ref": "L-0012" },
        { "kind": "path", "ref": ".project/evidence/T-2-run-2.txt" }
      ]
    },
    {
      "id": "T-3",
      "title": "Archive on terminal",
      "description": "Freeze and archive the document at Ship or End.",
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
          "summary": "Both failures come from checking invariant 2 before the log entry is appended; reorder the validation.",
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
      "node": "review",
      "target": { "type": "ticket", "id": "T-1" },
      "verdict": "pass",
      "dimensions": [
        { "name": "correctness", "result": "pass" },
        { "name": "constraints", "result": "pass" }
      ],
      "evidence_refs": [{ "kind": "log", "ref": "L-0010" }],
      "date": "2026-09-30T10:20:00Z"
    },
    {
      "id": "R-2",
      "node": "review",
      "target": { "type": "ticket", "id": "T-2" },
      "verdict": "fail",
      "dimensions": [
        { "name": "correctness", "result": "fail" },
        { "name": "constraints", "result": "pass" }
      ],
      "evidence_refs": [{ "kind": "log", "ref": "L-0012" }],
      "date": "2026-09-30T10:45:00Z"
    },
    {
      "id": "R-3",
      "node": "review",
      "target": { "type": "ticket", "id": "T-2" },
      "verdict": "fail",
      "dimensions": [
        { "name": "correctness", "result": "fail" },
        { "name": "constraints", "result": "pass" }
      ],
      "evidence_refs": [{ "kind": "path", "ref": ".project/evidence/T-2-run-2.txt" }],
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
      "date": "2026-09-30T09:15:00Z",
      "note": null
    },
    {
      "id": "H-2",
      "gate": "spec",
      "node": "human-gate-spec",
      "decision": "approved",
      "grading": null,
      "date": "2026-09-30T09:40:00Z",
      "note": "Looks complete."
    }
  ],
  "outcome": null,
  "outcome_reason": null,
  "log": [
    { "id": "L-0001", "timestamp": "2026-09-30T09:00:00Z", "source": "orchestrator", "actor": null, "node": "trigger", "event_type": "create", "description": "Created work-unit.json from issue WOR-33.", "source_ref": null },
    { "id": "L-0002", "timestamp": "2026-09-30T09:01:00Z", "source": "orchestrator", "actor": null, "node": "trigger", "event_type": "route", "description": "Routed trigger to research-explore.", "source_ref": null },
    { "id": "L-0003", "timestamp": "2026-09-30T09:12:00Z", "source": "actor-report", "actor": "implementor", "node": "research-explore", "event_type": "report", "description": "Research report received; proposes full grading.", "source_ref": "report:research-1" },
    { "id": "L-0004", "timestamp": "2026-09-30T09:13:00Z", "source": "orchestrator", "actor": null, "node": "research-explore", "event_type": "route", "description": "Routed research-explore to human-gate-grading.", "source_ref": null },
    { "id": "L-0005", "timestamp": "2026-09-30T09:15:00Z", "source": "human-answer", "actor": null, "node": "human-gate-grading", "event_type": "human-decision", "description": "Human approved grading full (H-1).", "source_ref": "answer:grading-1" },
    { "id": "L-0006", "timestamp": "2026-09-30T09:16:00Z", "source": "orchestrator", "actor": null, "node": "human-gate-grading", "event_type": "route", "description": "Routed human-gate-grading to spec.", "source_ref": null },
    { "id": "L-0007", "timestamp": "2026-09-30T09:38:00Z", "source": "orchestrator", "actor": null, "node": "spec", "event_type": "route", "description": "Spec review passed; spec_ref set; routed spec to human-gate-spec.", "source_ref": null },
    { "id": "L-0008", "timestamp": "2026-09-30T09:40:00Z", "source": "human-answer", "actor": null, "node": "human-gate-spec", "event_type": "human-decision", "description": "Human approved spec (H-2).", "source_ref": "answer:spec-1" },
    { "id": "L-0009", "timestamp": "2026-09-30T09:55:00Z", "source": "orchestrator", "actor": null, "node": "ticket", "event_type": "route", "description": "Tickets T-1..T-3 written; routed ticket to build for T-1.", "source_ref": null },
    { "id": "L-0010", "timestamp": "2026-09-30T10:20:00Z", "source": "actor-report", "actor": "reviewer", "node": "review", "event_type": "verdict", "description": "Review R-1 pass for T-1.", "source_ref": "report:review-1" },
    { "id": "L-0011", "timestamp": "2026-09-30T10:21:00Z", "source": "orchestrator", "actor": null, "node": "review", "event_type": "route", "description": "T-1 passed with tickets remaining; routed review to ticket, then to build for T-2.", "source_ref": null },
    { "id": "L-0012", "timestamp": "2026-09-30T10:45:00Z", "source": "actor-report", "actor": "reviewer", "node": "review", "event_type": "verdict", "description": "Review R-2 fail for T-2; counter ticket:T-2 is 1; routed to build.", "source_ref": "report:review-2" },
    { "id": "L-0013", "timestamp": "2026-09-30T11:05:00Z", "source": "actor-report", "actor": "reviewer", "node": "review", "event_type": "verdict", "description": "Review R-3 fail for T-2, same error; counter ticket:T-2 is 2.", "source_ref": "report:review-3" },
    { "id": "L-0014", "timestamp": "2026-09-30T11:06:00Z", "source": "orchestrator", "actor": null, "node": "review", "event_type": "route", "description": "Recorded blocked_at build; routed review to advisor.", "source_ref": null },
    { "id": "L-0015", "timestamp": "2026-09-30T11:10:00Z", "source": "actor-report", "actor": "advisor", "node": "advisor", "event_type": "advisor-consultation", "description": "Advisor consultation 1 for ticket:T-2#1 recorded.", "source_ref": "report:advisor-1" },
    { "id": "L-0016", "timestamp": "2026-09-30T11:20:00Z", "source": "orchestrator", "actor": null, "node": "advisor", "event_type": "route", "description": "Routed advisor to blocked_at node build with advice.", "source_ref": null }
  ]
}
```

#### Scenario: Example satisfies the schema
- **WHEN** the example document is validated against this spec
- **THEN** every field SHALL match its defined type and allowed values and every consistency invariant SHALL hold, with `blocked_at` `build` justified by the open entry `ticket:T-2#1`
