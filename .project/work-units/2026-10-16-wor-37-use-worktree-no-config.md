# Work Unit: 2026-10-16-wor-37-use-worktree-no-config

- **Work-unit identifier**: 2026-10-16-wor-37-use-worktree-no-config
- **Created**: 2026-10-16
- **Work-unit tool reference**: none (Linear WOR-37; source: user correction in session — "main branch is a plugin that needs no config, so the rewrite went the wrong way" — and user decisions: remove config reading from the script, delete the `setup` subcommand, defaults `HEAD` + `.project/worktrees/`)

## Contract

### Scope

Make use-worktree config-free on branch `feature/wor-37-use-worktree` (PR #10). Baseline for this round's diff: commit `558fa0b`. Replaces F-006 (its verification greps for the config docs) and reverses D-004's "keep the `.harness/config.json` contract" and "script byte-identical" parts.

1. **`scripts/worktree.mjs` reads no config file**
   - Delete `.harness/config.json` reading and everything that only serves it: `CONFIG_REL`, `SUPPORTED_SCHEMA_MAJOR`, `configError`, `readConfig`, `worktreesLocation`, `validateWorktreeSetup`, and any helper left unused (for example `safeRelPath`).
   - Worktree location is fixed at `.project/worktrees` (`DEFAULT_LOCATION`); `info/exclude` handling is unchanged.
   - Base for a new `wu/<id>` branch is always the main checkout's `HEAD` (`not_a_git_repository` when it has no commits). Remote for an existing non-`wu` branch is fixed at `origin`.
   - Delete the `setup` subcommand: `runSetup`, `copyTree`, and helpers used only by setup (for example `within`). `setup` becomes an unknown subcommand (`usage` error).
   - Remove error codes that can no longer occur: `config`, `setup_failed`, `base_ref_missing`. Do not renumber the remaining exit codes.
   - Update the header comment and `--help` text to match (no Configuration paragraph, no `setup` usage line, no removed exit codes).
   - Everything else — `ensure --branch`, `ensure --branch <existing> --id`, `ensure --detach`, stale recovery, collision handling, probe, Node version check, JSON output contract — keeps its behavior.
2. **`scripts/worktree.test.mjs`** — delete tests for config and setup; adjust helpers (`makeRepo`, `writeConfig`, `cfg`, `setupRepo`) so no test writes a config unless it tests that config is ignored. Add tests: (a) `ensure` succeeds and uses `.project/worktrees/<id>` with `HEAD` as base while a `.harness/config.json` holding invalid JSON or a different `locations.worktrees` exists — the file is ignored; (b) `setup` is a `usage` error. All remaining tests pass.
3. **`skills/use-worktree/SKILL.md`** — remove every config reference and every `setup` reference (invocation line, "Run `setup` after every `ensure`…", "then `setup` again"). State the fixed behavior: base is the main checkout's `HEAD`, location is `.project/worktrees/`. Keep "never symlink a mutable file or directory between worktrees" as a standalone policy line. Add one line: preparing a new worktree (installing dependencies and similar) follows the project's own instructions and is outside this skill. All other policy stays.
4. **`docs/use-worktree.md`** — delete the Configuration section, the `setup` invocation line, and "run your declared setup commands"; state that the skill needs no configuration (base `HEAD` of the main checkout, location `.project/worktrees/<id>`).
5. **`README.md`** — the use-worktree Skills row drops "setup" ("create, reuse, and recovery"). The External tools bullets stay as they are unless they mention setup.

### Verification Standards

Run from the repo root of the feature worktree, in order; all must succeed:

1. `claude plugin validate .`
2. `node --test scripts/*.test.mjs` — all tests pass.
3. `! grep -n -E 'config\.json|CONFIG_REL|readConfig|worktree_setup|schema_version|default_branch|runSetup|setup_failed|base_ref_missing|configError' scripts/worktree.mjs`
4. `! grep -n -i -E 'config\.json|worktree_setup|default_branch|schema_version|\bsetup\b' skills/use-worktree/SKILL.md docs/use-worktree.md`
5. `! grep -n -i -E 'graph|orchestrator|stage director|close-out|fix unit|trigger|abandon|post-review|worker|dispatch' skills/use-worktree/SKILL.md docs/use-worktree.md`
6. `S="$PWD/scripts/worktree.mjs"; T=$(mktemp -d) && git -C "$T" init -q -b main && git -C "$T" -c user.email=t@e -c user.name=t commit -q --allow-empty -m init && mkdir -p "$T/.harness" && printf '{bad' > "$T/.harness/config.json" && (cd "$T" && node "$S" ensure --branch wu/demo-1) | grep -q '"ok":true' && test -d "$T/.project/worktrees/demo-1" && [ "$(git -C "$T" rev-parse wu/demo-1)" = "$(git -C "$T" rev-parse HEAD)" ] && (cd "$T" && node "$S" setup --worktree x) | grep -q '"error":"usage"' && rm -rf "$T"` — config ignored, fixed location, `HEAD` base, `setup` gone.
7. `grep -q '^name: use-worktree$' skills/use-worktree/SKILL.md && grep -q 'git worktree remove' skills/use-worktree/SKILL.md && grep -q 'never symlink a mutable file or directory' skills/use-worktree/SKILL.md && grep -q '.project/worktrees' skills/use-worktree/SKILL.md && grep -q '.project/worktrees' docs/use-worktree.md`
8. `grep -q 'open-skills:use-worktree' README.md && ! grep 'docs/use-worktree.md' README.md | grep -q -i 'setup'`
9. `git status --porcelain --untracked-files=all -- . ':!.project' | awk '{print $2}' | sort` lists only paths among: `README.md`, `docs/use-worktree.md`, `scripts/worktree.mjs`, `scripts/worktree.test.mjs`, `skills/use-worktree/SKILL.md`.

### Exclusions

- `CLAUDE.md`, `.harness/`, `.project/`, `evals/`, `agents/`, `.claude-plugin/`, and every other skill.
- No new subcommands, flags, or behavior; no renumbering of the remaining exit codes; `ensure --detach` stays.
- The `milestone/graph-engineering` branch and its worktree.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | use-worktree needs no configuration: the script reads no config file and has no `setup` subcommand, worktrees branch from `HEAD` at `.project/worktrees/<id>`, and the skill page, doc, and README say so | Verification Standards 1–9 | active |

## Review Log

## Notes

- 2026-10-16 — Opened after the user rejected the previous unit's config direction (decision B was read as "keep the config mechanism"; the intent was a config-free plugin). The previous unit (archived `2026-10-16-wor-37-use-worktree`) stays as history; this unit's merge moment supersedes F-006 and D-004.
