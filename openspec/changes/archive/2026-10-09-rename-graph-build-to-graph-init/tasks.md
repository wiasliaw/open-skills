## 1. Script guards (independent of the rename)

- [x] 1.1 Add a shared linked-worktree check (`git rev-parse --git-dir` vs `--git-common-dir`) and refuse `init.mjs write` inside a linked worktree with stable error code `in_worktree`, exit nonzero, nothing written
- [x] 1.2 Apply the same refusal to `types.mjs write` and `graph.mjs assemble`; leave validate/probe commands unrestricted
- [x] 1.3 Add tests in `init.test.mjs`, `types.test.mjs`, `graph.test.mjs` covering: refusal in a linked worktree (code, exit status, no file written) and success in a main checkout
- [x] 1.4 Document the `in_worktree` error code in `docs/file-formats.md` (or wherever script error codes are cataloged)

## 2. Skill rename

- [x] 2.1 `git mv skills/graph-build skills/graph-init`; update SKILL.md frontmatter `name` and description
- [x] 2.2 Update internal references in `skills/graph-init/references/*.md` and any templates text that names graph-build
- [x] 2.3 Update cross-references in `skills/graph-run/SKILL.md` and `skills/graph-run/references/*.md` (including the "no validated definition → run graph-build" hint)
- [x] 2.4 Grep the repo for remaining live `graph-build` mentions (README.md, docs/, other skills); update all except `openspec/changes/archive/` and `E2E-RETRO.md`, which stay historical

## 3. Scaffold phase in the skill

- [x] 3.1 Add the scaffold phase to `skills/graph-init/SKILL.md` mode-picking: empty-project detection (no HEAD commit, or no manifests/sources beyond VCS and harness metadata) routes to scaffold before Tier 1
- [x] 3.2 Write the scaffold procedure (in SKILL.md or `references/bootstrap.md`): project-type interview, recommended scaffold command with source, one-at-a-time user confirmation, execute only confirmed commands, never on a non-empty project, never improvised
- [x] 3.3 State the ordering invariant: scaffold completes before the Tier 1/2 survey and interviews, so recorded facts and slot answers describe the scaffolded project

## 4. Close-out gate in the skill

- [x] 4.1 Add the close-out section to SKILL.md: prompt the user to commit the skeleton and `.harness/` files (graph-init itself performs no VCS writes)
- [x] 4.2 Add the read-only verification: HEAD resolves to a commit and the written `.harness/` files are tracked; until both hold, the report names what is missing, repeats the prompt, and does not name graph-run as next step
- [x] 4.3 Update the Report section: include scaffold answers (if any) and the worktree-ability verification result

## 5. Docs and specs

- [x] 5.1 Rename `docs/graph-build.md` → `docs/graph-init.md`; update its content for the scaffold phase and close-out gate; fix links from README.md, `docs/project-anatomy.md`, `docs/graph-run.md`
- [x] 5.2 Update `docs/project-anatomy.md` writer table and any flow descriptions for the new name and the commit-prompt step
- [x] 5.3 Validate the change (`openspec validate --change rename-graph-build-to-graph-init`); on sync/archive, move `openspec/specs/graph-build/` → `openspec/specs/graph-init/` and update textual references in `graph-run`, `graph-definition`, `graph-engineering-model`, `type-catalog`, `plugin-engineering-principles` specs

## 6. Verification

- [x] 6.1 Run the full script test suite (`node --test scripts/`)
- [x] 6.2 End-to-end dry run on a fresh empty repo: graph-init scaffolds, builds the factory, prompts for commit, verifies, then `worktree.mjs` provisions a worktree successfully
- [x] 6.3 Confirm `rg graph-build` reports hits only under `openspec/changes/archive/` and `E2E-RETRO.md`
