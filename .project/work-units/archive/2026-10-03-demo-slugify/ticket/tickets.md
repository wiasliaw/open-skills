# Tickets: 2026-10-03-demo-slugify

Source: spec/spec.md (AC1-AC14), review/review-1.md. Build REVISES the three existing
worktree files (`demo/slugify.mjs`, `demo/slugify.test.mjs`, `demo/README.md`); it does not
start over. All commands run from the worktree root.

Spec check: no contradiction found. Rule order (validate -> normalize -> strip -> collapse -> trim)
is consistent with the idempotence claim, including multi-character and mixed separators
(`--`, `-_`, `''`).

Spec-level gates (Build-wide, not tickets; run after T-2):
`node --test "scripts/"*.test.mjs` stays 92/92; `git status --porcelain` shows only `?? demo/`
holding exactly the three files.

## T-1: Revise slugify.mjs and its test suite to AC1-AC14

- description: Work test-first inside the ticket. (a) Rewrite `demo/slugify.test.mjs` first so it
  covers every AC1-AC14 (test names quote the ID), including the required review-1 gap tests for
  AC2, AC7, AC11, AC12, AC14 and the mandatory examples `a -!- b` -> `a-b` and `a.!.b` with
  separator `.` -> `a.b` (second pass identical); AC13 charset checks run under default, `.`, `_`.
  Confirm the suite is RED against the current `slugify.mjs` (hyphen stripping, non-idempotent).
  (b) Revise `demo/slugify.mjs` to the normative order: validate (TypeError for non-string input,
  non-string separator, separator not matching `^[-_.~]*$`); NFKD + drop U+0300-U+036F + lowercase;
  STRIP everything except `[a-z0-9]`, `\s`, `_`, `-`, separator chars; THEN collapse each boundary
  run to one `separator`; THEN trim leading/trailing separator. Use `const`/`let`, no `var`; keep
  header comment, named export `slugify`, Node built-ins only. Touch only these two files.
- verification_command: `node --test demo/slugify.test.mjs`
- done when: exits 0 with 0 failures, and the suite contains tests for all of AC1-AC14 (it was
  red against the pre-revision `slugify.mjs`).

## T-2: Update demo/README.md for new behavior and provenance

- description: Revise `demo/README.md`: describe hyphen/whitespace/underscore runs as separators
  (hyphens never stripped), idempotence, the validated `{ separator }` option (charset
  `-_.~`, empty allowed, invalid -> TypeError); keep the run command
  `node --test demo/slugify.test.mjs`; replace the provenance line with the graph-flow chain
  research-explore -> spec -> build -> review. No other file touched.
- verification_command: `grep -q 'node --test demo/slugify.test.mjs' demo/README.md && grep -q 'research-explore' demo/README.md && grep -q 'spec' demo/README.md && grep -q 'build' demo/README.md && grep -q 'review' demo/README.md && grep -qi 'idempotent' demo/README.md`
- done when: exits 0 (fails now: README lacks `research-explore` and `idempotent`).

Next ticket: T-1
