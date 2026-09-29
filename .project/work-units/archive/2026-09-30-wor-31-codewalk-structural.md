# Work Unit: 2026-09-30-wor-31-codewalk-structural

- **Work-unit identifier**: 2026-09-30-wor-31-codewalk-structural
- **Created**: 2026-09-30
- **Work-unit tool reference**: none (source: user-approved structural proposals from the /open-skills:request-code-review pipeline; see `.project/handoff.md` Next Steps 1 at commit 888aef2)

## Contract

### Scope

Apply the three user-approved structural restructurings to `skills/codewalk/SKILL.md` on branch `feature/wor-31-codewalk`. Behavior-preserving: every rule that exists today survives, relocated; no rule content is weakened or dropped. Baseline for this round's diff: commit `67a481a`.

1. **Stop-record consolidation** — Step 3 defines the stop record completely: content anchor, `file:line`, and the verbatim code snapshot, with the snapshot copied at the moment the anchor is verified while reading (not reconstructed later). The pin stays walk-level (one HEAD per walk) with the per-stop `Pinned at:` template line kept. Step 5 becomes purely "fill the template from the stop records" plus its existing landing rules (real repo not worktree, fence longer than content, cite only confirmed files, overwrite-ask semantics, `unknown`-pin drift-notice replacement, template comments never landed, only presented stops recorded). Remove any wording claiming the record gains new fields at landing.
2. **Merge Fallback into Citation boundaries** — the two Step 2 subsections overlap on "read and cite only the project's own source". Merge into one subsection that fully preserves: the fallback triggers (no git / not a repo / no commits / worktree creation or read fails), reading the working tree with pin `unknown`, the judgment-rule (not a `.gitignore` parser) for skipping dependencies/build output/vendored code, never citing gitignored or out-of-repo code, and submodules as describe-only boundaries.
3. **Fold the Modes section into Step 1** — move the two mode definitions (codebase tour: default when no clear anchor, anchor defaults to the primary execution path, a named directory/module narrows scope; topic trace: one real execution path) into Step 1's bullets, deleting the standalone Modes section. `docs/codewalk.md`'s mode list stays as-is.

### Verification Standards

Run from the repo root, in order; all must succeed:

1. `claude plugin validate .`
2. `[ "$(sed -n '2,/^---$/p' skills/codewalk/SKILL.md | grep -E '^[A-Za-z_-]+:' | cut -d: -f1 | sort | tr '\n' ' ')" = "description name " ]`
3. `grep -qi 'unknown' skills/codewalk/SKILL.md && grep -q 'topic trace' skills/codewalk/SKILL.md` — fallback pin and mode definitions survive relocation.
4. `grep -qi 'prohibitions' skills/codewalk/SKILL.md`
5. `git diff 2e1bb56 --name-only | grep -vqx 'skills/codewalk/SKILL.md'; [ $? -ne 0 ]` — this round touches exactly `skills/codewalk/SKILL.md` (baseline: the commit that opened this work unit).
6. `git diff main --name-only | grep -qx 'skills/request-code-review/reviewer-prompt.md'; [ $? -ne 0 ]`
7. `git diff main --name-only | grep -qx '.claude-plugin/plugin.json'; [ $? -ne 0 ]`
8. Reviewer judgment: each relocated rule survives verbatim-or-equivalent (six Prohibitions, worktree lifecycle, fallback triggers and judgment rule, citation boundaries, mode definitions and defaults, all Step 1–5 rules); the file reads as one coherent procedure; no behavior change.

### Exclusions

- The per-stop `Pinned at:` template line stays (pending user decision recorded in handoff).
- The "ask at most one clarifying question" cap stays as-is (pending user decision).
- Deferred minors stay deferred: `docs/codewalk.md` fallback/Requirements dedup; worktree-lifecycle bullets to numbered steps.
- No changes to the template, docs, README, or any other file; no version bump; everything excluded by the parent work units.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk SKILL.md restructured: stop record defined once in Step 3 (snapshot at verification time), Fallback merged into Citation boundaries, Modes folded into Step 1 — all rules preserved | `claude plugin validate .` plus contract checks 2–7 and reviewer judgment 8 | passed (F-004) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-09-30 — feature 1, round 1: **pass** — checks 1–7 all exit 0; rule-preservation audit clean (diff vs `2e1bb56` is exactly three hunks in `skills/codewalk/SKILL.md`, all relocated rules survive verbatim-or-equivalent, six prohibitions untouched). Caveat: check 5 exited 0 but was unreliable while the orchestrator's contract correction sat uncommitted; resolved by committing the correction at the merge moment.

## Notes

- 2026-09-30 — Opened on user approval of the three structural proposals ("Structural 也可以修，修復完成後 PR"); minors and the two pending judgment calls remain excluded.
- 2026-09-30 — Implementor reported blocked on checks 4 and 5; both were contract defects (orchestrator attribution: verification spec), not edit defects — check 4 was case-sensitive against the actual heading "The six prohibitions", check 5's baseline predated this work unit's own opening commit. Contract corrected (grep -qi; baseline 2e1bb56); edit accepted as ready-for-review. Line count 181→182 (+1): accepted — remaining cuts would have dropped rule content.
