---
name: request-code-review
description: Use when the user asks for a code review, after completing a feature, or before merging — determines the review scope, dispatches three lens reviewers in parallel, adversarially verifies their findings, and reports a synthesized, severity-ranked review with a design verdict.
---

# Request Code Review

Every review runs the full pipeline: three lens reviewers in parallel
→ dedup → adversarial verification → synthesis. The reviewers run in
fresh contexts so they carry none of the implementer's assumptions;
the verification wave exists because the characteristic failure of an
LLM reviewer is a confident, plausible, wrong finding. Expect 5–10
subagents per review.

## Step 1: Determine scope

Resolve what to review, in this order:

1. The user gave an explicit scope (commit range, files, PR number) —
   use it.
2. The working tree has uncommitted changes — review those
   (`git diff HEAD`).
3. Clean tree on a feature branch — review the branch against its
   merge base:
   `git diff $(git merge-base <default-branch> HEAD)...HEAD`.
4. Clean tree on the default branch — review the last commit.

If the directory is not a git repository or `git` is unavailable, the
detection above is impossible — do not fake it. Ask the user which
files or directories to review, and review those files whole instead
of a diff.

State the resolved scope in one sentence before dispatching (e.g.
"Reviewing 3 uncommitted files" / "Reviewing feature-x against main,
5 commits"). A review of the wrong scope is worthless; this sentence
is cheap insurance.

## Step 2: Gather intent

The reviewers need to know what the change is supposed to do. Take it
from the conversation if the work happened in this session; otherwise
derive it from commit messages; if neither is informative, ask the
user one short question. Do not dispatch reviewers with no statement
of intent.

## Step 3: Dispatch the lens reviewers

Dispatch three general-purpose subagents in a single message so they
run concurrently. Each uses the reviewer template in
[reviewer-prompt.md](reviewer-prompt.md) with the same substitutions:

- `{DESCRIPTION}` — the statement of intent from Step 2: what the
  change is supposed to do and why
- `{SCOPE}` — the exact diff command or file list from Step 1

Each reviewer's "How to review" section is replaced by one of the
three lens texts defined in the same file: defects, structure, intent
and behavior. Keep the report format and prohibitions sections
unchanged — every reviewer still opens with a design verdict.

If the user named a specific focus ("watch the concurrency"), append
it to all three lenses; do not replace a lens with it.

## Step 4: Dedup, then verify adversarially

Merge findings that point at the same file:line or share a root cause.
A finding reported by more than one lens is a credibility signal —
note the agreement on the merged finding.

Then dispatch verifier subagents using the verifier template in
[reviewer-prompt.md](reviewer-prompt.md):

- **Critical** — two independent verifiers. Drop the finding only if
  both refute it. A wrongly dropped Critical is a missed bug; the
  asymmetry justifies the cost.
- **Structural** — one verifier. Drop if refuted.
- **Minor** — not verified; label "unverified" in the final report.

If this would take more than ~10 verifier dispatches, give each
verifier a batch of related findings instead of one each — coverage
matters more than one-agent-per-finding purity.

## Step 5: Synthesize and relay

Assemble the single report yourself — you hold all the material, and
another relay layer only loses information. Present it unsoftened:

- Open with the design verdicts. If the three reviewers agree, merge
  into one verdict. If they disagree, the disagreement is the
  headline — do not average it away.
- Then confirmed findings in severity order; Minor findings labeled
  unverified.
- Close with one line of accounting: how many findings were merged in
  dedup, how many were dropped as refuted. A silently cleaned report
  looks more finished than it is.
- Do not delete or downgrade findings you disagree with. If you
  believe a surviving finding is wrong, say so alongside it — with
  file:line evidence, not opinion.

## Step 6: Act on findings

- **Critical** — fix before anything else.
- **Structural** — present the restructuring path to the user; these
  touch a lot of code, so confirm before executing.
- **Minor** — fix if trivial, otherwise list them for later.
