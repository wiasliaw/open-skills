# Spec: demo/ slugify worked example

Supersedes the trivial-path research proposal where they differ (notably the
`{ separator }` option, now required). Revised after review-1 FAIL (rule order, separator charset, suite command).

## Goals

- Provide a zero-dependency ESM `slugify(input, options?)` as a graph-flow worked example.
- Make the review-1 defect impossible to recur: hyphens are separators (not stripped), and the function is idempotent.
- Ship a test suite that exercises exactly the cases review-1 found missing (hyphens, idempotence, digits).

## Scope

Exactly three new files in the worktree; no existing file is touched:

1. `demo/slugify.mjs` - named export `slugify`; header comment on purpose/usage; Node built-ins only; `const`/`let` (no `var`).
2. `demo/slugify.test.mjs` - `node:test` + `node:assert/strict`, imports `./slugify.mjs`, header states how to run.
3. `demo/README.md` - what the folder is, graph-flow provenance (research-explore -> spec -> build -> review), run command.

Out of scope: CLAUDE.md layout tree, scripts/, skills/, .harness/, package.json, any other file.

### Behavior (normative)

`slugify(input, { separator = '-' } = {})`, applied in this order:

1. Validation. `input` not a string -> throw `TypeError`. `separator` not a string -> throw `TypeError`. `separator` MUST match `^[-_.~]*$` (every character one of `-`, `_`, `.`, `~`; empty string allowed and valid); any other string (e.g. `é`, `!`, `a`, a space) -> throw `TypeError`.
2. Normalize: NFKD-normalize, drop combining marks (U+0300-U+036F), lowercase.
3. STRIP first: remove every character that is none of ASCII `[a-z0-9]`, whitespace (JS `\s`), `_`, `-`, or a character occurring in `separator`. Stripped characters insert nothing (`a!b` -> `ab`). Separator characters are explicitly exempt from stripping.
4. THEN collapse: every maximal run of boundary characters (whitespace, `_`, `-`, or any character occurring in `separator`) is replaced by exactly one `separator` (for `''` the run vanishes). Hyphens are NEVER stripped. Because stripping precedes collapsing, a stripped character between two boundary runs merges them (`a -!- b` -> `a-b`, `a.!.b` with separator `.` -> `a.b`).
5. THEN trim: remove a leading and a trailing separator. Empty or symbol-only result -> `''`.
6. Digits are preserved.
7. Output charset: result contains only `[a-z0-9]` and characters occurring in `separator`; for the default separator it matches `^[a-z0-9-]*$`.
8. Idempotence: `slugify(slugify(x, o), o) === slugify(x, o)` for all string `x`, default separator and every valid custom separator (including `''`). Holds because step 3 runs before step 4 and the validated separator charset is never altered by steps 2-3.

## Acceptance criteria

Each criterion maps to at least one test in `demo/slugify.test.mjs` (test name should quote the ID).

| ID | Criterion | Example |
|---|---|---|
| AC1 | Basic phrase, lowercased | `Hello World` -> `hello-world` |
| AC2 | Hyphenated input: hyphen is a separator, words not glued | `foo-bar` -> `foo-bar`; `well-known state-of-the-art` -> `well-known-state-of-the-art` |
| AC3 | Whitespace, `_`, `-` mixed runs collapse to one separator | `a _- b` -> `a-b`; `  Hello_World  foo ` -> `hello-world-foo` |
| AC4 | Other non-alphanumerics stripped | `Hello, World!` -> `hello-world`; `a!b` -> `ab` |
| AC5 | Leading/trailing separators trimmed | `--A!!B--` -> `ab`; `  x  ` -> `x` |
| AC6 | Diacritics folded to ASCII | `Crème Brûlée` -> `creme-brulee` |
| AC7 | Digits preserved | `Top 10 Tips` -> `top-10-tips` |
| AC8 | Empty / symbol-only -> `''` | `''`, `'!!!'` -> `''` |
| AC9 | Non-string input throws TypeError | `1`, `null`, `undefined`, `{}`; also non-string `separator` |
| AC10 | Custom separator, including empty | `a b` + `_` -> `a_b`; `Ünï  cödé` + `.` -> `uni.code`; `a b` + `''` -> `ab` |
| AC14 | Invalid separator throws TypeError | `{separator:'é'}`, `'!'`, `'a'`, `' '` |
| AC11 | Idempotence, default separator | for inputs of AC1-AC8 incl. `Hello, World!`, `--A!!B--`, `foo-bar`; MANDATORY: `a -!- b` -> `a-b` (and its second pass is `a-b`) |
| AC12 | Idempotence, custom separators (`_`, `.`, `--`, `''`) | `slugify(slugify('Hello, World!', {separator:'.'}), {separator:'.'})` === `hello.world`; MANDATORY: `a.!.b` with separator `.` -> `a.b` (second pass `a.b`) |
| AC13 | Output charset: default separator -> `^[a-z0-9-]*$`; custom separator `.` -> `^[a-z0-9.]*$`, `_` -> `^[a-z0-9_]*$` | all AC inputs, run under default, `.`, and `_` |

The suite MUST contain at least one test each for AC2, AC7, AC11, AC12, AC14 (the review-1 gaps), and the two mandatory examples `a -!- b` and `a.!.b` (separator `.`).

### Verification (in order)

1. `node --test demo/slugify.test.mjs` exits 0, 0 failures (run from repo root).
2. `node --test "scripts/"*.test.mjs` (run from the repo root) remains 92 pass, 0 fail (92/92).
3. `git status --porcelain` shows only `?? demo/` containing exactly the three files.
