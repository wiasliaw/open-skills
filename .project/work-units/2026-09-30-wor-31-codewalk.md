# Work Unit: 2026-09-30-wor-31-codewalk

- **Work-unit identifier**: 2026-09-30-wor-31-codewalk
- **Created**: 2026-09-30
- **Work-unit tool reference**: none (Linear WOR-31 is the spec source, not a declared work-unit tool)

## Contract

### Scope

Add the `codewalk` skill to the open-skills plugin, implementing Linear WOR-31 (issue body v1.5, fully consolidated — comments are revision history only). One change covering, per C-002, all four deliverables together:

1. `skills/codewalk/SKILL.md` — frontmatter `name` + `description` only. Description: third person, what + when, trigger phrases ("walk me through", "how does X work end to end", "give me a tour of this codebase", "onboard me"), skip conditions (single-fact questions; defect-finding → request-code-review). Body imperative, core loop rules near the top, style and length matching the existing skills.
2. `skills/codewalk/templates/walkthrough.md.template` — `{{snake_case_descriptive_name}}` placeholders (pattern: `skills/handoff/templates/handoff.md.template`); header with topic, mode, depth, commit pin, date; per-stop anchor + `file:line` + verbatim snapshot; drift notice.
3. `docs/codewalk.md` — follows the existing docs pages (second-person intro, ## Usage, ## What happens, ## Requirements); includes the manual worktree cleanup command.
4. `README.md` — Skills table row linking docs/codewalk.md, `/open-skills:codewalk` in the invocation block, External tools entry for git.

Spec points the skill content must honor (from WOR-31 body):

- Interactive-only anchored walkthrough; no orchestrator dispatch; with no reader to reply, explain and stop — do not even create the worktree. The landed file is a reading record, not a project deliverable.
- Two v1 modes: codebase tour (default when no clear anchor; anchor defaults to the primary execution path; a named directory/module narrows scope) and topic trace (one real execution path).
- Five-step flow: determine mode & anchor (landing location asked only in the first turn; default `.codewalk/<topic>.md`, kebab-case slug, `worktree` reserved) → recon → build route → walk (reader-paced: next / deeper on N / skip to X; orientation is stop 1, core path starts at stop 2; no duplicate numbers) → land (written to the real repo, never the worktree; ask before overwriting a pre-existing file; re-landing its own file does not re-ask).
- Recon reads from a HEAD worktree at `.codewalk/worktree/codewalk-<short-sha>` inside the repo; reused when the same commit is walked again; hooks and LFS off at creation; add `.codewalk/worktree/` to `.git/info/exclude` if absent; probe-read one tracked file before recording the pin.
- No automatic cleanup — worktrees persist for reuse; docs record `git worktree remove .codewalk/worktree/codewalk-<sha>`. Never run global `git worktree prune`; a broken registration (dir manually deleted) is fixed by `git worktree remove --force` on that exact path only, then one re-add.
- Fallback (no git / not a repo / no commits / worktree creation or read fails): read the working tree, pin `unknown`; what not to read or cite (dependencies, build output, vendored code) is the agent's judgment written as a rule, not a `.gitignore` parser.
- Citation discipline: never cite gitignored or out-of-repo code; submodules are boundaries — describe, do not cite.
- Route: narrative arc orientation → high-level map → core path → next steps (no recap); depth 5–8 / 9–13 / 14–18 stops; SMIG (Situation / Mechanism / Implication / Gotcha) check per stop; single stop-record definition — anchor created and verified (unique match in the cited file) while reading; walk and landing share the record.
- Six Prohibitions: no source modification; no citing unread files; say "not found" rather than guess; no file-listing descriptions; no whole-repo shallow overview; no judging or findings/verdicts (refer to request-code-review).

### Verification Standards

Run from the repo root, in order; all must succeed:

1. `claude plugin validate .`
2. `test -f skills/codewalk/SKILL.md && test -f skills/codewalk/templates/walkthrough.md.template && test -f docs/codewalk.md`
3. `[ "$(sed -n '2,/^---$/p' skills/codewalk/SKILL.md | grep -E '^[A-Za-z_-]+:' | cut -d: -f1 | sort | tr '\n' ' ')" = "description name " ]` — frontmatter carries exactly `name` and `description`.
4. `grep -q 'docs/codewalk.md' README.md && grep -q 'open-skills:codewalk' README.md && grep -qi 'git' README.md`
5. `grep -q 'git worktree remove' docs/codewalk.md`
6. `git diff main --name-only | grep -qx 'skills/request-code-review/reviewer-prompt.md'; [ $? -ne 0 ]` — reviewer-prompt.md untouched (F-001 greps its strings).
7. `git diff main --name-only | grep -qx '.claude-plugin/plugin.json'; [ $? -ne 0 ]` — no version bump.

### Exclusions

- PR walkthrough mode (v2).
- Refresh mode (v2).
- Changes to harness-flow or any existing skill.
- Version bump.

## Features

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | codewalk skill: interactive anchored-walkthrough skill with worktree-pinned recon, five-step flow, landing template, docs page, and README wiring | `claude plugin validate .` plus contract checks 2–7 | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

## Notes

- 2026-09-30 — Work unit opened on branch `feature/wor-31-codewalk` from up-to-date main. Prior branch `feature/wor-31-code-walk-skill` and PR #6 are abandoned; clean start, no reuse of their work units or harness entries.
