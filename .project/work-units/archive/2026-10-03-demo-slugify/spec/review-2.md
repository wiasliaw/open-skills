# Review 2: spec/spec.md (revised)

> Orchestrator note (deviation): installed v0.1.0 reviewer lacks the Write
> tool; report returned in-reply and persisted verbatim by the orchestrator.

**Verdict: PASS**

## Correctness
1. Rule order fixed (validate -> normalize -> strip -> collapse -> trim).
   Prototype of the literal wording: `a -!- b` -> `a-b` (fixed point);
   `a.!.b` sep "." -> `a.b` (fixed point); `Hello, World!` -> `hello-world`;
   `x  y` sep "--" -> `x--y` (fixed point). Brute-force idempotence sweep:
   20 inputs x 8 separators (default, ., _, --, '', ~, -., ._) = 0
   non-idempotent cases.
2. Separator charset fixed: `^[-_.~]*$`, empty allowed, TypeError otherwise;
   separator chars exempt from strip; AC13 charset checks (default, ., _);
   AC14 invalid-separator TypeError cases.
3. Suite command fixed: `node --test "scripts/"*.test.mjs` from repo root,
   run by this reviewer: 92 pass / 0 fail.
4. Previously-passing content intact: structure; hyphens never stripped;
   scope exactly three demo/ files; mandatory tests AC2/AC7/AC11/AC12/AC14
   plus both counterexamples.

## Contract compliance: pass
Only spec.md revised; main checkout shows only the two untracked dirs;
HEAD bf849d7; worktree exactly `?? demo/`.

## Verification results
Prototype + sweep (0 failures); charset ACs present; 92/92 suite pass.

Minor, non-blocking: trimming of a multi-character separator is unstated,
but collapse guarantees at most one occurrence per edge, so outputs are
unaffected.

**Verdict: pass.**
