---
name: init
description: Use when a project is adopting the harness or re-auditing an existing adoption — surveys the repo, interviews the user, and produces a harness declaration (root CLAUDE.md, or a private HARNESS.md outside the repo) plus a scaffolded .harness/ directory. Manual entry point only — invoked via the /open-skills:init command. Do not invoke automatically.
disable-model-invocation: true
---

# init

Generate (or update) the project's harness declaration and `.harness/` long-term memory by interviewing the user, so any agent opening this repo — or the harness-flow loop — knows how it is developed, verified, organized, and constrained.

## Storage modes

- **Shared mode** (default) — the harness declaration is root `CLAUDE.md`; the harness root (the directory holding `.harness/` and `.project/`) is the project root; everything is git-tracked.
- **Private mode** — for a repo maintained by others. The whole harness tree lives outside the repo at `~/.open-skills/<slug>/`, which is not git-managed: the harness declaration is `HARNESS.md` there, next to `.harness/` and `.project/` (internal structure identical to shared mode). The repo gains only a root `CLAUDE.local.md` shim that `@`-imports `HARNESS.md`, excluded locally from git.
- **slug** — the repo's absolute path with every character other than ASCII letters, digits, and `-` replaced by `-` (e.g. `/Users/me/Github/foobar` → `-Users-me-Github-foobar`). Used once, at init, to name the directory — never as a lookup key; afterwards the shim's explicit path is the only repo → harness pointer. If `~/.open-skills/<slug>/` already exists and its `HARNESS.md` `project root:` bullet names a different path (or it has no `HARNESS.md`), append `-2`, `-3`, … until the name is free; if it names this repo, that is update mode.

## Checklist

Work through these in order. Do not skip or reorder.

1. Survey the repo
2. Interview the user — one question at a time
3. Fill the template and self-check
4. User reviews the draft
5. Write the harness declaration and scaffold `.harness/`
6. Report

## 1. Survey the repo

Read before asking anything:

- Directory structure (two levels deep)
- README, any existing CLAUDE.md or CLAUDE.local.md
- Manifests and lockfiles: package.json, Cargo.toml, pyproject.toml, go.mod, Makefile, …
- Recent git log (commit message style), if git exists in the repo
- CI config (.github/workflows, .gitlab-ci.yml, …)
- Existing docs directories

Anything inferable from files is NOT asked. The interview confirms inferences and fills gaps only.

If an adoption already exists, enter update mode against the harness declaration and harness root found: shared — a root `CLAUDE.md` and/or `.harness/`; private — a root `CLAUDE.local.md` whose `@` import points at a `HARNESS.md` (its directory is the harness root). The found adoption settles the storage mode: do not re-ask it, and do not move files between modes. In update mode: keep sections and files that are still correct, and ask only about missing or stale fields. Still run both self-check gates (step 3) against current repo state, and report the gaps found — update mode is the plugin's audit mechanism, so gap reporting is not optional even when nothing changes.

Update mode also recognizes the former (harness-init 0.1.0) template shape and migrates its content without re-asking settled answers: a `## First Run` section's install/run/toolchain content merges into `## Development Environment`; a standalone `## Verification` section's layer table becomes the Workflow table's verification row (and the non-verification phases are the only genuinely new question, since 0.1.0 never asked them); a `## Short-Term Work-Unit Tool` section's declaration becomes the Harness section's `work-unit tool:` bullet. Update mode also recognizes a Workflow table whose last row is a verification phase carrying layered static/unit/e2e commands, and migrates it without re-asking the settled workflow answers: those commands stay in their row, and consumers infer the verification phase from the table. Legacy migrations no longer add a `Verification:` line; an existing interim `Verification: <phase name(s)>` (or `Verification: none`) line under the Workflow table is removed as surplus and reported as a resolved gap, leaving the table rows untouched. A Harness section lacking a `session memory:` bullet gains one (default `.project/handoff.md`), reported as a resolved gap alongside these migrations.

Update mode also migrates the pre-rename (agent-flow) shape without re-asking settled answers, reporting each migration as a resolved gap:

- A load directive or Harness-section note naming `open-skills:agent-flow` is rewritten to `open-skills:harness-flow`.
- A single `short-term memory:` bullet is split in two: a declared tool name moves to a new `work-unit tool:` bullet; a fallback contract-file location stays as the `short-term memory:` value, with `work-unit tool: none`. When the old bullet named a tool, ask only for the state-file location (default `.project/work-units/`).
- A `DECISIONS.md` or `FEATURES.md` holding inline `## D-NNN` / `## F-NNN` entries is split: each entry is copied verbatim into `decisions/D-NNN.md` or `features/F-NNN.md` with `Status: active` and `Supersedes: none` added, and the file is rewritten as the index. A legacy decision whose text explicitly reverses an earlier ID marks that earlier entry superseded and moves it to `decisions/archive/`.

## 2. Interview

One question per message. Offer multiple-choice options where possible, with your inferred answer listed first and marked as inferred. Cover six topics, in this order:

1. **Storage mode** — shared or private (see Storage modes), asked first because it decides where everything is written. Shared is the inferred default; list private first as inferred only when the survey suggests it (e.g. the user states the repo is maintained by others). Skipped in update mode.
2. **VCS strategy declaration** — ask an open question expecting a proper-noun answer (e.g. "git-flow", "trunk-based development, commitizen for commit messages"): what VCS model and conventions govern this project? Offer the survey's inference (from `.git`, `.jj/`, branch names, commit history) as the suggested answer, phrased as a proper noun in the same vocabulary — not a menu of strategy skills. Accept "no formal process" as a valid answer for a solo/simple repo. By default, write exactly one sentence into the Version Control section naming the model and conventions. Write a detailed paragraph only when the user volunteers a concrete process beyond the name. Record a named VCS-strategy skill (with a load-before-operating instruction) only when the user declares one; if the user both names a skill and describes a process, the sentence names the skill and the paragraph carries the described process.
3. **Short-term memory** — two parts. (a) Which external tool, if any, carries in-flight change/task state (e.g. OpenSpec, an issue tracker plus branch convention, a plain tasks file); write it into the Harness section's `work-unit tool:` bullet, or `none` if the user declines to declare one. Do not invent a tool the project does not use. (b) Where the harness keeps its own work-unit state files — one per work unit, carrying the sprint contract and loop state, used whether or not a tool is declared; write that location into the `short-term memory:` bullet (default `.project/work-units/` unless the user declares another path).
4. **Workflow** — ask how many phases the user's workflow has, what each is called, and HOW each phase is executed: a runnable command, a skill or slash-command name, a described manual step, or TBD when the execution method is not yet decided. Init MAY propose a lifecycle inferred from the surveyed repo type as a starting point (e.g. script/config repo → edit→verify; library or app with a test suite → plan→build→verify; larger multi-component project → spec→plan→build→verify or longer), but MUST NOT mandate phase count, naming, ordering, or a verification-last position — the user's answer stands as declared. No verification designation is asked: the Workflow table itself is the complete declaration, and consumers infer the verification phase(s) from phase names and HOW content. A HOW answered TBD is recorded verbatim in that row's How column, with a warning at record time that the phase is not executable. When no declared phase is inferable as verifying the work, warn that the harness-flow loop will then have only per-contract Verification Standards to run. "No formal process, edit directly" is a valid answer and still yields at minimum an edit→verify lifecycle.
5. **Hard-constraint extraction** — ask what the project must and must not do (invariants, prohibited patterns, non-negotiable rules), independent of what a linter already enforces. Each answer becomes one `.harness/CONSTRAINTS.md` entry: rule (MUST/MUST NOT), source (why it exists), applicability (when it applies). Stop collecting at 15 entries; if more surface, ask the user which existing ones to consolidate or drop rather than exceeding the budget.
6. **Repo structure and environment** — confirm survey inferences only: the purpose of key directories (only those an agent would get wrong without being told), toolchain/tools (language versions, package managers), external services, and env-var shapes (names, purpose, how to obtain — never values). Install and run/start commands are not interview items here — they belong in the Workflow table if the user's declared workflow uses them. Skip anything already inferable from manifests, lockfiles, or CI config.

Execute every executable command collected in the workflow topic, or at minimum dry-run it (`--help` or equivalent), before writing it into the harness declaration. Manual prose steps and TBD entries are exempt. If a command does not exist or fails to run, say so and ask for a working one instead of writing an unverified command.

If the project requires environment variables or secrets to run, document their shape only — variable names, purpose, and how to obtain a value (dashboard, vault, generation command) — and point at `.env.example` where present. Never write a secret value into the harness declaration or `.harness/`, and never read the contents of gitignored secret files (e.g. `.env`) during the survey or interview.

If the user asks init to also implement functionality (write feature code, fix a bug, add a dependency beyond what init itself needs), decline: finish initialization first, then defer the implementation work to the harness-flow loop (`/open-skills:harness-flow`). Init writes only the harness declaration and `.harness/` scaffolding (plus, in private mode, the `CLAUDE.local.md` shim and its local exclude entry) — never feature code.

## 3. Fill the template and self-check

Read this skill's `CLAUDE.md.template` at `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/CLAUDE.md.template` and fill every `{{placeholder}}` from the survey and interview. In private mode the filled template is `HARNESS.md` — same template, same sections. `{{project_name}}` comes from the survey (manifest or README). The opening load directive is fixed template text — never collected from the interview.

Fill `{{repo_structure_tree}}` as `tree` CLI format, using `├──`/`└──` connectors, inside the template's ```tree fence, and include key file names (manifests, primary entry files such as `SKILL.md`) — not directories only. Add an inline `#` comment only on entries an agent would get wrong without being told.

Fill the Workflow table with one row per user-declared phase, in the user's declared order — phase count, naming, and order are the user's, not mandated. No `Verification:` line follows the table — the table itself is the complete workflow declaration, and consumers infer the verification phase(s) from phase names and HOW content. Every command in the table must be copy-paste runnable as written — no unresolved placeholders or paraphrased commands; manual steps are recorded as prose, and TBD is recorded verbatim where the execution method is not yet decided.

Fill the Harness section as a bullet list only: the version bullet (`open-skills plugin version: v<version>`), the four `.harness/` file links each with a one-line applicability note, a `short-term memory:` bullet carrying the work-unit state file location, a `work-unit tool:` bullet carrying the declared tool (or `none`), a `session memory:` bullet carrying the handoff file location (default `.project/handoff.md` unless the user declares another path), and the merge-moment write-discipline note. Fill the version bullet by reading `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` at fill time. If the manifest cannot be read, omit the version bullet entirely — do not guess a version — and note the omission in the final report.

In private mode, resolve the harness root now (slug and collision rule under Storage modes), then add a `project root: <absolute repo path>` bullet after the version bullet, and write the four `.harness/` file bullets, `short-term memory:`, and `session memory:` as absolute paths under the harness root (defaults `<harness root>/.project/work-units/` and `<harness root>/.project/handoff.md`). Expand `~` in every written path.

Draft `.harness/ARCHITECTURE.md` and `.harness/CONSTRAINTS.md` alongside CLAUDE.md, instantiating this skill's `ARCHITECTURE.md.template` and `CONSTRAINTS.md.template` at `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/` with the survey's module map and the interview's constraint entries. `.harness/DECISIONS.md` and `.harness/FEATURES.md` are drafted as indexes with only their template's format header — no rows, and no `decisions/` or `features/` detail directories; those are created at the first merge moment that writes an entry. Existing project history is NOT backfilled into `FEATURES.md`: nothing is verified yet at init time.

Then, before showing the draft, run both self-check gates:

- **Readiness gate** — confirm the draft lets a reader: start the project, test it, see progress, and pick up next steps.
- **Fresh Session Test** — confirm a fresh session with only repo contents plus this draft could answer: what is this system, how is it organized, how do I run it, how do I verify it, and where are we now.

If either gate finds a gap, return to step 2 and ask the missing question before proceeding — do not paper over the gap with a placeholder.

Also check:

- No `{{` remains anywhere in the output.
- No section contradicts another, and none contradicts `.harness/CONSTRAINTS.md`.
- The harness declaration (CLAUDE.md, or HARNESS.md in private mode) is between 50 and 200 lines. If over budget, move detail out into `.harness/` (e.g. a fuller module map in ARCHITECTURE.md) or a topic doc, and link to it from the declaration, until it is back in budget. If under 50 lines, check whether a required topic was skipped rather than padding it.

## 4. User review

Show the complete draft — the harness declaration and the four `.harness/` files, plus in private mode the resolved harness root and the shim content — in the conversation, along with the two self-check gate results. Iterate until the user approves. Do not write any file before approval.

## 5. Write and scaffold

Shared mode:

- Write the approved CLAUDE.md to the repo root.
- Create `.harness/` (git-tracked) with exactly four files: `ARCHITECTURE.md`, `CONSTRAINTS.md`, `DECISIONS.md`, `FEATURES.md`, each containing the approved draft content.

Private mode — never create or edit the repo's `CLAUDE.md`, `.gitignore`, or any tracked file:

- Create the harness root `~/.open-skills/<slug>/` resolved in step 3. It is not git-managed: harness files there have no version history.
- Write the approved `HARNESS.md` there, and create `.harness/` there with the same four files.
- Write the root `CLAUDE.local.md` shim from `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/CLAUDE.local.md.template`, filling the absolute `HARNESS.md` path. If `CLAUDE.local.md` already exists, append the shim lines and keep its existing content.
- From the project root, resolve the local exclude file with `git rev-parse --git-path info/exclude` (works in worktrees) and append a `CLAUDE.local.md` line, creating the file if absent, only if not already listed. If the project is not a git repo, skip this step.

Both modes:

- In update mode, overwrite only files/sections that changed; leave still-correct content untouched. A legacy entry split (step 1) also writes the detail files under `.harness/decisions/` and `.harness/features/`.

## 6. Report

Report the storage mode, the harness root, what was written (the harness declaration, each `.harness/` file) and the two self-check gate results. In private mode, also report the `CLAUDE.local.md` shim write and the exclude-file write (or that it was skipped), and tell the user that Claude Code shows a one-time approval dialog for the external `HARNESS.md` import on the next session start — approve it, or the declaration is not loaded. In update mode, report the gaps found and how they were resolved. If the Harness section's version line was omitted because `.claude-plugin/plugin.json` could not be read, note that omission here.
