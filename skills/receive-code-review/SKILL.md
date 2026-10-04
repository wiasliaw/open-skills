---
name: receive-code-review
description: Use when the user has review feedback from an external source — PR/MR comments, a colleague, another AI — and wants it handled, including direct invocations like "#91" meaning the pull/merge request of the current repo. Also mountable on a graph node where external feedback arrives. Triages every item to adopt, decline, or needs-clarification with recorded reasons, folds adopted items in with verification, and declines what conflicts with the contract.
---

# Receive Code Review

Digest external review feedback with technical rigor. Feedback is input, not
command: verify before changing anything, never adopt to be agreeable.

## Step 1: Obtain the review

Most direct source first; always prefer original comments over a summary.

- `#91`, `!91`, a bare number, or a PR/MR URL: the review lives on a
  pull/merge request of the current repo. Detect the forge from
  `git remote get-url origin`, never assume GitHub.
  - GitHub: `gh pr view <n> --comments`, and
    `gh api repos/{owner}/{repo}/pulls/<n>/comments` for inline comments.
  - GitLab (including self-hosted): `glab mr view <n> --comments`, and
    `glab api "projects/:fullpath/merge_requests/<n>/discussions"` for inline
    threads. `glab mr view` takes a number or branch, not a URL.
  - Any other forge, or the CLI is missing or unauthenticated: say exactly what
    is missing and ask the user to paste the review text. Never reconstruct it
    from memory or a summary.
- Pasted text or a file path: use as given.
- Nothing provided (and not mounted on a node): ask where the review is.

## Step 2: Restate every item

Restate each item as a technical requirement. Number them; none may be
dropped. Review items often depend on each other, so read all before acting.

## Step 3: Verify and triage

Check each item against the actual code, the work's contract (approved spec,
ticket, plan), and the project's standing constraints. Is it correct for this
stack and version? Would it break behavior or tests? Is there a reason the
current code is as it is? Is there a real caller (YAGNI)?

Assign exactly one verdict per item and record the reason:

- **adopt**: verified correct and consistent with the contract. Reason: the
  evidence.
- **decline**: verified wrong, or in conflict. State the reason with file:line
  references, a passing test, or a counter-scenario. If the item contradicts an
  approved contract or standing constraint, decline naming the conflict, or
  escalate it as a proposed contract change through the contract's own approval.
  Never apply it silently; feedback alone never overrides the contract.
- **needs-clarification**: intent is unclear. Ask about intent (for example,
  "must the API stay backward compatible?"), not for technical decisions, which
  are yours to make and justify.

Show the triage record to the user (or write it, see Graph profile) before
implementing. If an adopted item patches a symptom of a structural root cause,
say so and propose the structural fix.

## Step 4: Fold in adopted items

One item at a time, blocking issues first, then simple fixes, then complex
changes. After each, run the declared verification (the project's tests or the
node's verification commands). An adopted item with no corresponding change, or
a change that fails verification, is a triage error: fix it or re-triage.

Do not implement while a clarification item might change another item's fix.

## Step 5: Respond

- Adopted: "Fixed. [what changed, where]." No performative agreement.
- Declined: technical reasoning with specific references, no defensiveness.
- If a decline turns out wrong: "You were right, verified [X]. Fixed."
- On GitHub or GitLab, reply in the originating inline thread, not top-level.
  GitLab: `glab mr note create <n> --reply <discussion-id>` (experimental; else
  POST via `glab api` to `.../discussions/<id>/notes`).

## Graph profile (when mounted on a node)

In addition to the steps above:

- Write the triage record (every item, verdict, reason) as a file in the
  dispatched stage directory. Write your report there too; the orchestrator
  records only verdicts and file pointers.
- Report the outcome `feedback-digested` only when no item remains at
  needs-clarification. Otherwise report blocked with the unresolved questions,
  which engages the in-place fallback chain so the question reaches the human.
  Do not guess answers to unblock yourself.
- Do not choose the next node. The orchestrator routes by the node's declared
  edges.

## Prohibitions

- No silent dropping of items; no verdict without a recorded reason.
- No implementation before verification; no performative agreement.
- No applying an item that conflicts with the contract or a standing constraint.
- No reporting `feedback-digested` with any needs-clarification item open.
