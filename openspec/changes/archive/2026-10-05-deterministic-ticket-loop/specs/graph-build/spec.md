## MODIFIED Requirements

### Requirement: Node declaration contract

Each node in a graph definition SHALL declare: its purpose and type; the state it reads and the state it produces; the routable outcomes it can report; its verification criteria; its outgoing guarded edges; its mounted capabilities — skills, commands, and MCP servers; its restrictions (what it must not write or do); whether its output requires a human approval before routing; and optionally its deterministic pre-steps and post-steps — commands the orchestrator runs before dispatch and after a passing verdict (worktree provisioning, VCS operations, delivery). A node's verification MAY declare its runner: `reviewer` (the default — an independent reviewer dispatch executes the commands) or `orchestrator` — the orchestrator executes the declared verification commands itself after the worker's report and derives the verdict deterministically; the validator accepts only these two values. Terminals and the entry node declare no outcomes, verification, or outgoing guarded edges, but a terminal SHALL declare its deterministic steps — for the success terminal the handoff copy and archival (worktree removal already happened in the close-out node's post-steps), for the abandonment terminal forced worktree removal, the handoff, and archival. Every pre-step, post-step, and terminal-step command counts as a mount for the tool gate, so nothing the orchestrator runs is outside the graph. For deterministic and tool-call nodes the verification is the exit status of their commands, recorded by the orchestrator; on success they report the fixed outcome `pass`, which the edge coverage rule checks like any routable outcome. Declared steps SHALL be idempotent, because a failed step's retry re-runs only that step. A capability not declared at build time SHALL NOT be available to the node at run time.

#### Scenario: Mounts declared at build time
- **WHEN** a node needs a skill, command, or MCP server during a run
- **THEN** that mount SHALL already be named in the node's declaration, and the dispatch SHALL carry only declared mounts

#### Scenario: Unshipped mount degrades to instructions
- **WHEN** a declared skill mount without graph profile obligations is not installed in the running environment
- **THEN** the dispatch SHALL carry the mount's intent as instructions instead, and the degradation SHALL be visible in the dispatch

#### Scenario: Profile-bearing mount never degrades
- **WHEN** a mounted skill that defines a graph profile is unavailable
- **THEN** the stage SHALL report blocked instead of degrading to instructions

#### Scenario: Invalid verification runner rejected
- **WHEN** a node declares a verification runner other than `reviewer` or `orchestrator`
- **THEN** the validator SHALL reject the definition naming the node and the field
