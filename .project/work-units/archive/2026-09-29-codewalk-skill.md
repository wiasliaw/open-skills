# Work Unit: 2026-09-29-codewalk-skill

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-codewalk-skill
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source request: Linear WOR-31)

## Contract

### Scope

Add a standalone `codewalk` skill to the plugin: an "anchored
walkthrough" that walks a reader through code as an interactive,
conversation-paced tour, then lands the route as a verifiable markdown
file. Independent of `.harness/`; model-invocable and manually
invocable via `/open-skills:codewalk`; dispatchable by harness-flow as
an ordinary skill.

Deliverables (one change, per C-002):

1. `skills/codewalk/SKILL.md`
   - Frontmatter: `name: codewalk` and `description` only. Description
     is third person, what + when, key use case first, natural trigger
     phrases ("walk me through", "how does X work end to end", "give me
     a tour of this codebase", "onboard me"), slightly pushy, with
     explicit skip conditions: not for single-fact questions Claude
     answers directly; not for finding defects or judging changes —
     direct those to request-code-review.
   - Body: imperative voice, rules with brief rationale, matching the
     style and length of existing skills (~100–150 lines). Core loop
     rules near the top. Numbered steps:
     - Step 1 — Determine mode & anchor. Two modes: codebase tour
       (default when no specific anchor) and topic trace (follow one
       real execution path answering one question). Infer mode, reader,
       and depth from the user's words; ask at most one question, only
       when genuinely ambiguous. Ask where the landed file should go
       (offer a default such as `docs/walkthroughs/<topic>.md`); when
       invoked by an orchestrator (e.g. harness-flow) rather than the
       user directly, decide the location autonomously instead of asking.
     - Step 2 — Recon. Progressive reading: structural signals
       (manifests, entry points, directory shape) → Grep to locate →
       Read only what is needed. Trace one vertical slice end to end
       instead of surveying broadly. For large scopes, dispatch Explore
       subagents with a fixed, self-contained report schema
       (self-contained prompts; no external references).
     - Step 3 — Build route. Narrative order follows understanding,
       never file-tree order. Fixed arc: orientation (anchored to a real
       file) → short high-level map → core path in execution order →
       closing "what you can do next" (no recap). Stop count by depth:
       quick 5–8, standard 9–13, deep 14–18. Every stop passes SMIG
       (Situation, Mechanism, Implication, Gotcha) and teaches something
       the reader could not get by reading the file alone; cut anything
       not serving the reader's goal. Every cited file must actually
       have been read; verify each anchor resolves before presenting.
     - Step 4 — Walk. One stop per turn; reader paces with short
       replies (next / deeper on N / skip to X); reader may jump to
       landing at any time.
     - Step 5 — Land. Fill
       `${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template`
       and write it to the agreed location. Header records:
       topic/question, mode, depth, repo commit SHA at generation time,
       date. Each stop records: title, `file:line` display reference, a
       content anchor (symbol name or unique text pattern — never a bare
       line number as the only anchor), a short verbatim code snapshot,
       and the narrative. The file states it describes that commit and
       may drift afterward.
   - Ends with a Prohibitions section: never modify source code; never
     cite a file you have not read; if a file or symbol cannot be found,
     say so and skip it — never guess; no file-listing descriptions
     ("this file contains..."); no shallow whole-repo surveys; no
     findings, verdicts, or smell/risk analysis — refer the user to
     request-code-review.
2. `skills/codewalk/templates/walkthrough.md.template` — placeholders
   use the `{{snake_case_descriptive_name}}` convention (see
   `skills/handoff/templates/handoff.md.template`).
3. `docs/codewalk.md` — follows existing docs pages: intro in second
   person, `## Usage`, `## What happens`, `## Requirements`.
4. `README.md` — one row in the Skills table
   `| [codewalk](./docs/codewalk.md) | <one sentence, verb-first> |`
   and `/open-skills:codewalk` added to the invocation code block. No
   External tools entry.

All content in English (C-001).

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `git status --porcelain --untracked-files=all | grep -v '^?? .project/work-units/' | awk '{print $2}' | sort` — lists exactly `README.md`, `docs/codewalk.md`, `skills/codewalk/SKILL.md`, `skills/codewalk/templates/walkthrough.md.template`.
3. `head -5 skills/codewalk/SKILL.md | grep -q '^name: codewalk$' && awk '/^---$/{n++; next} n==1' skills/codewalk/SKILL.md | grep -vE '^(name|description):' | grep -c . | grep -qx 0` — frontmatter holds only `name` and `description`.
4. `grep -qi "walk me through" skills/codewalk/SKILL.md && grep -q "request-code-review" skills/codewalk/SKILL.md` — trigger phrase and skip-to-request-code-review present.
5. `grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "5–8\|5-8" skills/codewalk/SKILL.md && grep -q "14–18\|14-18" skills/codewalk/SKILL.md` — SMIG and depth stop counts present.
6. `grep -q '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md` — template referenced by plugin-root path.
7. `grep -q "^## Prohibitions" skills/codewalk/SKILL.md` — Prohibitions section present.
8. `L=$(wc -l < skills/codewalk/SKILL.md); [ "$L" -ge 90 ] && [ "$L" -le 160 ]` — SKILL.md length in the expected range.
9. `grep -qE '\{\{[a-z0-9_]+\}\}' skills/codewalk/templates/walkthrough.md.template && ! grep -oE '\{\{[^}]*\}\}' skills/codewalk/templates/walkthrough.md.template | grep -vqE '^\{\{[a-z0-9_]+\}\}$'` — template uses only `{{snake_case}}` placeholders.
10. `grep -qi "commit" skills/codewalk/templates/walkthrough.md.template && grep -qi "anchor" skills/codewalk/templates/walkthrough.md.template` — template records commit SHA and content anchors.
11. `grep -q "^## Usage" docs/codewalk.md && grep -q "^## What happens" docs/codewalk.md && grep -q "^## Requirements" docs/codewalk.md` — docs page sections present.
12. `grep -q '^| \[codewalk\](./docs/codewalk.md) |' README.md && grep -q '^/open-skills:codewalk' README.md` — README row and invocation present.
13. `! LC_ALL=C.UTF-8 grep -nP '[\x{3000}-\x{9FFF}\x{FF00}-\x{FFEF}]' skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template docs/codewalk.md README.md` — no CJK text or full-width punctuation (C-001). (Typographic punctuation such as en-dashes is allowed.)

Manual (reviewer, not auto-checkable): SKILL.md body is imperative, rules carry brief rationale, core loop rules sit near the top, and every Step 1–5 and Prohibition item in Scope is present.

### Exclusions

- PR walkthrough mode (v2 — overlaps with the code-review skills and
  needs boundary work).
- Refresh / re-verify mode (v2 — v1 only makes the landed format
  refresh-ready).
- Changes to harness-flow or any other existing skill, agent, or
  template; in particular `skills/request-code-review/reviewer-prompt.md`
  MUST NOT change (F-001 greps its strings).
- Version bump in `.claude-plugin/plugin.json`.
- Edits to CLAUDE.md or `.harness/` (orchestrator-only, at the merge
  moment).
- A README External tools entry (v1 has no git dependency beyond
  reading the commit SHA when available).

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | The `codewalk` skill ships with SKILL.md, a walkthrough landing template, a docs page, and a README entry | `claude plugin validate . && test -f skills/codewalk/SKILL.md && test -f skills/codewalk/templates/walkthrough.md.template && grep -q "^name: codewalk$" skills/codewalk/SKILL.md && grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "^## Prohibitions" skills/codewalk/SKILL.md && grep -q "^## Usage" docs/codewalk.md && grep -q '^| \[codewalk\](./docs/codewalk.md) |' README.md && grep -q '^/open-skills:codewalk' README.md` | passed (F-002) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-29 — feature 1, round 1: fail — feature cmd and VS1–13 pass, exclusions clean; but SKILL.md counts map and "what next" as stops (l.83) while exempting them from SMIG (l.87) and from file:line/anchor/snapshot, contradicting Scope "every stop passes SMIG / each stop records…", SKILL.md Steps 4–5, and docs. FIX: count only orientation + core-path stops; map/closing are framing, not stops.
- 2026-09-29 — feature 1, round 2: pass — feature cmd and VS1–13 exit 0 (SKILL.md 154 lines); stops = orientation + core path, map/closing framing; SKILL.md, template, docs, README consistent; all Scope steps and prohibitions present; no excluded path changed.

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Work unit created from Linear WOR-31 (design v1 + INIT_PROMPT). Clock-in: `claude plugin validate .` passed; Workflow "eval: TBD" skipped as not auto-checkable; no handoff file present. Branch `feature/wor-31-code-walk-skill`.
- 2026-09-29 — The `open-skills:implementor` / `open-skills:reviewer` agent types are not registered in this session (plugin not installed here), so dispatch uses general-purpose subagents carrying the full `agents/implementor.md` / `agents/reviewer.md` instructions; the reviewer is instructed to stay read-only.
- 2026-09-29 — Round 1 fail relayed; orchestrator decision: keep Scope wording, treat map and closing as framing (not stops). Round 2 passed. Merge moment: F-002, D-002, ARCHITECTURE Module Map and CLAUDE.md Repo Structure updated. Work unit closed.
