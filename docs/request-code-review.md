# request-code-review

Ask for a code review of your current changes. Every review runs a
multi-agent pipeline: three reviewers with different lenses read the
change in parallel, their findings are deduplicated and adversarially
verified, and you get one synthesized report.

## Usage

```
/open-skills:request-code-review
/open-skills:request-code-review src/auth.ts
/open-skills:request-code-review HEAD~3..HEAD watch the concurrency
```

No arguments are required. The scope is auto-detected, in this order:

1. An explicit scope you passed — commit range, files, or PR number.
2. Uncommitted changes, if any.
3. Your branch against its merge base with the default branch.
4. Otherwise, the last commit.

The resolved scope is stated in one sentence before the review starts,
so a wrong guess costs you one glance, not a whole review. Extra words
in the invocation ("watch the concurrency") become a focus appended to
all three reviewers.

## What the pipeline does

| Stage | What happens |
| -- | -- |
| Review | Three fresh-context subagents review the full scope in parallel, each through one lens: defects, structure, intent & behavior. |
| Dedup | Findings pointing at the same code or root cause are merged; agreement across lenses is noted as a credibility signal. |
| Verify | Each Critical finding faces two independent verifiers and is dropped only if both refute it. Structural findings face one verifier. Minor findings pass through unverified, labeled as such. |
| Synthesize | One report, assembled by the main agent — no extra relay layer. |

## The report

- It opens with a **design verdict**: whether the overall approach is
  sound. If the three reviewers disagree, the disagreement is the
  headline rather than averaged away.
- Findings follow in severity order: **Critical** (bugs, security,
  broken behavior — each with a concrete failure scenario),
  **Structural** (a restructuring that meaningfully simplifies the
  implementation, described concretely enough to execute), **Minor**.
- It closes with accounting: how many findings were merged in dedup and
  how many were refuted and dropped.

Reviewers are prohibited from praise, hedging, and padding. An empty
review must say what was searched for.

## Cost

Expect 5–10 subagents per review (three reviewers plus verifiers) and
two waves of wall-clock time. This is deliberate — the pipeline is the
only mode, including for small diffs.

## Requirements

`git`. In a non-git directory the skill asks which files to review and
reviews them whole instead of a diff.
