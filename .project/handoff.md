# Handoff — 2026-09-29

> If you are picking up this work: read this file fully. Goal, completed work, and task state live in short-term memory (the work-unit state file and any declared work-unit tool), not here. This file is overwritten or deleted at the next clock-out — do not hand-edit it to track ongoing state.

## Decisions & Rationale

- Branch `feature/wor-27-root-path-option-for-store-harness` (Linear WOR-27) carries two closed work units: `.project/work-units/archive/2026-09-29-private-harness-storage.md` and `.project/work-units/archive/2026-09-29-init-adoption-detection.md`. No PR has been opened yet — the user has not asked for one.
- A request-code-review of the first work unit confirmed three Critical findings (C1, C2, C3) and two Structural findings (S1, S2); none was refuted. The user chose to fix the init flow first. C1 and C2 were fixed by the second work unit (D-003). C3, S1, S2, and the Minor findings below are still open.
- The user has not yet decided whether C3 and S1 belong on this branch or in follow-up work. Ask before starting them.
- S1 must reuse init's adoption marker (D-003) so consumers and init agree on what counts as an adoption. The marker has to keep recognizing legacy shapes (agent-flow directive, harness-init 0.1.0 `## Short-Term Work-Unit Tool`), or update-mode migration becomes unreachable.
- Verification for these skills is grep-only (`eval: TBD` in CLAUDE.md). The second work unit added a manual scenario walk (A–L) run by the reviewer as a stand-in. S2 proposes a real scenario eval.

## Dead Ends

- Finding an existing private harness by slug lookup: rejected. The slug is lossy, and a repo whose directory got a `-N` suffix would be missed. D-002 and D-003 use a scan of `~/.open-skills/*/HARNESS.md` `project root:` bullets instead.
- Detecting an existing private harness only when the harness root is resolved in the fill step: too late. The interview has already run as a first init, and fresh drafts then overwrite an unversioned harness. Detection now runs as init's step 1.
- Dispatching `open-skills:implementor` / `open-skills:reviewer` as agent types: they are not installed in the cloud session. Use general-purpose agents that first read `agents/implementor.md` / `agents/reviewer.md` verbatim.

## Next Steps

1. Ask the user whether to handle C3 and S1 on this branch, then open a work unit under `.project/work-units/` for whatever they choose.
   - **C3**: add the `open-skills:harness-flow` load directive to `skills/init/templates/CLAUDE.local.md.template`, so that declining Claude Code's external-import dialog (which is permanent) does not silently disable the harness. Document the sticky decline and how to recover in `docs/harness.md`, and update init's step-7 report wording in `skills/init/SKILL.md`.
   - **S1**: replace the per-mode definitions in `skills/harness-flow/SKILL.md` ("Harness declaration and harness root" subsection) and `skills/handoff/SKILL.md` (step 1) with one rule. Harness declaration: the `HARNESS.md` imported by the root `CLAUDE.local.md` if present, else a root `CLAUDE.md` carrying the adoption marker. Harness root: the directory containing the declaration.
2. Open Minor findings, from the review of the first work unit:
   - Handle a shim whose `HARNESS.md` is missing, and compare `project root:` with the project root at harness-flow clock-in.
   - Document the permission prompts for writes under `~/.open-skills/` (`/add-dir` or `permissions.additionalDirectories`; verify the setting name first).
   - Warn about the `AGENTS.md` side effect in init's report.
   - Change `skills/harness-flow/templates/WORK-UNIT.md.template` lines 6–7 to say "harness declaration" instead of "CLAUDE.md".
   - Document the `info/exclude` path for worktrees, and how to share one harness across worktrees.
3. Open reviewer notes from the second work unit, in `skills/init/SKILL.md` step 1:
   - Whether topic 1 is asked after the dangling-shim "recreate" option.
   - What happens to a stale shim after "start fresh" followed by shared mode.
   - How keeping a large unmarked upstream `CLAUDE.md` interacts with the 50–200 line budget.
4. S2: propose a scenario eval (fixture repos plus `git status --porcelain` / `diff -r` assertions) as its own Linear issue. Ask the user before creating it.
5. When the user asks for a PR, open it from `feature/wor-27-root-path-option-for-store-harness` against `main`. Mirror any PR template, and subscribe to PR activity.
