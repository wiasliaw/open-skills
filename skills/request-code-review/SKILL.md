---
name: request-code-review
description: Use when the user asks for a code review, after completing a feature, or before merging, and when a graph node mounts this skill as its reviewer capability. Packages the work into a request that carries its own contract (scope, verification commands, restrictions, acceptance criteria), has independent reviewers verify it without trusting the author, and returns a pass/fail verdict with WHAT/WHY/FIX evidence.
---

# Request Code Review

A review request is a contract, not a plea. It carries everything an
independent reviewer needs, so the reviewer never has to take the
author's word for anything. Reviewers run in fresh contexts; a
verification wave exists because the characteristic failure of an LLM
reviewer is a confident, plausible, wrong finding.

## Step 1: Assemble the request

The request MUST carry all four parts:

1. **Scope** — what to review, resolved in this order: explicit scope
   from the user (commit range, files, PR number); uncommitted changes
   (`git diff HEAD`); clean feature branch against its merge base
   (`git diff $(git merge-base <default-branch> HEAD)...HEAD`); clean
   default branch, the last commit. Not a git repository: ask which
   files to review and review them whole. State the resolved scope in
   one sentence before dispatching.
2. **Verification commands** — the commands that prove the work (tests,
   linters, validators), taken from the project's declared workflow
   (root CLAUDE.md, CI config). If none are declared, ask the user; do
   not invent them.
3. **Restrictions** — what the author was forbidden to touch or do
   (files, directories, branches, memory writes). "None" is a valid
   answer and is stated explicitly.
4. **Acceptance criteria** — the intent and the conditions under which
   the work counts as done. Take them from the conversation, the
   ticket, or commit messages; if none are informative, ask one short
   question. Never dispatch with no statement of intent.

Do not include the author's self-reported results. If the author
claims checks passed, that claim stays out of the request.

## Step 2: Dispatch independent reviewers

Dispatch three general-purpose subagents in a single message so they
run concurrently, using the templates in
[references/reviewer-prompt.md](references/reviewer-prompt.md): one
per lens (defects, structure, intent and behavior). Every reviewer
receives the full request from Step 1. A user-named focus ("watch the
concurrency") is appended to all three lenses, never substituted for
one.

Each reviewer MUST:

- execute every declared verification command itself and record its own
  output as evidence, whatever the author claims;
- check restriction compliance; a violation fails the review
  regardless of command results.

## Step 3: Dedup, then verify adversarially

Merge findings at the same file:line or sharing a root cause; agreement
across lenses is a credibility signal. Then verify with the verifier
template in the references file: Critical findings get two independent
verifiers (dropped only if both refute), Structural one, Minor none
(labeled "unverified"). Above ~10 verifier dispatches, batch related
findings per verifier.

## Step 4: Deliver the verdict

Assemble the single report yourself. The verdict is an explicit
**pass** or **fail**:

- Score each dimension (correctness, restriction compliance, contract
  and acceptance criteria, structure) as pass or fail with evidence
  references a third party can resolve (file:line, command plus its
  output).
- Any failing dimension makes the verdict fail. Every failure states
  **WHAT** is wrong, **WHY** it fails the contract, and **FIX**
  guidance concrete enough to act on.
- Open with the design verdict; if the lenses disagree, the
  disagreement is the headline. Close with one line of accounting
  (merged in dedup, dropped as refuted). Never delete or downgrade a
  finding you disagree with; rebut it alongside, with evidence.

## Step 5: Act on findings

Critical: fix first. Structural: present the restructuring path and
confirm with the user before executing. Minor: fix if trivial,
otherwise list for later.

## Graph profile

When a graph node mounts this skill, the two halves split by role: the
orchestrator's dispatch construction fulfills Step 1, and the mounted
reviewer actor owns independence, verdict shape, the single report
write, and verdict release. Load
[references/graph-profile.md](references/graph-profile.md) when running
as a mounted node capability; the standalone pipeline above does not
apply there.
