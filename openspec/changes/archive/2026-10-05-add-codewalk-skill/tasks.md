## 1. Port

- [x] 1.1 Port `skills/codewalk/SKILL.md` from `main`, replacing the raw worktree lifecycle with `worktree.mjs ensure --detach` delegation and updating the orchestrator reference
- [x] 1.2 Copy `skills/codewalk/templates/walkthrough.md.template` verbatim from `main`

## 2. Docs

- [x] 2.1 Port `docs/codewalk.md` with the new pin path and script mechanics
- [x] 2.2 Add the README Skills row; bump the architecture skill count

## 3. Validate and archive

- [x] 3.1 `claude plugin validate .`; `node --test "scripts/*.test.mjs"`
- [x] 3.2 Archive the change and sync `skill-codewalk` into `openspec/specs/`; `openspec validate --specs --no-interactive`
