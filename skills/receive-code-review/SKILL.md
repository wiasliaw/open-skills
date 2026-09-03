---
name: receive-code-review
description: Use when the user has review feedback from an external source — PR/MR comments, a colleague, another AI — and wants it handled, including direct invocations like "#91" meaning the pull/merge request of the current repo. Verifies each item against the code, fixes what holds up, rebuts what doesn't with evidence.
---

# Receive Code Review

Process external review feedback with technical rigor. Verify before
implementing; never implement to be agreeable.

## Step 1: Obtain the review

Accepted inputs, most direct first:

- `#91`, `!91`, a bare number, or a PR/MR URL — the review lives on a
  pull/merge request of the current repo. Resolve which forge from the
  remote (`git remote get-url origin`), never by assuming GitHub:
  - GitHub remote — `gh pr view <n> --comments` for the discussion,
    and `gh api repos/{owner}/{repo}/pulls/<n>/comments` for inline
    review comments with file/line anchors.
  - GitLab remote (gitlab.com or self-hosted) — `glab mr view <n>
    --comments` for the discussion (`--unresolved` skips
    already-resolved threads), and
    `glab api "projects/:fullpath/merge_requests/<n>/discussions"`
    for inline threads with file/line position anchors. Given a URL,
    extract the MR number yourself — `glab mr view` takes a number or
    branch name, not a URL.
  - Any other forge, or the matching CLI is missing or
    unauthenticated — say exactly what is missing and ask the user to
    paste the review text. Do not reconstruct it from the user's
    summary or from memory.
- Pasted text or a file path — use as given.
- Nothing provided — ask where the review is. Do not guess.

Always prefer the original comments over any summary of them.

## Step 2: Read and understand — all of it, before touching code

Restate each item as a technical requirement. If any item is unclear,
stop: review items often depend on each other, and implementing the half
you understood produces wrong fixes. Ask the user — but ask about intent
("does the reviewer mean the API must stay backward compatible?"), not
for technical decisions; those are yours to make and justify.

## Step 3: Verify each item against the code

For every item, check in the actual codebase:

- Is it technically correct here — this stack, this version, this
  codebase?
- Would the suggested change break existing behavior or tests?
- Is there a reason the current implementation is the way it is?
- YAGNI: if the item asks for a "proper" or more general implementation,
  search for actual callers. Unused generality is a cost, not a fix.
- Is the reviewer missing context that changes the conclusion?

## Step 4: Triage

Sort every item into exactly one bucket and show the user the triage
before implementing anything:

- **Accept** — verified correct. Will fix.
- **Rebut** — verified wrong. State why with file:line references,
  passing tests, or a concrete counter-scenario. Technical reasoning
  only; no defensiveness.
- **Unclear** — blocks implementation of everything until resolved
  (Step 2).

If an accepted item patches a symptom whose root cause is structural,
say so and propose the structural fix instead of applying the band-aid —
and explain why in the response to the reviewer.

## Step 5: Implement accepted items

In order: blocking issues (breakage, security) → simple fixes → complex
changes. One item at a time; run the relevant tests after each. No batch
fixes with a single test run at the end.

## Step 6: Respond

- Valid feedback: "Fixed. [what changed, where]." The corrected code is
  the acknowledgment — no "great catch", no gratitude theater.
- Rebuttals: technical reasoning with specific references.
- If your own rebuttal turns out wrong: "You were right — verified [X],
  it does [Y]. Fixed." State facts, skip the apology essay.
- On GitHub or GitLab, reply in the inline comment thread the item
  came from, not as a new top-level comment. On GitLab:
  `glab mr note create <n> --reply <discussion-id>` — experimental
  command; if it is gone, POST via `glab api` to
  `projects/:fullpath/merge_requests/<n>/discussions/<id>/notes`.

## Prohibitions

- No performative agreement ("You're absolutely right!").
- No implementation before verification.
- No implementing while any item is still unclear.
