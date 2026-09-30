## ADDED Requirements

### Requirement: Dispatch is built from the node spec
For every LLM stage, the orchestrator SHALL construct the dispatch from that node's `graph-node-*` spec, and the payload SHALL identify the node.

#### Scenario: Dispatch for a stage
- **WHEN** the orchestrator dispatches an actor for a node
- **THEN** the payload SHALL contain the node identity, stage instructions, assigned skills, prompt-carried restrictions, and verification commands, all derived from that node's spec

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
Per-stage permissions SHALL be written into the dispatch prompt as contractual restrictions (for example "MUST NOT write `.harness/`" for Build). The plugin MUST NOT rely on mechanical per-node tool whitelists or per-node agent definitions to enforce permissions. Every dispatch SHALL also state that the actor MUST NOT write `work-unit.json`.

#### Scenario: Build restriction
- **WHEN** the orchestrator dispatches the implementor for Build
- **THEN** the prompt SHALL state that it MUST NOT write `.harness/` or `work-unit.json`

#### Scenario: Wrap exception
- **WHEN** the orchestrator dispatches the implementor for Wrap
- **THEN** the prompt SHALL permit writing `.harness/` because Wrap is the single long-term memory write point, and SHALL still forbid writing `work-unit.json`

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
