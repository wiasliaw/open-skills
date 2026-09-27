# Work Unit: 2026-09-27-thicken-lens2

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-27-thicken-lens2
- **Created**: 2026-09-27
- **Work-unit tool reference**: none

## Contract

### Scope

Thicken Lens 2 (structure) of the request-code-review skill with
concrete maintainability standards adapted from the
`thermo-nuclear-code-quality-review` rubric (cursor/plugins).

- File: `skills/request-code-review/reviewer-prompt.md`.
- Shape: extend the reviewer template's "How to review" section in
  place — that section IS Lens 2 (the "Lens 2: Structure" pointer
  says "use unchanged"); Lens 1 and Lens 3 replace it entirely, so
  thickening it affects only the structure reviewer. Keep the
  "Lens 2: Structure — use the 'How to review' section unchanged"
  pointer as is.
- Content to incorporate, rewritten in this plugin's own words (not
  copied verbatim from the source rubric):
  1. Code-judo framing: prefer reframings that make whole branches,
     helpers, modes, or layers disappear; delete complexity rather
     than rearrange it; the result should feel inevitable in
     hindsight.
  2. File-size boundary: a change pushing a file past ~1000 lines is
     a strong smell by default — flag it and propose decomposition
     unless there is a compelling structural reason.
  3. Spaghetti growth: new ad-hoc conditionals, one-off flags, or
     special cases bolted into unrelated flows are a design problem,
     not a style nit — push the logic behind a dedicated abstraction.
  4. Boring over magical: flag thin wrappers, identity abstractions,
     and pass-through helpers that add indirection without buying
     clarity; prefer direct, legible code.
  5. Type/boundary cleanliness: question unnecessary optionality,
     `any`/`unknown`, cast-heavy code, and silent fallbacks that
     paper over an unclear invariant.
  6. Canonical layer and reuse: flag feature logic leaking into
     shared paths and bespoke near-duplicates of existing helpers;
     push logic to the module that already owns the concept.
  7. Orchestration smells: needless sequential flow of independent
     work, and related updates that can leave state half-applied.
  8. Output discipline: a few high-conviction structural findings
     outrank many cosmetic notes (must stay consistent with the
     existing Prohibitions section, not duplicate it).
- The thickened section must stay compatible with the existing report
  format (design verdict; Critical/Structural/Minor severities) and
  the Prohibitions section — do not change either.

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `git diff --name-only HEAD` — lists exactly
   `skills/request-code-review/reviewer-prompt.md` (plus this work
   unit's own state file if tracked); no other file changed.
3. `grep -q "1000 lines" skills/request-code-review/reviewer-prompt.md` — file-size standard present.
4. `grep -qi "wrapper" skills/request-code-review/reviewer-prompt.md` — thin-wrapper standard present.
5. `grep -qi "canonical" skills/request-code-review/reviewer-prompt.md` — canonical-layer standard present.
6. `grep -q "scope creep" skills/request-code-review/reviewer-prompt.md` — Lens 1 text intact.
7. `grep -q "untested claims are findings" skills/request-code-review/reviewer-prompt.md` — Lens 3 text intact.
8. `grep -q "the burden of proof is on refutation" skills/request-code-review/reviewer-prompt.md` — verifier template intact.
9. `grep -q "No praise, no hedging" skills/request-code-review/reviewer-prompt.md` — Prohibitions intact.

### Exclusions

- No changes to `SKILL.md` (the pipeline, steps, and lens pointer
  wording stay accurate under the chosen shape).
- No changes to Lens 1, Lens 3, the verifier template, the report
  format, or the Prohibitions section.
- No `docs/` or README updates — lens names and the user-visible
  pipeline are unchanged, so C-002 is not triggered.
- No verbatim import of the source rubric's text; no attribution
  section, tone-phrase catalog, or approval-bar section.
- No version bump in `.claude-plugin/plugin.json`.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | The structure lens (reviewer template "How to review" section) carries concrete maintainability standards adapted from the thermo-nuclear rubric, with all other prompt sections unchanged | `claude plugin validate . && grep -q "1000 lines" skills/request-code-review/reviewer-prompt.md && grep -q "scope creep" skills/request-code-review/reviewer-prompt.md && grep -q "untested claims are findings" skills/request-code-review/reviewer-prompt.md && grep -q "the burden of proof is on refutation" skills/request-code-review/reviewer-prompt.md && grep -q "No praise, no hedging" skills/request-code-review/reviewer-prompt.md` | passed (F-001) |

## Review Log

<!-- One line per reviewer verdict, appended in order. -->

- 2026-09-27 — feature 1, round 1: pass — all 9 commands pass; single hunk confined to "How to review" (lines 27–56); all 8 standards present in original wording; all protected sections byte-unchanged.

## Notes

- 2026-09-27 — Work unit created from user agreement to thicken Lens 2 with the thermo-nuclear-code-quality-review rubric (source: cursor/plugins, fetched this session). Shape decision: thicken the template's "How to review" section in place rather than adding an explicit Lens 2 blockquote — smallest diff, no SKILL.md edit needed.
