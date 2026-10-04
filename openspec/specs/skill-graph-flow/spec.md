## Purpose

The shipped graph-flow orchestrator skill and its per-node dispatch reference.

## Requirements

### Requirement: graph-flow is the shipped orchestrator

The plugin SHALL ship a `graph-flow` skill that turns the main session into the orchestrator of the execution graph defined by `graph-engineering-node-specs`: it reads state, builds each LLM stage's dispatch, records results through the work-unit script, and routes by the node's edge guards. The page SHALL state that the orchestrator never produces stage deliverables itself.

#### Scenario: Skill page content
- **WHEN** `skills/graph-flow/SKILL.md` is read
- **THEN** it SHALL cover the four actor roles, the work-unit folder contract, the dispatch payload contents, the review gate, the two human gates, the advisor escalation with its caps, and the Ship/End terminals

### Requirement: Node dispatch data ships with the skill

The skill SHALL carry a per-node dispatch reference at `skills/graph-flow/references/nodes.md` with one section per node (all thirteen), each stating the node's type, purpose, reads, produces, edge guards, assigned skills, and extra restrictions, derived from the `graph-node-*` specs.

#### Scenario: A node section drives the dispatch
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the payload's instructions, skills, restrictions, and edges SHALL come from that node's section of `references/nodes.md`

### Requirement: State writes go through the script

The skill SHALL direct every `state.json` and `log.ndjson` change through `work-unit.mjs write` (and creation and archival through `create`/`archive`), and SHALL forbid hand-editing either file.

#### Scenario: Rejected write
- **WHEN** the script rejects a drafted state
- **THEN** the orchestrator SHALL fix the draft and retry, not edit `state.json` directly
