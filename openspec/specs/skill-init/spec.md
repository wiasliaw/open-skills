## Purpose

The rebuilt init skill: narrowed interview, tool-availability gate, and orchestrator-independent outputs.

## Requirements

### Requirement: Six-step session flow
The init skill SHALL run as a manual entry point only (`/open-skills:init`, `disable-model-invocation: true`) and SHALL proceed through six steps in order: survey the repo, interview the user one question at a time, fill the template and self-check, user review of the complete draft, write the approved files, report. The skill MUST NOT write any output file before the user approves the draft, and MUST NOT write feature code under any circumstances.

#### Scenario: Review gates the write
- **WHEN** the draft CLAUDE.md and worktree-setup.json have not been approved by the user
- **THEN** init SHALL NOT write either file

#### Scenario: Implementation requests declined
- **WHEN** the user asks init to also implement functionality
- **THEN** init SHALL decline and finish initialization only

### Requirement: Narrowed interview
The interview SHALL cover exactly four topics, in order: VCS strategy, workflow phases (count, names, and HOW each executes), repo structure and environment confirmation, and worktree setup needs. Anything inferable from the survey (manifests, lockfiles, CI config, git history) MUST NOT be asked; the interview confirms inferences and fills gaps. The skill MUST NOT ask about short-term memory tools, harness adoption, or hard-constraint extraction — those topics belong to the future harness rebuild.

#### Scenario: Inferred answers offered first
- **WHEN** a topic has a survey-inferable answer
- **THEN** init SHALL present the inference as the suggested answer instead of an open question

#### Scenario: No harness topics
- **WHEN** the interview runs
- **THEN** no question SHALL concern load directives, `.harness/` memory files, or work-unit tools

### Requirement: Orchestrator-independent outputs only
Init SHALL produce exactly three artifacts: a root `CLAUDE.md` containing project knowledge (structure, development environment, version control, workflow) with no skill load directive and no Harness section; the worktree setup config `.harness/worktree-setup.json`; and the project config `.harness/config.json` carrying the interview's machine-readable record (VCS declaration and workflow phases with their execution methods), so scripts and the future orchestrator consume the declarations without parsing CLAUDE.md. Init MUST NOT scaffold `.harness/` index files (ARCHITECTURE/CONSTRAINTS/DECISIONS/FEATURES) or decision/feature entry formats. Init MUST NOT hand-write either config file: it drafts the JSON and validates and writes it through the `init-script` capability (`scripts/init.mjs`), treating a validation failure as a gap to fix before the draft is shown.

#### Scenario: CLAUDE.md shape
- **WHEN** init writes CLAUDE.md
- **THEN** it SHALL contain no `open-skills:*` load directive and no `## Harness` section, and SHALL stay within the 50–200 line budget

#### Scenario: No memory scaffold
- **WHEN** init completes
- **THEN** the only files under `.harness/` that init has written SHALL be `worktree-setup.json` and `config.json`, both through the init script

#### Scenario: Script-mediated write
- **WHEN** init writes either config file
- **THEN** it SHALL do so via `node scripts/init.mjs write --kind <kind> --from <draft>` and SHALL NOT write the canonical file directly

### Requirement: Tool-availability gate
During the survey and before recording workflow commands, init SHALL verify that every declared executable command and required CLI runs (execute it, or dry-run via `--help` or equivalent). A command that cannot run MUST NOT be written into CLAUDE.md; init SHALL ask for a working one. If a required tool is unavailable and no substitute is declared, init SHALL end with a blocking report naming the missing tool.

#### Scenario: Tool missing
- **WHEN** a required CLI, test, or deploy tool is unavailable
- **THEN** init SHALL report the missing tool by name as blocking instead of writing an unverified command

### Requirement: Worktree setup recording
Init SHALL investigate what a fresh `git worktree add` lacks (a fresh worktree contains tracked files only): the setup command or commands that regenerate dependencies, and untracked assets that cannot be cheaply regenerated (env files, large data), which must be copied. Init SHALL confirm findings in the interview and SHALL write `.harness/worktree-setup.json` with the schema `{"version": 1, "setup": [<command>...], "copy": [{"path": <repo-relative>, "readonly": <boolean, optional>}...]}`. Init SHALL write the file even when nothing is needed, with `setup` and `copy` as explicitly empty lists. Init is the single writer of this file: no other actor edits it.

#### Scenario: Needs found
- **WHEN** the survey finds a dependency install command and an untracked env file
- **THEN** init SHALL write the command into `setup` and the env file path into `copy`

#### Scenario: Nothing needed
- **WHEN** nothing is required to make a fresh worktree workable
- **THEN** init SHALL still write the file with empty `setup` and `copy` lists

#### Scenario: Existing .worktreeinclude translated
- **WHEN** the repo has a `.worktreeinclude` file
- **THEN** init SHALL translate its concrete paths into `copy` entries and SHALL report any glob patterns to the user for manual decision instead of translating them

### Requirement: No legacy migration handling
The rebuilt skill MUST NOT carry migration logic for pre-release shapes (harness-init 0.1.0, agent-flow, inline D-/F- entries). On a repo whose CLAUDE.md predates this rebuild, init SHALL run its normal update mode: keep still-correct sections, re-ask only missing or stale fields, and remove a load directive or Harness section pointing at skills this plugin no longer ships, reporting each removal.

#### Scenario: Pre-rebuild CLAUDE.md encountered
- **WHEN** init runs on a repo whose CLAUDE.md carries a `open-skills:harness-flow` load directive
- **THEN** init SHALL remove the directive, report the removal, and SHALL NOT invoke any legacy-shape migration path
