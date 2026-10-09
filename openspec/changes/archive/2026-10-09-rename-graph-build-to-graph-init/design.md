## Context

graph-build writes `.harness/` (config, graph definition, types, examples) and performs no VCS operations. On an empty project this produces a factory that cannot run: `worktree.mjs` refuses a repository with no commits (`not_a_git_repository`, `scripts/worktree.mjs:297-299`), the `worktree_setup.setup` commands confirmed in the interview (for example an install command) fail in a worktree that has no manifest, and the slot answers (`test_command`, `lint_command`) describe a project that does not exist yet. Deferring the scaffold to "the first work unit" does not work either, because that unit needs a provisioned worktree — the factory's facts depend on the skeleton existing. Separately, nothing prevents writing `.harness/` from inside a linked worktree, which would diverge from the main checkout, and nothing ensures `.harness/` ever gets tracked, which the delta mechanism (deltas carried on unit branches) requires.

## Goals / Non-Goals

**Goals:**

- Rename `graph-build` to `graph-init` everywhere (skill, spec capability, docs, cross-references).
- On an empty project, scaffold the skeleton before the bootstrap/assembly interviews so every recorded fact is true of a real project.
- End graph-init with a verified worktree-able repository: user prompted to commit, HEAD commit and tracked `.harness/` verified before graph-run is named as next step.
- Script-enforce "harness writers run only in the main checkout".

**Non-Goals:**

- graph-init does not commit, stage, or push — VCS writes stay with the user (at init time) and the orchestrator (at run time).
- No change to the config schema, graph definition format, assembly format, or template library.
- No scaffolding on non-empty projects, and no scaffold-command invention: only user-confirmed commands run.
- Historical documents (`openspec/changes/archive/`, `E2E-RETRO.md`) keep the old name.

## Decisions

**Rename to graph-init.** The skill is the project's one-time initialization — Tier 1 is already called "Bootstrap (init)" and its writer is `init.mjs` — so `graph-init` matches the existing vocabulary better than `build`. Mechanics: move `skills/graph-build/` → `skills/graph-init/` (frontmatter `name`, references, templates move with it), move `openspec/specs/graph-build/` → `openspec/specs/graph-init/` when syncing, rename `docs/graph-build.md` → `docs/graph-init.md`, and update every live cross-reference (graph-run skill and spec, graph-definition, graph-engineering-model, type-catalog, plugin-engineering-principles specs, README, docs). Alternative considered: keep the name and only fix behavior — rejected because the name actively misleads about when the skill runs.

**Scaffold is a skill-level procedure, not a script.** Scaffolding is ecosystem-specific and interactive (cargo init, npm create, uv init, …); a deterministic script cannot own it the way `init.mjs` owns the config. The skill interviews the project type, recommends a scaffold command with its source, and runs it only after explicit confirmation — the same hard-gate discipline as the slot interview. The ordering invariant (scaffold → survey → Tier 1 → Tier 2) is what the spec enforces. Alternative considered: ship scaffold templates in the plugin — rejected as duplicating every ecosystem's own generator.

**"Empty project" detection is a recommendation, not a gate.** Detected as: HEAD resolves to no commit, or no manifests/sources beyond VCS and harness metadata. Since every scaffold command is user-confirmed anyway, a borderline detection just produces a question, never a wrong write.

**Commit is prompted, not performed.** graph-init keeps zero VCS write operations (user decision). Close-out prompts the user to commit the skeleton plus `.harness/`, then verifies read-only: `git rev-parse --verify HEAD^{commit}` and `git ls-files --error-unmatch` (or equivalent) over the `.harness/` files it wrote. Until both pass, the report names what is missing and does not point to graph-run. This keeps the single-writer story clean (init.mjs writes config, user writes history) at the cost of one manual step. Alternative considered: graph-init commits itself — rejected: it would be the only place outside the orchestrator with commit rights, and the spec currently reserves commit ownership.

**Worktree refusal lives in the writers.** `init.mjs write`, `types.mjs write`, and `graph.mjs assemble` compare `git rev-parse --git-dir` with `--git-common-dir`; when they differ the process is in a linked worktree and the writer exits nonzero with stable code `in_worktree`, writing nothing. Validate/probe commands stay usable anywhere. Enforcing in scripts rather than SKILL.md prose matches the repo's philosophy that invariants are script-enforced. The same check in `worktree.mjs` is not needed — it already resolves the main checkout itself.

## Risks / Trade-offs

- [Scaffold commands run for effect, unlike everything else in graph-init] → Confined to empty projects, one command at a time, each user-confirmed; the spec forbids improvisation and non-empty-project scaffolding.
- [User never commits; factory stalls at close-out] → The report loop names exactly what is missing (no HEAD commit / untracked `.harness/` files) and repeats the prompt; graph-run's existing refusal paths are unchanged as a second net.
- [Rename breaks muscle memory and external links] → BREAKING is declared; all live docs and cross-references updated in the same change; archives intentionally untouched.
- [Worktree detection via `--git-dir` vs `--git-common-dir` misfires in exotic setups (submodules, `GIT_DIR` overrides)] → The check only refuses writes; a false positive is loud and recoverable (run from the main checkout), never silent corruption.

## Migration Plan

1. Land scripts + tests (worktree refusal) — independent of the rename.
2. Move the skill directory and update SKILL.md (scaffold phase, close-out gate), then fix all cross-references in the same commit so the plugin never references a missing skill.
3. Update docs and spec deltas; sync specs (folder rename happens at sync).
4. Existing projects with a working factory need no action; an empty project previously stuck simply re-runs graph-init.

## Open Questions

- None blocking. (Deferred: whether `graph.mjs validate` should also warn — not refuse — when `.harness/` is untracked, as an extra hint before graph-run.)
