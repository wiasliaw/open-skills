# Work Unit: 2026-10-16-wor-37-use-worktree

- **Work-unit identifier**: 2026-10-16-wor-37-use-worktree
- **Created**: 2026-10-16
- **Work-unit tool reference**: none (Linear WOR-37 "general skill：use-worktree" tracks the request; source: user decisions in session — A remove graph-engineering wording, B keep `.harness/config.json`, C no evals, D leave `milestone/graph-engineering` as-is with no back-sync)

## Contract

### Scope

Port the use-worktree skill from branch `milestone/graph-engineering` (commit `ccc74cf`, checked out read-only at `/Users/wiasliaw/Github/claude/open-skills/.project/worktrees/graph-engineering`) onto branch `feature/wor-37-use-worktree` as a standalone skill. Baseline for this round's diff: commit `c12e339`.

1. **Script, byte-identical** — copy `scripts/worktree.mjs` and `scripts/worktree.test.mjs` from the milestone worktree unchanged (including the `ensure --detach` pin mode).
2. **Skill page** — copy `skills/use-worktree/SKILL.md`, then remove every graph-engineering concept while keeping all script-facing policy (naming `wu/<id>`, id regex, path `<worktrees-location>/<id>`, `info/exclude`, lazy open and reuse, existing-branch `--id` form, script invocation lines, JSON output contract, setup-after-ensure rule, no-symlink rule, read-only pins, fail-closed behavior with no raw `git worktree` fallback, collision handling, the agent never removes a worktree, reopen-on-existing-branch rule):
   - Delete the `## Graph profile` section entirely.
   - Frontmatter `description`: drop "when a graph build node needs repository writes".
   - Rewrite graph-only wording: trigger / fix unit, stage directory and draft deltas, work-unit folder archival, orchestrator deterministic steps, post-review delivery, abandonment terminal, worker, dispatch. Removal becomes the user's job with `git worktree remove <path>`.
3. **User doc** — copy `docs/use-worktree.md`, delete its `## Graph profile` section and graph wording ("graph run mounts it", "graph task", "orchestrator"), and document the optional user-authored `.harness/config.json`: `schema_version` (major 1), `vcs.default_branch`, `vcs.remote`, `locations.worktrees`, `worktree_setup.setup` / `worktree_setup.copy`; and the behavior when the file is absent (`ensure` branches from `HEAD` at `.project/worktrees/`, `setup` is a no-op).
4. **README wiring (C-002)** — add a use-worktree row to the Skills table linking `./docs/use-worktree.md`, add `/open-skills:use-worktree` to the invocation block, and add Node.js >= 20 to External tools (used by use-worktree; without it the skill reports blocked); mention use-worktree under the `git` bullet.
5. **CLAUDE.md** — Repo Structure tree gains `scripts/` (`worktree.mjs`, `worktree.test.mjs`), `skills/use-worktree/SKILL.md`, `docs/use-worktree.md`; Development Environment gains Node.js >= 20 for `scripts/` and its `node:test` suite; Workflow edit row gains `scripts/`; Workflow verify row gains `node --test scripts/*.test.mjs`.

### Verification Standards

Run from the repo root of the feature worktree, in order; all must succeed:

1. `claude plugin validate .`
2. `node --test scripts/*.test.mjs` — all tests pass.
3. `git diff --exit-code ccc74cf -- scripts/worktree.mjs scripts/worktree.test.mjs` — script and test byte-identical to milestone.
4. `! grep -n -i -E 'graph|orchestrator|stage director|close-out|fix unit|trigger|abandon|post-review|worker|dispatch' skills/use-worktree/SKILL.md docs/use-worktree.md` — no graph-engineering vocabulary.
5. `grep -q '^name: use-worktree$' skills/use-worktree/SKILL.md && grep -q 'scripts/worktree.mjs' skills/use-worktree/SKILL.md && grep -q 'git worktree remove' skills/use-worktree/SKILL.md`
6. `grep -q '.harness/config.json' docs/use-worktree.md && grep -q 'worktree_setup' docs/use-worktree.md && grep -q 'default_branch' docs/use-worktree.md`
7. `grep -q 'docs/use-worktree.md' README.md && grep -q 'open-skills:use-worktree' README.md && grep -q 'Node.js' README.md`
8. `grep -q 'scripts/' CLAUDE.md && grep -q 'node --test' CLAUDE.md && grep -q 'use-worktree' CLAUDE.md`
9. `git status --porcelain --untracked-files=all -- . ':!.project' | awk '{print $2}' | sort` lists exactly: `CLAUDE.md`, `README.md`, `docs/use-worktree.md`, `scripts/worktree.mjs`, `scripts/worktree.test.mjs`, `skills/use-worktree/SKILL.md`.

### Exclusions

- `evals/` — not ported (decision C).
- `skills/harness-flow/`, `skills/handoff/`, `skills/init/` (init does not generate `.harness/config.json`), `skills/codewalk/` (keeps its own worktree procedure per D-002), `skills/request-code-review/`, `skills/receive-code-review/`, `agents/`.
- `.harness/` and `.project/` — orchestrator-only.
- `.claude-plugin/plugin.json` and `marketplace.json` — version unchanged.
- Any behavior change to `scripts/worktree.mjs` or its tests.
- Every other milestone file (graph-init, graph-run, ticket, wrap, other scripts, `openspec/`, `.claude/`).
- The `milestone/graph-engineering` branch and its worktree — read-only source.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | use-worktree ships on main as a standalone skill with its byte-identical zero-dependency script, a graph-free skill page and doc, and README/CLAUDE.md wiring | Verification Standards 1–9 | active |

## Review Log

## Notes

- 2026-10-16 — Worktrees provisioned with the milestone `worktree.mjs` itself: milestone at `.project/worktrees/graph-engineering`, feature at `.project/worktrees/wor-37-use-worktree` (branch `feature/wor-37-use-worktree` from `c12e339`). Clock-in: `claude plugin validate .` passed (pre-existing root CLAUDE.md warning); no in-flight work unit, no handoff.
- 2026-10-16 — Pre-check: milestone `worktree.mjs` + test run standalone outside the milestone tree, 31/31 pass on Node v24.12.0.
