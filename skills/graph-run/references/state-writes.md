# Writing state and the log

Load this before the first write of a run and whenever a draft is rejected. The orchestrator is the only writer of `state.json` and `log.ndjson`, and writes them only through `work-unit.mjs`. Hand-editing either file is forbidden.

## The write procedure

1. Read the unit's current `state.json` and the last lines of `log.ndjson`.
2. Make a draft copy of the whole state in a temp directory outside the unit folder (for example under `mktemp -d`), and edit only the fields this event changes. Do not add graph-declared fields by hand: the gate materializes each declared field with its default at the moment its applicability becomes true (phase approval for phase-bound fields, first dispatch of the owning node for node-bound ones). A field outside its applicability is invalid.
3. Draft the new log line(s) in a second temp file (one object or an array).
4. Run:
   `node "$CLAUDE_PLUGIN_ROOT/scripts/work-unit.mjs" write --graph "$GRAPH" --unit "$UNITS/<id>" --state <draft-state.json> --log <lines.json>`
5. Branch on the JSON: `ok: true` means applied atomically. `error: "state"` (exit 3) lists `violations` (`rule`, `message`): fix the draft, never the files, and retry; nothing was written. `not_found` (5), `write_failed` (4), or anything else: treat as a script failure and engage the escalation chain.
6. Every write needs at least one new log line, and every state change must be accompanied by one. `updated_at` must equal the newest log line's timestamp.

Other subcommands: `create` (run start), `validate --graph --unit` (clock-in, after resume), `archive --graph --unit` (terminal step 4 only; it requires `outcome` set, the archive log line last, and `handoff.md` at the folder root).

## Log lines

One JSON object each, with exactly these keys:

```json
{"id": "L-0007", "timestamp": "2026-10-06T11:05:00Z", "source": "actor-report", "actor": "reviewer",
 "node": "build", "event_type": "verdict", "description": "R-3 fail; counter ticket:T-2 is 2.",
 "source_ref": "build/review-2.md"}
```

- `id`: `L-` plus a zero-padded sequence, strictly increasing from the previous line. `timestamp`: ISO-8601 UTC without fractional seconds (`2026-10-06T11:05:00Z`), never earlier than the previous line.
- `node`: a node id declared by the graph, the node the event is about.
- `event_type` fixes `source`:

| event_type | source | actor | source_ref |
| -- | -- | -- | -- |
| `create` | orchestrator | null | null (written by `create`) |
| `dispatch` | orchestrator | null | null |
| `route` | orchestrator | null | null |
| `archive` | orchestrator | null | null |
| `report` | actor-report | `worker` | the worker's `report-<n>.md` |
| `verdict` | actor-report | `reviewer` | the `review-<n>.md` |
| `advisor-consultation` | actor-report | `advisor` | the `advice-<n>.md` |
| `human-decision` | human-answer | null | the `decision-<n>.md` |

`source_ref` is a folder-relative path to a file that exists (`<stage>/<file>` or `handoff.md`), never absolute, never containing `..`. Write the file before the log line that cites it. Orchestrator lines carry `source_ref: null` and cite step records in their description.

## State: core fields the orchestrator edits

The core contract is present for every unit. Edit only what each event requires.

- `current_node`, `walked_path`: on every route or override set `current_node` and append the new node id to `walked_path` (append-only; revisits append again). Arrival at the first node: `walked_path` becomes `["<entry>", "<first node>"]`.
- `phase`: null until the phase approval; set once, never changed. The same write adds the approval's `human_decisions` entry carrying `phase`.
- `blocked_at`: the current node while a problem is open; null otherwise.
- `fail_counters`: `{"<scope>": {"signature": "...", "count": 2, "total": 3}}`; remove keys to reset (see `escalation.md`). Scopes are `node:<id>`, `edge:<from>-<to>`, or a graph-declared `<kind>:<id>` that exists in state.
- `advisor_consults`: problem records, append-only history:
  ```json
  {"problem_key": "ticket:T-2#1", "scope": "ticket:T-2", "signature": "dims:correctness|cmd:npm test",
   "opened_by": "signature", "blocked_node": "build", "inherited": 0, "supersedes": null, "count": 1,
   "advice": [{"file": "build/advice-1.md", "date": "2026-10-06T11:10:00Z", "log_ref": "L-0015"}],
   "status": "open"}
  ```
  `opened_by` in `signature | total | edge-revisit | blocked`; `status` in `open | escalated | resolved | abandoned | superseded`. `log_ref` names a log line that exists in the same write.
- `reviews` (append-only):
  ```json
  {"id": "R-3", "node": "build", "target": {"type": "ticket", "id": "T-2"}, "verdict": "fail",
   "dimensions": [{"name": "correctness", "result": "fail"}],
   "evidence_refs": [{"kind": "path", "ref": "build/review-2.md"}, {"kind": "command", "ref": "npm test exit 1"}],
   "file": "build/review-2.md", "date": "2026-10-06T11:05:00Z"}
  ```
  `target` is `{"type": "stage", "id": "<node>"}` or a declared scope kind (`ticket`). `verdict` is `pass` or `fail`; a pass has no failing dimension. At least one evidence reference is required; kinds are `path` (folder-relative, resolves to an existing file, or `repo:`-prefixed for an external path), `command`, `log` (an existing log line id).
- `human_decisions` (append-only):
  ```json
  {"id": "H-1", "kind": "approval", "node": "research", "decision": "approved", "phase": "feat",
   "target": null, "file": "research/decision-1.md", "date": "2026-10-06T09:15:00Z"}
  ```
  approval decisions: `approved | send-back | not-needed`; escalation decisions: `retry | move-back | end`. `phase` only on an approved approval at the shared first node. `move-back` and send-back to a named node need `target`, a declared node id.
- `outcome` / `outcome_reason`: set only in the write that arrives at a terminal: `shipped` at the success terminal, `ended` (with a non-empty reason) at abandonment. Outcome is non-null if and only if the current node is a terminal.
- Immutable: `id`, `created_at`, `trigger`, `schema_version`. The gate rejects changing the phase once recorded, recording `maintenance` on a non-`maintenance-due` unit, and any phase other than `maintenance` on a `maintenance-due` unit.

## Graph-declared fields (the reference graph as example)

The graph's `state_fields` declare everything beyond the core, each bound to an owning node or to phases. The orchestrator transcribes routing data from actor reports into them and never invents them. In the reference graph:

- `contract_ref` (`{kind, ref}`, phases `feat`/`fix`): set when the contract-producing node (spec, or research for a fix) passes review.
- `tickets` (per ticket only routing data: `id`, `status`, `verification_command`, `evidence_refs`), `pending_tickets`, `current_ticket` (all owned by the decomposition node): set when decomposition passes review, from the routing entries the worker handed over; descriptive ticket text stays in the decomposition stage files. Ticket status vocabulary: `pending | in-progress | passed | failed | blocked`: `in-progress` when selected, `passed` when its build passes review (that is recorded progress), `failed` on a failing verdict, `blocked` while a problem on `ticket:<id>` is open.
- A ticket's `verification_command` is a run-time invocation and must be covered by a mounted command family of the node the field's `executes` names; the gate rejects an uncovered one with `command-not-mounted`.

A unit whose approved path excludes the owning node carries none of these fields; the gate rejects them if present.

## Typical writes

| Event | State changes | Log lines |
| -- | -- | -- |
| Route from entry to the first node | `current_node`, `walked_path` | `route` |
| Worker dispatched | node-bound fields materialize on first dispatch | `dispatch` |
| Worker report recorded | none (or counters on a blocked path) | `report` |
| Verdict recorded | `reviews` append; failing in-node: counter +1 | `verdict` |
| Approval answered | `human_decisions` append; phase at the first node; any send-back move | `human-decision` (+ `route` for a move) |
| Route on a released outcome | `current_node`, `walked_path`, edge counter if returning, transcribed fields | `route` |
| Problem opened / superseded | `advisor_consults`, `blocked_at` | `route` |
| Advisor consulted | problem `advice` + `count` | `advisor-consultation` |
| Ruling recorded | `human_decisions`, problem status, resets, `blocked_at: null` | `human-decision` |
| Terminal arrival | `current_node`, `walked_path`, `outcome`, `outcome_reason` | `route`, `archive` |

Several of these may share one write when the spec says "in the same write" (a failing verdict and its counter; a pass and its resets; a route and its edge counter). Combine them: one `write`, several log lines in the array.

## Stage directory files the orchestrator writes

- `decision-<n>.md` (human decisions), in the stage directory where the decision happened.
- `steps-<n>.md` (records of deterministic steps it executed), in the acting node's stage directory.
- `handoff.md` at the folder root: on success copied verbatim from the close-out stage's reviewed `handoff.md` by the terminal's copy step; at abandonment written by the orchestrator directly before archival.

Everything else in a stage directory (`report-<n>.md`, `review-<n>.md`, `advice-<n>.md`, `delta-<n>.md`, `worktree.md`, deliverables) is written by the actor that produced it. After the archive line the folder is frozen: no further writes by anyone.
