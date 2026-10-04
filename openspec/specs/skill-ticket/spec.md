## Purpose

Standalone decomposition skill: split an approved contract into independently verifiable tickets, each with its verification declared before any implementation starts. Mountable on a ticket node.

## Requirements

### Requirement: Verification is defined before build

Every ticket SHALL declare its verification (commands or criteria) before it is handed to implementation, and tickets SHALL be independently verifiable.

#### Scenario: Ticket written
- **WHEN** the skill writes a ticket
- **THEN** that ticket SHALL include its scope and a declared verification

### Requirement: Contradictions go back to the contract

When decomposition reveals that the contract contradicts itself or cannot be satisfied, the skill SHALL send the problem back to the specification instead of producing tickets around it.

#### Scenario: Contradiction found
- **WHEN** decomposition finds the spec unsatisfiable
- **THEN** the contradiction SHALL be recorded and the specification revised before tickets are produced

### Requirement: Selection-only re-entry is deterministic

Selecting the next pending ticket from an unchanged list SHALL be a deterministic step (declared order), not an LLM task. An LLM pass SHALL occur only for the initial decomposition or when the ticket list itself must change.

#### Scenario: Next ticket after a pass
- **WHEN** a ticket passes and pending tickets remain unchanged
- **THEN** the next pending ticket SHALL be selected in declared order with no LLM dispatch

### Requirement: Graph profile

When mounted on a node, the skill SHALL additionally: write the ticket list into the work unit's state through the orchestrator; route to build on next-ticket and to the spec node on contradiction; and report blocked rather than decompose an unapproved contract.

#### Scenario: Mounted run
- **WHEN** the skill runs as a mounted node capability
- **THEN** tickets SHALL be recorded in work-unit state with their verification, and routing SHALL follow the node's declared edges
