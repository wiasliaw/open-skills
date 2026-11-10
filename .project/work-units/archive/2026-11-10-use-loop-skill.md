# Work Unit: 2026-11-10-use-loop-skill

<!--
Purpose: the harness's own short-term state for one work unit — its sprint contract and the harness-flow loop state. The same format is used whether or not the project declares a work-unit tool.
Written by: the orchestrator (main session) only. Read by the implementor and reviewer; neither may write to it.
Location: one file per work unit at the location declared in the project's CLAUDE.md Harness section `short-term memory:` bullet; moved to that location's `archive/` subdirectory when the work unit closes.
Ownership: when CLAUDE.md declares a work-unit tool, that tool owns what it records (e.g. scope, acceptance criteria, a task checklist) — this file points at it instead of copying it. This file owns the loop state (Features, Review Log, Notes) and any contract section the tool has no home for. Every field lives in exactly one place.
-->

- **Work-unit identifier**: 2026-11-10-use-loop-skill
- **Created**: 2026-11-10
- **Work-unit tool reference**: none

## Contract

### Scope

Add a `use-loop` skill that lets an orchestrator session wait for a state change without spending its own context on the wait. The skill ships a one-shot **sentinel** subagent, an orchestrator protocol, a loop journal template, a docs page, and README wiring.

#### Terms

- **Loop**: one named wait for a state change, recorded in a journal file at `.project/loops/<id>.md`. `<id>` matches `^[a-z0-9][a-z0-9-]*$`.
- **Sentinel**: the `open-skills:sentinel` subagent. One dispatch waits for one change or one deadline, then ends with a handoff. It never loops across changes.
- **Round**: one sentinel dispatch. The orchestrator forms a loop by dispatching a new round after each handoff.
- **Check**: the probe that reads the current state. Two kinds:
  - `shell`: a command whose exit status or stdout decides the condition. The sentinel waits inside a foreground `until` loop, so the wait costs zero model turns.
  - `tool`: a read-only tool call, for example an MCP tool such as Linear. The sentinel sleeps `interval` in a foreground Bash call, then calls the tool and compares with the baseline. Each tick costs one sentinel turn.
- **Baseline**: the state observed when the round starts. The condition is "current differs from baseline" or "predicate becomes true", as the loop record states.
- **Deadline**: a required wall-clock bound per round. The sentinel hands off when it passes.
- **Handoff**: the sentinel's final message, in the fixed format below.

#### `agents/sentinel.md`

- Frontmatter `name: sentinel` and a `description` that names the trigger: dispatched by the use-loop skill to wait for one state change.
- Input shape: the loop record (id, condition, check kind, check command or tool call, interval, deadline, baseline) and the handoff format.
- Wait rules:
  - MUST wait only inside foreground Bash calls. MUST NOT use `run_in_background`, the `Monitor` tool, or `ScheduleWakeup`. Reason: a sentinel that ends its turn while waiting on background work is not reliably rewoken (probe, 2026-11-10, Notes).
  - Each foreground wait call MUST set an explicit timeout of at most 9 minutes and MUST exit on its own before that timeout. The sentinel re-arms the next wait call until the condition holds or the deadline passes.
  - For `shell` checks, the wait loop MUST poll with `sleep <interval>`, MUST NOT pipe `tail -f` into `grep`, and MUST emit both the success signal and failure signals (command missing, non-zero exit three times in a row).
  - For `tool` checks, each tick MUST be one `sleep <interval>` foreground Bash call followed by one tool call. The sentinel MUST stop and hand off with `outcome: error` after three consecutive tool failures.
- Prohibitions: MUST NOT write any file inside the project, MUST NOT run version-control commands, MUST NOT call tools that mutate external systems, MUST NOT spawn agents, MUST NOT ask the user questions. The sentinel is read-only for its whole life.
- Handoff format, as the final message and nothing else:

  ```
  outcome: changed | deadline | error
  loop: <id>
  observed-at: <ISO 8601 UTC>
  waits: <number of foreground wait calls made>
  baseline-before: <one line>
  baseline-after: <one line, or `unchanged`>
  evidence:
  <at most 10 lines of raw check output>
  ```

#### `skills/use-loop/SKILL.md`

- Frontmatter `name: use-loop` and a `description` with the triggers: the user asks to wait for, watch, poll, or react to a state change, or runs `/open-skills:use-loop`.
- States the context rule: the orchestrator pays one dispatch and one handoff per round, nothing during the wait.
- Orchestrator protocol, as a numbered procedure:
  1. Write `.project/loops/<id>.md` from `${CLAUDE_PLUGIN_ROOT}/skills/use-loop/templates/LOOP.md.template`. Capture the baseline with the same check before writing.
  2. Dispatch `open-skills:sentinel` with `run_in_background: true` and the loop record. Record the round start in the journal.
  3. Continue other work. Do not poll the sentinel.
  4. On the completion notification: append the handoff to the journal's Rounds section verbatim. Then act: inform the user, dispatch the follow-up work the user asked for, or start a new round with `baseline-after` as the new baseline.
  5. Close the loop when the user says so or the awaited outcome is reached: set Status to `closed`, move the journal to `.project/loops/archive/`.
- Rules: at most one live sentinel per loop. A loop record MUST carry a deadline before dispatch. Only the orchestrator writes the journal. A sentinel still waiting at clock-out is stopped with `TaskStop` and the journal records `interrupted`.
- Relation to harness-flow: a loop is not a feature. The orchestrator can hold a live sentinel while it runs the harness-flow loop. The clock-out checklist adds: no live sentinel, every open loop journal records its last round.
- Check-kind guidance with one `shell` example (a file or a `gh pr checks` state) and one `tool` example (a Linear issue state), each with its wait snippet.
- Out-of-scope pointers: periodic jobs with no change condition go to Desktop scheduled tasks or `/loop`. Waits that must outlive the session go to a Desktop scheduled task or a cloud scheduled task.

#### `skills/use-loop/templates/LOOP.md.template`

Fields: id, created, status (`open` | `closed` | `interrupted`), condition, check kind, check command or tool call, interval, deadline, baseline, and a Rounds section with one block per handoff plus the orchestrator's action.

#### Docs and README (C-002)

- `docs/use-loop.md`: what it does, when to use it, how it is invoked, the two check kinds, the handoff format, and the out-of-scope pointers.
- README: a Skills table row, the `/open-skills:use-loop` line in the invocation list, and no new external tool.

### Verification Standards

Run from the repository root, in this order:

```
claude plugin validate .
node --test scripts/*.test.mjs
test -f agents/sentinel.md && test -f skills/use-loop/SKILL.md && test -f skills/use-loop/templates/LOOP.md.template && test -f docs/use-loop.md
grep -q '^name: sentinel$' agents/sentinel.md && grep -q '^name: use-loop$' skills/use-loop/SKILL.md
grep -q 'run_in_background' agents/sentinel.md && grep -q 'Monitor' agents/sentinel.md && grep -qF 'outcome: changed | deadline | error' agents/sentinel.md
grep -q 'LOOP.md.template' skills/use-loop/SKILL.md && grep -q 'TaskStop' skills/use-loop/SKILL.md && grep -q '\.project/loops/' skills/use-loop/SKILL.md
grep -q '| \[use-loop\](./docs/use-loop.md) |' README.md && grep -q '^/open-skills:use-loop$' README.md
test -z "$(find agents skills docs README.md -type f | xargs perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }')"
```

Acceptance probe (executable, spends tokens, run once before the reviewer verdict):

```
REPO="$PWD"; rm -f /tmp/use-loop-eval; cd "$(mktemp -d)"; (sleep 120; touch /tmp/use-loop-eval) & claude -p --plugin-dir "$REPO" --permission-mode bypassPermissions --max-turns 12 --output-format json "Use the open-skills:use-loop skill. Loop id use-loop-eval. Condition: the file /tmp/use-loop-eval exists. Check kind shell. Interval 2s. Deadline 5 minutes. When the handoff arrives, print the handoff's outcome line and stop." | jq -r 'if type == "array" then .[] | select(.type == "result") | .result else .result end' | grep -q 'outcome: changed'
```

### Exclusions

- Periodic jobs with no change condition (reports, nightly maintenance). Pointer only.
- Waits that outlive the orchestrator session. No daemon, no launchd, no paseo schedule, no `durable` cron.
- `Monitor`, Channels, `ScheduleWakeup`, `CronCreate`, hooks, and the session inbox socket as wait or report paths.
- New files under `scripts/`.
- Changes to `skills/harness-flow/`, `skills/handoff/`, `agents/implementor.md`, `agents/reviewer.md`.
- Mutating actions by the sentinel of any kind.
- Version bump in `.claude-plugin/plugin.json`.

## Features

<!-- One row per feature, activated strictly one at a time. Status: not_started | active | blocked | passed (F-NNN). -->

| # | Behavior | Verification command | Status |
|---|---|---|---|
| 1 | `agents/sentinel.md` defines the read-only one-shot sentinel with foreground-only waits, the three-failure error rule, and the fixed handoff format | `claude plugin validate . && grep -q '^name: sentinel$' agents/sentinel.md && grep -q 'run_in_background' agents/sentinel.md && grep -qF 'outcome: changed' agents/sentinel.md` | passed (F-009) |
| 2 | `skills/use-loop/SKILL.md` and `templates/LOOP.md.template` carry the five-step orchestrator protocol, journal ownership, one-sentinel-per-loop, deadline requirement, clock-out rule, and out-of-scope pointers | `claude plugin validate . && grep -q 'LOOP.md.template' skills/use-loop/SKILL.md && grep -q 'TaskStop' skills/use-loop/SKILL.md && test -f skills/use-loop/templates/LOOP.md.template` | passed (F-010) |
| 3 | `docs/use-loop.md` and README wiring exist and all tracked text is English | `test -f docs/use-loop.md && grep -qF '[use-loop](./docs/use-loop.md)' README.md && grep -q '^/open-skills:use-loop$' README.md && test -z "$(perl -CSD -ne 'if (/\p{Han}/) { print "$ARGV\n"; close ARGV }' $(find agents skills docs README.md -type f))"` | passed (F-011) |
| 4 | End-to-end: an orchestrator run with the plugin loaded waits on a `shell` check through a sentinel and prints `outcome: changed` after the file appears | the acceptance probe under Verification Standards | passed (F-012) |

## Review Log

<!-- One line per reviewer verdict, appended in order. Two consecutive fails for the same feature stop the loop. -->

- 2026-11-10 — feature 1, round 1: pass — reviewer ran feature command, validate, node tests (23/23), contract greps, English check, and executed the shell wait snippet end to end; diff confined to agents/sentinel.md.
- 2026-11-10 — feature 2, round 1: pass — reviewer ran feature chain, validate, node tests (23/23), contract greps, English check; template fields match the sentinel input; diff confined to skills/use-loop/. Non-blocking note: shortened shell snippet omits failure branches and points to the agent file.
- 2026-11-10 — feature 3, round 1: pass — reviewer ran feature chain, validate, node tests (23/23), README grep; handoff block diff BLOCK_SAME; README diff is exactly two added lines; no contradiction with skill, template, or agent.
- 2026-11-10 — feature 4, round 1: pass on behavior, fail on the literal probe pipeline — `jq -r .result` cannot index the event array that `--output-format json` returns in 2.1.321; `outcome: changed` present in the second result object; sentinel dispatched in background; journal complete; repository clean. Orchestrator corrected the probe filter.
- 2026-11-10 — feature 4, round 2: pass — corrected probe exited 0 (PROBE_RC=0), 6 dispatch turns and 2 post-handoff turns, cumulative cost 0.235 USD, repository clean, validate and node tests pass.

## Notes

- 2026-11-10 — Research-and-planning session. No implementor dispatched. This file is the spec; implementation starts in the next session at Feature 1.
- 2026-11-10 — Implementation started in the same session on branch `research-use-loop-skill-spec`. The open-skills plugin is not installed in this session, so implementor and reviewer run as `general-purpose` subagents instructed to read and follow `agents/implementor.md` and `agents/reviewer.md` verbatim. Feature 1 set to active and dispatched.
- 2026-11-10 — Feature 1 passed review. Merge moment wrote F-009, D-007, index rows, and the agents/ line in ARCHITECTURE. Feature 2 set to active.
- 2026-11-10 — Feature 2 passed review. Merge moment wrote F-010, D-008, D-009, index rows, and the skills/use-loop lines in ARCHITECTURE. Feature 3 set to active.
- 2026-11-10 — Feature 3 passed review. Merge moment wrote F-011 and its index row. Feature 4 set to active. Clarified the acceptance probe: it runs from a temp directory with `--plugin-dir` pointing at this repository, so the probe journal does not land in the tracked tree, and the trigger file appears after 120 s with a 5-minute deadline to remove the race between baseline capture and file creation. Feature 4 has nothing to build, so the reviewer is dispatched directly; an implementor round follows only on a fail.
- 2026-11-10 — Feature 4 round 1: the plugin behavior passed (second result object holds `outcome: changed`, sentinel dispatched in background, journal shows the five-step protocol, repository clean) but the probe pipeline as written exited 1 because `--output-format json` returns an array of events in Claude Code 2.1.321 and `jq -r .result` cannot index it. Contract probe corrected to select the `result` objects. Reviewer asked to re-run the corrected probe before the pass is recorded. Observation: the orchestrator-in-probe wrote the journal under `~/.local/state/claude/<slug>/.project/loops/`, following the user's global CLAUDE.md plugin-state rule; the repository stayed clean.
- 2026-11-10 — Feature 4 passed review on round 2. Merge moment wrote F-012 and its index row. All four features passed; work unit closed and archived.

### Design summary

- Problem: native `/loop` (`CronCreate`, `ScheduleWakeup`) runs trigger and body inside the orchestrator, so every fire spends orchestrator context. Native event paths (`Monitor`, Channels, `FileChanged` hook, inbox socket) also inject into the orchestrator.
- Chosen shape: a one-shot sentinel subagent waits in its own context and returns one handoff. The orchestrator spends one dispatch and one handoff per round. Time-based and event-based waits share one shell `until` loop.
- Rejected shapes:
  - A: `CronCreate` in the orchestrator dispatching a background subagent per fire. Rejected: the cron prompt still lands in the orchestrator every fire, and events need `Monitor`.
  - B: a child watcher process (`scripts/loop.mjs`) spawning `claude -p` workers, reporting through the inbox socket. Rejected for v1: new script, inbox hold rules under `bypassPermissions`, and the user excluded cross-session survival.
  - C: a resident daemon (launchd or paseo `create_schedule`). Rejected: the user excluded cross-session survival.

### Probe evidence (2026-11-10, Claude Code 2.1.321)

- Probe 1: a general-purpose subagent ran `until [ -f FILE ]; do sleep 1; done` with `run_in_background: true`, then ended its turn. The shell detected the file within 1 s. The subagent was not rewoken within 4 minutes. Stopped with `TaskStop`. Conclusion: background Bash inside a subagent is not a usable wait primitive.
- Probe 2: the same loop in a foreground Bash call with `timeout 300000`. The orchestrator received the completion notification 1 s after the file appeared. The subagent used 2 model turns total. Conclusion: foreground waits cost zero tokens while waiting and wake the orchestrator reliably.
- Foreground Bash timeout cap is 600000 ms. The sentinel re-arms waits under 9 minutes each.

### Interview record (2026-11-10)

- Scenarios in scope: waiting for long tasks (build, test, deploy, CI); PR and issue watching; local file and log watching; MCP or other state sources.
- Periodic jobs with no change condition: excluded.
- Cross-session survival: excluded.
- Journal location `.project/loops/<id>.md`: accepted.
- Orchestrator does other work while a sentinel waits: accepted.

### Decision candidates for the merge moment

- D: sentinel waits only in foreground Bash calls (evidence: probes 1 and 2).
- D: the sentinel is read-only; the orchestrator alone writes the loop journal (keeps the unattended agent unable to mutate the project, and matches ARCHITECTURE's agents-never-write-state boundary).
- D: use-loop covers change-waits only; periodic and cross-session work is pointed elsewhere (interview).
- ARCHITECTURE update at merge: new `agents/sentinel.md`, new `skills/use-loop/` with a dependency on `agents/`.

### Open items

- Unconfirmed: `Monitor` behavior inside a subagent. Not needed for v1.
- Unconfirmed: the acceptance probe's exact `--max-turns` need; raise it if the run ends before the handoff.
- The sentinel's context grows by one tool call per re-arm. A 24-hour deadline means about 160 re-arms. Recommend deadlines of a few hours and a new round after each.
