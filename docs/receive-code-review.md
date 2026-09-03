# receive-code-review

Hand over review feedback you received — from a colleague, a PR/MR
thread, or another AI — and get it processed with verification first:
every comment is checked against the actual code before anything is
implemented.

## Usage

```
/open-skills:receive-code-review #91
/open-skills:receive-code-review !91
/open-skills:receive-code-review https://github.com/you/repo/pull/91
/open-skills:receive-code-review        (then paste the review text)
```

A bare number, `#91`, `!91`, or a URL means the pull/merge request of
the current repo. The forge is detected from the git remote:

- GitHub — comments fetched via `gh`, including inline review comments
  with file/line anchors.
- GitLab (gitlab.com or self-hosted) — fetched via `glab`.
- Anything else, or the matching CLI is missing or unauthenticated —
  you are told what is missing and asked to paste the review text.

The original comments are always preferred over a summary of them.

## What happens

1. **Read everything first.** Each item is restated as a technical
   requirement. If any item is unclear, nothing gets implemented until
   it is resolved — review items often depend on each other. Questions
   to you are intent questions only; technical decisions are made and
   justified, not delegated back to you.
2. **Verify each item** against the code: is it correct for this
   codebase, would the fix break existing behavior, is there a reason
   things are the way they are, does it violate YAGNI.
3. **Triage, shown before any edit:**
   - **Accept** — verified correct; will be fixed.
   - **Rebut** — verified wrong; you get a rebuttal draft with
     file:line evidence, ready to post.
   - **Unclear** — blocks all implementation until answered.
4. **Implement** accepted items one at a time — blocking issues first,
   then simple fixes, then complex changes — running the relevant
   tests after each.
5. **Respond.** Fixes are acknowledged as "Fixed. [what, where]" — no
   gratitude theater. Replies go into the inline comment thread they
   came from. If a comment patches a symptom whose root cause is
   structural, the response proposes the structural fix instead of the
   band-aid.

## Requirements

Optional: `gh` for GitHub, `glab` for GitLab. Without them the skill
still works from pasted review text.
