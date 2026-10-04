# request-code-review

Commission an independent code review. The skill packages your work
into a request that carries its own contract, has fresh-context
reviewers verify it without trusting the author, and returns an
explicit pass or fail verdict with evidence.

## When to use

- You finished a feature and want it reviewed before merging.
- You want a second opinion that does not rely on your own claims that
  "the tests pass".
- A graph node mounts it as its reviewer capability (see the graph
  profile below).

## Usage

```
/open-skills:request-code-review
/open-skills:request-code-review src/auth.ts
/open-skills:request-code-review HEAD~3..HEAD watch the concurrency
```

The scope is auto-detected: an explicit scope you pass, else
uncommitted changes, else your branch against its merge base, else the
last commit. The resolved scope is stated before the review starts.
Extra words become a focus appended to all three reviewers.

## The request carries the contract

Every request includes four things, so the reviewer never needs the
author's word:

| Part | Meaning |
| -- | -- |
| Scope | What is under review. |
| Verification commands | The declared commands (tests, linters, validators). |
| Restrictions | What the author was forbidden to touch or do. |
| Acceptance criteria | The intent and the conditions for "done". |

If the project declares no verification commands, the skill asks you
rather than inventing them.

## How the review runs

1. Three reviewers run in parallel, each through one lens: defects,
   structure, intent and behavior.
2. Each reviewer runs every declared verification command itself and
   checks restriction compliance. A violation fails the review even if
   every command passes.
3. Findings are deduplicated, then adversarially verified: Critical
   findings face two verifiers, Structural one, Minor none (labeled
   unverified).
4. One report is synthesized.

Expect 5-10 subagents per review.

## The verdict

An explicit pass or fail, scored per dimension, with evidence a third
party can resolve (file:line, command output). Every failure states
WHAT is wrong, WHY it fails the contract, and FIX guidance concrete
enough to act on. The report opens with a design verdict and closes
with accounting of merged and refuted findings.

## Graph profile

When mounted on a graph node, the request half is the orchestrator's
dispatch (scope, commands, restrictions, and criteria come from the
node's declaration). The dispatched reviewer actor then:

- runs every declared command itself and checks restrictions;
- writes exactly one `review-<n>.md` into the stage directory, its only
  write;
- reports a verdict. Only a pass releases a routable outcome for the
  node's edges; a failure feeds the failure counters and the in-place
  retry or escalation. On a standalone validator node, the verdict
  itself is the routable outcome.

Routing stays with the orchestrator.

## Requirements

`git`. Without a git repository the skill asks which files to review
and reviews them whole.
