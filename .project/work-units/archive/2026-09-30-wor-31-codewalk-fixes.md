# Work Unit: 2026-09-30-wor-31-codewalk-fixes

- **Work-unit identifier**: 2026-09-30-wor-31-codewalk-fixes
- **Created**: 2026-09-30
- **Work-unit tool reference**: none (source: /open-skills:request-code-review pipeline verdicts on branch feature/wor-31-codewalk)

## Contract

### Scope

Apply the review findings confirmed by adversarial verification to the codewalk skill files on branch `feature/wor-31-codewalk`. Touch only `skills/codewalk/SKILL.md`, `skills/codewalk/templates/walkthrough.md.template`, and `docs/codewalk.md` (the one phrase mirroring the exclude path). All fixes preserve WOR-31 spec intent; where a fix rewords the spec's literal text (`.git/info/exclude`), the reworded form must still target the same file.

Verified findings to fix (all CONFIRMED by two independent verifiers unless noted):

1. **Exclude path** — replace the literal `.git/info/exclude` with "the file reported by `git rev-parse --git-path info/exclude`"; create its parent directory if missing; skip the append when the exact line `.codewalk/worktree/` is already present; when appending, guard against a missing trailing newline on the existing last line. Mirror the wording fix in `docs/codewalk.md` where it names the exclude file.
2. **Reuse safety** — before reusing an existing `codewalk-<short-sha>` worktree, require `git -C <path> rev-parse HEAD` to equal the repo's full HEAD SHA, and run the probe-read on reuse as well as on creation; if either fails, treat the directory as unusable (stale-registration recovery or fallback). Record the pin as the full SHA (directory name stays short).
3. **Path anchoring** — anchor `.codewalk/worktree/...` (and the landed `.codewalk/<topic>.md` default) at the directory reported by `git rev-parse --show-toplevel`, not the current working directory.
4. **Creation command** — give the exact invocation: `GIT_LFS_SKIP_SMUDGE=1 git -c core.hooksPath=/dev/null worktree add --detach <toplevel>/.codewalk/worktree/codewalk-<short-sha> HEAD`, and state explicitly that the worktree is created from HEAD and the pin is that HEAD's full SHA.
5. **Drift notice for `unknown` pin** — template and Step 5: when the pin is `unknown`, the landed file must not emit `git show unknown:<path>`; it states instead that no commit was recorded and snapshots reflect the working tree at the recorded date. Keep the `git show <pin>:<path>` hint for SHA pins. Keep the per-stop `Pinned at:` line (spec lists a per-stop generation SHA).
6. **Stop numbering** — state that the high-level map is part of stop 1 (keeping "orientation is stop 1; the core path starts at stop 2" intact), that "Next steps" is a closing section and not a counted stop, and that `deeper on N` sub-stops do not count toward the 5–8 / 9–13 / 14–18 ranges.
7. **Depth default** — default depth is standard (9–13); add phrase cues (e.g. "quick look"/"overview" → quick, "in depth"/"everything" → deep).
8. **Template comments** — Step 5: HTML comments in the template are instructions to the agent (including "repeat the per-stop section"), never copied into the landed file. (CONFIRMED by one verifier as part of the template finding.)

Trivial verified-adjacent minors, one line each (single-lens, unverified — included because each prevents a concrete failure):

9. The Explore-subagent prompt must include the worktree path and the pin, so recon subagents read the pinned tree, not the working tree.
10. The no-reader check ("no reader who can reply → explain and stop, create nothing") runs in Step 1, before Step 2 can create the worktree.
11. Reword the anchor rule: the anchor pattern must identify the stop's line unambiguously (with enough surrounding context to be unique), rather than demanding the symbol itself appear only once in the file.
12. Landing records only stops actually presented to the reader (including `deeper on N` sub-stops); sub-stop anchors are verified the same way as any other stop's.

### Verification Standards

Run from the repo root, in order; all must succeed:

1. `claude plugin validate .`
2. `[ "$(sed -n '2,/^---$/p' skills/codewalk/SKILL.md | grep -E '^[A-Za-z_-]+:' | cut -d: -f1 | sort | tr '\n' ' ')" = "description name " ]`
3. `grep -q 'git rev-parse --git-path info/exclude' skills/codewalk/SKILL.md && ! grep -q '`\.git/info/exclude`' skills/codewalk/SKILL.md`
4. `grep -q 'rev-parse --show-toplevel' skills/codewalk/SKILL.md`
5. `grep -q 'GIT_LFS_SKIP_SMUDGE=1 git -c core.hooksPath=/dev/null worktree add --detach' skills/codewalk/SKILL.md`
6. `grep -qi 'unknown' skills/codewalk/templates/walkthrough.md.template`
7. `git diff main --name-only | grep -qx 'skills/request-code-review/reviewer-prompt.md'; [ $? -ne 0 ]`
8. `git diff main --name-only | grep -qx '.claude-plugin/plugin.json'; [ $? -ne 0 ]`
9. Reviewer judgment: each of the 12 scope items is present and correctly worded; no other content changed; six Prohibitions intact; README untouched by this round.

### Exclusions

- Structural restructurings from the review (single stop-record consolidation with Step 5 as pure template fill; merging Fallback into Citation boundaries; folding the Modes section into Step 1) — pending user confirmation.
- Deleting the Prohibitions section (refuted — spec-mandated) and dropping the per-stop `Pinned at:` line (spec lists a per-stop SHA).
- Deferred minors: docs fallback/Requirements dedup; reformatting the worktree lifecycle bullets; the one-clarifying-question cap decision; landing-location wording polish.
- Everything excluded by the parent work unit (PR walkthrough mode, refresh mode, changes to harness-flow or existing skills, version bump).

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk review fixes: worktree procedure concrete and safe (exclude path, reuse checks, toplevel anchoring, exact creation command), `unknown`-pin drift notice, numbering/depth defaults, landing hygiene | `claude plugin validate .` plus contract checks 2–8 and reviewer judgment 9 | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

## Notes

- 2026-09-30 — Opened from /open-skills:request-code-review results: 26 lens findings deduped to 12 verified candidates; 7 critical-level and the template-comment item CONFIRMED (dual verifiers for criticals); 1 dropped as refuted by both verifiers (Read-only vs Prohibition 1 "contradiction"); refuted sub-claims: delete-Prohibitions, docs mode duplication, SMIG placeholder style.
