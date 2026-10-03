# Review report: spec node, in-node review pass (spec/review-1.md)

> Orchestrator note (deviation): installed v0.1.0 reviewer lacks the Write
> tool; report returned in-reply and persisted verbatim by the orchestrator.

**Verdict: FAIL**

## Correctness: fail

Structure, pinned behavior (hyphen rule), scope, and testability largely hold;
the idempotence guarantee (rule 7) is NOT implied by the spec's own rules.
Literal prototype of the rules (collapse -> strip -> trim, the spec's order):

| Input | Options | Pass 1 | Pass 2 | Result |
|---|---|---|---|---|
| `a -!- b` | default | `a--b` | `a-b` | not idempotent |
| `a.!.b` | `{separator:'.'}` | `a..b` | `a.b` | not idempotent |
| `a b` | `{separator:'é'}` | `aéb` | `aeb` | not idempotent |

Cause 1: step 3 collapses boundary runs, step 4 then strips characters sitting
BETWEEN two runs, leaving adjacent separators a second pass would merge. The
mandatory examples (AC11/AC12) never place a stripped character between two
separator runs, so the tests would pass while the bug stays. Cause 2: rule 7's
carve-out ("no ASCII alphanumerics") still admits separators (é, !) that other
rules strip or normalize. AC13's charset check also lacks a custom-separator
variant.

## Contract compliance: pass

Only spec/spec.md added; main checkout status shows just the two untracked
dirs; HEAD bf849d7; worktree still exactly `?? demo/`.

## Failures

1. **Idempotence vs rule order.** FIX: strip first (everything that is neither
   alphanumeric, whitespace, `_`, `-`, nor the separator), THEN collapse runs
   of boundary characters to one separator, then trim; add `a -!- b` and
   `a.!.b` (separator `.`) as mandatory examples.
2. **Custom separator charset.** FIX: restrict separators to printable ASCII,
   non-alphanumeric, not stripped by the strip step; define violator behavior
   (TypeError) and exempt separator characters from stripping; add the AC13
   charset variant for custom separators.
3. **Verification command wording.** FIX: name the exact command for the
   92/92 suite: `node --test "scripts/"*.test.mjs` from the repo root.
