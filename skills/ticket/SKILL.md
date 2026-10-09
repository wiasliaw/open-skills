---
name: ticket
description: Use when a contract (spec, requirement, or bug description) must be split into small implementation tickets, each defined by an executable test written before any implementation — "break this into tickets", "TDD decomposition", "plan tickets for this spec". Also mountable on a graph decomposition node. Skip when there is no contract to decompose, or for a single trivial change that needs no split.
---

# ticket

Split a contract into tickets whose verification is an executable test declared before implementation. A ticket is defined by its test: no declared test, no ticket.

## Procedure

1. **Read the contract.** Read it fully. Decompose only an approved contract.
2. **Check it can be satisfied.** If the contract contradicts itself or cannot be satisfied, stop. Record the contradiction (what conflicts, where, why) and send it back to the contract for revision. Do not produce tickets around it.
3. **Cut tickets.** Each ticket is independently verifiable and small enough that one test run settles it.
4. **Declare the test first.** Each ticket carries:
   - `id` (stable, e.g. `T-1`)
   - scope: what the ticket covers and what it does not
   - verification: an executable test or check, including the exact command that runs it
   - the test itself, authored now as part of the decomposition output
5. **Confirm the test targets a real gap.** The test must fail against the pre-implementation state. If it would already pass, the ticket is mis-scoped or already satisfied: revise or drop it.
6. **Order the tickets** in the sequence they should be built.

## Red before green

The declared test must fail before implementation and pass when the ticket is done. This skill authors the test; the implementing side proves red-then-green inside the worktree.

- The build pipeline's `red-check` script task lands the declared test files from `tests/<ticket-id>/` in the worktree, commits them, and runs the ticket's command expecting failure (`expect-red`), recording the failing result as evidence before any implementation.
- If the test already passes in the worktree before any implementation, that run surfaces the graph-declared outcome `ticket-invalid` deterministically, with no worker involved. That outcome routes by an edge back to the decomposition node for revision or removal, and counts as no progress for the revisit counter.
- The pipeline's validator task confirms red-then-green from that evidence (landed tests unchanged since the red commit, the ticket's command passing), with no execution outside the worktree.

These obligations belong to the build pipeline, not to this skill's mount. A graph definition that mounts this skill must also declare them: a `red-check` script task in its build node's pipeline, and the `ticket-invalid` outcome with its edge back to decomposition. The library's `build` node does.

## Graph profile

Applies only when the skill runs mounted on a graph task. Standalone use needs none of this.

- Write the full ticket text (scope, verification command, test) as the stage artifact in the stage directory named in the dispatch, e.g. `tickets.md`. Never write routing state or the event log; the orchestrator is their only writer.
- Hand the routing entries to the orchestrator for state: per ticket only `id`, `status` (initially `pending`), and `verification_command`. Descriptive content stays in the stage file.
- Report exactly one outcome:
  - `tickets-produced`: tickets are written and every one declares its test.
  - `spec-contradiction`: the contract is contradictory or unsatisfiable; the report carries the recorded contradiction as evidence.
- Place each ticket's test files under `tests/<ticket-id>/` in the stage directory, laid out at their repo-relative target paths (`tests/T-1/test/foo.test.js` lands at `test/foo.test.js`); the orchestrator lands that tree in the worktree.
- Never decompose an unapproved contract.
- The orchestrator applies the pipeline entry's `on` action to the reported outcome (the library's `ticket` node surfaces both for edge routing). A blocked report instead engages the universal in-place fallback chain.
