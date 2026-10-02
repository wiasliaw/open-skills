## 1. Break the bootstrapping loop (commit 1, first)

- [ ] 1.1 Remove the `open-skills:harness-flow` load directive (line 1 block) and the entire `## Harness` section from root `CLAUDE.md`
- [ ] 1.2 Inline constraints C-001 (all shipped content in English) and C-002 (docs/ and README stay in sync with skills) as short rules in `CLAUDE.md`

## 2. Delete harness surfaces (commit 1)

- [ ] 2.1 Delete `skills/harness-flow/` (SKILL.md + templates/WORK-UNIT.md.template)
- [ ] 2.2 Delete `skills/handoff/` (SKILL.md + templates/handoff.md.template)
- [ ] 2.3 Delete `docs/harness.md`
- [ ] 2.4 Delete `.harness/` entirely (4 index files, `decisions/` incl. archive, `features/`)
- [ ] 2.5 Remove harness-flow/handoff rows and `docs/harness.md` links from `README.md`; remove the harness-flow orchestrator cross-reference from `docs/use-worktree.md` if it dangles
- [ ] 2.6 Update the `## Repo Structure` tree in `CLAUDE.md` (drop deleted dirs; keep agents/, use-worktree, init as-is per the dangling-references decision)
- [ ] 2.7 Run `claude plugin validate .` — green

## 3. Relocate scripts (commit 2)

- [ ] 3.1 `git mv skills/use-worktree/scripts/worktree.mjs scripts/worktree.mjs` and same for `worktree.test.mjs`; remove the empty `skills/use-worktree/scripts/`
- [ ] 3.2 Update `scripts/worktree.test.mjs`: header run instructions and the read-only-plugin-dir test's hardcoded `skills/use-worktree/scripts` layout → `scripts/`
- [ ] 3.3 Update `skills/use-worktree/SKILL.md`: `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs` resolution and the stable-path-contract sentence (now `scripts/`)
- [ ] 3.4 Update `skills/codewalk/SKILL.md` detach-mode script path
- [ ] 3.5 Update `docs/use-worktree.md` script path references
- [ ] 3.6 Update `CLAUDE.md`: repo tree gains top-level `scripts/`; Workflow verify command becomes `node --test "scripts/*.test.mjs"`
- [ ] 3.7 Update `README.md` if it references the old script path

## 4. Verify

- [ ] 4.1 `claude plugin validate .` — green
- [ ] 4.2 `node --test "scripts/*.test.mjs"` — all tests pass
- [ ] 4.3 `grep -rn "use-worktree/scripts" --include="*.md" --include="*.mjs" . | grep -v openspec/ | grep -v .git/` returns nothing (openspec/ history exempt)
- [ ] 4.4 Confirm remaining harness-flow references match exactly the proposal's known-dangling list (agents/*.md, skills/use-worktree/SKILL.md policy wording, skills/init/SKILL.md + templates/CLAUDE.md.template)
