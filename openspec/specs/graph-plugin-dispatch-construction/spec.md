## Purpose

How the orchestrator builds each per-stage dispatch (instructions, skills, restrictions, verification commands) from the node spec.

## Requirements

### Requirement: Dispatch is built from the node spec
For every LLM stage, the orchestrator SHALL construct the dispatch from that node's `graph-node-*` spec, and the payload SHALL identify the node.

#### Scenario: Dispatch for a stage
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the payload SHALL contain the node identity, stage instructions, assigned skills, prompt-carried restrictions, and verification commands, all derived from that node's spec, and the stage directory path where the actor MUST write its outputs

### Requirement: Dispatch names the stage directory
Every dispatch payload SHALL carry the path of the stage directory, inside the work-unit folder, where the actor MUST write its outputs: the executed node's directory for the implementor, the reviewed stage's directory for the reviewer (`review/` for the Build stage's reviewer pass), and the addressed stage's directory for the advisor. The orchestrator SHALL create the directory before dispatching. The actor SHALL write its artifacts there directly and SHALL NOT write elsewhere in the work-unit folder.

#### Scenario: Reviewer dispatch
- **WHEN** the orchestrator dispatches the reviewer for the `spec` stage
- **THEN** the payload SHALL name `spec/` as the directory for the reviewer report `review-<n>.md`

#### Scenario: Advisor dispatch directory
- **WHEN** the orchestrator dispatches the advisor for a problem blocked at `build`
- **THEN** the payload SHALL name `build/` as the directory for `advice-<n>.md`

### Requirement: Stage instructions
The stage instructions SHALL state the node's purpose, its state inputs and outputs, and its acceptance criteria as given in the node spec.

#### Scenario: Instruction content
- **WHEN** a dispatch is built for Spec
- **THEN** its instructions SHALL include Spec's purpose, the state it reads, the outputs it must produce, and its acceptance criteria

### Requirement: Skill assignment for the implementor
The orchestrator SHALL assign skills to the implementor per stage, reusing general skills. The assignment SHALL follow the node specs: Research: deep-research and receive-code-review; Spec: SDD; Ticket: TDD; Build: use-worktree. A stage whose node spec mounts no skill SHALL be dispatched with none. Skills MUST NOT be modeled as nodes.

#### Scenario: Build implementor skills
- **WHEN** the orchestrator dispatches the implementor for Build
- **THEN** the payload SHALL assign use-worktree and no other stage's skills

### Requirement: Skill assignment for the reviewer
The orchestrator SHALL assign the reviewer stage-appropriate verification skills, chosen for reuse of general skills. For the Build and Review stage the reviewer SHALL be assigned request-code-review.

#### Scenario: Build reviewer skills
- **WHEN** the orchestrator dispatches the reviewer for Build's output
- **THEN** the payload SHALL assign request-code-review

### Requirement: Restrictions are contractual and prompt-carried
Per-stage permissions SHALL be written into the dispatch prompt as contractual restrictions (for example "MUST NOT write `.harness/`" for Build). The plugin MUST NOT rely on mechanical per-node tool whitelists or per-node agent definitions to enforce permissions. Every dispatch SHALL also state that the actor MUST NOT write `state.json` or `log.ndjson`.

#### Scenario: Build restriction
- **WHEN** the orchestrator dispatches the implementor for Build
- **THEN** the prompt SHALL state that it MUST NOT write `.harness/`, `state.json`, or `log.ndjson`

#### Scenario: Wrap exception
- **WHEN** the orchestrator dispatches the implementor for Wrap
- **THEN** the prompt SHALL permit writing `.harness/` because Wrap is the single long-term memory write point, and SHALL still forbid writing `state.json` and `log.ndjson`

### Requirement: Verification commands
Each dispatch SHALL carry the stage's executable verification commands in declared order. The implementor SHALL run them as self-checks, and the reviewer SHALL execute them independently.

#### Scenario: Ticket verification
- **WHEN** Build is dispatched for a ticket
- **THEN** the payload SHALL include that ticket's declared verification command from state

### Requirement: Reviewer checks restriction compliance
The reviewer's dispatch SHALL include the implementor's restrictions so that the reviewer can verify they were respected and report a violation as a failure.

#### Scenario: Violation detected
- **WHEN** the reviewer finds a file changed that the implementor's restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence

### Requirement: Advisor dispatch
The orchestrator SHALL dispatch the advisor with the failure history, the review logs and verdicts, the blocked stage's node spec, and the relevant constraints, and no skills. The prompt SHALL carry the restrictions that the advisor MUST NOT edit deliverables and MUST NOT write `state.json`, `log.ndjson`, or `.harness/` (its only write is its advice file in the stage directory), and SHALL ask for analysis plus retry guidance. The advisor's guidance SHALL be included in the payload of the retried stage.

#### Scenario: Retry with guidance
- **WHEN** the advisor returns retry guidance for a blocked Build
- **THEN** the orchestrator SHALL include that guidance in the Build implementor's next dispatch payload
