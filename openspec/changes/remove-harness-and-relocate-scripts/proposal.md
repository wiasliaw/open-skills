## Why

The harness loop is due for a ground-up redesign: `skills/harness-flow` (and its companion `skills/handoff`) will be rebuilt rather than patched, so keeping them published misleads consumers and blocks the rebuild from starting clean. At the same time the repo's scripts should live in one place: `worktree.mjs` already serves two skills (use-worktree and codewalk), so it is a shared plugin asset misfiled under a single skill's directory.

## What Changes

- **BREAKING** Delete `skills/harness-flow/` (SKILL.md + WORK-UNIT template). The orchestrator loop will be redesigned and rebuilt in a future change, not this one.
- **BREAKING** Delete `skills/handoff/` and `docs/harness.md` (its content covers init/harness-flow/handoff and dies with them).
- **BREAKING** Delete this repo's own `.harness/` directory (ARCHITECTURE/CONSTRAINTS/DECISIONS/FEATURES plus `decisions/` and `features/`), and strip the root `CLAUDE.md` load directive and Harness section. Removing the load directive is the **first implementation action**, so that executing this change does not itself trigger the harness-flow loop it deletes (bootstrapping loop).
  - Constraints C-001 (English-only content) and C-002 (docs/README stay in sync with skills) are preserved by inlining them into `CLAUDE.md` before `.harness/` is deleted.
  - History recovery point: the pre-deletion tree is the parent of the deletion commit (`git log --oneline -- .harness` finds it; HEAD at proposal time is `a5aad45`). D-007 and D-008 are the decisions most likely needed during the rebuild.
- **BREAKING** Move `skills/use-worktree/scripts/{worktree.mjs,worktree.test.mjs}` to top-level `scripts/`, updating every reference (use-worktree SKILL.md, codewalk SKILL.md, docs/use-worktree.md, README.md, CLAUDE.md verify command, the test's read-only-plugin-dir layout assumption). This **explicitly reverses D-008 / C-003** ("scripts MUST live under the owning skill's `scripts/`"): the plugin is distributed only as a plugin (decision made in this proposal), so standalone per-skill installation is no longer a supported scenario, and `scripts/` matches the hooks convention for plugin-root shared assets.
- Kept deliberately dangling until the rebuild (documented, not tombstoned): `agents/implementor.md`, `agents/reviewer.md`, `skills/use-worktree/SKILL.md` orchestrator wording, `skills/init/SKILL.md` + its CLAUDE.md.template load directive. `README.md` and `docs/` must NOT keep dangling harness-flow references (C-002 spirit); their rows/sections are removed or rewritten in this change.
- Out of scope: rebuilding init (follow-up change `rebuild-init`), redesigning harness-flow, and changing `worktree.mjs`'s `CONFIG_REL = '.harness/worktree-setup.json'` path.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

Both live in the unarchived change `use-worktree-skill` (`openspec/specs/` has no synced specs yet); delta specs here modify the path contract only:

- `worktree-script`: the script's home moves from `skills/use-worktree/scripts/` to `scripts/`; the stable path contract is re-declared at `scripts/`.
- `skill-use-worktree`: script resolution becomes `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`; everything else unchanged.

## Impact

- Deleted: `skills/harness-flow/`, `skills/handoff/`, `docs/harness.md`, `.harness/` (10 files incl. decisions/features), CLAUDE.md load directive + Harness section.
- Moved: `skills/use-worktree/scripts/` → `scripts/` (2 files).
- Edited: `CLAUDE.md` (repo tree, workflow verify command, inlined C-001/C-002), `README.md`, `docs/use-worktree.md`, `skills/use-worktree/SKILL.md`, `skills/codewalk/SKILL.md`, `skills/use-worktree/scripts/worktree.test.mjs` path assumptions.
- Related unarchived changes: `use-worktree-skill` (path pins in `worktree-script` and `skill-use-worktree` specs — handled via the delta specs above), `graph-plugin-architecture` (names harness-flow's successor; untouched).
- Open question (recorded, not resolved here): whether `.harness/` remains the memory namespace after the harness rebuild. Until decided, `worktree.mjs` keeps reading `.harness/worktree-setup.json`.
