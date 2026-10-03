# Review 1: research-explore (2026-10-03-demo-slugify)

## Verdict: FAIL

## Correctness
- FAIL. findings.md "Drift noted" (line 10) claims root CLAUDE.md "still describes skills/use-worktree/scripts/, agents/, docs/harness.md, harness-flow". Checked the on-disk /Users/wiasliaw/Github/claude/open-skills/CLAUDE.md: `grep` for `use-worktree/scripts` and `docs/harness.md` returns nothing; the tree lists `agents/` (generic graph actors), `graph-flow` skill/doc, and a top-level `scripts/` (line 42); verify row (line 71) is `node --test "scripts/*.test.mjs"`. `harness-flow` appears only on line 80 as the retired loop, retrievable from git history. The file is not stale; the claim is fabricated or based on the injected older context. `agents/` also exists on disk, so listing it as drift is wrong too.
- Other facts verified: top-level scripts/ exists (init, work-unit, worktree, shared); skills/graph-flow exists; .harness/ contains only config.json and worktree-setup.json; config.json verify command is `node --test scripts/*.test.mjs`; baseline 92 pass claim is true.

## Contract compliance
- Acceptance criteria: findings.md exists in the stage dir (met); concrete paths (met: demo/slugify.mjs, demo/slugify.test.mjs, demo/README.md); runnable verification command `node --test demo/slugify.test.mjs` (met); ends with exactly one grading, "trivial" (met, though the section ends with a rationale paragraph; the single grading is unambiguous).
- Restrictions: no demo/ dir exists; `git status --porcelain` shows only `?? .harness/` and `?? .project/work-units/2026-10-03-demo-slugify/`; git log head unchanged (bf849d7). No restriction violated (state.json/log.ndjson/.harness contents not shown modified; .harness is untracked pre-existing config).

## Verification results
1. Acceptance criteria check: met, see above.
2. `node --test "scripts/"*.test.mjs`: tests 92, pass 92, fail 0.

## Failures
- WHAT: findings.md line 10 states root CLAUDE.md is stale (lists harness-flow, skills/use-worktree/scripts/, agents/, docs/harness.md).
- WHY: The actual CLAUDE.md already reflects the graph-flow layout and top-level scripts/; the dispatch explicitly makes a false staleness claim a correctness defect.
- FIX: Remove or rewrite the drift bullet to say CLAUDE.md matches the repo (top-level scripts/, skills/graph-flow, agents/ generic actors, verify `node --test "scripts/*.test.mjs"`). Optionally keep the valid note that demo/ is not in the layout tree and that the scripts glob does not cover demo/. The grading and rest can stay.
