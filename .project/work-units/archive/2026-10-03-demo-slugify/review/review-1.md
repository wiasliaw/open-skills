# Review report: 2026-10-03-demo-slugify (review-1)

> Orchestrator note (deviation): installed v0.1.0 reviewer lacks the Write
> tool; report returned in-reply and persisted verbatim by the orchestrator.

**Verdict: FAIL**

## Correctness: fail

Spot checks run directly with `node -e`:

| Input | Output | Assessment |
|---|---|---|
| `slugify('Crème Brûlée')` | `creme-brulee` | ok |
| `slugify('  Hello_World  foo ')` | `hello-world-foo` | ok |
| `slugify('a b', {separator:'_'})` | `a_b` | ok |
| `slugify('Ünï  cödé', {separator:'.'})` | `uni.code` | ok |
| `slugify('!!!')` | `''` | ok |
| `slugify(1)`, `null`, `undefined`, `{}` | all throw `TypeError` | ok |
| `slugify('a-b')` | `ab` | defect |
| `slugify('foo-bar')` | `foobar` | defect |
| `slugify('well-known state-of-the-art')` | `wellknown-stateoftheart` | defect |
| `slugify(slugify('Hello, World!'))` | `helloworld` | defect, not idempotent |
| `slugify('--A!!B--')` | `ab` | defect |

Hyphens in the input are not treated as separators: the `[^a-z0-9 ]` strip
deletes them, gluing adjacent words together, and slugify does not preserve its
own output. findings.md lists idempotence in the proposed suite and specifies
that runs of non-alphanumerics become a single separator; by that rule `a!b`
is `a-b`, not `ab`. The suite has no idempotence or digits test — exactly the
cases that would have caught this.

The README states the run command and the graph-flow provenance: fine.

## Contract compliance: pass

`git status --porcelain` shows only `?? demo/`; HEAD bf849d7; demo/ holds
exactly the three contracted files. The `{ separator }` decision was recorded
and is acceptable. Minor style nit: `var` instead of `const`.

## Verification results (in order)

1. `node --test demo/slugify.test.mjs`: 7 pass, 0 fail.
2. `node --test scripts/*.test.mjs`: 92 pass, 0 fail.

Both pass; the failure is the behavioral defect the suite does not exercise.

## Failures

- **WHAT:** demo/slugify.mjs removes hyphens instead of treating them as
  separators (`foo-bar` → `foobar`); `slugify(slugify(x)) !== slugify(x)`;
  no idempotence or digits test in demo/slugify.test.mjs.
- **WHY:** findings.md requires non-alphanumeric runs to collapse to a single
  separator and lists idempotence among required tests; a slug function that
  merges hyphenated words and cannot preserve its own output is incorrect.
- **FIX:** map `[\s_-]+` to the separator boundary before stripping the
  remaining non-alphanumerics, then collapse/trim; add tests for `foo-bar`,
  idempotence, and digits (`Top 10 Tips` → `top-10-tips`); optionally
  `const` over `var`. Re-run `node --test demo/slugify.test.mjs`.
