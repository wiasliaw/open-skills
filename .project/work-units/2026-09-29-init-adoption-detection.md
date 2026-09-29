# Work Unit: 2026-09-29-init-adoption-detection

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-init-adoption-detection
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source issue: Linear WOR-27; follow-up to the request-code-review of work unit 2026-09-29-private-harness-storage, findings C1 and C2)

## Contract

### Scope

Rework init's entry so that it **first detects the adoption state
thoroughly** — both the project's own Claude files and `~/.open-skills/`
— and only then **classifies** the run into one of four cases, before any
interview question:

| | first init | re-init |
|---|---|---|
| **project** (shared mode) | project first init | project re-init |
| **external** (private mode) | external first init | external re-init |

Plus the anomaly outcomes below, which stop for the user instead of
guessing.

Fixes review findings C1 (any root `CLAUDE.md` counted as an adoption;
private mode unreachable in repos with their own CLAUDE.md; tracked
upstream CLAUDE.md rewritten) and C2 (private adoption found only via the
shim; a lost shim leads to a fresh interview that overwrites an
unversioned harness; suffix loop skips this repo's own `-N` directory;
"slug never a lookup key" contradiction).

Orchestrator decisions binding on this contract:

- E-a. **Detection is its own checklist step, first**, before the survey
  and interview (renumber init's checklist and every in-file step
  reference accordingly). It only reads; it writes nothing.
- E-b. **Canonical project root** `P`: `git rev-parse --show-toplevel`
  in a git repo, else `pwd -P`. `P` is used for the slug and for the
  `project root:` bullet; paths are compared after expanding `~` and
  resolving symlinks.
- E-c. **Project evidence** (checked in `P`):
  - root `CLAUDE.md` counts as a harness declaration only if it carries
    the **adoption marker**: a load directive naming
    `open-skills:harness-flow` (or the legacy `open-skills:agent-flow`),
    or a `## Harness` section, or the legacy harness-init 0.1.0
    `## Short-Term Work-Unit Tool` section. A root `CLAUDE.md` without
    the marker is ordinary project content, not an adoption;
  - a root `.harness/` directory also counts as project evidence;
  - root `CLAUDE.local.md`: exists? tracked (`git ls-files
    --error-unmatch CLAUDE.local.md` succeeds)? contains an `@` import
    whose target ends in `/HARNESS.md` (the shim)? does that target
    exist, and does its `project root:` equal `P`?
- E-d. **External evidence**: read only the `project root:` bullet of
  each `~/.open-skills/*/HARNESS.md` (one level deep; no other file) and
  collect those equal to `P`. This scan — not the slug — finds an
  existing private harness, so the slug stays a naming rule only and is
  never a lookup key (D-002 holds as written).
- E-e. **Classification** (state it with its evidence in one or two
  sentences before the first interview question):
  - **project re-init** — project evidence, no external evidence →
    shared update mode (existing behavior; storage mode not asked).
  - **external re-init** — a shim whose target exists with
    `project root:` = `P`, or no shim and exactly one external match →
    private update mode against that harness root (storage mode not
    asked; no fresh interview; existing `.harness/` files are updated,
    never replaced wholesale). With no shim, the write step re-attaches
    it (writes the shim, re-applies the exclude).
  - **first init** — no project evidence, no external evidence → ask
    storage mode (topic 1). Private is listed first as inferred when a
    root `CLAUDE.md` without the marker (or a root `AGENTS.md`) exists,
    else shared. Shared first init with an unmarked root `CLAUDE.md`
    keeps its content and adds the harness sections; private first init
    never touches it. **project first init** / **external first init**
    follow the answer.
  - **anomalies — stop, report the evidence, ask the user; write
    nothing until resolved**:
    - both project and external evidence (two declarations);
    - no shim and more than one external match (list them);
    - dangling shim (import target missing) — options: recreate a
      private harness at the shim's path, or remove the shim and start
      over;
    - shim target's `project root:` ≠ `P` (repo moved or copied) —
      options: adopt it (update `project root:` to `P`) or start fresh;
    - private mode chosen or detected while `CLAUDE.local.md` is
      tracked — private mode cannot be installed without editing a
      tracked file.
- E-f. **External first init directory**: `~/.open-skills/<slug>/`; if it
  exists (it cannot name `P`, the scan would have found it), append
  `-2`, `-3`, … until the name is free. A first init never overwrites an
  existing file in a harness root.
- E-g. **Shim write**: if `CLAUDE.local.md` has no shim, append the shim
  lines; if it already has one (re-attach, or the "adopt" anomaly
  option), replace that import line in place — never a second `@…/HARNESS.md`
  import.

Files and required changes:

1. `skills/init/SKILL.md` — implement E-a..E-g: new detection +
   classification step; storage-mode topic tied to the classification
   (asked only in first init); update-mode text refers to project /
   external re-init; the "Storage modes" slug bullet drops the
   "that is update mode" clause and keeps "never a lookup key" true; the
   write step implements E-f, E-g, re-attach, and the no-overwrite rule;
   the report states the classification. Also replace the leftover
   "alongside CLAUDE.md" in the fill step with "alongside the harness
   declaration".
2. `docs/harness.md` — per C-002: describe the detection-first flow and
   the four cases plus anomalies (concisely, e.g. a table), the adoption
   marker (an ordinary CLAUDE.md is not an adoption), that a lost shim
   is re-attached by re-running init, and fix "the slug is never looked
   up again" wording if it no longer matches (it should: existing
   harnesses are found by `project root:`).

All tracked content in English (C-001).

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `git diff --name-only HEAD -- . ':!.project' ':!.harness'` lists only
   `skills/init/SKILL.md` and/or `docs/harness.md`.
3. The feature-level grep checks in the Features table.
4. Manual (reviewer): walk each scenario below through the edited
   `skills/init/SKILL.md` text and confirm the outcome it prescribes
   matches E-c..E-g, citing the lines. `P` = `/w/foo`.
   - A. nothing at all → first init; storage mode asked; shared inferred.
   - B. upstream root `CLAUDE.md` without marker, nothing else → first
     init; storage mode asked with private inferred; private leaves the
     CLAUDE.md untouched.
   - C. root `CLAUDE.md` with the harness-flow directive → project
     re-init; storage mode not asked.
   - D. valid shim → `HARNESS.md` with `project root: /w/foo` → external
     re-init.
   - E. no shim; `~/.open-skills/-w-foo-2/HARNESS.md` names `/w/foo` →
     external re-init against `-w-foo-2`, no fresh interview, shim
     re-attached, no wholesale overwrite.
   - F. no shim; two external matches → anomaly, ask.
   - G. marked root `CLAUDE.md` + valid shim → anomaly, ask.
   - H. shim pointing at a missing file → anomaly, ask.
   - I. shim target names `/old/foo` → anomaly, ask.
   - J. tracked `CLAUDE.local.md` and private chosen → refused/asked.
   - K. first init private; `~/.open-skills/-w-foo/` exists naming
     `/x/other` → `-w-foo-2`; nothing overwritten.
   - L. re-attach when `CLAUDE.local.md` already has a (dangling-free)
     shim line → replaced in place, no duplicate import.

### Exclusions

- Review finding C3 (load directive in the shim / sticky import decline)
  and S1 (mode-free declaration rule in harness-flow/handoff) — later
  work units. No changes to `skills/harness-flow/`, `skills/handoff/`,
  `agents/`, templates (including `CLAUDE.local.md.template`), README.
- S2 (scenario eval harness) — not built here; the manual scenario walk
  above is this unit's stand-in.
- Minor findings not listed in Scope (permission prompts for writes
  outside the working directory, `project root:` check at clock-in,
  AGENTS.md warning at init, WORK-UNIT template wording).
- No migration between modes; no registry; no version bump.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | init detects the adoption state first (project files + `~/.open-skills/*/HARNESS.md` `project root:` scan), classifies it as project/external × first init/re-init or a stop-and-ask anomaly, and only then interviews; writes follow the classification (re-attach, suffix, no overwrite, in-place shim) | `claude plugin validate . && grep -q "project first init" skills/init/SKILL.md && grep -q "project re-init" skills/init/SKILL.md && grep -q "external first init" skills/init/SKILL.md && grep -q "external re-init" skills/init/SKILL.md && grep -q "adoption marker" skills/init/SKILL.md && grep -q "~/.open-skills/\*/HARNESS.md" skills/init/SKILL.md && grep -q "git ls-files --error-unmatch" skills/init/SKILL.md && grep -q "git rev-parse --show-toplevel" skills/init/SKILL.md && ! grep -q "that is update mode" skills/init/SKILL.md && ! grep -q "alongside CLAUDE.md" skills/init/SKILL.md` + manual scenario walk A–L | active |
| 2 | docs/harness.md describes the detection-first flow, the four cases and anomalies, the adoption marker, and shim re-attachment | `grep -q "re-init" docs/harness.md && grep -q "first init" docs/harness.md && grep -qi "adoption marker" docs/harness.md && grep -qi "re-attach" docs/harness.md` | not_started |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Opened after the user reviewed the request-code-review report and directed: handle the init flow first; make the check thorough — inspect `~/.open-skills` and the project's Claude files — then classify into project vs external × first init vs re-init. Orchestrator chose to find existing private harnesses by scanning `~/.open-skills/*/HARNESS.md` `project root:` bullets (the listing mechanism D-002 already names) rather than by slug lookup, so D-002 needs no revision.
