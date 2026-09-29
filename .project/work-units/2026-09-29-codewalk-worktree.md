# Work Unit: 2026-09-29-codewalk-worktree

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-codewalk-worktree
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source request: Linear WOR-31, user redesign after the code review of 2026-09-29-codewalk-fixes)

## Contract

### Scope

Replace codewalk's working-tree pin machinery with a git worktree
snapshot, narrow citations to tracked project code, move the default
landing location to `.codewalk/`, and stop the existing-file prompt from
firing on the walk's own file. Everything else in
`.project/work-units/archive/2026-09-29-codewalk-fixes.md` (items 1–19)
and `.project/work-units/archive/2026-09-29-codewalk-skill.md` stays in
force, except where an item below replaces it (items 12, 13, 17 and the
working-tree parts of item 2 are removed).

Files: `skills/codewalk/SKILL.md`,
`skills/codewalk/templates/walkthrough.md.template`, `docs/codewalk.md`,
`README.md`.

1. **Worktree snapshot.** At the start of recon, when the directory is a
   git repository with at least one commit:
   - run `git worktree prune`, then remove any stale codewalk worktree
     at the chosen path, then create the snapshot with
     `git worktree add --detach <path> HEAD`, where `<path>` is outside
     the repository (e.g. under the system temp directory, named after
     the repository and the short SHA so a rerun finds its own stale
     copy);
   - the pin is that HEAD SHA, recorded at creation — it is exact by
     construction, so no status check or snapshot re-check is needed;
   - read, Grep and Glob code only inside the worktree; Explore
     subagents get the worktree path and read only there;
   - every landed and displayed `file:line` is repo-relative (strip the
     worktree prefix) — the phrase `repo-relative` MUST appear;
   - tell the reader in the first turn, in one clause, that the walk
     describes the last commit (short SHA) and excludes uncommitted
     changes (commit first to include them);
   - remove the worktree with `git worktree remove --force <path>` after
     landing, and when the walk ends without landing.
   SKILL.md MUST contain the literals `git worktree add --detach`,
   `git worktree remove` and `git worktree prune`.
2. **Fallback.** If git is unavailable, the directory is not a
   repository, it has no commits, or the worktree cannot be created,
   read the working tree directly, record the pin as `unknown`, and say
   so — never invent a SHA.
3. **Citation scope.** Read and cite only tracked project code: never
   gitignored paths (dependencies such as `node_modules`, build output)
   or files outside the repository. Where the path crosses into one,
   name the boundary in prose (e.g. "hands off to the framework's
   router") without citing its code. SKILL.md MUST contain the word
   `gitignored`. (In worktree mode such files are absent anyway; the
   rule also governs the fallback.)
4. **Remove the old pin machinery.** Delete from SKILL.md: the
   `git status` coverage check, `--ignored`, the "outside the repository
   root" uncovered-file rule, the landing-time snapshot re-check, the
   `<sha> + uncommitted changes in <files>` notation, and the
   working-tree note. Template: the commit placeholder becomes
   `{{commit_sha_or_unknown}}` (both occurrences) and the
   working-tree-note placeholder is removed.
5. **Default landing location** is `.codewalk/<topic>.md` (a dot
   directory: tool output, not a project deliverable; the reader decides
   whether to commit or gitignore it). The landing file is written in
   the real repository, never inside the worktree. No `docs/walkthroughs`
   remains in SKILL.md or docs.
6. **Re-landing.** The existing-file prompt applies only to a file that
   existed before this walk. Re-landing the file this walk already
   wrote (e.g. the reader asks to keep a `deeper on N` expansion, which
   is appended to that stop's narrative) overwrites it without asking.
   SKILL.md MUST contain the phrase `existed before this walk`.
7. **Prohibitions.** Keep all six; amend only the first to allow the
   temporary worktree, e.g. "Never modify source code; the only files
   written are the walkthrough and the temporary worktree, which you
   remove."
8. **Docs and README.** `docs/codewalk.md` reflects items 1–6 in
   user-facing terms (describes the last commit; uncommitted changes
   excluded — commit first; temporary worktree outside the repository,
   removed afterwards; gitignored and outside-repo code not cited;
   default `.codewalk/<topic>.md`; fallback without git/commits reads
   the working tree with commit `unknown`). README's External tools list
   gains a `git` note for codewalk (worktree snapshot; without it the
   working tree is read and the commit is `unknown`); its Skills row
   changes only if it would otherwise contradict the skill.

All content in English (C-001). SKILL.md stays within 90–160 lines.

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `test -z "$(git status --porcelain --untracked-files=all | grep -v ' .project/work-units/' | awk '{print $2}' | grep -vxE 'README.md|docs/codewalk.md|skills/codewalk/SKILL.md|skills/codewalk/templates/walkthrough.md.template')"` — only in-scope files changed.
3. `head -5 skills/codewalk/SKILL.md | grep -q '^name: codewalk$' && awk '/^---$/{n++; next} n==1' skills/codewalk/SKILL.md | grep -vE '^(name|description):' | grep -c . | grep -qx 0` — frontmatter holds only `name` and `description`.
4. `grep -qi "walk me through" skills/codewalk/SKILL.md && grep -q "request-code-review" skills/codewalk/SKILL.md` — trigger phrase and redirect.
5. `grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "5–8\|5-8" skills/codewalk/SKILL.md && grep -q "14–18\|14-18" skills/codewalk/SKILL.md` — SMIG and depth counts.
6. `grep -q '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md` — template path.
7. `grep -q "^## Prohibitions" skills/codewalk/SKILL.md && [ "$(awk '/^## Prohibitions/{f=1;next} f' skills/codewalk/SKILL.md | grep -c '^- ')" = 6 ]` — six Prohibitions.
8. `L=$(wc -l < skills/codewalk/SKILL.md); [ "$L" -ge 90 ] && [ "$L" -le 160 ]` — length bound.
9. `grep -qE '\{\{[a-z0-9_]+\}\}' skills/codewalk/templates/walkthrough.md.template && ! grep -oE '\{\{[^}]*\}\}' skills/codewalk/templates/walkthrough.md.template | grep -vqE '^\{\{[a-z0-9_]+\}\}$'` — snake_case placeholders only.
10. `grep -q "may drift" skills/codewalk/templates/walkthrough.md.template && grep -qi "anchor" skills/codewalk/templates/walkthrough.md.template && [ "$(grep -o '{{commit_sha_or_unknown}}' skills/codewalk/templates/walkthrough.md.template | wc -l)" = 2 ] && ! grep -q "working_tree_note\|uncommitted" skills/codewalk/templates/walkthrough.md.template` — template pin and drift notice.
11. `grep -q "^## Usage" docs/codewalk.md && grep -q "^## What happens" docs/codewalk.md && grep -q "^## Requirements" docs/codewalk.md` — docs sections.
12. `grep -q '^| \[codewalk\](./docs/codewalk.md) |' README.md && grep -q '^/open-skills:codewalk' README.md && grep -A20 '^### External tools' README.md | grep -q 'codewalk'` — README row, invocation, External tools note.
13. `! LC_ALL=C.UTF-8 grep -nP '[\x{3000}-\x{9FFF}\x{FF00}-\x{FFEF}]' skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template docs/codewalk.md README.md` — no CJK (C-001).
14. `grep -q "interactive only" skills/codewalk/SKILL.md && grep -q "reading record" skills/codewalk/SKILL.md` — interactive-only and reading-record rules kept.
15. `grep -q "git worktree add --detach" skills/codewalk/SKILL.md && grep -q "git worktree remove" skills/codewalk/SKILL.md && grep -q "git worktree prune" skills/codewalk/SKILL.md && grep -q "repo-relative" skills/codewalk/SKILL.md && grep -qi "worktree" docs/codewalk.md` — worktree snapshot.
16. `! grep -q "git status" skills/codewalk/SKILL.md && ! grep -q -- "--ignored" skills/codewalk/SKILL.md && ! grep -q "still appears verbatim" skills/codewalk/SKILL.md && ! grep -q "uncommitted changes in" skills/codewalk/SKILL.md docs/codewalk.md` — old pin machinery removed.
17. `grep -q "gitignored" skills/codewalk/SKILL.md && grep -q "unknown" skills/codewalk/SKILL.md && grep -qi "unknown" docs/codewalk.md` — citation scope and fallback.
18. `grep -qF '.codewalk/<topic>.md' skills/codewalk/SKILL.md && grep -qF '.codewalk/<topic>.md' docs/codewalk.md && ! grep -q "docs/walkthroughs" skills/codewalk/SKILL.md docs/codewalk.md && grep -q "existed before this walk" skills/codewalk/SKILL.md` — default location and re-landing.
19. `grep -q "stop record" skills/codewalk/SKILL.md && grep -q "the orientation stop is stop 1" skills/codewalk/SKILL.md && grep -q "right after the current stop" skills/codewalk/SKILL.md && grep -q "as a literal string" skills/codewalk/SKILL.md && grep -q "already exists" skills/codewalk/SKILL.md && grep -q "primary path" skills/codewalk/SKILL.md && grep -qi "backtick" skills/codewalk/SKILL.md && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template` — earlier units' mandated behavior kept.

Manual (reviewer, not auto-checkable): items 1–8 present and mutually
consistent across SKILL.md, template, docs, and README; every earlier
Scope item still in force is present (archived units' Step 1–5 items,
items 1–11, 14–16, 18–19 of the fixes unit); SKILL.md stays imperative
with brief rationale and core loop rules near the top. Sanity-check the
worktree commands in a scratch repo (create, read, remove, prune of a
stale one; repo-relative path stripping).

### Exclusions

- Changes to harness-flow, handoff, init, request-code-review (incl.
  `reviewer-prompt.md`), receive-code-review, or `agents/`.
- PR walkthrough and refresh modes (still v2).
- Depth-range semantics, the inferred "reader" field, and the number of
  Prohibitions (six; only the first one's wording changes).
- Version bump in `.claude-plugin/plugin.json`.
- Edits to CLAUDE.md or `.harness/` (orchestrator-only, at the merge
  moment). Replacement of F-003 and supersession of D-003 are
  merge-moment work.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk reads from a temporary git worktree pinned to HEAD (falling back to the working tree with commit unknown), cites only tracked project code, lands a reading record at .codewalk/<topic>.md by default without prompting on its own file, and keeps its interactive-only, stop-record, and numbering behavior (replaces F-003) | `claude plugin validate . && head -5 skills/codewalk/SKILL.md \| grep -q '^name: codewalk$' && grep -qi "walk me through" skills/codewalk/SKILL.md && grep -q "request-code-review" skills/codewalk/SKILL.md && grep -q "SMIG" skills/codewalk/SKILL.md && grep -q "14–18\\\|14-18" skills/codewalk/SKILL.md && grep -q '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md && grep -q "^## Prohibitions" skills/codewalk/SKILL.md && grep -q "interactive only" skills/codewalk/SKILL.md && grep -q "reading record" skills/codewalk/SKILL.md && grep -q "git worktree add --detach" skills/codewalk/SKILL.md && grep -q "git worktree remove" skills/codewalk/SKILL.md && grep -q "git worktree prune" skills/codewalk/SKILL.md && grep -q "repo-relative" skills/codewalk/SKILL.md && grep -q "gitignored" skills/codewalk/SKILL.md && ! grep -q "git status" skills/codewalk/SKILL.md && grep -q "stop record" skills/codewalk/SKILL.md && grep -q "the orientation stop is stop 1" skills/codewalk/SKILL.md && grep -q "right after the current stop" skills/codewalk/SKILL.md && grep -q "as a literal string" skills/codewalk/SKILL.md && grep -q "already exists" skills/codewalk/SKILL.md && grep -q "existed before this walk" skills/codewalk/SKILL.md && grep -q "primary path" skills/codewalk/SKILL.md && grep -qi "backtick" skills/codewalk/SKILL.md && grep -qF '.codewalk/<topic>.md' skills/codewalk/SKILL.md && grep -q "may drift" skills/codewalk/templates/walkthrough.md.template && grep -qF '{{commit_sha_or_unknown}}' skills/codewalk/templates/walkthrough.md.template && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template && grep -q "^## Usage" docs/codewalk.md && grep -qi "worktree" docs/codewalk.md && grep -q '^\| \[codewalk\](./docs/codewalk.md) \|' README.md && grep -q '^/open-skills:codewalk' README.md` | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Opened from the user's redesign after the code review of 2026-09-29-codewalk-fixes: K1 — gitignore marks what need not be read, so cite only tracked code; K2 — isolate reading in a git worktree so the pin is exact and no status/re-check is needed; K3/K4 kept as implemented; default landing `.codewalk/<topic>.md` (user choice; `.harness/` is orchestrator-only and `.project/` is a harness-specific location); re-landing does not prompt on the walk's own file. Scope names the replacement of F-003 and supersession of D-003 at this unit's merge moment. Clock-in: `claude plugin validate .` passed; eval TBD skipped; no handoff file; tree clean.
- 2026-09-29 — Feature row command escapes `|` as `\|` for the Markdown table; unescape before running.
