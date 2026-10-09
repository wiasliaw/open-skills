# Writing state and the log

Load this before the first write of a run and whenever a draft is rejected. The orchestrator is the only writer of `state.json` and `log.ndjson`, and writes them only through `work-unit.mjs`. Hand-editing either file is forbidden.

## The write procedure

1. Read the unit's current `state.json` and the last lines of `log.ndjson`.
2. Make a draft copy of the whole state in a temp directory outside the unit folder (for example under `mktemp -d`), and edit only the fields this event changes. Do not add graph-declared fields by hand: the gate materializes each declared field with its catalog default in the write that makes it applicable (a route into a node whose pipeline references a producing task, and the phase field when the phase-approval task records it); the write's JSON lists them in `materialized`. A field outside its applicability is invalid (`field-inapplicable`).
3. Draft the new log line(s) in a second temp file (one object or an array).
4. Run:
   `node "$CLAUDE_PLUGIN_ROOT/scripts/work-unit.mjs" write --graph "$GRAPH" --unit "$UNITS/<id>" --state <draft-state.json> --log <lines.json>`
   `--types` (the project catalog, default `.harness/types.json`) and `--plugin-types` (default: the catalog shipped with the plugin) are accepted by every subcommand that takes `--graph`; omit both. The two catalogs are merged in memory; no schema or registry file is stored.
5. Branch on the JSON: `ok: true` means applied atomically. `error: "state"` (exit 3) lists `violations` (`rule`, `message`): fix the draft, never the files, and retry; nothing was written. `not_found` (5), `write_failed` (4), `graph` (8, the definition or a catalog cannot back a unit), or anything else: treat as a script failure and engage the escalation chain.
6. Every write needs at least one new log line, and every state change must be accompanied by one. `updated_at` must equal the newest log line's timestamp.

Other subcommands: `create` (run start), `validate --graph --unit` (clock-in, after resume), `archive --graph --unit [--to]` (terminal procedure only; it requires `outcome` set, the archive log line last, and `handoff.md` at the folder root), and the red-check pair `land-tests` and `expect-red` (below), which only the `red-check` task's `run` lines call.

## Log lines

One JSON object each, with exactly these keys:

```json
{"id": "L-0007", "timestamp": "2026-10-06T11:05:00Z", "source": "actor-report", "actor": "reviewer",
 "node": "build", "event_type": "verdict", "description": "R-3 fail; counter build.verify-build:T-2 is 2.",
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
| `step` | orchestrator | null | null |
| `archive` | orchestrator | null | null |
| `report` | actor-report | `worker` | the worker's `report-<n>.md` |
| `verdict` | actor-report | `reviewer` | the `review-<n>.md` |
| `advisor-consultation` | actor-report | `advisor` | the `advice-<n>.md` |
| `human-decision` | human-answer | null | the `decision-<n>.md` |

`source_ref` is a folder-relative path to a file that exists (`<stage>/<file>` or `handoff.md`), never absolute, never containing `..`. Write the file before the log line that cites it. Orchestrator lines carry `source_ref: null`.

A `dispatch` line marks an entry starting (the write that sets `current_task`), for actors and for entries the orchestrator runs itself. A `step` line records one command the orchestrator executed — a script task's `run` line (provisioning, red check, commit, delivery, terminal lines) or an orchestrator-run validator check (test-integrity diffs, ticket and suite runs). Its `description` carries the command, the exit status, and a truncated output tail (reference: last ~20 lines), for example `"npm test exit 1 | tail: 1 failing: responds on /health"`. These lines replace step files and red/green output dumps; evidence references cite them with `kind: "log"`.

### Transcribing the red-check commands

`land-tests` and `expect-red` print one JSON object each. Transcribe it into the `step` line for that run line; the line's exit status is the script's own, and `exit_status` inside `expect-red`'s JSON is the ticket command's.

| Run line | Success | Failure |
| -- | -- | -- |
| `land-tests --graph .. --unit .. --worktree .. --ticket ..` | `{ok: true, action: "tests-landed", ticket, source, files}` | `state` (3: the unit holds no such ticket, or a symlink or special file in the test tree), `write_failed` (4), `not_found` (5: no declared test files) |
| `expect-red --graph .. --unit .. --worktree .. --ticket ..` | `{ok: true, action: "red-observed", ticket, command, exit_status, signal, output_tail}` | `already_green` (11) and `not_runnable` (12), whose bodies carry the same fields besides `error` and `message`; `state` (3), `graph` (8), `not_found` (5) |

Examples: `"land-tests T-1 exit 0 | files: test/a.test.js"`; `"expect-red exit 1 | ticket command 'npm test -- t-1' exit_status 1 | tail: 1 failing"`; `"expect-red exit 11 (already_green) | ticket command 'npm test -- t-1' exit_status 0 | tail: 3 passing"`. Put `files` from `land-tests` and the red commit's id in the step descriptions: the test-integrity check needs both later. The `expect-red` line maps only exit 11 to `ticket-invalid`; any other non-zero status on any line is `failed`.

## State: core fields the orchestrator edits

The core contract is present for every unit. Edit only what each event requires.

- `schema_version`: `"2.0.0"`, immutable.
- `current_node`, `walked_path`: on every route or override set `current_node` and append the new node id to `walked_path` (append-only; revisits append again). Arrival at the first node: `walked_path` becomes `["<entry>", "<first node>"]`.
- `current_task`: the pipeline position, null or a task of `current_node`'s pipeline (`task-invalid` otherwise). A route write sets it to the target's first entry; the write carrying an entry's `dispatch` line sets it to that entry; a selection step sets it to null; the terminal arrival sets it to the terminal's final entry. Recording a result never moves it.
- `phase`: null until the phase approval; set once with `approve-phase` in flight, never changed. The same write adds the approval's `human_decisions` entry carrying `phase`. Values come only from the instantiated `phase` type.
- `blocked_at`: the current node while a problem is open; null otherwise.
- `fail_counters`: `{"<scope>": {"signature": "...", "count": 2, "total": 3}}`; remove keys to reset (see `escalation.md`). Scopes are `<node>.<task>`, `<node>.<task>:<item-id>` (the task reads a `re_entry` progress field and the id names a record of its items field), or `edge:<from>-<to>`; anything else is `scope-invalid`.
- `advisor_consults`: problem records, append-only history:
  ```json
  {"problem_key": "build.verify-build:T-2#1", "scope": "build.verify-build:T-2", "signature": "dims:correctness|cmd:npm test",
   "opened_by": "signature", "blocked_node": "build", "inherited": 0, "supersedes": null, "count": 1,
   "advice": [{"file": "build/advice-1.md", "date": "2026-10-06T11:10:00Z", "log_ref": "L-0015"}],
   "status": "open"}
  ```
  `opened_by` in `signature | total | edge-revisit | blocked`; `status` in `open | escalated | resolved | abandoned | superseded`. `log_ref` names a log line that exists in the same write.
- `reviews` (append-only), one per recorded verdict of either runner:
  ```json
  {"id": "R-3", "node": "build", "scope": "build.verify-build:T-2", "verdict": "fail",
   "dimensions": [{"name": "correctness", "result": "fail"}],
   "evidence_refs": [{"kind": "path", "ref": "build/verify-2.md"}, {"kind": "log", "ref": "L-0014"}],
   "file": "build/verify-2.md", "date": "2026-10-06T11:05:00Z"}
  ```
  `scope` is `<node>.<task>` or `<node>.<task>:<item-id>` of the validator entry (an `edge:` scope is a counter's, never a review's). `file` is the reviewer's `review-<n>.md`, or the `verify-<n>.md` the orchestrator wrote for an orchestrator-run verdict. `verdict` is `pass` or `fail`; a pass has no failing dimension. At least one evidence reference is required; kinds are `path` (folder-relative, resolves to an existing file, or `repo:`-prefixed for an external path), `command`, `log` (an existing log line id).
- `human_decisions` (append-only):
  ```json
  {"id": "H-1", "kind": "approval", "node": "research", "decision": "approved", "phase": "feat",
   "target": null, "file": "research/decision-1.md", "date": "2026-10-06T09:15:00Z"}
  ```
  approval decisions: `approved | send-back | not-needed`; escalation decisions: `retry | move-back | end`. `phase` only on an approved approval at the shared first node. `target` is the declared node id a `move-back` moves to (required there); a send-back is a `goto` and carries no target.
- `outcome` / `outcome_reason`: set only in the write that arrives at a terminal: `shipped` at the success terminal, `ended` (with a non-empty reason) at abandonment. Outcome is non-null if and only if the current node is a terminal.
- Immutable: `id`, `created_at`, `trigger`, `schema_version` (`identity-changed`). The gate rejects changing the phase once recorded (`phase-immutable`), recording `maintenance` on a non-`maintenance-due` unit and any phase other than `maintenance` on a `maintenance-due` unit (`maintenance-binding`).

## Graph-declared fields (the library as example)

Everything beyond the core is declared by the tasks: a field exists because some task lists `produces: ["state:<field>"]`, and its type comes from the merged catalogs by that field name. Its applicability follows the nodes whose pipelines reference the producing task: it exists from the first route into such a node, and nowhere else. You transcribe routing data from actor reports into these fields and never invent them. In the library:

- `contract_ref` (`{kind, ref}`, null by default): produced by `author-contract` (feat) and by `approve-phase` (a fix approval records the existing contract the proposal names). Materialized when the first node is reached.
- `tickets` (per ticket only routing data: `id`, `status`, `verification_command`, `evidence_refs`), `pending_tickets`, `current_ticket`: produced by `decompose-tickets`; set when it reports, from the routing entries the worker handed over; descriptive ticket text stays in the decomposition stage files. Materialized when the `ticket` node is first reached. Ticket status vocabulary: `pending | in-progress | passed | failed | blocked`: `in-progress` when selected, `passed` in the write that records its passing verification (recorded progress), `failed` on a failing verdict, `blocked` while a problem on its scope is open. A pass after earlier failures flips `failed` to `passed` in the same write — a unit must never leave build with a shipped change and a stale `failed` status, and the review node is not entered while any ticket is not `passed`.

A unit whose route never reaches a node referencing a producing task carries none of that task's fields; the gate rejects them if present.

**Write authorization (`write-unauthorized`).** A changed graph-declared field, or `phase`, must be listed in `produces` by the task in flight: the stored `current_task` before the write. So a task's produced data is written while that task is still the position (the report write; the approval write for `approve-phase`), before any `on` action moves it. The one exemption is re-entry bookkeeping, performed without a producing task: (a) the selection step (the progress field takes an element of the list field, which loses exactly that element — the first one under `declared` order) and (b) updates of existing `items_field` records (nothing added, removed, or reordered; `id` and command-typed fields unchanged — the ticket status flips). A write that adds, removes, or reorders ticket records, or edits a `verification_command`, needs `decompose-tickets` in flight.

**Command coverage.** A `command`-typed value read by a state-sourced equipment entry must fall within the family a task mounts for it: `{source: "state:tickets.verification_command", family: <base>}` on `red-check`, `implement-ticket`, and `verify-build`. The gate checks every ticket's `verification_command` against the family's tokens and rejects an uncovered one with `command-not-mounted`.

## Typical writes

| Event | State changes | Log lines |
| -- | -- | -- |
| Route to a node (including entry to the first node) | `current_node`, `walked_path`, `current_task` = target's first entry, edge counter if returning; the node's declared fields materialize | `route` |
| Entry started | `current_task` | `dispatch` |
| Worker report recorded | produced `state:` fields; none else (counters and a problem on a blocked path) | `report` |
| Script task executed | none on `ok`; on failure the problem and `blocked_at` | `step` (one per executed line) |
| Reviewer verdict | `reviews` append; fail: counter +1 (problem at the cap), ticket `failed`; pass: counters of the scope removed, problem resolved, ticket `passed`, `edge:*` removed | `verdict` |
| Orchestrator-run verdict | the same, after `verify-<n>.md` is written | `step` (one per check) |
| Human task answered | `human_decisions` append; at `approve-phase`, `phase` (and `contract_ref` for fix) | `human-decision` |
| Selection (re-entry) | `list_field`, `progress_field`, item status, `edge:*` removed, `current_task` null | `route` |
| Route on a surfaced outcome | `current_node`, `walked_path`, `current_task`, edge counter if returning | `route` |
| Problem opened / superseded | `advisor_consults`, `blocked_at`, ticket `blocked` | `route` |
| Advisor consulted | problem `advice` + `count` | `advisor-consultation` |
| Ruling recorded | `human_decisions`, problem status, resets, `blocked_at: null` | `human-decision` |
| Terminal arrival | `current_node`, `walked_path`, `current_task`, `outcome`, `outcome_reason` | `route`, `archive` |

Several of these may share one write when the spec says "in the same write" (a failing verdict and its counter; a pass and its resets and the ticket flip; a route and its edge counter; a failed script task's `step` lines and its problem). Combine them: one `write`, several log lines in the array. Apply an `on` action only after its result is recorded.

## Stage directory files the orchestrator writes

- `decision-<n>.md` (human decisions), in the stage directory where the decision happened.
- `report-<n>.md`: the worker's returned report, transcribed verbatim (one provenance line on top). The same fallback applies to a reviewer or advisor report whose own write the harness blocked.
- `verify-<n>.md`: the verdict record of an orchestrator-run validator task (checks run, exit statuses, failing dimensions and command, pointing at the `step` lines).
- `handoff.md` at the folder root: on success copied verbatim from the close-out stage's reviewed `handoff.md` by the terminal's first run line; at abandonment written by the orchestrator directly before archival.

Command records are `step` log lines, never files. Everything else in a stage directory (`review-<n>.md`, `advice-<n>.md`, `delta-<n>.md`, `worktree.md`, deliverables, `tests/<ticket-id>/`) is written by the actor that produced it. After the archive line the folder is frozen (`frozen`): no further writes by anyone.
