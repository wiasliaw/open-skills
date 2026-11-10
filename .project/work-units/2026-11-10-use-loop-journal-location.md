# Work Unit: 2026-11-10-use-loop-journal-location

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-11-10-use-loop-journal-location
- **Created**: 2026-11-10
- **Work-unit tool reference**: none

## Contract

### Scope

Two follow-ups from the acceptance probe of work unit `2026-11-10-use-loop-skill`.

#### Feature 1: journal location is a default with a stated override rule

The use-loop journal location becomes a default that the orchestrator resolves once per loop, instead of a fixed path.

- `skills/use-loop/SKILL.md` gains a `## Journal location` section that states:
  - Default: `.project/loops/<id>.md` under the project root; closed loops move to `.project/loops/archive/` in the same root.
  - Override: when an instruction in effect for the session (a user-level or project-level CLAUDE.md, or the user in conversation) maps plugin state or the `.project/` directory to another root, the orchestrator resolves the journal location per that instruction at loop creation.
  - The orchestrator tells the user the resolved path before the first write, uses that one location for the loop's whole life including archive, and records nothing about the location in the sentinel dispatch (the sentinel never reads or writes the journal).
  - Clock-out and clock-in list open loops from the resolved location, not only from the default.
- Every other mention of `.project/loops/` in `SKILL.md` reads as the default, not as the only location.
- `skills/use-loop/templates/LOOP.md.template`: the leading comment's Location line states the default and that the orchestrator's resolved location applies.
- `docs/use-loop.md`: the same rule in user-facing words, in the section that names the journal path.
- `agents/sentinel.md` is unchanged.

#### Feature 2: archived work units contain no Chinese text (C-001)

Three lines in two archived work-unit state files quote the user's Chinese decisions verbatim. The orchestrator, as the only writer of work-unit state, rewrites each quote as an English paraphrase and changes nothing else in those files:

- `.project/work-units/archive/2026-09-30-wor-31-codewalk-polish.md` line 5 and line 53.
- `.project/work-units/archive/2026-09-30-wor-31-codewalk-structural.md` line 51.

### Verification Standards

Run from the repository root, in this order:

```
claude plugin validate .
node --test scripts/*.test.mjs
grep -q '^## Journal location' skills/use-loop/SKILL.md
grep -qi 'default' skills/use-loop/SKILL.md && grep -q '\.project/loops/<id>\.md' skills/use-loop/SKILL.md
grep -qi 'resolved' skills/use-loop/SKILL.md && grep -qi 'before the first write' skills/use-loop/SKILL.md
grep -qi 'default' skills/use-loop/templates/LOOP.md.template
grep -qi 'default' docs/use-loop.md && grep -q '\.project/loops/' docs/use-loop.md
git diff --quiet HEAD -- agents/sentinel.md
test -z "$(git ls-files -z | xargs -0 perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"
```

### Exclusions

- Any change to `agents/sentinel.md`, `agents/implementor.md`, `agents/reviewer.md`, `skills/harness-flow/`, `skills/handoff/`, `scripts/`, `.claude-plugin/plugin.json`.
- Any change to the handoff format, the check kinds, the five-step protocol's step count, or the sentinel's rules.
- Any change to the archived work units beyond the three quoted lines.
- Any change to `README.md` (the Skills row needs no update for this behavior).

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | use-loop states the default journal location and the override rule in the skill, the template comment, and the docs page, with the sentinel unchanged | `claude plugin validate . && grep -q '^## Journal location' skills/use-loop/SKILL.md && grep -qi 'default' skills/use-loop/SKILL.md && grep -qi 'before the first write' skills/use-loop/SKILL.md && grep -qi 'default' skills/use-loop/templates/LOOP.md.template && grep -qi 'default' docs/use-loop.md && git diff --quiet HEAD -- agents/sentinel.md` | passed (F-013) |
| 2 | every tracked file is English, including archived work units | `test -z "$(git ls-files -z \| xargs -0 perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"` | active |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-11-10 — feature 1, round 1: pass — reviewer ran feature chain, validate, node tests (23/23), contract greps; four Journal location points present; all .project/loops mentions read as default; five steps kept; sentinel unchanged; diff confined to the three scoped files.

## Notes

- 2026-11-10 — Opened on the user's two decisions after the acceptance probe: (1) the probe's orchestrator wrote the journal under `~/.local/state/claude/<slug>/` because the user's global CLAUDE.md maps plugin state there, so the skill must state the default and the override rule; (2) three Chinese quotes remain in archived work units from 2026-09-30, to be rewritten in English. Branch `research-use-loop-skill-spec`, PR #12 open. Implementor and reviewer run as `general-purpose` subagents following `agents/implementor.md` and `agents/reviewer.md`, since the plugin is not installed in this session. Feature 2 is an orchestrator edit (work-unit state has one writer) verified by the reviewer.
- 2026-11-10 — Feature 1 passed review. Merge moment wrote F-013, D-010, and index rows. Feature 2 set to active; orchestrator rewrites the three quoted lines next.
