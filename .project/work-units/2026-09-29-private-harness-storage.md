# Work Unit: 2026-09-29-private-harness-storage

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-private-harness-storage
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source issue: Linear WOR-27, "root path option for store harness"; branch `feature/wor-27-root-path-option-for-store-harness`)

## Contract

### Scope

Add a **private** harness storage mode alongside the existing **shared**
mode, so a user can adopt the harness in a project maintained by others
without leaving harness files in the repo.

Terms (use these consistently across all touched files):

- **Shared mode** — current behavior: root `CLAUDE.md` + `.harness/` +
  `.project/` inside the repo, git-tracked.
- **Private mode** — the whole harness tree lives outside the repo at
  `~/.open-skills/<slug>/`, which is **not git-managed**.
- **slug** — the repo's absolute path with every character other than
  ASCII letters, digits, and `-` replaced by `-` (e.g.
  `/Users/wiasliaw/Github/foobar` → `-Users-wiasliaw-Github-foobar`),
  the same shape as Claude Code's `~/.claude/projects/`. The slug is used
  only once, at init, to name the directory; it is never used as a lookup
  key.
- **harness declaration** — the file that declares adoption: root
  `CLAUDE.md` in shared mode; `~/.open-skills/<slug>/HARNESS.md` in
  private mode, reached from the repo's root `CLAUDE.local.md` shim.
- **harness root** — the directory holding `.harness/` and `.project/`:
  the project root in shared mode; `~/.open-skills/<slug>/` in private mode.

Private-mode layout (internal structure identical to shared mode):

```
~/.open-skills/<slug>/
├── HARNESS.md      # harness declaration
├── .harness/       # ARCHITECTURE.md, CONSTRAINTS.md, DECISIONS.md, FEATURES.md (+ decisions/, features/ later)
└── .project/
    ├── work-units/ # short-term memory (default)
    └── handoff.md  # session memory (default)
```

Orchestrator decisions binding on this contract:

- D-a. `HARNESS.md` is the same filled `CLAUDE.md.template` (all
  sections: load directive, Repo Structure, Development Environment,
  Version Control, Workflow, Harness), plus one extra Harness bullet
  `project root: <absolute repo path>` (the back-pointer). Its Harness
  bullets for `.harness/` files, `short-term memory:`, and
  `session memory:` carry absolute paths under the harness root. One
  template, one shape — the consumers see the same sections in both modes.
- D-b. The shim is `CLAUDE.local.md` at the repo root, one to two lines,
  containing a Claude Code `@` import of the absolute path to
  `HARNESS.md` (e.g. `@/Users/wiasliaw/.open-skills/-Users-wiasliaw-Github-foobar/HARNESS.md`),
  so Claude Code loads the declaration at session start. The explicit
  path in the shim is the authoritative repo → harness pointer (still
  valid if the slug rule would now produce a different name). Shipped as
  a new template `skills/init/templates/CLAUDE.local.md.template`.
- D-c. Private-mode init never creates or edits the repo's `CLAUDE.md`,
  `.gitignore`, or any tracked file. It appends `CLAUDE.local.md` to the
  local exclude file resolved by `git rev-parse --git-path info/exclude`
  (works in worktrees), only if not already listed; if the project is not
  a git repo, the exclude step is skipped.
- D-d. No central registry. harness root → repo is the `project root:`
  bullet; listing or orphan cleanup scans `~/.open-skills/*/HARNESS.md`.
  On slug collision (directory exists and its `HARNESS.md`'s
  `project root:` names a different path), init appends a numeric suffix
  (`-2`, `-3`, …). If it names the same path, that is update mode.

Required behavior by file:

1. **init** (`skills/init/SKILL.md`, `skills/init/templates/`):
   - Interview gains a storage-mode question (shared vs private), asked
     first, since it decides where everything is written. Shared is the
     inferred default unless the survey suggests otherwise (e.g. the user
     states the repo is maintained by others). Remaining topics keep
     their order.
   - Survey detects an existing private adoption (root `CLAUDE.local.md`
     importing a `HARNESS.md`) as well as a shared one, and enters update
     mode against the harness declaration and harness root it finds.
   - Fill/self-check/review steps apply to `HARNESS.md` in private mode
     (same 50–200 line budget, same gates); `{{project_name}}` etc.
     unchanged.
   - Write step: shared mode unchanged (`.harness/` git-tracked).
     Private mode: create `~/.open-skills/<slug>/` (collision rule D-d),
     write `HARNESS.md`, scaffold `.harness/` there, write the
     `CLAUDE.local.md` shim from the new template, and apply D-c. State
     that `~/.open-skills/` is not git-managed.
   - Report step reports the mode, the harness root, and the shim/exclude
     writes in private mode, and the external-import approval prompt the
     user will see on the next session start.
   - `CLAUDE.md.template`: the Harness-section guidance comment notes the
     private-mode `project root:` bullet and absolute paths; no change to
     shared-mode output.
2. **harness-flow** (`skills/harness-flow/SKILL.md`, including its
   frontmatter `description`):
   - Applicability/trigger accepts a root `CLAUDE.local.md` that imports a
     `HARNESS.md` declaring adoption, not only root `CLAUDE.md`.
   - All reads of the declaration (Workflow table in Clock-in step 4,
     Harness bullets) come from the harness declaration; `.harness/`
     reads/writes (clock-in, merge moment) resolve against the harness
     root.
   - File-access scope: in private mode the harness root is project
     state and may be read/written; it is located only via the shim's
     explicit path, never by search. Declared paths may be absolute.
     The prohibition on filesystem-wide search and on reading other
     outside files stays.
   - Workflow commands still run from the project root.
   - Clock-out's "nothing left outside version control" check excludes
     the private-mode harness root (not git-managed by design); repo
     work is still checked.
3. **handoff** (`skills/handoff/SKILL.md`, including frontmatter
   `description` if it names root CLAUDE.md): step 1 resolves the
   `session memory:` bullet from the harness declaration (root
   `CLAUDE.md`, or `HARNESS.md` via the `CLAUDE.local.md` shim); the
   value may be an absolute path. In private mode the handoff file is not
   under version control.
4. **Docs** (`docs/harness.md`, `README.md` Skills-table harness row) —
   per C-002: document the two modes, the layout, the shim +
   `.git/info/exclude`, that `~/.open-skills/` is not git-managed (no
   history for harness files in private mode), the one-time
   external-import approval dialog, and that a `CLAUDE.local.md` stops
   Claude Code reading a repo's `AGENTS.md` by default (Project
   instructions setting `claude-md-and-agents-md` restores it).

All tracked content in English (C-001).

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `git diff --name-only main -- . ':!.project' ':!.harness'` lists only
   files among: `skills/init/SKILL.md`,
   `skills/init/templates/CLAUDE.md.template`,
   `skills/init/templates/CLAUDE.local.md.template`,
   `skills/harness-flow/SKILL.md`, `skills/handoff/SKILL.md`,
   `docs/harness.md`, `README.md` (new untracked files checked with
   `git status --porcelain`).
3. Feature-level grep checks listed in the Features table.

### Exclusions

- No codex / `AGENTS.md` shim or any non-Claude agent support (future
  work; WOR-27 "known limitation").
- No migration between modes (shared ↔ private) in init update mode.
- No central registry, no orphan-cleanup command.
- No changes to `agents/`, `skills/request-code-review/`,
  `skills/receive-code-review/`, `skills/harness-flow/templates/`,
  `skills/handoff/templates/`, or init's `.harness/` file templates
  (ARCHITECTURE/CONSTRAINTS/DECISIONS/FEATURES and entry templates).
- No version bump in `.claude-plugin/plugin.json`; no change to this
  repo's own `CLAUDE.md`.
- No change to shared-mode behavior beyond wording needed to name the
  mode.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | init offers shared/private storage; private mode scaffolds `~/.open-skills/<slug>/` with `HARNESS.md` + `.harness/`, writes the `CLAUDE.local.md` import shim and the local git exclude, and detects existing private adoptions for update mode | `claude plugin validate . && test -f skills/init/templates/CLAUDE.local.md.template && grep -q "HARNESS.md" skills/init/templates/CLAUDE.local.md.template && grep -q "~/.open-skills/" skills/init/SKILL.md && grep -q "CLAUDE.local.md" skills/init/SKILL.md && grep -q "info/exclude" skills/init/SKILL.md && grep -q "project root:" skills/init/SKILL.md && grep -q "not git-managed" skills/init/SKILL.md && grep -qi "private" skills/init/SKILL.md && grep -q "project root:" skills/init/templates/CLAUDE.md.template` | passed (F-002) |
| 2 | harness-flow and handoff resolve the harness declaration and harness root through the `CLAUDE.local.md` → `HARNESS.md` chain, accept absolute declared paths, and exempt the private harness root from the version-control clock-out check | `claude plugin validate . && sed -n 1,5p skills/harness-flow/SKILL.md \| grep -q "CLAUDE.local.md" && grep -q "HARNESS.md" skills/harness-flow/SKILL.md && grep -q "harness root" skills/harness-flow/SKILL.md && grep -qi "absolute" skills/harness-flow/SKILL.md && grep -q "CLAUDE.local.md" skills/handoff/SKILL.md && grep -q "HARNESS.md" skills/handoff/SKILL.md && grep -qi "absolute" skills/handoff/SKILL.md` | active |
| 3 | docs/harness.md and README describe the two storage modes, the private layout, the shim and local exclude, that `~/.open-skills/` is not git-managed, the external-import approval, and the AGENTS.md side effect | `grep -q "~/.open-skills/" docs/harness.md && grep -q "CLAUDE.local.md" docs/harness.md && grep -q "not git-managed" docs/harness.md && grep -q "info/exclude" docs/harness.md && grep -q "AGENTS.md" docs/harness.md && grep -qi "private" README.md` | not_started |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-29 — feature 1, round 1: pass — feature chain PASS, validate exit 0, diff within init files; all Scope item-1 bullets and D-a..D-d implemented; shared-mode output unchanged; exclusions untouched.

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Work unit created from Linear WOR-27 (design agreed 2026-09-29). Verified against Claude Code memory docs: `CLAUDE.local.md` is loaded and supports `@` imports of absolute/`~` paths; the first external import in a project triggers a one-time approval dialog; a `CLAUDE.local.md` counts as a CLAUDE.md and stops default `AGENTS.md` loading; Claude Code does not read `AGENTS.local.md`. Orchestrator decisions D-a..D-d recorded in the contract.
- 2026-09-29 — `open-skills:implementor` / `open-skills:reviewer` agent types are not installed in this session; they are dispatched as general-purpose agents carrying the verbatim `agents/implementor.md` / `agents/reviewer.md` instructions.
- 2026-09-29 — Feature 1 merged as F-002; D-002 recorded. Reviewer non-blocking notes: init step 3 still says "alongside CLAUDE.md" for the `.harness/` drafts; a missing shim with an existing matching `~/.open-skills/<slug>/HARNESS.md` is only recognized as update mode at step 3. Carried to the final request-code-review.
