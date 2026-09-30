## ADDED Requirements

### Requirement: Graph vocabulary
The graph SHALL use these definitions: a node is a unit of work typed as LLM call, deterministic function, tool call, validator, or human gate, and may itself be a loop; an edge is routing, a condition function that reads state and decides what runs next; state is `work-unit.json`, shared across the whole graph; a skill is a capability mounted on a node and is not a node.

#### Scenario: Skills are not nodes
- **WHEN** a capability such as SDD or TDD is attached to a step
- **THEN** it SHALL be specified as a skill mounted on that node and not as a separate node

### Requirement: Static relations are not edges
The term edge SHALL be reserved for routing. Static relations (supersedes, depends-on, decided-by, verified-by) SHALL be typed references between long-term-memory entries, stored as markdown with explicit frontmatter fields, with no separate JSON or DOT graph file. Code-structure facts (module, file, symbol) SHALL NOT be persisted and SHALL be queried live with tools.

#### Scenario: Relation storage
- **WHEN** a decision supersedes an earlier one
- **THEN** the relation SHALL be recorded as a frontmatter reference and not as a graph edge

### Requirement: Graph is a superset and skipping is normal
The graph definition SHALL be a superset of any single execution path, and skipping nodes according to the approved grading SHALL be normal execution.

#### Scenario: Trivial fast path
- **WHEN** the approved grading is trivial
- **THEN** execution SHALL go from the grading gate to Build, skipping Spec and Ticket

### Requirement: Complete conditional edge set
The graph SHALL contain exactly 26 conditional edges: Trigger to Research; Research to Human Gate (grading); Human Gate (grading) to Spec (full), Ticket (small), Build (trivial), End (not needed or already exists), Research (rejected); Spec to Human Gate (spec); Human Gate (spec) to Ticket (approved) or Research (rejected); Ticket to Spec (spec contradiction) or Build (next ticket); Build to Review (ready-for-review); Review to Build (fail below 2), Advisor (fail 2 or more, same error recurring), Spec (fast-path fail), Ticket (pass, tickets remain), Wrap (pass, none remain); Wrap to Ship (CI green) or Build (CI red); any stage (Research, Spec, Ticket, Build, Review, Wrap) to Advisor (blocked, with the orchestrator recording `blocked_at` in state); Research, Spec, Ticket, or Wrap to Advisor (second failure of the node's in-node review loop); Advisor to the `blocked_at` node (advice issued, consultations on this problem below 2); Advisor to Human Escalation (2 consultations on the same problem both failed); Human Escalation to the `blocked_at` node (unblocked); Human Escalation to End (cancel). An edge whose source is written as "any stage" or "Research, Spec, Ticket, or Wrap" and an edge whose target is the `blocked_at` node each count as one edge.

#### Scenario: Edge coverage
- **WHEN** any node other than Ship and End finishes
- **THEN** at least one listed edge guard SHALL match and select the next node

#### Scenario: Edge count
- **WHEN** the edge set is audited
- **THEN** it SHALL contain 26 edges: 1 (Trigger) + 1 (Research) + 5 (grading gate) + 1 (Spec) + 2 (spec gate) + 2 (Ticket) + 1 (Build) + 5 (Review) + 2 (Wrap) + 1 (blocked to Advisor) + 1 (in-node second failure to Advisor) + 2 (Advisor) + 2 (Human Escalation)

### Requirement: Every loop has an exit and a cap
Every loop SHALL have an exit and a cap: a stage failing twice or more (same error recurring) SHALL escalate to Advisor, and Advisor consultations SHALL be capped at 2 per problem, after which the graph SHALL route to Human Escalation. Every node's blocked state SHALL have Advisor as its destination.

#### Scenario: Repeated stage failure
- **WHEN** the same failure recurs twice
- **THEN** the graph SHALL route to Advisor rather than loop again

#### Scenario: Advisor cap
- **WHEN** Advisor has been consulted twice on the same problem and the stage still fails
- **THEN** the graph SHALL route to Human Escalation rather than consult Advisor a third time

### Requirement: Two legitimate terminals
The graph SHALL have exactly two terminals: Ship (success) and End (abandonment), both legitimate.

#### Scenario: Terminals have no outgoing edges
- **WHEN** execution reaches Ship or End
- **THEN** the graph SHALL stop

### Requirement: Human intervention is concentrated
Human intervention SHALL occur only at Human Gate (grading), Human Gate (spec), and Human Escalation, and the gates SHALL sit in the cheap stages so that no synchronous human wait occurs inside the Build and Review loop. Advisor is an LLM node and SHALL NOT count as a human stop; human intervention stays a last resort, with Advisor absorbing the first escalations.

#### Scenario: No human wait in the build loop
- **WHEN** Build or Review is blocked or repeatedly failing
- **THEN** the work SHALL route to Advisor first, and to Human Escalation only after Advisor's consultation cap is reached, instead of waiting inline

### Requirement: Single long-term memory write point
Only Wrap SHALL write long-term memory. Long-term memory SHALL be readable by every node.

#### Scenario: Non-Wrap write
- **WHEN** a node other than Wrap attempts to write `.harness/`
- **THEN** that write SHALL be disallowed by the graph definition
