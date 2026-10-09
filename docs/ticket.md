# ticket

Splits a contract into small tickets, each defined by an executable test that is written before any implementation.

## What it does

- Reads the contract (a spec, requirement, or bug description) and cuts it into tickets that are independently verifiable and small enough for one test run to settle.
- Gives every ticket a scope and an executable verification command. A ticket without a declared test does not exist.
- Requires each test to fail against the pre-implementation state (red) and pass when the ticket is done (green). A test that already passes means the ticket is mis-scoped or already satisfied, so it is revised or dropped.
- If the contract contradicts itself or cannot be satisfied, it records the contradiction and sends it back to the contract instead of producing tickets around it.

## When to use

- You have an approved contract and want a test-first work breakdown.
- A graph definition has a decomposition node ahead of the build node.

Skip it when there is nothing to decompose or the change is too small to split.

## How it is invoked

- Standalone: ask for it ("break this spec into tickets", "TDD decomposition"), or invoke `/open-skills:ticket`.
- Mounted on a graph task: the orchestrator dispatches the task's worker with the skill mounted.

## Red before green

This skill authors the tests. Proving red-then-green happens in the build pipeline: its `red-check` script task, run by the orchestrator rather than the worker, lands the declared test files (kept in the decomposition stage under `tests/<ticket-id>/`) in the worktree, commits them, runs the ticket's command expecting failure, and records the failing run as a log step, all before any implementation. If the test already passes, that run exits 11, which the task maps to `ticket-invalid`, routing back to the decomposition node with no worker dispatched. A graph that mounts this skill must declare these obligations and the `ticket-invalid` outcome with its returning edge on its build node; the library's `build` node does.

## Graph profile

When mounted on a task, the skill additionally:

- writes the full ticket text as the stage artifact (for example `tickets.md`);
- hands the routing entries (id, status, verification command) to the orchestrator, which records them in work-unit state;
- reports exactly one outcome: `tickets-produced` or `spec-contradiction`. It never decomposes an unapproved contract.

The orchestrator applies the pipeline entry's `on` action to the outcome, and the node's declared edges route what it surfaces. A blocked report engages the in-place fallback chain.
