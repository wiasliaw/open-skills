## 1. Author the spec

- [x] 1.1 Write the `skill-use-worktree` spec (self-managed git worktree shape and guardrails, when to open, cadence, naming, Build record, Wrap-owned cleanup)
- [x] 1.2 State the worktree setup-after-creation page content (run setup after every `git worktree add`, read `.harness/worktree-setup.json`, copy-on-write copies, no mutable symlinks, CI-red re-run)
- [x] 1.3 Record design decisions and rejected alternatives in `design.md`

## 2. Validate

- [x] 2.1 Run `openspec validate use-worktree-skill --strict --no-interactive`
- [x] 2.2 Run `claude plugin validate .`
