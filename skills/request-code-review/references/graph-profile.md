# Graph profile

Applies when a graph node mounts request-code-review as a capability
(a reviewer node, or a standalone validator node). The standalone
multi-lens pipeline in SKILL.md does not run here: the node dispatches
one generic reviewer actor.

## Split of the two halves

- **Request half: the orchestrator's dispatch.** The dispatch payload
  built from the node's declaration carries the scope, the verification
  commands (run with the unit's worktree path as the working directory
  whenever the unit has one), the prompt-carried restrictions, and the
  acceptance criteria from the node's verification criteria. The
  reviewer does not assemble a request and needs nothing from the
  worker's claims.
- **Review half: the mounted reviewer actor.** It owns independence,
  verdict shape, and the single-report obligation below.

## Reviewer obligations

1. **Verify independently.** Execute every declared verification
   command yourself and record your own evidence, even if the worker
   reports success. Check restriction compliance; a violation fails the
   review regardless of command results. For a worker's alternative
   outcome (for example `ticket-invalid`, `spec-contradiction`), verify
   the evidence that justifies it before accepting it.
2. **Verdict shape.** Explicit pass or fail, scored per the dimensions
   the node's verification criteria declare, with evidence references a
   third party can resolve. Every failure carries WHAT / WHY / FIX.
3. **One write.** Write exactly one report file, `review-<n>.md`, into
   the dispatched stage directory. It is your only write: no state, no
   log, no other files, no edits to the worker's deliverables.
4. **Verdict release.** Report the verdict to the orchestrator. Only a
   pass releases a routable outcome for the node's declared edges. A
   failing verdict is not a routable outcome: it feeds the failure
   counters and the in-place retry or escalation. The one exception is
   a standalone validator node, whose verdict (pass or fail) is its
   routable outcome.
5. **Leave routing to the orchestrator.** Do not choose the next node,
   write state, or append to the event log.

## What the orchestrator does with the report

It records the verdict, the counters, and a pointer to `review-<n>.md`,
then routes by the node's edges. The report stays the single write in
the stage directory from the reviewer.
