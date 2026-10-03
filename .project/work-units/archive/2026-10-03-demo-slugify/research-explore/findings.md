# Findings: demo/ slugify worked example

## What was read
- /Users/wiasliaw/Github/claude/open-skills/CLAUDE.md, README.md (Skills table, graph-flow entry)
- Repo layout: top-level `scripts/` (init, work-unit, worktree + `shared/`), `skills/`, `openspec/`, `.harness/` (only config.json, worktree-setup.json)
- scripts/worktree.test.mjs and scripts/worktree.mjs headers; .harness/config.json
- Ran `node --test "scripts/*.test.mjs"`: 92 pass, 0 fail (Node v24.12.0)

## Drift noted (not acted on)
- Root CLAUDE.md matches the repo (top-level `scripts/`, `skills/graph-flow`, generic `agents/` actors, verify `node --test "scripts/*.test.mjs"`); no CLAUDE.md drift found. `harness-flow` appears only as the retired loop in its history note.
- A `demo/` folder does not exist yet and is not in CLAUDE.md's layout tree.
- The scripts/*.test.mjs glob does not reach demo/, so demo tests need their own command.

## Conventions a demo/ module must follow
- ESM `.mjs`, no package.json, zero dependencies (Node built-ins only), Node >= 20.
- Tests: `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`; header comment states how to run (existing style: "Run with: node --test ...").
- Test file sits beside the module and imports it via relative path (`./slugify.mjs`).
- English-only content and comments; UTF-8.
- Header comment on module describing purpose/usage, like scripts/worktree.mjs.

## Proposed file list
1. demo/slugify.mjs - named export `slugify(input, options?)`. Lowercase; NFKD-normalize and strip combining marks; replace runs of non-[a-z0-9] with a single `-`; trim leading/trailing `-`; non-string input throws TypeError; empty result returns ''. Optional `options.separator` is NOT required; keep the API to a single argument unless the spec says otherwise.
2. demo/slugify.test.mjs - node:test suite: basic phrase, case folding, punctuation/whitespace runs, diacritics ("Crème Brûlée" -> "creme-brulee"), leading/trailing separators, empty/symbol-only input -> '', digits preserved, non-string -> TypeError, idempotence.
3. demo/README.md - short: what the folder is, that it was produced via the graph-flow loop (research-explore -> spec/build -> review), how to run tests.

## Verification command
`node --test demo/slugify.test.mjs` (run from /Users/wiasliaw/Github/claude/open-skills; must exit 0). Optional regression: `node --test "scripts/*.test.mjs"` should still be 92 pass.

## Grading proposal
**trivial**

Rationale: three new, self-contained files in a new directory; no existing code, skill, spec, or harness file is modified; no public interface of the plugin is affected; behavior is a well-known pure function whose acceptable semantics are fully stated above. No existing spec covers it (so "small" does not fit) and the work is too small and low-risk to justify a new spec ("full" is overkill). It is not a no-op: demo/ does not exist. Fast path straight to build is appropriate.
