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
- Mounted on a graph node: the orchestrator dispatches the node's worker with the skill mounted.

## Red before green

This skill authors the tests. Proving red-then-green happens on the build node: the build worker lands the declared test in the worktree, runs it, records the failing run as evidence, and then implements. If the test already passes, the worker reports `ticket-invalid`, which routes back to the decomposition node. A graph that mounts this skill must declare these obligations and the `ticket-invalid` outcome with its returning edge on its build node; the template graphs do.

## Graph profile

When mounted on a node, the skill additionally:

- writes the full ticket text as the stage artifact (for example `tickets.md`);
- hands the routing entries (id, status, verification command) to the orchestrator, which records them in work-unit state;
- reports exactly one outcome: `tickets-produced` or `spec-contradiction`. It never decomposes an unapproved contract.

Outcomes route by the node's declared edges. A blocked report engages the in-place fallback chain.
