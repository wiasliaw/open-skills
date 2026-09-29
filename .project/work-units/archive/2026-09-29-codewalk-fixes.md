# Work Unit: 2026-09-29-codewalk-fixes

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-codewalk-fixes
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source request: Linear WOR-31, follow-up to the code review of work unit 2026-09-29-codewalk-skill)

## Contract

### Scope

Fix the verified findings from the code review of the `codewalk`
skill and drop harness-flow / orchestrator compatibility. Every Scope
item of the archived work unit
`.project/work-units/archive/2026-09-29-codewalk-skill.md` stays in
force except its orchestrator clause (Step 1 "when invoked by an
orchestrator … decide the location autonomously"), which this unit
removes.

Files: `skills/codewalk/SKILL.md`,
`skills/codewalk/templates/walkthrough.md.template`,
`docs/codewalk.md` (and `README.md` only if its row would otherwise
contradict the skill).

1. **Interactive only (drops harness-flow compatibility).**
   - Delete the orchestrator clause (SKILL.md l.43-45).
   - Add a core rule stating the skill is interactive only — it
     needs a reader replying in the conversation. When no reader can
     reply (e.g. it was loaded inside a subagent), say so and stop
     without walking or landing. The rule text MUST contain the
     phrase `interactive only`.
   - Add a rule that the landed walkthrough is a reading record of
     this walk, not a project deliverable: the session running the
     walk writes it directly, even in a project whose instructions
     route deliverables through an orchestrator. The text MUST
     contain the phrase `reading record`.
   - Landing location: ask in the first turn only — together with the
     clarifying question if there is one, otherwise alongside the
     first stop — offering the default `docs/walkthroughs/<topic>.md`.
     Never spend a turn on the location question alone.
2. **Honest commit pin.** At landing, run `git rev-parse HEAD` and
   `git status --porcelain -- <every cited file>`. If any cited file
   is modified or untracked, record the commit as
   `<sha> + uncommitted changes in <files>` and have the notice say
   the snapshots come from the working tree. If `git rev-parse HEAD`
   fails for any reason (git unavailable, not a repository, no
   commits yet), record `unknown` — never invent a SHA. Rename the
   template's commit placeholder to reflect this and update
   `docs/codewalk.md` Requirements to match. SKILL.md MUST contain
   the literal `git status --porcelain` and the words
   `uncommitted changes`.
3. **Stop record (single definition, verified at capture).**
   - In Step 3, define a stop record once — the phrase `stop record`
     MUST appear: number, title, `file:line`, content anchor, a short
     verbatim snapshot copied from the file, and the SMIG narrative.
   - Capture each record when reading the code and verify its anchor
     at capture: the anchor matches exactly once in the cited file
     (use a longer unique pattern, e.g. the full signature line, when
     a symbol name is not unique). A record that does not verify is
     fixed or dropped. This applies equally to stops added later by a
     re-plan or a `skip to` a topic outside the route.
   - Step 4 presents records (the shown excerpt IS the record's
     snapshot); Step 5 writes the records in route order. Remove the
     separate one-time "before the first stop, verify every anchor"
     paragraph and the words `already verified`.
   - `deeper on N` expansions are not landed unless the reader asks.
4. **Stop numbering.** The orientation stop is stop 1; core-path
   stops continue from 2. Each walk turn shows the stop's number, so
   `deeper on N` has a defined N. SKILL.md MUST contain the phrase
   `the orientation stop is stop 1`. The template's orientation
   heading MUST be `### 1. {{orientation_stop_title}}`.
5. **Existing file.** If the landing path already exists, say so and
   ask whether to overwrite or choose a new name before writing. The
   words `already exists` MUST appear in SKILL.md.
6. **Codebase tour anchor.** A codebase tour's anchor is the system's
   primary path: the question defaults to what the system does on its
   primary path, starting from the main entry point found in recon;
   a named directory or module scopes the tour. The phrase
   `primary path` MUST appear in SKILL.md; the docs mode description
   stays consistent.
7. **Walk ends in landing.** The closing follows the last core-path
   stop, and landing (Step 5) happens in that same turn — the reader
   need not type `land` after the last stop.
8. **Closing citations.** In "What you can do next", name a file or
   test only after confirming it exists with Glob/Grep; otherwise
   describe it without a path.
9. **Snapshot fencing.** Fence each snapshot (and any backtick-wrapped
   anchor) with a backtick run longer than any backtick run inside it.
   The word `backtick` MUST appear in SKILL.md.
10. **De-duplicate** the map/closing placement: state it once (Step 4
    turn placement), not in both Step 3 and Step 4.
11. **Docs sync.** `docs/codewalk.md` reflects items 1, 2, 4, 5, 6, 7
    in user-facing terms (interactive only; uncommitted-changes
    notation; stop numbering; existing-file prompt; tour follows the
    primary path; the walk lands after the last stop). Keep its
    structure (second-person intro, `## Usage`, `## What happens`,
    `## Requirements`).

All content in English (C-001). SKILL.md stays within 90–160 lines.

Amendment (2026-09-29, after /request-code-review of this unit's diff;
round 2 of feature 1). Items 1–11 stay in force; add:

12. **Pin coverage.** For cited files inside the repository run
    `git status --porcelain --ignored -- <files>` and treat any `??`
    or `!!` entry — including an ignored parent directory that covers
    a cited file — as not in the commit. Classify cited files outside
    the repository root as not in the commit without running git on
    them. If `git status` itself fails, treat every cited file as not
    covered. All of these are listed in
    `<sha> + uncommitted changes in <files>`. The phrases `--ignored`
    and `outside the repository` MUST appear in SKILL.md; docs
    Requirements/Land text matches.
13. **Snapshot re-check at landing.** Before pinning, confirm each
    record's snapshot still appears verbatim in its file and its
    anchor still matches exactly once; re-capture any record that
    drifted during the walk (or drop it and say so). The phrase
    `still appears verbatim` MUST appear in SKILL.md.
14. **Closing citations.** Name a file or test in the closing only if
    you read it in this session (locate it with Glob/Grep first; a
    Glob hit proves existence, not behavior); call a test one that
    exercises the path only if it references a symbol on the route.
    Otherwise describe it without a path.
15. **Off-route insert.** A stop added by `skip to` an off-route topic
    goes right after the current stop and takes the next number;
    unshown stops renumber after it; shown stops keep their numbers;
    inserted stops count toward the depth cap. The phrase
    `right after the current stop` MUST appear in SKILL.md.
16. **Anchor matching.** Match anchors as a literal string (escape
    regex metacharacters when using Grep), and take the record's
    `file:line` from the anchor's match. The phrase
    `as a literal string` MUST appear in SKILL.md.
17. **Working-tree note.** SKILL.md says to leave the note empty when
    every cited file is covered; the template puts a space before the
    note's placeholder so a filled note reads as its own sentence.
18. **No-reader contexts.** The description gains a skip condition for
    contexts where no one can reply (e.g. subagents, headless runs).
    The interactive-only rule says: do not walk or land; answer the
    question directly, or say the walk needs an interactive session.
19. **Turn wording.** The controls line ends each stop turn except the
    last (which lands); "the map follows stop 1, in the same turn".

SKILL.md stays within 90–160 lines: pay for items 12–19 by tightening
wording, never by dropping a mandated item (six Prohibitions, core
loop rules near the top, SMIG, depth counts, fixed arc).

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `test -z "$(git status --porcelain --untracked-files=all | grep -v ' .project/work-units/' | awk '{print $2}' | grep -vxE 'README.md|docs/codewalk.md|skills/codewalk/SKILL.md|skills/codewalk/templates/walkthrough.md.template')"` — only in-scope files changed.
3. `head -5 skills/codewalk/SKILL.md | grep -q '^name: codewalk$' && awk '/^---$/{n++; next} n==1' skills/codewalk/SKILL.md | grep -vE '^(name|description):' | grep -c . | grep -qx 0` — frontmatter holds only `name` and `description`.
4. `grep -qi "walk me through" skills/codewalk/SKILL.md && grep -q "request-code-review" skills/codewalk/SKILL.md` — trigger phrase and redirect present.
5. `grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "5–8\|5-8" skills/codewalk/SKILL.md && grep -q "14–18\|14-18" skills/codewalk/SKILL.md` — SMIG and depth counts present.
6. `grep -q '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md` — template referenced by plugin-root path.
7. `grep -q "^## Prohibitions" skills/codewalk/SKILL.md` — Prohibitions section present.
8. `L=$(wc -l < skills/codewalk/SKILL.md); [ "$L" -ge 90 ] && [ "$L" -le 160 ]` — length bound.
9. `grep -qE '\{\{[a-z0-9_]+\}\}' skills/codewalk/templates/walkthrough.md.template && ! grep -oE '\{\{[^}]*\}\}' skills/codewalk/templates/walkthrough.md.template | grep -vqE '^\{\{[a-z0-9_]+\}\}$'` — only `{{snake_case}}` placeholders.
10. `grep -qi "commit" skills/codewalk/templates/walkthrough.md.template && grep -qi "anchor" skills/codewalk/templates/walkthrough.md.template && grep -q "may drift" skills/codewalk/templates/walkthrough.md.template` — template records commit, anchors, and drift notice.
11. `grep -q "^## Usage" docs/codewalk.md && grep -q "^## What happens" docs/codewalk.md && grep -q "^## Requirements" docs/codewalk.md` — docs sections present.
12. `grep -q '^| \[codewalk\](./docs/codewalk.md) |' README.md && grep -q '^/open-skills:codewalk' README.md` — README row and invocation present.
13. `! LC_ALL=C.UTF-8 grep -nP '[\x{3000}-\x{9FFF}\x{FF00}-\x{FFEF}]' skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template docs/codewalk.md README.md` — no CJK text (C-001).
14. `grep -q "interactive only" skills/codewalk/SKILL.md && grep -q "reading record" skills/codewalk/SKILL.md && ! grep -q "nobody is there to answer" skills/codewalk/SKILL.md` — interactive-only and reading-record rules present; orchestrator clause gone.
15. `grep -q "git status --porcelain" skills/codewalk/SKILL.md && grep -q "uncommitted changes" skills/codewalk/SKILL.md && grep -qi "uncommitted" docs/codewalk.md` — honest commit pin.
16. `grep -q "stop record" skills/codewalk/SKILL.md && ! grep -q "already verified" skills/codewalk/SKILL.md` — single stop record; no stale verification claim.
17. `grep -q "the orientation stop is stop 1" skills/codewalk/SKILL.md && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template` — stop numbering defined.
18. `grep -q "already exists" skills/codewalk/SKILL.md && grep -q "primary path" skills/codewalk/SKILL.md && grep -qi "backtick" skills/codewalk/SKILL.md` — existing-file prompt, tour anchor, snapshot fencing.
19. `grep -q -- "--ignored" skills/codewalk/SKILL.md && grep -q "outside the repository" skills/codewalk/SKILL.md && grep -q "still appears verbatim" skills/codewalk/SKILL.md` — pin coverage and landing re-check.
20. `grep -q "right after the current stop" skills/codewalk/SKILL.md && grep -q "as a literal string" skills/codewalk/SKILL.md` — insert position and literal anchor matching.
21. `grep -qE '\. \{\{working_tree_note' skills/codewalk/templates/walkthrough.md.template` — working-tree note placeholder preceded by a space.

Manual (reviewer, not auto-checkable): every Scope item 1–11 is present
and mutually consistent across SKILL.md, the template, and the docs;
every Step 1–5 item and Prohibition from the archived work unit's
Scope is still present except the removed orchestrator clause; SKILL.md
stays imperative with brief rationale and core loop rules near the top.

### Exclusions

- Changes to harness-flow, handoff, init, request-code-review (in
  particular `reviewer-prompt.md`, F-001), receive-code-review, or
  `agents/`.
- PR walkthrough mode and refresh/re-verify mode (still v2).
- Depth-range semantics (5–8 / 9–13 / 14–18 stay as specified), the
  inferred "reader" field, and the Prohibitions list contents (all six
  items stay).
- Version bump in `.claude-plugin/plugin.json`.
- Edits to CLAUDE.md or `.harness/` (orchestrator-only, at the merge
  moment).
- Replacement of F-002 and supersession of D-002 are merge-moment
  work by the orchestrator, not implementor work.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk is interactive only, lands an honest commit-pinned walkthrough (covering untracked, ignored, and out-of-repo citations and re-checking snapshots at landing) built from verified, numbered stop records, and ships with its template, docs page, and README entry (replaces F-002) | `claude plugin validate . && head -5 skills/codewalk/SKILL.md \| grep -q '^name: codewalk$' && grep -qi "walk me through" skills/codewalk/SKILL.md && grep -q "request-code-review" skills/codewalk/SKILL.md && grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "14–18\\\|14-18" skills/codewalk/SKILL.md && grep -q '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md && grep -q "^## Prohibitions" skills/codewalk/SKILL.md && grep -q "interactive only" skills/codewalk/SKILL.md && grep -q "reading record" skills/codewalk/SKILL.md && grep -q "git status --porcelain" skills/codewalk/SKILL.md && grep -q "uncommitted changes" skills/codewalk/SKILL.md && grep -q -- "--ignored" skills/codewalk/SKILL.md && grep -q "outside the repository" skills/codewalk/SKILL.md && grep -q "still appears verbatim" skills/codewalk/SKILL.md && grep -q "stop record" skills/codewalk/SKILL.md && grep -q "the orientation stop is stop 1" skills/codewalk/SKILL.md && grep -q "right after the current stop" skills/codewalk/SKILL.md && grep -q "as a literal string" skills/codewalk/SKILL.md && grep -q "already exists" skills/codewalk/SKILL.md && grep -q "primary path" skills/codewalk/SKILL.md && grep -qi "backtick" skills/codewalk/SKILL.md && grep -q "may drift" skills/codewalk/templates/walkthrough.md.template && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template && grep -q "^## Usage" docs/codewalk.md && grep -qi "uncommitted" docs/codewalk.md && grep -q '^\| \[codewalk\](./docs/codewalk.md) \|' README.md && grep -q '^/open-skills:codewalk' README.md` | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-29 — feature 1, round 1: pass — feature cmd and VS1–18 exit 0 (SKILL.md 159 lines); Scope items 1–11 located; archived Step 1–5 items and six Prohibitions intact except the removed orchestrator clause; SKILL.md/template/docs/README consistent; only the three in-scope files changed. Optional polish noted (docs l.64-66 auto-land vs existing-file prompt; docs Requirements omits "not a repository").
- 2026-09-29 — feature 1, reopened (not a reviewer fail): user-invoked /request-code-review of this diff confirmed pin-coverage (K1), capture-vs-pin drift (K2), closing-citation ambiguity (K3), off-route insert numbering (K4), and Features-row coverage gap (T3); contract amended with items 12–19 and VS19–21 before the merge moment.

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Opened after /request-code-review of branch feature/wor-31-code-walk-skill (4 Critical, 5 Structural candidates; S2/S3 refuted as proposed). User decision: drop harness-flow trigger compatibility; landed file is a reading record, not a deliverable. Scope names the replacement of F-002 (by the new F-NNN) and supersession of D-002 at this unit's merge moment. Clock-in: `claude plugin validate .` passed; eval TBD skipped; no handoff file.
- 2026-09-29 — Feature row command escapes `|` as `\|` for the Markdown table; when running it, unescape to `|` (the pipes after `head -5` and inside the README grep pattern).
- 2026-09-29 — Held the merge moment after the round-1 pass because the user requested /request-code-review. Review: 3 lenses, 27 raw findings → 16 after dedup; K1–K4 kept (K4 narrowed; verifiers rated all four Important/Minor rather than Critical), T3 confirmed narrowed, T1/T2/T4/T5 refuted. Amended Scope (items 12–19), VS19–21, and the Features row (adds the MUST-string checks T3 found missing). Round 2 dispatched.
