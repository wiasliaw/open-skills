# init

Prepares a project for agent work: surveys the repo, interviews you
one question at a time, and produces a root CLAUDE.md so any agent
opening the repo knows how it is developed, verified, organized, and
constrained.

## Usage

```
/open-skills:init
```

A manual entry point only — it never triggers on its own.

## What it does

Surveys the repo first (structure, manifests, git history, CI config),
then interviews you about what it could not infer: VCS strategy,
workflow phases and how each executes, and repo structure and
environment. Anything inferable from files is confirmed rather than
asked. Declared commands are executed (or dry-run) before being
written down.

It drafts the root CLAUDE.md, runs a readiness gate and a
fresh-session test, and writes nothing until you approve the draft.

Run it again on an initialized project to enter update mode:
still-correct content is kept, only missing or stale fields are asked,
and the gaps found are always reported.

> Note: this skill is being rebuilt — see
> `openspec/changes/rebuild-init/`. The harness-adoption outputs it
> used to produce (load directive, `.harness/` memory scaffold) are
> removed pending the harness redesign.
