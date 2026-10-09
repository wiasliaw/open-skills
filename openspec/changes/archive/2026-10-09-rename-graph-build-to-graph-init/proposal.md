## Why

On an empty project (zero commits, no manifests), graph-build succeeds — it writes `.harness/` and the tool gate only probes tools — but the factory it builds is unusable: `worktree.mjs` refuses a repo with no commits (`not_a_git_repository`), the interview answers (`test_command`, `worktree_setup`) describe a project that does not exist yet, and nothing in the flow ever gets `.harness/` tracked, which the delta mechanism also depends on. The skill's name also undersells what it does: it is the project's one-time initialization, not just a build step.

## What Changes

- **BREAKING** Rename the `graph-build` skill to `graph-init` (skill directory, SKILL.md, docs, and every cross-reference in graph-run and the spec corpus).
- Add a scaffold phase to graph-init: when the survey finds an empty project, interview the project type and run only user-confirmed scaffold commands (e.g. `cargo init`, `npm create ...`) before the Tier 1/2 interviews, so the survey and every slot answer describe a project that actually exists. Scaffolding is never improvised and never runs on a non-empty project.
- Add a close-out gate: graph-init prompts the user to commit the skeleton and `.harness/` (it never commits itself), then verifies the repo is worktree-able — HEAD resolves to a commit and `.harness/` is tracked — before its report may point to graph-run.
- Enforce "not inside a worktree" in the scripts: `init.mjs write`, `types.mjs write`, and `graph.mjs assemble` detect a linked worktree and refuse with a stable error code, so `.harness/` can never be written into a worktree and diverge from the main checkout.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `graph-build`: renamed to `graph-init`; the bootstrap requirement gains the empty-project scaffold phase (user-confirmed commands only), the commit prompt + worktree-ability close-out gate, and the main-checkout-only script guard.

## Impact

- `skills/graph-build/` → `skills/graph-init/` (SKILL.md name/description, references, templates path unchanged in content).
- `scripts/init.mjs`, `scripts/types.mjs`, `scripts/graph.mjs`: linked-worktree refusal with a stable error code; corresponding tests.
- `skills/graph-run/`: cross-references to the renamed skill; its "no validated definition" hint text.
- `openspec/specs/graph-build/` → `openspec/specs/graph-init/`; textual references in `graph-run`, `graph-definition`, `graph-engineering-model`, `type-catalog`, `plugin-engineering-principles` specs.
- `docs/graph-build.md` → `docs/graph-init.md`; `README.md`, `docs/project-anatomy.md`, `docs/file-formats.md`, `docs/graph-run.md`.
- No change to the config schema, graph definition format, or any runtime script interface beyond the new refusal code.
