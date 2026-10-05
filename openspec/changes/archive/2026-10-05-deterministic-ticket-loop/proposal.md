## Why

The demo e2e exposed four coupled problems in the ticketed build loop. (1) Every ticket ran a full worker-plus-reviewer cycle, producing 30+ files in one stage directory, although the per-ticket review only re-ran a command the orchestrator could run itself. (2) The worker's red-run claim is unverifiable after the fact, and the implementing worker can weaken the test it is implementing against. (3) A Claude Code guardrail blocks subagent writes of `report-<n>.md`, which the e2e worked around ad hoc. (4) The unit shipped with ticket T-6 left `failed` in state.json — no rule flips a ticket back to `passed` when its retry passes, and nothing checks ticket statuses before the review node.

## What Changes

- A node MAY declare its verification runner: `verification.runner: "orchestrator"` means the orchestrator executes the declared verification itself after the worker's report and derives a counted verdict — same signature form and escalation path as a reviewer verdict. The reference template declares this on the build node; the per-ticket reviewer dispatch is removed, and the review validator node remains the only reviewer dispatch on every path. **BREAKING** for in-flight units mid-build (none known).
- Red moves to the orchestrator: tickets declare each test's repo-relative target path; the orchestrator lands the test files in the worktree, runs the ticket command expecting failure (exit 126/127 is a defect, not red), commits them (`test: <ticket-id>`), and only then dispatches the implement-only worker. A red run that exits 0 releases `ticket-invalid` deterministically, with no worker dispatched.
- Test integrity is checked mechanically: before the green verdict the orchestrator compares the worktree's test files against the committed red-run versions; a mismatch is a failing verdict (test-integrity dimension). Green runs the ticket command plus the full declared suite, so a regression in an earlier ticket is attributed at the ticket that introduced it.
- Worker reports become returned text: the orchestrator transcribes the report verbatim into `report-<n>.md` (the harness blocks subagent report-file writes). Reviewer and advisor keep writing their own files, with a transcribe-on-block fallback.
- Step records and red/green output dumps stop being files: a new `step` log event carries command, exit status, and output tail in `log.ndjson`; evidence references use `kind: "log"`. `steps-<n>.md` and `red-run`/`green-run` dumps are retired.
- Ticket status discipline: the write that records a passing green verdict flips the current ticket to `passed` (also on a retry after failures — the e2e bug); entering the review node with any ticket not `passed` is a defect the orchestrator refuses.
- One worktree per unit, tickets sequential, stated as an invariant: no per-ticket worktrees, no merges between tickets.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `graph-run`: review gating admits the declared orchestrator-run verification with counted verdicts; the ticketed build procedure (orchestrator-landed red, tamper check, deterministic ticket-invalid, status discipline, sequential single worktree) and the report-transcription rule are added; step records move into the event log.
- `graph-definition`: a node's verification MAY declare `runner` (`orchestrator | reviewer`, default reviewer), validated as part of the verification shape.
- `work-unit-state`: the event log gains the `step` event (orchestrator-run command record: command, exit status, output tail) as the home of pre/post/terminal step results and red/green runs.

## Impact

- Scripts: `scripts/graph.mjs` (validate `verification.runner`), `scripts/work-unit.mjs` (accept the `step` log event) and their tests.
- Template: `skills/graph-build/templates/coding-factory.json` (build node runner + instructions + test-integrity restriction; ticket node target-path instruction); demo definition re-instantiated.
- Graph-run docs: `SKILL.md`, `references/dispatch.md`, `references/node-execution.md`, `references/escalation.md`, `references/state-writes.md`.
- Agents: `agents/worker.md`, `agents/reviewer.md`, `agents/advisor.md`.
- Docs: `docs/file-formats.md`, `docs/graph-run.md`.
- A fresh demo e2e run is the acceptance test for the whole change.
