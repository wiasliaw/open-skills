## Context

The repo currently ships seven skills; two of them (`harness-flow`, `handoff`) implement the orchestration loop that is about to be redesigned from scratch. The repo also dogfoods its own harness: root `CLAUDE.md` line 1 instructs every session to load `harness-flow` before touching any deliverable, and merge moments write to `.harness/`. `worktree.mjs` lives under `skills/use-worktree/scripts/` per D-008/C-003, but is consumed by two skills (use-worktree branch mode, codewalk detach mode), making it a shared plugin asset in a skill-owned location.

Advisor review (2026-10-02) surfaced three constraints this design addresses: the bootstrapping loop (executing this change would itself trigger harness-flow), the silent-reversal problem (deleting `.harness/` also deletes C-003, the very constraint the script move violates), and three unarchived OpenSpec changes whose specs pin the old script path.

## Goals / Non-Goals

**Goals:**

- Remove harness-flow, handoff, docs/harness.md, and this repo's `.harness/` in one mechanical change, leaving the repo in a documented intermediate state ready for the rebuild.
- Relocate `worktree.mjs` + test to top-level `scripts/` as the plugin-root shared-asset location, with every reference updated and the D-008/C-003 reversal recorded explicitly (here, since `.harness/` will no longer exist to record it).
- Keep C-001 (English-only) and C-002 (docs sync) in force by inlining them into `CLAUDE.md`.

**Non-Goals:**

- Redesigning or rebuilding harness-flow (future change; `graph-plugin-architecture` names the successor).
- Rebuilding init (follow-up change `rebuild-init`).
- Changing `worktree.mjs` behavior or its `CONFIG_REL = '.harness/worktree-setup.json'` consumer-side path.
- Tombstone files for deleted skills.

## Decisions

1. **Strip the CLAUDE.md load directive as the first implementation step.** Alternative — run the change through the harness-flow loop one last time — rejected: the loop's merge moment writes F-/D- entries into the `.harness/` this change deletes, which is incoherent.
2. **Scripts move to `scripts/` (plugin root), reversing D-008/C-003.** The user decided distribution is plugin-only, so "standalone skills must stay standalone" (D-008's rationale) no longer applies, and codewalk's cross-skill reference into `skills/use-worktree/scripts/` was already a boundary violation under the old rule. Alternative — keep scripts in the skill dir — rejected with the distribution decision.
3. **No tombstones for dangling references.** `agents/*.md`, use-worktree's orchestrator wording, and init's template still name harness-flow; they are kept as-is because the future rebuild rewires them, and `graph-plugin-architecture` already serves as the forward pointer. The proposal's dangling-references list is the record. Exception: `README.md` and `docs/` may not dangle (C-002), so their harness-flow/handoff rows and `docs/harness.md` links are removed in this change.
4. **History preservation via git, not copies.** C-001/C-002 are inlined into `CLAUDE.md`; everything else in `.harness/` stays retrievable from the parent of the deletion commit (`git log -- .harness`). Alternative — move `.harness/` to an `archive/` dir — rejected: duplicates git history and keeps stale constraints discoverable as if active.
5. **Delta specs amend the unarchived `use-worktree-skill` change rather than forking new capability names.** `openspec/specs/` is empty, so the path contract's source of truth is that change's spec files; this change carries MODIFIED deltas for `worktree-script` and `skill-use-worktree` so an eventual sync/archive lands the new path.

## Risks / Trade-offs

- [Lost decision context after `.harness/` deletion] → proposal records the recovery SHA procedure; D-007/D-008 named explicitly as the entries the rebuild will need.
- [Dangling harness-flow references mislead a session between this change and the rebuild] → references are confined to files the rebuild owns (`agents/`, use-worktree policy wording, init template); README/docs are cleaned so no user-facing surface dangles. Agent descriptions (`agents/*.md:3`) do remain visible in session agent lists until the rebuild — accepted.
- [Test assumes old layout] → `worktree.test.mjs` read-only-plugin-dir test hardcodes `skills/use-worktree/scripts`; it is updated to the `scripts/` layout in the same commit as the move, keeping `node --test` green at every commit.
- [`.harness/worktree-setup.json` namespace may change in the rebuild] → recorded as an open question; `CONFIG_REL` untouched here so consumer projects are unaffected.

## Migration Plan

Two commits on one branch, PR per GitHub flow:

1. `refactor!: remove harness-flow, handoff, and repo .harness memory` — strip CLAUDE.md directive + Harness section first, inline C-001/C-002, delete the four targets, clean README/docs references.
2. `refactor!: move worktree scripts to plugin-root scripts/` — `git mv`, update all references and the test, run `claude plugin validate .` and `node --test "scripts/*.test.mjs"`.

Rollback: revert the PR; no consumer-side state migrates.

## Open Questions

- Does `.harness/` remain the memory namespace after the harness rebuild? (Owns whether `CONFIG_REL` and init's output location move later.)
