## MODIFIED Requirements

### Requirement: Write authority is split by path

`state.json` and `log.ndjson` SHALL be written only by the orchestrator, which also writes exactly three other kinds of file: the human decision records `decision-<n>.md` in the stage directory where the ruling happened; the worker-report transcriptions `report-<n>.md` in the stage directory — verbatim copies of the text report the worker returned (the execution harness blocks subagent report-file writes), and the same fallback applies to a reviewer or advisor report whose own write is blocked; and `handoff.md` at the folder root — on success copied verbatim from the close-out stage's reviewed handoff artifact during the terminal's deterministic steps, at abandonment written by the orchestrator directly. The record of every deterministic command the orchestrator executes — pre-steps, post-steps, terminal steps, and orchestrator-run verification runs — is a `step` line in the event log (command, exit status, output tail), not a file. The close-out worker writes its handoff inside its own stage directory like any deliverable. Stage artifacts SHALL otherwise be written by the actor that produced them, directly into the stage directory named in its dispatch, and nowhere else in the folder. Humans write nothing: their answers reach the folder only as orchestrator-recorded decision records, state entries, and log lines.

#### Scenario: Reviewer report
- **WHEN** the reviewer completes a pass
- **THEN** the reviewer SHALL have written its report into the dispatched stage directory itself, and the orchestrator SHALL record only the verdict and a file pointer in `state.json`

#### Scenario: Worker report transcribed
- **WHEN** a worker returns its report
- **THEN** the orchestrator SHALL write it verbatim as `report-<n>.md` in the stage directory and log the `report` line pointing at that file; the worker itself writes stage deliverables, never the report file

#### Scenario: Step recorded in the log
- **WHEN** the orchestrator runs a pre-step, post-step, terminal step, or an orchestrator-run verification command
- **THEN** the result SHALL be recorded as a `step` log line carrying the command, exit status, and output tail, and no `steps-<n>.md` or output-dump file SHALL be written
