## 1. init.mjs — config schema

- [x] 1.1 Drop `strategy` from the `vcs` key whitelist and its required-string check (init.mjs:84-85); unknown-key rejection then names `strategy` on legacy configs
- [x] 1.2 Replace `checkRelPath` on budget keys (init.mjs:123) with a bare-file-name check (no path separators), message mirroring memory.mjs: `memory.budgets key must be a bare file name`
- [x] 1.3 Update init.mjs header comment (schema overview) for both changes

## 2. worktree.mjs — drop base_ref

- [x] 2.1 Remove the `vcs.base_ref` branch (worktree.mjs:296 and the header mention at line 15); base ref comes from `vcs.default_branch` only
- [x] 2.2 Remove the `base_ref` case from worktree.test.mjs (line 109 area)

## 3. Tests

- [x] 3.1 Update init.test.mjs fixtures: drop `strategy` from valid configs; add a rejection case for a config carrying `strategy`; add a rejection case for a budget key containing `/`
- [x] 3.2 Run `node --test scripts/*.test.mjs` green

## 4. Docs and skill references

- [x] 4.1 bootstrap.md: sections table (`vcs` row loses strategy; memory row states bare-name rule), interview prompts (drop strategy question, budgets asked as bare names), example draft updated; add the skeleton-creation step after the config write (create missing `.harness/<doc>` with a one-line heading, never overwrite)
- [x] 4.2 docs/file-formats.md: config example and prose — remove `vcs.strategy`, state the bare-name budget-key rule
- [x] 4.3 graph-build SKILL.md Tier 1: mention skeleton creation as part of bootstrap output

## 5. Fixtures

- [x] 5.1 demo/.harness/config.json: re-draft without `vcs.strategy` and write through `init.mjs write --root demo`; create skeleton `.harness/ARCHITECTURE.md` and `.harness/CONSTRAINTS.md` in demo
- [x] 5.2 Verify `node scripts/init.mjs validate` accepts the demo config and `node scripts/memory.mjs validate --root demo` passes
