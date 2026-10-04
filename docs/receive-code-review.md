# receive-code-review

Hand over review feedback you received, from a colleague, a PR/MR thread, or
another AI, and have it digested with verification first. Every comment is
triaged against the code and the work's contract before anything changes.

## When to use

- You have PR/MR comments or pasted review text to act on.
- Review feedback arrives at a graph node (see the graph profile below).

For producing a review rather than receiving one, use `request-code-review`.

## Invocation

```
/open-skills:receive-code-review #91
/open-skills:receive-code-review !91
/open-skills:receive-code-review https://github.com/you/repo/pull/91
/open-skills:receive-code-review        (then paste the review text)
```

A bare number, `#91`, `!91`, or a URL means the pull/merge request of the
current repo. The forge is detected from the git remote: GitHub via `gh`,
GitLab (including self-hosted) via `glab`. If the CLI is missing or the forge
is unknown, you are told what is missing and asked to paste the text.

## What happens

1. Every item is restated as a technical requirement; none is dropped.
2. Each item gets exactly one verdict, with the reason recorded:
   - **adopt**: verified correct and consistent with the contract.
   - **decline**: verified wrong, or in conflict with the approved contract or a
     standing constraint (the conflict is named, or the item is escalated as a
     proposed contract change). Feedback never overrides the contract by itself.
   - **needs-clarification**: intent is unclear; you are asked about intent only.
3. Adopted items are folded in one at a time and verified like any other change.
4. Replies are posted per item: "Fixed. [what, where]" or a rebuttal with
   evidence, in the originating inline thread.

## Graph profile

When mounted on a graph node, the skill also writes the triage record into the
node's stage directory, and reports the outcome `feedback-digested` only when no
item remains at needs-clarification. Otherwise it reports blocked, and the
in-place fallback chain carries the question to you. The orchestrator routes by
the node's declared edges.

## Requirements

Optional: `gh` for GitHub, `glab` for GitLab. Without them the skill works from
pasted review text.
