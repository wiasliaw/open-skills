---
name: init
description: Use when a project wants a root CLAUDE.md and worktree setup config generated from a survey and interview — surveys the repo, interviews the user one question at a time, and produces a root CLAUDE.md plus .harness/worktree-setup.json. Manual entry point only — invoked via the /open-skills:init command. Do not invoke automatically.
disable-model-invocation: true
---

# init

Prepare a repository for agent work by interviewing the user, so any agent opening this repo knows how it is developed, verified, and organized. Init produces exactly two artifacts: a root `CLAUDE.md` carrying project knowledge, and the worktree setup config `.harness/worktree-setup.json`. Init writes nothing else — no memory scaffolding, no skill load directives, and never feature code.

## Checklist

Work through these in order. Do not skip or reorder.

1. Survey the repo
2. Interview the user — one question at a time
3. Fill the template and self-check
4. User reviews the draft
5. Write CLAUDE.md and worktree-setup.json
6. Report

## 1. Survey the repo

Read before asking anything:

- Directory structure (two levels deep)
- README, any existing CLAUDE.md
- Manifests and lockfiles: package.json, Cargo.toml, pyproject.toml, go.mod, Makefile, …
- Recent git log (commit message style), if git exists in the repo
- CI config (.github/workflows, .gitlab-ci.yml, …)
- Existing docs directories
- Worktree needs: what a fresh `git worktree add` would lack. A fresh worktree contains tracked files only, so note the dependency install command the manifests imply, untracked assets that cannot be cheaply regenerated (`.env` where `.env.example` exists, local data files), and any `.worktreeinclude` file.

Anything inferable from files is NOT asked. The interview confirms inferences and fills gaps only.

If a root `CLAUDE.md` already exists, enter update mode: keep sections that are still correct, and ask only about missing or stale fields. If the existing CLAUDE.md carries a skill load directive or a Harness section pointing at skills this plugin no longer ships, remove it and report the removal. There is no other migration handling: still-correct content is kept as-is, gaps are asked, and every gap found is reported — update mode is the audit mechanism, so gap reporting is not optional even when nothing changes.

Never read the contents of gitignored secret files (e.g. `.env`) during the survey or interview.

## 2. Interview

One question per message. Offer multiple-choice options where possible, with your inferred answer listed first and marked as inferred. Cover four topics, in this order:

1. **VCS strategy declaration** — ask an open question expecting a proper-noun answer (e.g. "git-flow", "trunk-based development, commitizen for commit messages"): what VCS model and conventions govern this project? Offer the survey's inference (from `.git`, branch names, commit history) as the suggested answer. Accept "no formal process" as a valid answer for a solo/simple repo. By default, write exactly one sentence into the Version Control section naming the model and conventions. Write a detailed paragraph only when the user volunteers a concrete process beyond the name. Record a named VCS-strategy skill (with a load-before-operating instruction) only when the user declares one. For "no formal process" the sentence may be exactly "No formal process."; add inferred conventions only when explicitly marked as inferred.
2. **Workflow** — ask how many phases the user's workflow has, what each is called, and HOW each phase is executed: a runnable command, a skill or slash-command name, a described manual step, or TBD when the execution method is not yet decided. Init MAY propose a lifecycle inferred from the surveyed repo type as a starting point (script/config repo → edit→verify; library or app with a test suite → plan→build→verify), but MUST NOT mandate phase count, naming, or ordering — the user's answer stands as declared. A HOW answered TBD is recorded verbatim with a warning at record time that the phase is not executable. "No formal process, edit directly" is a valid answer and still yields at minimum an edit→verify lifecycle; when the user names no verify method, ask how they check their edits and record the answer as a manual prose step rather than TBD.
3. **Repo structure and environment** — confirm survey inferences only: the purpose of key directories (only those an agent would get wrong without being told), toolchain/tools (language versions, package managers), external services, and env-var shapes (names, purpose, how to obtain — never values). Install and run/start commands are not interview items here — they belong in the Workflow table if the user's declared workflow uses them.
4. **Worktree setup** — confirm the survey's worktree-needs inference: which command(s) regenerate dependencies in a fresh worktree (`setup`), and which untracked assets must be copied (`copy`), optionally marked `readonly` for assets that should be symlinked back to the main checkout instead of copied. If the repo has a `.worktreeinclude` file, translate its concrete paths into suggested `copy` entries; report any glob patterns to the user for a manual decision instead of translating them. A gitignored secret file (e.g. `.env`) goes into `copy` only on the user's explicit confirmation — never on inference alone, since copying secrets into every worktree may be unwanted. "Nothing needed" is a valid answer and still produces the config file with empty lists.

### Tool-availability gate

Execute every executable command collected in the workflow and worktree-setup topics, or at minimum dry-run it (`--help` or equivalent), when it is collected — during the interview, before the draft is shown. Manual prose steps and TBD entries are exempt. Prefer the least side-effectful form, and if a check creates files the repo did not have (e.g. an install command generating a lockfile), remove them afterwards: init leaves the repo unchanged except for its two outputs. If a command does not exist or fails to run, say so and ask for a working one instead of writing an unverified command. If a required tool is unavailable and the user declares no substitute, end with a blocking report naming the missing tool — do not write outputs that depend on it.

If the user asks init to also implement functionality (write feature code, fix a bug, add a dependency beyond what init itself needs), decline: init writes only CLAUDE.md and `.harness/worktree-setup.json` — never feature code.

## 3. Fill the template and self-check

Read this skill's `CLAUDE.md.template` at `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/CLAUDE.md.template` and fill every `{{placeholder}}` from the survey and interview. `{{project_name}}` and the one-sentence `{{project_description}}` come from the survey (manifest or README). The output MUST NOT contain a skill load directive or a Harness section.

Fill `{{repo_structure_tree}}` as `tree` CLI format, using `├──`/`└──` connectors, inside the template's ```tree fence, and include key file names (manifests, primary entry files) — not directories only. Add an inline `#` comment only on entries an agent would get wrong without being told.

Fill the Workflow table with one row per user-declared phase, in the user's declared order. Every command in the table must be copy-paste runnable as written — no unresolved placeholders or paraphrased commands; manual steps are recorded as prose, and TBD is recorded verbatim where the execution method is not yet decided.

Draft `.harness/worktree-setup.json` alongside CLAUDE.md, following this skill's `worktree-setup.json.template`: `{"version": 1, "setup": [...], "copy": [...]}` with the confirmed commands and assets, or explicitly empty lists when nothing is needed.

If the project requires environment variables or secrets to run, document their shape only — variable names, purpose, and how to obtain a value — and point at `.env.example` where present. Never write a secret value into any output.

Then, before showing the draft, run both self-check gates:

- **Readiness gate** — confirm the draft lets a reader: start the project, test it, see progress, and pick up next steps.
- **Fresh Session Test** — confirm a fresh session with only repo contents plus this draft could answer: what is this system, how is it organized, how do I run it, and how do I verify it.

If either gate finds a gap, return to step 2 and ask the missing question before proceeding — do not paper over the gap with a placeholder.

Also check:

- No `{{` remains anywhere in the output.
- No section contradicts another.
- CLAUDE.md is between 50 and 200 lines. If over budget, move detail into a linked topic doc until it is back in budget. If under 50 lines, check whether a required topic was skipped rather than padding it — a small repo that covers all four topics may legitimately stay under 50; completeness, not line count, is the check.
- `worktree-setup.json` is valid JSON matching the schema: `version` is 1, `setup` is an array of strings, `copy` entries are objects with a repo-relative `path` (no absolute paths, no `..`) and an optional boolean `readonly`.

## 4. User review

Show the complete draft — CLAUDE.md and worktree-setup.json — in the conversation, along with the two self-check gate results. Iterate until the user approves. Do not write any file before approval.

## 5. Write

- Write the approved CLAUDE.md to the repo root.
- Write the approved config to `.harness/worktree-setup.json`, creating the `.harness/` directory if needed. Write the file even when `setup` and `copy` are empty lists, so consumers can rely on its presence. Init is the single writer of this file: no other actor edits it; an actor needing a different setup reports the need instead.
- In update mode, overwrite only files/sections that changed; leave still-correct content untouched.

## 6. Report

Report what was written (CLAUDE.md, `.harness/worktree-setup.json`), the two self-check gate results, and the tool-availability results. In update mode, report the gaps found and how they were resolved, including any removed stale load directive or Harness section.
