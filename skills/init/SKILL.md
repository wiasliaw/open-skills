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
- **slug** — the repo's absolute path with every character other than ASCII letters, digits, and `-` replaced by `-` (e.g. `/Users/me/Github/foobar` → `-Users-me-Github-foobar`). Used once, at external first init, to name the directory (collisions in step 4) — never as a lookup key: an existing private harness is found by step 1's `project root:` scan, and afterwards the shim's explicit path is the repo → harness pointer.

## Checklist

Work through these in order. Do not skip or reorder.

1. Detect the adoption state
2. Survey the repo
3. Interview the user — one question at a time
4. Fill the template and self-check
5. User reviews the draft
6. Write the harness declaration and scaffold `.harness/`
7. Report

## 1. Detect the adoption state

Before surveying or asking anything, gather all of this evidence. This step only reads; it writes nothing.

- **Project root `P`** — `git rev-parse --show-toplevel` in a git repo, else `pwd -P`. `P` names the slug and fills the `project root:` bullet. Compare every path after expanding `~` and resolving symlinks.
- **Project evidence**, in `P`: a root `CLAUDE.md` carrying the **adoption marker** — a load directive naming `open-skills:harness-flow` (or the legacy `open-skills:agent-flow`), a `## Harness` section, or the legacy harness-init 0.1.0 `## Short-Term Work-Unit Tool` section; or a root `.harness/` directory. A root `CLAUDE.md` without the adoption marker is ordinary project content, not an adoption. Also note whether an unmarked root `CLAUDE.md` or a root `AGENTS.md` exists (topic 1's inference only).
- **Shim**, in `P`: does root `CLAUDE.local.md` exist; is it tracked (`git ls-files --error-unmatch CLAUDE.local.md` succeeds; never tracked outside git); does it contain an `@` import whose target ends in `/HARNESS.md` (the shim); does that target exist; does its `project root:` equal `P`?
- **External matches**: read only the `project root:` bullet of each `~/.open-skills/*/HARNESS.md` (one level deep; no other file) and collect the directories whose value equals `P`.

External evidence is a shim or at least one external match. Classify by the first rule that applies:

1. **Anomaly — stop, report the evidence, ask the user; write nothing until resolved:**
   - project evidence and external evidence both exist (two declarations);
   - dangling shim (import target missing) — options: recreate a private harness at the shim's path (continue as external first init with that directory as the harness root), or remove the shim and start over (first init);
   - shim target's `project root:` ≠ `P` (repo moved or copied) — options: adopt it (external re-init; update its `project root:` to `P`), or start fresh (first init);
   - no shim and more than one external match — list them; the user picks one (external re-init against it) or starts fresh;
   - `CLAUDE.local.md` is tracked and private mode is detected (any rule 3 case) or chosen (topic 1) — private mode cannot be installed without editing a tracked file.
2. **project re-init** — project evidence, no external evidence → shared update mode.
3. **external re-init** — a shim whose target exists with `project root:` = `P`, or no shim and exactly one external match → private update mode against that harness root (the shim target's directory, or the matched directory). With no shim, step 6 re-attaches it.
4. **first init** — no project evidence, no external evidence → topic 1 asks the storage mode; the answer makes it **project first init** or **external first init**.

State the classification with its evidence in one or two sentences before the first interview question.

### Update mode (project re-init, external re-init)

Work against the detected harness declaration and harness root: project re-init — root `CLAUDE.md` and/or `.harness/` in `P`; external re-init — the detected `HARNESS.md` and its directory. The classification settles the storage mode: do not re-ask it, do not run a fresh interview, and do not move files between modes. In update mode: keep sections and files that are still correct, and ask only about missing or stale fields. Still run both self-check gates (step 4) against current repo state, and report the gaps found — update mode is the plugin's audit mechanism, so gap reporting is not optional even when nothing changes.

Update mode also recognizes the former (harness-init 0.1.0) template shape and migrates its content without re-asking settled answers: a `## First Run` section's install/run/toolchain content merges into `## Development Environment`; a standalone `## Verification` section's layer table becomes the Workflow table's verification row (and the non-verification phases are the only genuinely new question, since 0.1.0 never asked them); a `## Short-Term Work-Unit Tool` section's declaration becomes the Harness section's `work-unit tool:` bullet. Update mode also recognizes a Workflow table whose last row is a verification phase carrying layered static/unit/e2e commands, and migrates it without re-asking the settled workflow answers: those commands stay in their row, and consumers infer the verification phase from the table. Legacy migrations no longer add a `Verification:` line; an existing interim `Verification: <phase name(s)>` (or `Verification: none`) line under the Workflow table is removed as surplus and reported as a resolved gap, leaving the table rows untouched. A Harness section lacking a `session memory:` bullet gains one (default `.project/handoff.md`), reported as a resolved gap alongside these migrations.

Update mode also migrates the pre-rename (agent-flow) shape without re-asking settled answers, reporting each migration as a resolved gap:

- A load directive or Harness-section note naming `open-skills:agent-flow` is rewritten to `open-skills:harness-flow`.
- A single `short-term memory:` bullet is split in two: a declared tool name moves to a new `work-unit tool:` bullet; a fallback contract-file location stays as the `short-term memory:` value, with `work-unit tool: none`. When the old bullet named a tool, ask only for the state-file location (default `.project/work-units/`).
- A `DECISIONS.md` or `FEATURES.md` holding inline `## D-NNN` / `## F-NNN` entries is split: each entry is copied verbatim into `decisions/D-NNN.md` or `features/F-NNN.md` with `Status: active` and `Supersedes: none` added, and the file is rewritten as the index. A legacy decision whose text explicitly reverses an earlier ID marks that earlier entry superseded and moves it to `decisions/archive/`.

## 2. Survey the repo

Read before asking anything:

- Directory structure (two levels deep)
- README, any existing CLAUDE.md or CLAUDE.local.md
- Manifests and lockfiles: package.json, Cargo.toml, pyproject.toml, go.mod, Makefile, …
- Recent git log (commit message style), if git exists in the repo
- CI config (.github/workflows, .gitlab-ci.yml, …)
- Existing docs directories

Anything inferable from files is NOT asked. The interview confirms inferences and fills gaps only.

## 3. Interview

One question per message. Offer multiple-choice options where possible, with your inferred answer listed first and marked as inferred. Cover six topics, in this order:

1. **Storage mode** — shared or private (see Storage modes), asked first because it decides where everything is written. Asked only in first init; in any re-init step 1's classification settles it. List private first as inferred when step 1 found an unmarked root `CLAUDE.md` or a root `AGENTS.md`, else shared. The answer makes the run **project first init** (shared) or **external first init** (private). If `CLAUDE.local.md` is tracked, private is unavailable: say so when asking, and if private is chosen anyway, stop and ask (step 1 anomaly).
2. **VCS strategy declaration** — ask an open question expecting a proper-noun answer (e.g. "git-flow", "trunk-based development, commitizen for commit messages"): what VCS model and conventions govern this project? Offer the survey's inference (from `.git`, `.jj/`, branch names, commit history) as the suggested answer, phrased as a proper noun in the same vocabulary — not a menu of strategy skills. Accept "no formal process" as a valid answer for a solo/simple repo. By default, write exactly one sentence into the Version Control section naming the model and conventions. Write a detailed paragraph only when the user volunteers a concrete process beyond the name. Record a named VCS-strategy skill (with a load-before-operating instruction) only when the user declares one; if the user both names a skill and describes a process, the sentence names the skill and the paragraph carries the described process.
3. **Short-term memory** — two parts. (a) Which external tool, if any, carries in-flight change/task state (e.g. OpenSpec, an issue tracker plus branch convention, a plain tasks file); write it into the Harness section's `work-unit tool:` bullet, or `none` if the user declines to declare one. Do not invent a tool the project does not use. (b) Where the harness keeps its own work-unit state files — one per work unit, carrying the sprint contract and loop state, used whether or not a tool is declared; write that location into the `short-term memory:` bullet (default `.project/work-units/` unless the user declares another path).
4. **Workflow** — ask how many phases the user's workflow has, what each is called, and HOW each phase is executed: a runnable command, a skill or slash-command name, a described manual step, or TBD when the execution method is not yet decided. Init MAY propose a lifecycle inferred from the surveyed repo type as a starting point (e.g. script/config repo → edit→verify; library or app with a test suite → plan→build→verify; larger multi-component project → spec→plan→build→verify or longer), but MUST NOT mandate phase count, naming, ordering, or a verification-last position — the user's answer stands as declared. No verification designation is asked: the Workflow table itself is the complete declaration, and consumers infer the verification phase(s) from phase names and HOW content. A HOW answered TBD is recorded verbatim in that row's How column, with a warning at record time that the phase is not executable. When no declared phase is inferable as verifying the work, warn that the harness-flow loop will then have only per-contract Verification Standards to run. "No formal process, edit directly" is a valid answer and still yields at minimum an edit→verify lifecycle.
5. **Hard-constraint extraction** — ask what the project must and must not do (invariants, prohibited patterns, non-negotiable rules), independent of what a linter already enforces. Each answer becomes one `.harness/CONSTRAINTS.md` entry: rule (MUST/MUST NOT), source (why it exists), applicability (when it applies). Stop collecting at 15 entries; if more surface, ask the user which existing ones to consolidate or drop rather than exceeding the budget.
6. **Repo structure and environment** — confirm survey inferences only: the purpose of key directories (only those an agent would get wrong without being told), toolchain/tools (language versions, package managers), external services, and env-var shapes (names, purpose, how to obtain — never values). Install and run/start commands are not interview items here — they belong in the Workflow table if the user's declared workflow uses them. Skip anything already inferable from manifests, lockfiles, or CI config.

Execute every executable command collected in the workflow topic, or at minimum dry-run it (`--help` or equivalent), before writing it into the harness declaration. Manual prose steps and TBD entries are exempt. If a command does not exist or fails to run, say so and ask for a working one instead of writing an unverified command.

If the project requires environment variables or secrets to run, document their shape only — variable names, purpose, and how to obtain a value (dashboard, vault, generation command) — and point at `.env.example` where present. Never write a secret value into the harness declaration or `.harness/`, and never read the contents of gitignored secret files (e.g. `.env`) during the survey or interview.

If the user asks init to also implement functionality (write feature code, fix a bug, add a dependency beyond what init itself needs), decline: finish initialization first, then defer the implementation work to the harness-flow loop (`/open-skills:harness-flow`). Init writes only the harness declaration and `.harness/` scaffolding (plus, in private mode, the `CLAUDE.local.md` shim and its local exclude entry) — never feature code.

## 4. Fill the template and self-check

Read this skill's `CLAUDE.md.template` at `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/CLAUDE.md.template` and fill every `{{placeholder}}` from the survey and interview. In private mode the filled template is `HARNESS.md` — same template, same sections. `{{project_name}}` comes from the survey (manifest or README). The opening load directive is fixed template text — never collected from the interview.

Fill `{{repo_structure_tree}}` as `tree` CLI format, using `├──`/`└──` connectors, inside the template's ```tree fence, and include key file names (manifests, primary entry files such as `SKILL.md`) — not directories only. Add an inline `#` comment only on entries an agent would get wrong without being told.

Fill the Workflow table with one row per user-declared phase, in the user's declared order — phase count, naming, and order are the user's, not mandated. No `Verification:` line follows the table — the table itself is the complete workflow declaration, and consumers infer the verification phase(s) from phase names and HOW content. Every command in the table must be copy-paste runnable as written — no unresolved placeholders or paraphrased commands; manual steps are recorded as prose, and TBD is recorded verbatim where the execution method is not yet decided.

Fill the Harness section as a bullet list only: the version bullet (`open-skills plugin version: v<version>`), the four `.harness/` file links each with a one-line applicability note, a `short-term memory:` bullet carrying the work-unit state file location, a `work-unit tool:` bullet carrying the declared tool (or `none`), a `session memory:` bullet carrying the handoff file location (default `.project/handoff.md` unless the user declares another path), and the merge-moment write-discipline note. Fill the version bullet by reading `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` at fill time. If the manifest cannot be read, omit the version bullet entirely — do not guess a version — and note the omission in the final report.

In private mode, resolve the harness root now. External first init: after step 1's recreate option, the dangling shim's target directory; otherwise `~/.open-skills/<slug>/`, and if that directory exists — it cannot name `P`, step 1's scan would have found it — append `-2`, `-3`, … until the name is free. External re-init: the harness root detected in step 1. Then add (or, in external re-init, set) a `project root: <P>` bullet after the version bullet, and write the four `.harness/` file bullets, `short-term memory:`, and `session memory:` as absolute paths under the harness root (defaults `<harness root>/.project/work-units/` and `<harness root>/.project/handoff.md`). Expand `~` in every written path.

Draft `.harness/ARCHITECTURE.md` and `.harness/CONSTRAINTS.md` alongside the harness declaration, instantiating this skill's `ARCHITECTURE.md.template` and `CONSTRAINTS.md.template` at `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/` with the survey's module map and the interview's constraint entries. `.harness/DECISIONS.md` and `.harness/FEATURES.md` are drafted as indexes with only their template's format header — no rows, and no `decisions/` or `features/` detail directories; those are created at the first merge moment that writes an entry. Existing project history is NOT backfilled into `FEATURES.md`: nothing is verified yet at init time.

Then, before showing the draft, run both self-check gates:

- **Readiness gate** — confirm the draft lets a reader: start the project, test it, see progress, and pick up next steps.
- **Fresh Session Test** — confirm a fresh session with only repo contents plus this draft could answer: what is this system, how is it organized, how do I run it, how do I verify it, and where are we now.

If either gate finds a gap, return to step 3 and ask the missing question before proceeding — do not paper over the gap with a placeholder.

Also check:

- No `{{` remains anywhere in the output.
- No section contradicts another, and none contradicts `.harness/CONSTRAINTS.md`.
- The harness declaration (CLAUDE.md, or HARNESS.md in private mode) is between 50 and 200 lines. If over budget, move detail out into `.harness/` (e.g. a fuller module map in ARCHITECTURE.md) or a topic doc, and link to it from the declaration, until it is back in budget. If under 50 lines, check whether a required topic was skipped rather than padding it.

## 5. User review

Show the complete draft — the harness declaration and the four `.harness/` files, plus in private mode the resolved harness root and the shim content — in the conversation, along with the two self-check gate results. Iterate until the user approves. Do not write any file before approval.

## 6. Write and scaffold

Shared mode:

- Write the approved CLAUDE.md to the repo root. In project first init over an unmarked root `CLAUDE.md`, keep its existing content and add the harness sections to it.
- Create `.harness/` (git-tracked) with exactly four files: `ARCHITECTURE.md`, `CONSTRAINTS.md`, `DECISIONS.md`, `FEATURES.md`, each containing the approved draft content.

Private mode — never create or edit the repo's `CLAUDE.md`, `.gitignore`, or any tracked file:

- External first init: create the harness root resolved in step 4. It is not git-managed: harness files there have no version history. Write the approved `HARNESS.md` there, and create `.harness/` there with the same four files. An unmarked root `CLAUDE.md` is left untouched.
- External re-init: update the detected `HARNESS.md` and `.harness/` files by the update-mode rules — never replace them wholesale.
- Write the root `CLAUDE.local.md` shim from `${CLAUDE_PLUGIN_ROOT}/skills/init/templates/CLAUDE.local.md.template`, filling the absolute `HARNESS.md` path, whenever `CLAUDE.local.md` has no shim or its shim does not import this `HARNESS.md` (external first init; re-attach in external re-init). If `CLAUDE.local.md` has no shim, append the shim lines and keep its existing content; if it already has one, replace that `@…/HARNESS.md` import line in place — never add a second one.
- From the project root, resolve the local exclude file with `git rev-parse --git-path info/exclude` (works in worktrees) and append a `CLAUDE.local.md` line, creating the file if absent, only if not already listed. If the project is not a git repo, skip this step.

Both modes:

- In project re-init and external re-init (update mode), overwrite only files/sections that changed; leave still-correct content untouched. A legacy entry split (step 1) also writes the detail files under `.harness/decisions/` and `.harness/features/`.
- A first init never overwrites an existing file in a harness root (the unmarked root `CLAUDE.md` merge above is not an overwrite); if a file to be written already exists, stop and ask.

## 7. Report

Report the classification from step 1, the storage mode, the harness root, what was written (the harness declaration, each `.harness/` file) and the two self-check gate results. In private mode, also report the `CLAUDE.local.md` shim write (in external re-init, whether the shim was restored by re-attach) and the exclude-file write (or that it was skipped), and tell the user that Claude Code shows a one-time approval dialog for the external `HARNESS.md` import on the next session start — approve it, or the declaration is not loaded. In update mode, report the gaps found and how they were resolved. If the Harness section's version line was omitted because `.claude-plugin/plugin.json` could not be read, note that omission here.
