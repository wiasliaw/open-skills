# Node dispatch reference

The per-node dispatch source for the graph-flow orchestrator, derived from the `graph-node-*` specs. Node ids are the thirteen kebab-case identifiers used in `state.json`. "Implementor skills" and "Reviewer skills" are the mounts the dispatch assigns; "—" means dispatched with none. Restrictions listed here are in addition to the universal ones (no `state.json`, no `log.ndjson`; no `.harness/` except where noted).

Edge guards are evaluated by the orchestrator in the order listed; "blocked" always means: record `blocked_at` as this node and route to `advisor`.

## trigger — entry (orchestrator-run, no actor)

- **Purpose**: receive the incoming work (prompt, issue, CI failure, or analysis request), create the work-unit folder, initialize state. Never grades, never skips.
- **Reads**: the raw trigger payload; the init report.
- **Produces**: the work-unit folder (`create` subcommand).
- **Edges**: new work → `research-explore`.

## research-explore — LLM loop with tools

- **Purpose**: gather everything needed to judge and specify the work — read the codebase and `.harness/` long-term memory, collect external data, digest external review feedback — and propose a grading of `full`, `small`, `trivial`, or `no-op` with rationale. Propose only after reading the relevant code; never route past the gate.
- **Reads**: the request and any gate rejection feedback (decision records); the codebase; `.harness/`; external data and review feedback.
- **Produces**: findings written into `research-explore/` and the grading proposal.
- **Implementor skills**: deep-research (external data); receive-code-review (external review feedback).
- **Reviewer skills**: —.
- **Edges**: grading proposal produced → `human-gate-grading`; blocked → `advisor`; in-node review loop fails a second time → `advisor`.

## human-gate-grading — human gate (orchestrator stop)

- **Purpose**: the human reviews the grading proposal and routes. Mandatory for every work unit; doubt resolves to rejection.
- **Reads**: the findings and grading proposal.
- **Produces**: `human-gate-grading/decision-<n>.md` and the `human_decisions` entry; on approval set `grading` (and `fast_path` for trivial); on `small` set `spec_ref` to the existing spec named in the findings; on rejection reset `grading` to null with feedback recorded.
- **Edges**: full → `spec`; small → `ticket`; trivial (fast path) → `build`; not needed or already exists → `end`; rejected → `research-explore`.

## spec — LLM

- **Purpose**: converge the research into a specification — goals, scope, acceptance criteria — the contract for all later stages. Re-entered on Ticket contradiction, fast-path upgrade, or gate rejection; revise accordingly.
- **Reads**: the findings, any rejection feedback, the constraints the findings reference.
- **Produces**: the specification in `spec/` (or as an OpenSpec change; `spec_ref` records which).
- **Implementor skills**: SDD (spec-driven development; with OpenSpec, draft the change proposal).
- **Reviewer skills**: —.
- **Edges**: submit for review (in-node review passed) → `human-gate-spec`; blocked → `advisor`; in-node review loop fails a second time → `advisor`.

## human-gate-spec — human gate (orchestrator stop)

- **Purpose**: the human approves the spec or rejects it back to Research with feedback. No Ticket work starts for a full-graded unit before approval.
- **Reads**: the spec.
- **Produces**: `human-gate-spec/decision-<n>.md` and the `human_decisions` entry; `spec_ref` set when the Spec review passed.
- **Edges**: approved → `ticket`; rejected or needs more info → `research-explore`.

## ticket — LLM decomposition / fan-out

- **Purpose**: split the spec into independently verifiable tickets, each with its `verification_command` declared before Build, and select the next ticket. A spec that contradicts itself routes back instead of producing tickets.
- **Reads**: the approved spec and constraints; the existing ticket list and progress.
- **Produces**: the `tickets` list in state (transcribed by the orchestrator from the ticket report in `ticket/`) and `current_ticket`.
- **Implementor skills**: TDD (verification defined before build).
- **Reviewer skills**: —.
- **Edges**: spec contradiction → `spec` (record the contradiction); next ticket → `build`; blocked → `advisor`; in-node review loop fails a second time → `advisor`.
- **Selection-only re-entry**: when a passing Review re-enters Ticket and the list needs no change, the orchestrator selects the next pending ticket in declared order deterministically — no LLM dispatch. Dispatch the implementor only for the initial decomposition or to change the list.

## build — LLM loop

- **Purpose**: implement one ticket at a time inside the isolated worktree. One worktree serves the whole work unit.
- **Reads**: the spec, constraints, and current ticket; any review log from a failed Review or red CI; any advisor guidance for the open problem; `.harness/worktree-setup.json` (read-only).
- **Produces**: code changes in the worktree; `build/worktree.md`; a status of ready-for-review or blocked.
- **Implementor skills**: use-worktree (the orchestrator provisions via `worktree.mjs`; the actor only works inside the path it is given).
- **Reviewer skills**: request-code-review (the Build reviewer pass is the Review node below).
- **Restrictions**: write only code, only inside the worktree; no VCS operations beyond what use-worktree assigns; MUST NOT write `.harness/`.
- **Edges**: ready-for-review → `review`; blocked → `advisor`.

## review — validator (the Build stage's reviewer pass)

- **Purpose**: independently re-run the current ticket's declared verification commands and record per-dimension pass/fail with evidence. Never trusts Build's self-reported results.
- **Reads**: the ticket's verification commands, the spec, the Build output, the ticket's fail counter, the grading path, any advisor guidance.
- **Produces**: `review/review-<n>.md` (written by the reviewer); the orchestrator records the verdict, evidence refs, and counter update.
- **Reviewer skills**: request-code-review.
- **Edges**: fail count < 2 on a non-fast path → `build` (with the review log); fail count >= 2, same error recurring → `advisor` (`blocked_at` = `build`); blocked (cannot run or complete verification) → `advisor` (`blocked_at` = `review`); 1 fail on the fast path → `spec` (upgrade: `grading` = `full`, `fast_path` = false); pass and tickets remain → `ticket`; pass and none remain → `wrap`.

## wrap — LLM merge moment

- **Purpose**: consolidate passing work at the single merge moment: update long-term memory (`.harness/` DECISIONS, FEATURES — static relations as frontmatter references, never a separate graph file), write the handoff, remove the worktree and temp artifacts, open the PR, run CI.
- **Reads**: all verified results, decisions, and progress; the worktree; current `.harness/` contents.
- **Produces**: `.harness/` updates, the handoff, a cleaned workspace, the PR (recorded in `refs.pr`), and `ci_status` from the deterministic CI command.
- **Implementor skills**: —.
- **Reviewer skills**: —.
- **Restrictions**: the one stage whose dispatch permits writing `.harness/`.
- **Edges**: CI green → `ship`; CI red → `build` (fresh worktree on the existing `wu/<id>` branch); blocked → `advisor`; in-node review loop fails a second time → `advisor`.

## ship — deterministic / tool calls (orchestrator-run, no actor)

- **Purpose**: complete delivery — merge the PR, deploy or release where the project declares it, close the issue, archive the work-unit folder. Success terminal; runs only after CI green.
- **Reads**: the green CI result, `refs.pr`, `refs.issue`.
- **Produces**: merged PR, closed issue, `outcome` = `shipped`, the archived folder.
- **Edges**: none — the graph ends.

## end — terminal (orchestrator-run, no actor)

- **Purpose**: the abandonment exit for work that is not needed, already exists, or was cancelled. Legitimate, not a failure.
- **Reads**: the abandonment reason (gate or escalation decision record) and the conclusions so far.
- **Produces**: conclusions and abort reason in the handoff; `outcome` = `ended` with `outcome_reason`; the archived folder.
- **Edges**: none — the graph ends.

## advisor — LLM

- **Purpose**: root-cause analysis on a blocked or repeatedly failing stage, with concrete retry guidance. The cheap escalation tier before the human. Analysis only — never edits deliverables.
- **Reads** (all carried in the dispatch payload): the `blocked_at` node, the failure history and review logs for the problem, the blocked node's section of this reference, the relevant constraints, earlier consultations on the same problem.
- **Produces**: `<blocked_node>/advice-<n>.md` — its only write. The orchestrator records the consultation.
- **Implementor skills / Reviewer skills**: — (dispatched with no skills).
- **Edges**: advice issued, consultations on this problem < 2 → the `blocked_at` node (retry with the advice); 2 consultations both failed → `human-escalation`.

## human-escalation — human (orchestrator stop)

- **Purpose**: last-resort unblocker, reached only through the advisor after two failed consultations on the same problem. No stage routes here directly.
- **Reads**: `blocked_at`, the blocked reason or repeated-failure review log, the consultation records.
- **Produces**: `human-escalation/decision-<n>.md` and the `human_decisions` entry (`unblocked` or `cancel`; cancel needs feedback).
- **Edges**: unblocked → the `blocked_at` node (reset the scope's fail counter, mark the problem `escalated`); cancel → `end`.
