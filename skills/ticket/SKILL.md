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

- The build worker lands the declared test in the worktree, runs it, records the failing result as evidence, and only then implements.
- If the test already passes in the worktree before any implementation, the build worker reports the graph-declared outcome `ticket-invalid`. That outcome routes by a returning edge back to the decomposition node for revision or removal, and counts as no progress for the revisit counter.
- A reviewer confirms red-then-green from that evidence, with no execution outside the worktree.

These obligations belong to the build node, not to this skill's mount. A graph definition that mounts this skill must also declare them on its build node (in its stage instructions, and as the `ticket-invalid` outcome with its returning edge). The template factories do.

## Graph profile

Applies only when the skill runs mounted on a graph node. Standalone use needs none of this.

- Write the full ticket text (scope, verification command, test) as the stage artifact in the stage directory named in the dispatch, e.g. `tickets.md`. Never write routing state or the event log; the orchestrator is their only writer.
- Hand the routing entries to the orchestrator for state: per ticket only `id`, `status` (initially `pending`), and `verification_command`. Descriptive content stays in the stage file.
- Report exactly one outcome:
  - `tickets-produced`: tickets are written and every one declares its test.
  - `spec-contradiction`: the contract is contradictory or unsatisfiable; the report carries the recorded contradiction as evidence.
- Never decompose an unapproved contract.
- Routable outcomes route by the node's declared edges. A blocked report instead engages the universal in-place fallback chain.
