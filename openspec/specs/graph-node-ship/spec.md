## Requirements

### Requirement: Ship purpose and type
The Ship step SHALL be defined as a deterministic / tool calls. Purpose: Complete delivery: merge the PR, deploy or release, close the issue, and archive the work-unit folder. It is the success terminal.

#### Scenario: Node identity
- **WHEN** the graph definition is read
- **THEN** Ship SHALL be typed as deterministic / tool calls

### Requirement: Ship state inputs
Ship SHALL read only the following from state and the environment: the green CI result, PR reference, and issue reference in the work-unit folder.

#### Scenario: Inputs available
- **WHEN** Ship starts
- **THEN** the inputs listed for Ship SHALL be available to it

### Requirement: Ship state outputs
Ship SHALL produce the following: the merged PR, release/deploy outcome, closed issue, and the work-unit folder archived.

#### Scenario: Outputs recorded
- **WHEN** Ship completes
- **THEN** its outputs SHALL be recorded as specified

### Requirement: Ship outgoing edges
Ship SHALL route only by the following guard conditions:

- none: success terminal -> (graph ends)

#### Scenario: None: success terminal
- **WHEN** none: success terminal
- **THEN** the next step SHALL be (graph ends)

### Requirement: Ship mounted skills
The skills mounted on Ship SHALL be: none. Skills are capabilities mounted on a node and MUST NOT be modeled as nodes.

#### Scenario: Skill mounts
- **WHEN** Ship needs a capability
- **THEN** it SHALL use only the mounted skills: none

### Requirement: Ship is a success terminal
Ship SHALL be a terminal node with no outgoing edges and SHALL run only after Wrap reports CI green.

#### Scenario: Reached only via green CI
- **WHEN** Ship runs
- **THEN** the preceding Wrap result SHALL have been CI green

#### Scenario: Work unit archived
- **WHEN** Ship completes
- **THEN** the work-unit folder SHALL be archived
