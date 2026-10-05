# Bootstrap reference

Load at Tier 1. The config is `.harness/config.json`, written only through `scripts/init.mjs`.

## Survey checklist

- Directory tree (two levels), README, root CLAUDE.md if any.
- Manifests and lockfiles (package.json, Cargo.toml, pyproject.toml, go.mod, Makefile).
- CI config (.github/workflows, .gitlab-ci.yml).
- `git remote -v`, default branch, recent commit message style.
- Untracked files a fresh checkout would lack (`.env`, local fixtures) and what rebuilds dependencies (install command).

## Sections

| Section | Required | Content |
|---|---|---|
| `schema_version` | yes | `"1.0.0"` |
| `vcs` | yes | `default_branch`, optional `remote` |
| `locations` | yes | `work_units`, `archive`, `worktrees`: repo-relative paths, no `..` |
| `worktree_setup` | yes | `setup`: commands run in a fresh worktree; `copy`: `{path, readonly}` entries. Write both lists even when empty |
| `memory` | optional | `budgets` (bare document file name to line budget — the name resolves under `.harness/`, never a path), `ledger` (location, required when the section exists), optional `pending_delta_threshold` and `budget_pressure_threshold` (0 to 1] |
| `graph` | optional | repo-relative path of the project's definition; absent means not built, so no run |

Unknown keys are rejected. Copy entries may be symlinked only when `readonly` is true.

## Interview prompts

The survey recommends; the user decides. One question at a time, each with a recommended answer from the survey, and every section below MUST receive the user's explicit confirmation before the draft is written — an unasked section blocks the write:

1. Branching and delivery: default branch, remote name.
2. Where work-unit folders, their archive, and worktrees should live (suggest `.project/work-units`, `.project/work-units/archive`, `.project/worktrees`; confirm the worktrees path is ignored by version control).
3. What a fresh worktree needs: dependency install command; untracked files to copy and whether each is read-only.
4. Long-term memory: which current-truth documents (reference: `ARCHITECTURE.md`, `CONSTRAINTS.md` — bare file names, they live under `.harness/`) with line budgets, the ledger location (reference: `.harness/deltas`), optional maintenance thresholds.

Do not ask for test, lint, or delivery commands here: they are declared on graph nodes in Tier 2.

## Example draft

```json
{
  "schema_version": "1.0.0",
  "vcs": { "default_branch": "main", "remote": "origin" },
  "locations": { "work_units": ".project/work-units", "archive": ".project/work-units/archive", "worktrees": ".project/worktrees" },
  "worktree_setup": { "setup": ["npm ci"], "copy": [{ "path": ".env", "readonly": false }] },
  "memory": { "budgets": { "ARCHITECTURE.md": 200, "CONSTRAINTS.md": 100 }, "ledger": ".harness/deltas", "pending_delta_threshold": 10 }
}
```

## Skeleton current-truth documents

After the config is written, create each budgeted document that does not yet exist as `.harness/<name>` with a single heading line (for example `# Architecture — current truth`), so the memory layer is operative from the first run. Never overwrite a document that exists. This is the one bootstrap write outside the config, and it is the bootstrap's duty, not `init.mjs`'s.

## Script contract

`validate --from <draft>` checks only; `write --from <draft> [--root <dir>]` validates then writes atomically; `read [--section <name>]` prints. Exit codes: 0 ok, 2 usage, 3 config invalid (draft unreadable, bad JSON, or schema violation; the message names the field), 4 write failed, 7 Node too old. On exit 3 fix the draft and retry; never write the file yourself. Updating the config means drafting the full new config and writing it the same way.
