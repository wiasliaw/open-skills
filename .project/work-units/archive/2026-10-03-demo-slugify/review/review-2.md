# Review 2: T-1 (demo/slugify)

> Orchestrator note (deviation): installed v0.1.0 reviewer lacks the Write
> tool; report returned in-reply and persisted verbatim by the orchestrator.

**Verdict: PASS**

Correctness: pipeline matches the spec's five steps (validate/normalize/
strip/collapse/trim; separator ^[-_.~]*$ else TypeError). All review-1
defect spot-checks pass (foo-bar, idempotence, a -!- b, a.!.b sep ".",
Top 10 Tips, invalid separators throw). Fuzz beyond the brief: 200,000
random inputs x separators {- _ . ~ '' -- -_ .- ~~}: 0 non-idempotent.

Test adequacy: 17 tests quoting AC1-AC14, incl. both mandatory examples
with second-pass checks and AC13 charset under default/./_.

Contract compliance: worktree status exactly `?? demo/` (three files),
HEAD bf849d7, const/let only, named export, built-ins only; README still
pre-T-2 (its grep chain exits 1, as expected).

Verification: demo suite 17/17; scripts suite 92/92; spot checks ok.

**Result: pass.** T-1 verified; T-2 remains open.
