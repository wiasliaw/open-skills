# Constructing a dispatch

Load this before dispatching any actor. A dispatch is derived entirely from the node's declaration in the graph definition plus the unit's state; the agent definitions (`worker`, `reviewer`, `advisor`) contain nothing node-specific, so everything node-specific must be in the payload. Never put node-specific text anywhere else, and never rely on tool whitelists for enforcement: restrictions are contractual, written into the prompt and checked by the reviewer.

## Common payload fields

Build these from `graph.nodes[<id>]` and `state.json`:

| Field | Source |
| -- | -- |
| node id | `node.id` |
| stage instructions | `node.purpose`, `node.instructions`, `node.reads`, `node.produces` (a `state:<field>` entry means: the actor reports that data to the orchestrator in its report; it never writes state) |
| routable outcomes | `node.outcomes`; the worker reports exactly one of them, or `blocked` |
| mounts | `node.mounts.skills` (the actor may use only these), `node.mounts.commands`, `node.mounts.mcp` |
| restrictions | `node.restrictions`, or the replacement list from `graph.phase[<approved phase>].restriction_overrides[<node id>]` when the unit's phase declares one for this node (a replacement, not an addition) |
| verification commands | `node.verification.commands` in declared order (executable); `node.verification.criteria` is the scoring text. When verification is a plain string, it is the criteria and there are no executable commands |
| scoring dimensions | the dimensions named in the criteria (for example correctness, contract coverage, restriction compliance, clean state); pass the criteria text verbatim and ask the reviewer to name each dimension it scores |
| stage directory | `<unit folder>/<node id>/`, created by the orchestrator before the dispatch |
| worktree path | `<WORKTREES>/<id>` whenever the unit has a worktree; omit otherwise |
| memory | when `reads` includes `memory`: tell the actor to load the current-truth documents under `.harness/` whole and run `node "$CLAUDE_PLUGIN_ROOT/scripts/memory.mjs" index` for the index, pulling single entries on demand |
| retry context | on a retry: the failing review report path(s) and any `advice-<n>.md` for the open problem |

Substitute the run-time variables (`CLAUDE_PLUGIN_ROOT`, `WU_ID`, `WU_BRANCH`, `WU_FOLDER`, `WU_WORKTREE`, `WU_REMOTE`, `WU_COMMIT_MESSAGE`) in every command before putting it in a payload; actors get concrete commands, not placeholders. Any `{{slot}}` still present means the definition was never completed: stop as blocked (definition defect).

File numbering: `<n>` is one more than the highest existing `<prefix>-<k>.md` in that stage directory, so retries and revisits never overwrite earlier files.

## Worker dispatch

Send to the `worker` agent. Prompt layout:

```
Node: <node id>
Stage directory: <abs path>/<node id>/   (write your report to report-<n>.md here)
Worktree path: <abs path>                (only when the unit has one)
Purpose / instructions / reads / produces: <verbatim from the node>
Routable outcomes: <list>; report exactly one, or blocked with a stable reason code.
Mounted skills (use only these): <list>
Verification commands (run in declared order, cwd = worktree path when given): <list>
Restrictions (binding, checked by the reviewer): <list, verbatim>
Retry context: <review reports + advice paths, or "none">
```

Rules for the restrictions block:

- Always carry the node's list verbatim. They already forbid writing routing state (`state.json`, `log.ndjson`); if a node's list somehow omits that, add it.
- For a repository-writing node, add: perform no VCS operations, confine repository writes to the given worktree path, stage directory stays writable, report `blocked` when no usable path is given, never remove the worktree.
- Close-out exception: for the node that mounts the wrap skill, the prompt permits the long-term memory writes that node owns (merging pending delta entries into the ledger inside the worktree) and still forbids writing routing state and current-truth documents.
- Maintenance phase: the unit's phase-level `restriction_overrides` replace the node's list; do not merge them with the default.
- Non-close-out nodes always get "MUST NOT write long-term memory" semantics from the node list; a ledger or current-truth write outside close-out (and outside the maintenance override) is a restriction violation.

The worker writes its final report to `report-<n>.md` in the stage directory as well as returning it; the orchestrator needs the file as the log line's `source_ref`.

## Reviewer dispatch

Send to the `reviewer` agent after a worker report (or alone for a validator node). Carry:

- Node id, stage instructions, and acceptance criteria exactly as given to the worker.
- The worker's restrictions (the same effective list), so it can check compliance, and the worker's report path (a claim to check, not evidence).
- The verification commands in declared order and the scoring dimensions; the reviewer runs them itself, with the worktree path as cwd whenever the unit has one.
- The outcome the worker reported, so the reviewer verifies its basis (for an alternative outcome such as `ticket-invalid` or `spec-contradiction`, the justifying evidence).
- The stage directory and filename `review-<n>.md`. For a validator node: no worker report; the reviewer also names the review scope (the whole change against the approved contract) and reports `pass` or `fail` as the node's routable outcome.
- A reviewer MAY reject a draft delta by naming its id and the reason in its report; tell it so when the node reads or produces drafts.

Ask the reviewer to name, at the end of its report, the failing dimensions and the failing verification command (if any) in a stable form, because the orchestrator derives the failure signature from them (see `escalation.md`).

## Advisor dispatch

Send to the `advisor` agent only from the escalation chain. Carry: the problem (key, scope, signature, blocked node), the failure history (review reports, worker reports, counters, any earlier `advice-<n>.md` on the same problem, which did not resolve it), the node's dispatch reference (instructions, restrictions, verification commands, worktree path), and the stage directory plus `advice-<n>.md` filename. The advisor analyses only; its single write is the advice file.

## Dispatch for a ticketed unit

When the graph declares a decomposition concept (the template's `tickets`, `current_ticket`), add to the build and review payloads the current ticket's routing entry (id, verification command) and the pointer to its full text in the decomposition stage directory. The ticket's `verification_command` is a run-time invocation: it is valid only when a mounted command family of the node named by the field's `executes` covers it (the write gate checks this; include it in the build worker's verification commands for that ticket).

## Orchestrator-run commands (not dispatches)

Pre-steps, post-steps, deterministic and tool nodes, and terminal steps are run by the orchestrator with the same variable substitution, one process per step, in declared order, with the step's stdout/stderr and exit status captured for the step record (`node-execution.md`).

- `WU_BRANCH` is `wu/<id>`, or `trigger.branch` for a fix unit that names one.
- `WU_WORKTREE` is `<WORKTREES>/<id>`; `WU_FOLDER` is `<UNITS>/<id>`; `WU_REMOTE` is `vcs.remote` (default `origin`).
- `WU_COMMIT_MESSAGE` is composed by the orchestrator as a Conventional Commits message: type from the approved phase (`feat`, `fix`, `chore`, `docs`, `refactor`; `chore` for `maintenance`), a short imperative subject derived from the trigger request, and the unit id in the body.
