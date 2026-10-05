## MODIFIED Requirements

### Requirement: Universal review gating

Every artifact-producing stage SHALL run worker, then verification, then route — the orchestrator SHALL NOT accept a worker's output as final without a recorded verdict. The verdict comes from the node's declared verification runner. Default (`reviewer`): an independent reviewer dispatch executes the declared verification commands itself, never relying on the worker's claims, scores per the dimensions the node's verification criteria declare, and checks the worker's restriction compliance, failing the review on a violation regardless of command results. Declared `orchestrator`: the orchestrator executes the declared verification commands itself after the worker's report and derives the verdict deterministically from their exit statuses plus the mechanical checks the node's criteria declare (reference: the ticketed build's test-integrity comparison); a command that cannot run (exit 126 or 127, or an unresolvable program) is a defect engaging the fallback chain as blocked, never a failing verdict. Either way, a failing verdict is not a routable outcome: below the failure cap the orchestrator re-dispatches the worker in place with the failure evidence, and only a pass releases a routable outcome for the edges — both runners' failing verdicts count identically for escalation (same signature form: failing dimensions plus failing command; same finest-applicable-scope counter). A standalone validator node is different: it has no worker, so its verdict is its routable outcome — pass and fail route by its declared edges (typically fail returns to the repairing node). Its failing verdict increments only the revisit counter of the returning edge it routes through (never a node counter on top), and cap checks run before the route is taken: at the cap the orchestrator stays in place and escalates instead of routing. A deterministic or tool-call node's command failure is not retried automatically: it engages the fallback chain directly, with the command and exit status as its signature. Any routable outcome the worker reports — the ordinary completion or an alternative such as `ticket-invalid` or `spec-contradiction` — passes through the verification: the runner verifies the outcome's basis (for an alternative outcome, the evidence that justifies it) before the orchestrator routes on it. Reviewer and advisor write their own reports into the stage directory; the worker's report reaches the folder as text the orchestrator transcribes verbatim into `report-<n>.md` (the execution harness blocks subagent report-file writes), and a reviewer or advisor whose report write is blocked falls back the same way. The orchestrator records verdicts and file pointers; verification runs it executed itself are recorded as `step` lines in the event log, cited as evidence.

#### Scenario: Worker claims success
- **WHEN** the worker reports its verification passed
- **THEN** the declared runner — reviewer dispatch or the orchestrator itself — SHALL still execute every declared verification command before a verdict is recorded

#### Scenario: Restriction violation
- **WHEN** the verification finds a file changed that the worker's restrictions forbade
- **THEN** the verdict SHALL be fail with that evidence, even if every verification command passed

#### Scenario: Orchestrator-run verification fails
- **WHEN** a node declaring `runner: orchestrator` sees a declared command exit non-zero after the worker's report
- **THEN** the orchestrator SHALL record a failing verdict with the failing command, increment the finest applicable scope's counter exactly as a reviewer's failing verdict would, and below the cap re-dispatch the worker with the failing output as evidence

#### Scenario: Verification command cannot run
- **WHEN** an orchestrator-run verification command exits 126 or 127
- **THEN** the orchestrator SHALL treat it as a defect (blocked class), not as a red or failing-verdict result

## ADDED Requirements

### Requirement: The ticketed build loop is deterministic and sequential

A unit SHALL use exactly one worktree for its whole life: tickets execute sequentially in it, in the decomposition's declared order, and no per-ticket worktree or branch merge between tickets exists. Each ticket SHALL declare its test as stage artifacts with repo-relative target paths. For each selected ticket the orchestrator SHALL: land the ticket's test files in the worktree at their declared paths; run the ticket's verification command expecting failure — a run that exits zero releases `ticket-invalid` deterministically with no worker dispatched, and an exit of 126 or 127 is a defect, not red; record the red run as a `step` log line; commit the landed tests on the unit's branch before dispatching the implement-only worker. Before recording a green verdict the orchestrator SHALL compare the worktree's test files against the committed red-run versions — a difference is a failing verdict on the test-integrity dimension — and SHALL run the full declared suite in addition to the ticket's command, so a regression in an earlier ticket surfaces at the ticket that introduced it. The write that records a passing green verdict SHALL set the current ticket's status to `passed` in the same write — including when the pass follows earlier failures on that ticket — and the orchestrator SHALL refuse to enter the whole-change review node while any ticket's status is not `passed`, treating it as a state defect to repair, not route past.

#### Scenario: Red lands before the worker
- **WHEN** a ticket is selected for build
- **THEN** the orchestrator SHALL land and commit the ticket's declared tests and record the failing run before any implement worker is dispatched, so red is the orchestrator's own observation, not the worker's claim

#### Scenario: Already-green ticket short-circuits
- **WHEN** the orchestrator's red run of a freshly landed ticket test exits zero
- **THEN** it SHALL release `ticket-invalid` without dispatching a worker, and the outcome routes back to the decomposition node as declared

#### Scenario: Weakened test caught
- **WHEN** the worktree's test files at green time differ from the committed red-run versions
- **THEN** the verdict SHALL be fail on the test-integrity dimension with the differing files named, regardless of the commands' exit statuses

#### Scenario: Retry pass flips the ticket
- **WHEN** a ticket that failed earlier verification passes on a retry
- **THEN** the write recording the pass SHALL set that ticket's status to `passed`, and a unit SHALL never reach the review node or a terminal with a shipped change and a ticket left `failed`
