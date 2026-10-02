## Context

Init is the manual entry point (`/open-skills:init`) that prepares a repo for agent work. The old version produced the full harness adoption surface: CLAUDE.md with a load directive, Harness section, and a four-file `.harness/` scaffold. With harness-flow deleted and awaiting redesign (`remove-harness-and-relocate-scripts`), those outputs would wire new projects to a skill that does not exist. The advisor review (2026-10-02) recommended limiting the rebuild to orchestrator-independent outputs so the init↔orchestrator contract is designed once, during the harness rebuild — the user adopted that recommendation. The `graph-init-bootstrap` spec (unarchived change `graph-engineering-node-specs`) already defines init's future role: pre-graph bootstrap, tool-availability gate, single writer of `.harness/worktree-setup.json`.

## Goals / Non-Goals

**Goals:**

- An init that any repo can run today and whose outputs stay valid after the harness rebuild: CLAUDE.md (project knowledge only) + `.harness/worktree-setup.json`.
- Implement the two orchestrator-independent `graph-init-bootstrap` requirements now: tool-availability checking and worktree-setup recording.
- Shed legacy-migration code paths that no released installation needs.

**Non-Goals:**

- Harness adoption surface (load directive, Harness section, `.harness/` four files, D-/F- formats) — harness rebuild's job.
- Moving `worktree-setup.json` out of `.harness/` (open question owned by the first change; path stays fixed).
- Bridging `.worktreeinclude` beyond a one-time translation of concrete paths at init time (no ongoing sync).

## Decisions

1. **Keep the six-step skeleton, including user review before write.** It is the part of the old init that worked; the rebuild changes what is produced, not how the session runs. Alternative — free-form init — rejected: the review gate and self-checks are what keep generated CLAUDE.md honest.
2. **Interview shrinks to four topics: VCS, workflow, repo-structure/environment, worktree setup.** Short-term memory and constraint extraction are dropped because their outputs land in deferred artifacts; re-adding them is the harness rebuild's decision. Alternative — keep collecting constraints and park them in CLAUDE.md — rejected: it predesigns the constraint format the rebuild owns.
3. **Always write `worktree-setup.json`, even when empty** (per `graph-init-bootstrap`): consumers (`worktree.mjs setup` treats absence as no-op today, but the spec wants presence-reliability for Build). Writing `{"version": 1, "setup": [], "copy": []}` costs nothing and makes the producer explicit.
4. **`.worktreeinclude` translation is best-effort and one-way.** Concrete paths become `copy` entries; glob patterns are reported to the user for manual decision. Alternative — teach `worktree.mjs` to read `.worktreeinclude` — rejected: changes script behavior, out of scope.
5. **Tool checks run the declared commands (or `--help` dry-runs), reusing the old init's verification rule**, now extended to a blocking gate: a missing required tool fails init with a named report, per `graph-init-bootstrap`'s "Missing tools block the graph".
6. **CLAUDE.md.template keeps the 50–200 line budget, Fresh Session Test, and readiness gate**, minus the Harness section. The template's fixed first line (load directive) is removed entirely rather than made conditional.

## Risks / Trade-offs

- [Projects initialized now lack a Harness section; the rebuild must define an upgrade path] → acceptable and explicit: the rebuild's init-update mode will add the section; this is one migration instead of two contract redesigns.
- [Dropping constraint extraction loses a useful interview even outside the harness] → deferred, not deleted; the rebuild decides where constraints live.
- [`.harness/` directory now exists in consumer repos solely for one JSON file] → cosmetic oddity; kept because `worktree.mjs` `CONFIG_REL` is pinned and the namespace question is tracked in the first change.

## Migration Plan

Single PR after `remove-harness-and-relocate-scripts` merges: rewrite SKILL.md + CLAUDE.md.template, delete the six harness templates, add the worktree-setup template, update README/docs. Verify with `claude plugin validate .` and a manual init dry-run against a scratch repo. Rollback: revert the PR.

## Open Questions

- None new. (The `.harness/` namespace question lives in `remove-harness-and-relocate-scripts`.)
