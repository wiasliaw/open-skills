# wrap

Ends a line of work so the next session can take over cold. It leaves
verification green, records durable outcomes in versioned files,
removes leftover scaffolding, and closes any workflow tool still
mid-flight.

## When to use it

- You are done with a task and want the project left in a clean,
  resumable state.
- A graph run reaches its close-out stage (the skill is mounted on
  exactly one task per graph).

Do not use it mid-task, and do not expect it to commit, push, or open
a pull request: those are the deterministic delivery steps that run
after the close-out deliverables pass review.

## How it is invoked

Ask for it in plain words ("wrap up", "close this out") or run
`/open-skills:wrap`. In a graph run, the orchestrator dispatches it as
the close-out task.

## What it does

1. Runs the declared verification commands and stops if they fail.
2. Consolidates draft deltas (decisions, features, proposed constraint
   or architecture changes) into pending entries in the delta ledger
   under `.harness/`. Current-truth documents are never edited; a
   later maintenance unit folds pending deltas in.
3. Removes residue it introduced: temp files, debug output,
   commented-out experiments, dead TODO markers.
4. Closes workflow-tool state, for example archiving an applied
   OpenSpec change.
5. Writes the handoff record: what was done, what was decided, what
   remains.

Running it again after an interruption converges to the same state.

## Graph profile

Mounted on the close-out task, it works inside the unit's worktree,
reads draft deltas from the work-unit stage directories in the main
checkout, and merges the entries into the ledger inside the worktree
so they travel on the unit's branch. The handoff record is written in
its own stage directory and copied to the work-unit folder root by the
success terminal's script task. The worker reports the task's declared
exit outcome (`done` for the library's `close-out` task); the node
surfaces `handed-off` once the delivery tasks that follow its review
have run.

A failure found after handover (red CI, a merge conflict) starts a new
work unit; the closed unit is not reopened.
