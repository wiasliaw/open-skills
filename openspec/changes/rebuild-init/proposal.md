## Why

After `remove-harness-and-relocate-scripts`, the current init skill is wrong on two fronts: its output contract targets a harness loop that no longer exists (CLAUDE.md load directive, Harness section, `.harness/` four-file scaffold), and it carries legacy-migration baggage (harness-init 0.1.0 and agent-flow shapes) for installations that predate any public release. Meanwhile `.harness/worktree-setup.json` — the config `worktree.mjs setup` reads — still has no producer; the `graph-init-bootstrap` spec assigns that job to init.

## What Changes

- **BREAKING** Rebuild `skills/init/SKILL.md`, keeping the six-step skeleton (survey → interview → fill + self-check → user review → write → report) but rewriting the content:
  - Drop all legacy-migration handling (harness-init 0.1.0, agent-flow, inline D-/F- entry splitting).
  - Narrow the output contract to orchestrator-independent artifacts only: a root `CLAUDE.md` **without** a load directive or Harness section, plus two machine-readable configs — `.harness/worktree-setup.json` and `.harness/config.json` (the interview's machine-readable record: VCS declaration and workflow phases with their commands, so scripts and the future orchestrator consume it without parsing CLAUDE.md). The Harness section, `.harness/` four-file scaffold, and D-/F- entry formats are deferred to the future harness rebuild, so the init↔orchestrator contract is designed once, not twice.
  - Config mechanics move to a script, mirroring the worktree.mjs pattern (mechanics in `scripts/`, policy in SKILL.md): a new zero-dependency `scripts/init.mjs` owns schema validation and atomic writing of both configs; the agent drafts JSON but never hand-writes the files.
  - Narrow the interview accordingly: keep VCS strategy, workflow phases, and repo-structure/environment confirmation; add a worktree-setup topic; drop the short-term-memory and hard-constraint-extraction topics (their outputs lived in the deferred Harness section and `.harness/CONSTRAINTS.md`).
  - Add tool-availability checking per `graph-init-bootstrap`: verify the declared workflow commands and required CLIs run; a missing required tool is reported to the human as blocking.
  - Add worktree-setup generation per `graph-init-bootstrap`: survey what a fresh worktree lacks (dependency install commands, untracked assets such as `.env`), confirm in the interview, and always write `.harness/worktree-setup.json` (empty `setup`/`copy` lists when nothing is needed). Translate an existing `.worktreeinclude` file's concrete paths into `copy` entries where present (globs cannot be translated; report them).
- **BREAKING** Templates: rewrite `CLAUDE.md.template` (no load directive, no Harness section); delete `ARCHITECTURE.md.template`, `CONSTRAINTS.md.template`, `DECISIONS.md.template`, `FEATURES.md.template`, `DECISION-ENTRY.md.template`, `FEATURE-ENTRY.md.template` (deferred to the harness rebuild); add a `worktree-setup.json` example or template.
- Update `docs/` and `README.md` rows describing init to the new scope.
- Out of scope: the harness-flow rebuild and everything it owns (Harness section, `.harness/` scaffold, memory write discipline); changing `worktree.mjs`.

## Capabilities

### New Capabilities

- `skill-init`: the rebuilt init skill page — six-step flow, narrowed interview, tool-availability gate, orchestrator-independent outputs (CLAUDE.md + two configs), and single-writer ownership of both config files, written only through the init script.
- `init-script`: the zero-dependency Node.js script `scripts/init.mjs` that validates and atomically writes `.harness/worktree-setup.json` and `.harness/config.json`, with the same stdout-JSON / exit-code conventions as `worktree-script`.

### Modified Capabilities

(none — `graph-init-bootstrap` in the unarchived `graph-engineering-node-specs` change is partially implemented by this change, not modified: the worktree-setup and tool-check requirements land here; its graph-routing requirements await the harness rebuild.)

## Impact

- Rewritten: `skills/init/SKILL.md`, `skills/init/templates/CLAUDE.md.template`.
- Deleted: six `.harness/`-related templates under `skills/init/templates/`.
- Added: worktree-setup and config templates/examples under `skills/init/templates/`; `scripts/init.mjs` + `scripts/init.test.mjs`.
- Edited: `README.md`, `docs/` page covering init.
- Depends on: `remove-harness-and-relocate-scripts` (must land first — it removes the load directive the old template still carries).
- Related unarchived changes: `graph-engineering-node-specs` (`graph-init-bootstrap` spec is the source for the worktree-setup and tool-check requirements).
