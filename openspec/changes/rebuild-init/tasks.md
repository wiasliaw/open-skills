## 1. Prerequisite

- [ ] 1.1 Confirm `remove-harness-and-relocate-scripts` has merged (CLAUDE.md load directive gone, `.harness/` deleted, scripts under `scripts/`)

## 2. Rewrite the skill page

- [ ] 2.1 Rewrite `skills/init/SKILL.md`: six-step flow kept; interview narrowed to VCS / workflow / repo-structure+environment / worktree setup; legacy-migration sections removed
- [ ] 2.2 Add the tool-availability gate (run or dry-run every declared command; missing required tool → blocking report)
- [ ] 2.3 Add the worktree-setup topic: survey inference (install commands, untracked assets), `.worktreeinclude` translation rules, always-write semantics with empty lists
- [ ] 2.4 Specify update mode: strip stale load directive / Harness section with a report; no legacy-shape migrations

## 3. Templates

- [ ] 3.1 Rewrite `skills/init/templates/CLAUDE.md.template`: remove the load directive line and Harness section; keep structure/environment/VCS/workflow sections and the 50–200 line budget
- [ ] 3.2 Delete `ARCHITECTURE.md.template`, `CONSTRAINTS.md.template`, `DECISIONS.md.template`, `FEATURES.md.template`, `DECISION-ENTRY.md.template`, `FEATURE-ENTRY.md.template`
- [ ] 3.3 Add `worktree-setup.json.template` (schema example with version/setup/copy and a readonly example)

## 4. Docs

- [ ] 4.1 Update README.md's init row to the new scope
- [ ] 4.2 Update the docs page covering init (post-first-change location) — describe outputs as CLAUDE.md + worktree-setup.json

## 5. Verify

- [ ] 5.1 `claude plugin validate .` — green
- [ ] 5.2 Manual dry-run: run `/open-skills:init` against a scratch repo with a package.json + `.env.example`; confirm interview order, tool gate, and that `worktree-setup.json` is written with the install command and env copy entry
- [ ] 5.3 Manual dry-run: scratch repo needing nothing; confirm `worktree-setup.json` written with empty lists
- [ ] 5.4 `grep -rn "{{" skills/init/templates/` output matches only intended placeholders; no `.harness/` scaffold references remain in `skills/init/`
