## 1. Author the spec

- [x] 1.1 Write the `skill-use-worktree` spec (policy page: script delegation, resolution, failure handling, who provisions, when to open, cadence, naming, Build record, Wrap-owned cleanup)
- [x] 1.2 State the worktree setup-after-creation page policy (setup after every create or reopen, no mutable symlinks, CI-red re-run)
- [x] 1.3 Record design decisions and rejected alternatives in `design.md`
- [x] 1.4 Write the `worktree-script` spec (subcommands, path and main-checkout rules, stale recovery, setup validation, failure contract, no `remove`)
- [x] 1.5 Revise proposal, design, and tasks for the script-owned-mechanics premise

## 2. Validate

- [x] 2.1 Run `openspec validate use-worktree-skill --strict --no-interactive`
- [x] 2.2 Run `claude plugin validate .`

## 3. Later changes (not part of this change; separate changes and work units)

- [x] 3.1 Implement `skills/use-worktree/scripts/worktree.mjs` with committed `node --test` tests
- [x] 3.2 Write `skills/use-worktree/SKILL.md` and its docs entry
- [ ] 3.3 Rewrite `skills/codewalk/SKILL.md` Step 2 to call the script's detach mode
