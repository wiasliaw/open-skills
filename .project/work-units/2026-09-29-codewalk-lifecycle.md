# Work Unit: 2026-09-29-codewalk-lifecycle

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-09-29-codewalk-lifecycle
- **Created**: 2026-09-29
- **Work-unit tool reference**: none (source request: Linear WOR-31, fixes from the /request-code-review of the full branch after 2026-09-29-codewalk-worktree)

## Contract

### Scope

Make codewalk's worktree lifecycle safe and portable, and fix the
verified review findings W1–W5 plus the cheap Minors. Everything else
in the archived units 2026-09-29-codewalk-skill, -fixes, and -worktree
stays in force except where an item below replaces it.

Files: `skills/codewalk/SKILL.md`,
`skills/codewalk/templates/walkthrough.md.template` (only if needed),
`docs/codewalk.md`, `README.md`.

1. **Gate before recon.** Where no reader can reply (subagent, headless
   run), do not run Steps 1–5 at all — in particular create no
   worktree — and answer directly or say the walk needs an interactive
   session.
2. **Snapshot location, unique per walk (W1).** From the repository
   root, compute the absolute common dir as
   `"$(cd "$(git rev-parse --git-common-dir)" && pwd -P)"` (no
   `--path-format`, which needs git 2.31). Create the snapshot directory
   with `mktemp -d "<common>/codewalk-$(date -u +%Y%m%dT%H%MZ)-XXXXXX"`.
   Shell state does not persist between Bash calls: capture the absolute
   path mktemp prints and reuse that literal string, double-quoted, in
   every later command and tool call. No `--lock`/`--reason` (the latter
   needs git 2.33; unique paths make locking unnecessary).
3. **No global prune (W2); scoped stale cleanup.** Never run
   `git worktree prune`. Before creating the snapshot, remove only
   registered worktrees (from `git worktree list --porcelain`) whose
   path starts with the absolute `<common>/codewalk-` prefix and whose
   stamp is more than 24 hours older than the current UTC time —
   compare the fixed-width stamps; do not rely on `date -d` or
   `date -v`. For those codewalk-owned snapshots
   `git worktree remove --force` is allowed. Touch nothing else. The
   phrase `24 hours` MUST appear.
4. **Hooks and LFS off (W4).** Create with
   `GIT_LFS_SKIP_SMUDGE=1 git -c core.hooksPath=/dev/null worktree add --detach "<path>" HEAD`.
   If it exits non-zero: if `<path>` is registered anyway (e.g. a hook
   failed), remove it with `git worktree remove --force "<path>"`;
   otherwise `rmdir "<path>"` (never `rm -rf`); then take the fallback.
5. **Probe before pinning (W5).** Read one tracked file inside
   `<path>`. If the read is denied (permission prompt refused, or reads
   outside the working directory blocked), remove the worktree, take
   the fallback, and tell the reader that allowing reads there gives an
   exact pin. Record the pin with `git -C "<path>" rev-parse HEAD` only
   after the probe succeeds.
6. **Removal without force (W3).** After landing, and when the walk
   ends without landing, run `git worktree remove "<path>"` with no
   `--force`; if git refuses, show `git -C "<path>" status --porcelain`
   and ask before forcing. To go on after landing, or if the snapshot
   vanished mid-walk, re-add it at the recorded SHA with the same
   hooks-off command — never read the working tree under a SHA pin.
   Fold into Prohibition 1: a code change the reader asks for goes to
   the real repository, never under `<path>` (still six Prohibitions).
7. **Fallback wording.** Fallback conditions: git unavailable, not a
   repository, no commits, or the worktree cannot be created or read.
   Pin `unknown`, say so, never invent a SHA. Keep "cite only tracked
   project code … never gitignored paths … or files outside the
   repository"; add one clause that in the fallback `<path>` means the
   repository (or working-directory) root, there is no worktree to
   remove, and without git what `.gitignore` excludes counts as
   untracked. Do not introduce a new variable.
8. **Submodules.** Their contents are not in the snapshot: treat a
   submodule as a boundary and name it in prose.
9. **Restart to include changes.** The first-turn clause says the walk
   describes the last commit (short SHA) and excludes uncommitted
   changes — commit and restart the walk to include them.
10. **Topic slug.** `<topic>` in the default path is a lowercase
    kebab-case slug of `[a-z0-9-]`, at most 50 characters.
11. **Going back.** The current stop is the furthest stop shown;
    revisiting a shown stop (e.g. `skip to 2` after stop 5) is answered
    in place, so an off-route insert still goes right after the
    furthest stop shown and numbers stay unique.
12. **Docs and README.** `docs/codewalk.md`: the worktree lives under
    the repository's `.git` directory, is unique per walk, is removed
    after the walkthrough is saved, and leftovers older than a day are
    cleaned on the next run; hooks and LFS downloads are skipped; a
    session started from a linked worktree may be asked to allow reads
    there (denied → commit recorded as `unknown`); the snapshot is a
    full checkout of the tree (disk and time on large repos); restart
    the walk after committing to include changes; remove the in-page
    duplicates (existing-file prompt, `deeper on N`). Remove every
    mention of the system temp directory and of a stale copy being
    replaced. README External tools codewalk line matches.
13. **Length.** SKILL.md stays within 90–175 lines. Write the Minors
    (items 8–11) as clauses in existing sentences. If it still cannot
    fit, report `blocked` rather than cutting mandated text or
    rationale.

All content in English (C-001).

### Verification Standards

Run from the repo root; all must pass:

1. `claude plugin validate .` — exits 0.
2. `test -z "$(git status --porcelain --untracked-files=all | grep -v ' .project/work-units/' | awk '{print $2}' | grep -vxE 'README.md|docs/codewalk.md|skills/codewalk/SKILL.md|skills/codewalk/templates/walkthrough.md.template')"` — only in-scope files changed.
3. `head -5 skills/codewalk/SKILL.md | grep -q '^name: codewalk$' && awk '/^---$/{n++; next} n==1' skills/codewalk/SKILL.md | grep -vE '^(name|description):' | grep -c . | grep -qx 0` — frontmatter holds only name and description.
4. `grep -qi 'walk me through' skills/codewalk/SKILL.md && grep -q 'request-code-review' skills/codewalk/SKILL.md` — trigger phrase and redirect.
5. `grep -q 'SMIG' skills/codewalk/SKILL.md && grep -q '5–8' skills/codewalk/SKILL.md && grep -q '9–13' skills/codewalk/SKILL.md && grep -q '14–18' skills/codewalk/SKILL.md` — SMIG and depth counts.
6. `grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md` — template path.
7. `grep -q '^## Prohibitions' skills/codewalk/SKILL.md && [ "$(awk '/^## Prohibitions/{f=1;next} f' skills/codewalk/SKILL.md | grep -c '^- ')" = 6 ]` — six Prohibitions.
8. `[ "$(wc -l < skills/codewalk/SKILL.md)" -ge 90 ] && [ "$(wc -l < skills/codewalk/SKILL.md)" -le 175 ]` — length bound 90–175.
9. `grep -qE '\{\{[a-z0-9_]+\}\}' skills/codewalk/templates/walkthrough.md.template && ! grep -oE '\{\{[^}]*\}\}' skills/codewalk/templates/walkthrough.md.template | grep -vqE '^\{\{[a-z0-9_]+\}\}$'` — snake_case placeholders only.
10. `grep -q 'may drift' skills/codewalk/templates/walkthrough.md.template && grep -qi 'anchor' skills/codewalk/templates/walkthrough.md.template && [ "$(grep -o 'commit_sha_or_unknown' skills/codewalk/templates/walkthrough.md.template | wc -l)" = 2 ] && ! grep -q 'working_tree_note\|uncommitted' skills/codewalk/templates/walkthrough.md.template && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template` — template pin, drift notice, orientation heading.
11. `grep -q '^## Usage' docs/codewalk.md && grep -q '^## What happens' docs/codewalk.md && grep -q '^## Requirements' docs/codewalk.md` — docs sections.
12. `grep -q '^| .codewalk.(./docs/codewalk.md) |' README.md && grep -q '^/open-skills:codewalk' README.md && grep -A20 '^### External tools' README.md | grep -q 'codewalk'` — README row, invocation, External tools note.
13. `! LC_ALL=C.UTF-8 grep -nP '[\x{3000}-\x{9FFF}\x{FF00}-\x{FFEF}]' skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template docs/codewalk.md README.md` — no CJK (C-001).
14. `grep -q 'interactive only' skills/codewalk/SKILL.md && grep -q 'reading record' skills/codewalk/SKILL.md && grep -q 'interactive only' docs/codewalk.md` — interactive-only and reading-record rules.
15. `grep -q -- '--git-common-dir' skills/codewalk/SKILL.md && grep -q 'mktemp -d' skills/codewalk/SKILL.md && grep -qF 'codewalk-$(date -u +%Y%m%dT%H%MZ)-XXXXXX' skills/codewalk/SKILL.md && grep -q 'core.hooksPath=/dev/null' skills/codewalk/SKILL.md && grep -q 'GIT_LFS_SKIP_SMUDGE=1' skills/codewalk/SKILL.md && grep -q 'git worktree add --detach' skills/codewalk/SKILL.md && grep -q 'git worktree remove' skills/codewalk/SKILL.md && grep -q 'rmdir' skills/codewalk/SKILL.md && grep -q 'only inside .<path>.' skills/codewalk/SKILL.md && grep -q 'repo-relative' skills/codewalk/SKILL.md` — worktree lifecycle literals.
16. `! grep -q 'worktree prune' skills/codewalk/SKILL.md docs/codewalk.md README.md && ! grep -qi 'system temp' skills/codewalk/SKILL.md docs/codewalk.md README.md && ! grep -q -- '--path-format' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q -- '--reason' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q -- '--lock' skills/codewalk/SKILL.md && ! grep -q 'git status' skills/codewalk/SKILL.md && ! grep -q -- '--ignored' skills/codewalk/SKILL.md && ! grep -q 'still appears verbatim' skills/codewalk/SKILL.md && ! grep -q 'uncommitted changes in' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q 'docs/walkthroughs' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -qi 'stale copy' skills/codewalk/SKILL.md docs/codewalk.md` — removed and forbidden constructs absent.
17. `grep -q 'unknown' skills/codewalk/SKILL.md && grep -qi 'unknown' docs/codewalk.md && grep -q 'gitignored' skills/codewalk/SKILL.md && grep -q 'tracked project code' skills/codewalk/SKILL.md && grep -qi 'submodule' skills/codewalk/SKILL.md && grep -q '24 hours' skills/codewalk/SKILL.md` — fallback, citation scope, submodules, stale cleanup.
18. `grep -qF '.codewalk/<topic>.md' skills/codewalk/SKILL.md && grep -qF '.codewalk/<topic>.md' docs/codewalk.md && grep -q 'kebab-case' skills/codewalk/SKILL.md && grep -q 'existed before this walk' skills/codewalk/SKILL.md && grep -q 'without asking' skills/codewalk/SKILL.md` — landing location, slug, re-landing.
19. `grep -q 'stop record' skills/codewalk/SKILL.md && grep -q 'the orientation stop is stop 1' skills/codewalk/SKILL.md && grep -q 'right after the current stop' skills/codewalk/SKILL.md && grep -q 'furthest stop shown' skills/codewalk/SKILL.md && grep -q 'as a literal string' skills/codewalk/SKILL.md && grep -q 'already exists' skills/codewalk/SKILL.md && grep -q 'primary path' skills/codewalk/SKILL.md && grep -qi 'backtick' skills/codewalk/SKILL.md && grep -q 'restart the walk' skills/codewalk/SKILL.md && grep -q '^- .next. ' skills/codewalk/SKILL.md && grep -q '^- .deeper on N. ' skills/codewalk/SKILL.md && grep -q '^- .skip to X. ' skills/codewalk/SKILL.md && grep -q '^- .land. ' skills/codewalk/SKILL.md` — walk behavior and controls.
20. `grep -qi 'linked worktree' docs/codewalk.md && grep -q 'after the walkthrough is saved' docs/codewalk.md` — docs permission caveat and removal timing.

Manual (reviewer): items 1–13 present and consistent across SKILL.md,
template, docs, README; earlier in-force items present; SKILL.md
imperative with brief rationale and core loop rules near the top. Run
the lifecycle literally in a scratch repo: stale cleanup (a registered
`<common>/codewalk-<old stamp>-*` worktree is removed; a fresh one and
an unrelated worktree such as `../codewalk-foo` are untouched);
`mktemp` + hooks-off `worktree add` (a post-checkout hook does not
run); two concurrent snapshots get distinct paths; probe + pin; the
main repo's status does not show the snapshot; repo-relative stripping
yields `src/app.py`; plain `worktree remove` succeeds on a fresh
snapshot and refuses on a modified one; a failed `add` (e.g. a
failing hook without hooks-off, or an invalid ref) leaves no directory
behind; the absolute common dir resolves from both the main checkout
and a linked worktree.

### Exclusions

- Changes to harness-flow, handoff, init, request-code-review (incl.
  `reviewer-prompt.md`), receive-code-review, or `agents/`.
- PR walkthrough and refresh modes; depth-range semantics; the
  inferred "reader" field; the `<root>` variable rewrite (X1) and the
  duplicate-text cuts (X2), both refuted.
- The landed-record set on an early `land` (refuted as intended, K4).
- Version bump in `.claude-plugin/plugin.json`.
- Edits to CLAUDE.md or `.harness/` (merge moment only). Replacement of
  F-004 (new entry titled with the full behavior, verification = every
  VS except VS2) and supersession of D-004 (listing all four fallback
  conditions), plus an ARCHITECTURE Key Boundaries line that codewalk
  writes temporary worktrees under the consuming repository's git
  common dir, are merge-moment work.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk is an interactive-only anchored walkthrough that snapshots HEAD into a unique hooks-off git worktree under the repository git dir (probe-read before pinning, scoped stale cleanup, no global prune, unforced removal), falls back to the working tree with commit unknown, cites only tracked project code, walks numbered verified stop records with next/deeper/skip/land controls, and lands a reading record at .codewalk/topic.md with its template, docs page, and README entry (replaces F-004) | `claude plugin validate . && head -5 skills/codewalk/SKILL.md \| grep -q '^name: codewalk$' && awk '/^---$/{n++; next} n==1' skills/codewalk/SKILL.md \| grep -vE '^(name\|description):' \| grep -c . \| grep -qx 0 && grep -qi 'walk me through' skills/codewalk/SKILL.md && grep -q 'request-code-review' skills/codewalk/SKILL.md && grep -q 'SMIG' skills/codewalk/SKILL.md && grep -q '5–8' skills/codewalk/SKILL.md && grep -q '9–13' skills/codewalk/SKILL.md && grep -q '14–18' skills/codewalk/SKILL.md && grep -qF '${CLAUDE_PLUGIN_ROOT}/skills/codewalk/templates/walkthrough.md.template' skills/codewalk/SKILL.md && grep -q '^## Prohibitions' skills/codewalk/SKILL.md && [ "$(awk '/^## Prohibitions/{f=1;next} f' skills/codewalk/SKILL.md \| grep -c '^- ')" = 6 ] && [ "$(wc -l < skills/codewalk/SKILL.md)" -ge 90 ] && [ "$(wc -l < skills/codewalk/SKILL.md)" -le 175 ] && grep -qE '\{\{[a-z0-9_]+\}\}' skills/codewalk/templates/walkthrough.md.template && ! grep -oE '\{\{[^}]*\}\}' skills/codewalk/templates/walkthrough.md.template \| grep -vqE '^\{\{[a-z0-9_]+\}\}$' && grep -q 'may drift' skills/codewalk/templates/walkthrough.md.template && grep -qi 'anchor' skills/codewalk/templates/walkthrough.md.template && [ "$(grep -o 'commit_sha_or_unknown' skills/codewalk/templates/walkthrough.md.template \| wc -l)" = 2 ] && ! grep -q 'working_tree_note\\|uncommitted' skills/codewalk/templates/walkthrough.md.template && grep -qF '### 1. {{orientation_stop_title}}' skills/codewalk/templates/walkthrough.md.template && grep -q '^## Usage' docs/codewalk.md && grep -q '^## What happens' docs/codewalk.md && grep -q '^## Requirements' docs/codewalk.md && grep -q '^\| .codewalk.(./docs/codewalk.md) \|' README.md && grep -q '^/open-skills:codewalk' README.md && grep -A20 '^### External tools' README.md \| grep -q 'codewalk' && ! LC_ALL=C.UTF-8 grep -nP '[\x{3000}-\x{9FFF}\x{FF00}-\x{FFEF}]' skills/codewalk/SKILL.md skills/codewalk/templates/walkthrough.md.template docs/codewalk.md README.md && grep -q 'interactive only' skills/codewalk/SKILL.md && grep -q 'reading record' skills/codewalk/SKILL.md && grep -q 'interactive only' docs/codewalk.md && grep -q -- '--git-common-dir' skills/codewalk/SKILL.md && grep -q 'mktemp -d' skills/codewalk/SKILL.md && grep -qF 'codewalk-$(date -u +%Y%m%dT%H%MZ)-XXXXXX' skills/codewalk/SKILL.md && grep -q 'core.hooksPath=/dev/null' skills/codewalk/SKILL.md && grep -q 'GIT_LFS_SKIP_SMUDGE=1' skills/codewalk/SKILL.md && grep -q 'git worktree add --detach' skills/codewalk/SKILL.md && grep -q 'git worktree remove' skills/codewalk/SKILL.md && grep -q 'rmdir' skills/codewalk/SKILL.md && grep -q 'only inside .<path>.' skills/codewalk/SKILL.md && grep -q 'repo-relative' skills/codewalk/SKILL.md && ! grep -q 'worktree prune' skills/codewalk/SKILL.md docs/codewalk.md README.md && ! grep -qi 'system temp' skills/codewalk/SKILL.md docs/codewalk.md README.md && ! grep -q -- '--path-format' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q -- '--reason' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q -- '--lock' skills/codewalk/SKILL.md && ! grep -q 'git status' skills/codewalk/SKILL.md && ! grep -q -- '--ignored' skills/codewalk/SKILL.md && ! grep -q 'still appears verbatim' skills/codewalk/SKILL.md && ! grep -q 'uncommitted changes in' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -q 'docs/walkthroughs' skills/codewalk/SKILL.md docs/codewalk.md && ! grep -qi 'stale copy' skills/codewalk/SKILL.md docs/codewalk.md && grep -q 'unknown' skills/codewalk/SKILL.md && grep -qi 'unknown' docs/codewalk.md && grep -q 'gitignored' skills/codewalk/SKILL.md && grep -q 'tracked project code' skills/codewalk/SKILL.md && grep -qi 'submodule' skills/codewalk/SKILL.md && grep -q '24 hours' skills/codewalk/SKILL.md && grep -qF '.codewalk/<topic>.md' skills/codewalk/SKILL.md && grep -qF '.codewalk/<topic>.md' docs/codewalk.md && grep -q 'kebab-case' skills/codewalk/SKILL.md && grep -q 'existed before this walk' skills/codewalk/SKILL.md && grep -q 'without asking' skills/codewalk/SKILL.md && grep -q 'stop record' skills/codewalk/SKILL.md && grep -q 'the orientation stop is stop 1' skills/codewalk/SKILL.md && grep -q 'right after the current stop' skills/codewalk/SKILL.md && grep -q 'furthest stop shown' skills/codewalk/SKILL.md && grep -q 'as a literal string' skills/codewalk/SKILL.md && grep -q 'already exists' skills/codewalk/SKILL.md && grep -q 'primary path' skills/codewalk/SKILL.md && grep -qi 'backtick' skills/codewalk/SKILL.md && grep -q 'restart the walk' skills/codewalk/SKILL.md && grep -q '^- .next. ' skills/codewalk/SKILL.md && grep -q '^- .deeper on N. ' skills/codewalk/SKILL.md && grep -q '^- .skip to X. ' skills/codewalk/SKILL.md && grep -q '^- .land. ' skills/codewalk/SKILL.md && grep -qi 'linked worktree' docs/codewalk.md && grep -q 'after the walkthrough is saved' docs/codewalk.md` | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-29 — feature 1, round 1: pass — feature cmd (verified to propagate early failures) and VS1–20 exit 0 (SKILL.md 173 lines); items 1–13 located; lifecycle exercised literally in a scratch repo (stale cleanup scoped to prefix+stamp, hooks off, distinct concurrent paths, probe then pin, invisible to main status, repo-relative stripping, unforced remove refuses on modified, failed add leaves no dir for hook failure and invalid ref, common dir resolves identically from a linked worktree); whitespace-normalized word diff shows only scoped changes. Observations: stale cutoff instruction does not say how to roll back month/year on the 1st (naive decrement would classify a live concurrent snapshot as stale); ~100-column rewrap matches neither sibling style (<=80 hard wrap vs unwrapped); wrap artifact at SKILL.md:77.

## Notes

<!-- Dated progress notes, blockers (with the options for a major uncontracted decision), and failure attributions. -->

- 2026-09-29 — Opened from /request-code-review of the full branch: W1 (fixed shared path), W2 (global prune), W3 (forced removal), W4 (hooks/LFS), W5 (unreadable snapshot) kept after verification (verifiers rated Important/Minor); X3 (F-004 weaker than contract, narrow title) confirmed; X1/X2 refuted. User decisions: worktree under the git common dir; SKILL.md bound raised to 175. Orchestrator probe in a scratch repo: a worktree at `.git/codewalk-XXXXXX` is invisible to the main repo's status and root-level search, readable by Grep/Glob, and removable without force. Git versions checked from release notes: `rev-parse --path-format` is 2.31, `worktree add --reason` is 2.33 — both avoided. Scope names the replacement of F-004 and supersession of D-004. Clock-in: `claude plugin validate .` passed; tree clean.
- 2026-09-29 — Feature row command escapes `|` as `\|` for the Markdown table; unescape before running. It is every VS except VS2.
- 2026-09-29 — Contract fix before review: VS8 used `L=...; [ ... ]`, whose bare `;` made the joined Features-row command ignore every check before it (reported by the implementor). Rewrote VS8 and the row without `;`. Implementor rewrapped SKILL.md from ~78 to ~100 columns to fit 175 lines (186 at the old width, no text cut) — to be put to the user.
- 2026-09-29 — Merge moment held after the round-1 pass: the month/year rollover gap in the stale cutoff can force-remove a live concurrent snapshot, and the line-width choice is pending with the user.
