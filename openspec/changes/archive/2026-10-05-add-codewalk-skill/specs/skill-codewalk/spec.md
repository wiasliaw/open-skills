## ADDED Requirements

### Requirement: Interactive only, never mounted

Codewalk SHALL run only as a reader-paced interactive session: it needs a reader who replies in the conversation, presents one stop at a time, and waits. It declares no graph profile and MUST NOT be mounted on any node or run under orchestrator dispatch; with no reader able to reply it says so and stops, creating nothing.

#### Scenario: No reader
- **WHEN** codewalk is invoked where no reader can reply (an orchestrated dispatch, a batch run)
- **THEN** it SHALL decline and stop before creating any worktree or file

### Requirement: Reading is pinned through the worktree script

All reading SHALL happen inside a read-only pinned worktree obtained from the worktree script's detach mode — resolve the repository's full `HEAD` SHA, run `ensure --detach <sha>`, and read only at the returned path (`<worktrees-location>/pin-<short-sha>`) — never through raw `git worktree` commands. The pin is that SHA, one per walk; the script owns exclusion, reuse, and the probe-read. On `probe_failure` or `not_a_git_repository` the walk SHALL degrade: read the working tree directly and record the pin as `unknown`. Worktree removal belongs to the user; codewalk removes nothing.

#### Scenario: Pin established
- **WHEN** a walk starts in a repository with commits
- **THEN** the script's detach mode SHALL provide the pinned worktree and every citation SHALL be read there, pinned to that commit

#### Scenario: Degraded walk
- **WHEN** the script reports `probe_failure` or `not_a_git_repository`
- **THEN** the walk SHALL read the working tree directly, record the pin as `unknown`, and say so in the landed record

### Requirement: Stops are verified records

Every stop SHALL be recorded while reading as an anchor (a symbol or pattern unambiguous in the cited file), a `file:line`, and a verbatim code snapshot copied at that moment — never reconstructed later — and SHALL teach situation, mechanism, implication, and gotcha beyond what opening the file shows. Citations cover only the project's own source: never dependencies, build output, vendored code, or submodule content, and never a file not actually read.

#### Scenario: Snapshot provenance
- **WHEN** a stop is presented or landed
- **THEN** its snapshot SHALL be the one copied at read time from the pinned tree, and its anchor SHALL identify the cited line unambiguously

### Requirement: The walk lands a reading record and changes nothing

The walk SHALL end by landing a reading record in the real repository (never the worktree), filled from the recorded stops via the shipped template, asking before overwriting a file that predates the walk. Codewalk is read-only and non-judging: it SHALL NOT modify source code, and it SHALL NOT issue findings or verdicts — defect-finding is referred to request-code-review.

#### Scenario: Landing
- **WHEN** the reader finishes or skips to landing
- **THEN** the record SHALL be written from the verified stop records into the real repository, with overwrite confirmed for pre-existing files

#### Scenario: No judging
- **WHEN** the reader asks for defects or a verdict during a walk
- **THEN** codewalk SHALL refer them to request-code-review instead of judging
