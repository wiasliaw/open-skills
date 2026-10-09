# Graph profile

Applies when a graph task mounts request-code-review as a capability
(a validator task, in a pipeline or as a standalone validator node). The
standalone multi-lens pipeline in SKILL.md does not run here: the task
dispatches one generic reviewer actor.

## Split of the two halves

- **Request half: the orchestrator's dispatch.** The dispatch payload
  built from the validator task's declaration carries the scope, the
  verification commands (run with the unit's worktree path as the
  working directory whenever the unit has one), the producing task's
  prompt-carried restrictions, and the validator task's `instructions`,
  which are the definition of pass and name the dimensions. The
  reviewer does not assemble a request and needs nothing from the
  worker's claims.
- **Review half: the mounted reviewer actor.** It owns independence,
  verdict shape, and the single-report obligation below.

## Reviewer obligations

1. **Verify independently.** Execute every declared verification
   command yourself and record your own evidence, even if the worker
   reports success. Check restriction compliance; a violation fails the
   review regardless of command results. Judge a worker's reported
   outcome only as far as the validator task's `instructions` direct: an
   alternative outcome (for example `ticket-invalid`) surfaces with its
   evidence artifact present, and reaches you only where the graph maps
   it to `next` into this validator task.
2. **Verdict shape.** Explicit pass or fail, scored per the dimensions
   the validator task's `instructions` name, with evidence references a
   third party can resolve. Every failure carries WHAT / WHY / FIX.
3. **One write.** Write exactly one report file, `review-<n>.md`, into
   the dispatched stage directory. It is your only write: no state, no
   log, no other files, no edits to the worker's deliverables.
4. **Verdict release.** Report the verdict to the orchestrator. In a
   pipeline only a pass lets the work proceed. A failing verdict is not
   a routable outcome: it feeds the failure counters and the in-place
   retry or escalation. The one exception is a standalone validator
   node, whose verdict (pass or fail) is the node's routable outcome,
   routed by its edges.
5. **Leave routing to the orchestrator.** Do not choose the next node,
   write state, or append to the event log.

## What the orchestrator does with the report

It records the verdict, the counters, and a pointer to `review-<n>.md`,
then applies the validator entry's `on` action (the node's edges route a
surfaced outcome). The report stays the single write in
the stage directory from the reviewer.
