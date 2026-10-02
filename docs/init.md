# init

Prepares a project for agent work: surveys the repo, interviews you
one question at a time, and produces a root CLAUDE.md plus a worktree
setup config, so any agent opening the repo knows how it is developed,
verified, and organized.

## Usage

```
/open-skills:init
```

A manual entry point only — it never triggers on its own.

## What it does

Surveys the repo first (structure, manifests, git history, CI config,
and what a fresh git worktree would lack), then interviews you about
what it could not infer, in four topics: VCS strategy, workflow phases
and how each executes, repo structure and environment, and worktree
setup needs. Anything inferable from files is confirmed rather than
asked.

Declared commands are executed (or dry-run) before being written
down. A required tool that is unavailable blocks init with a report
naming the tool.

## What it writes

Nothing is written until you approve the draft, which is checked by a
readiness gate and a fresh-session test first. Then:

- **`CLAUDE.md`** at the repo root — project knowledge only:
  structure, development environment, version control, workflow.
- **`.harness/worktree-setup.json`** — what a fresh git worktree
  needs: `setup` commands that regenerate dependencies and `copy`
  entries for untracked assets (optionally `readonly` to symlink
  instead of copy). Written even when nothing is needed, with empty
  lists, so consumers such as `scripts/worktree.mjs` can rely on its
  presence. Init is the file's single writer. Concrete paths in an
  existing `.worktreeinclude` are translated into `copy` entries;
  glob patterns are reported for a manual decision.

Run init again on an initialized project to enter update mode:
still-correct content is kept, only missing or stale fields are
asked, and the gaps found are always reported. A stale skill load
directive or Harness section pointing at skills this plugin no longer
ships is removed and reported.
