# harness

A project harness in three skills and two agents: `init` sets up a
project's long-term memory, `harness-flow` runs a reviewer-gated
execution loop over it, and `handoff` carries in-flight context across
sessions.

## Usage

```
/open-skills:init
/open-skills:harness-flow
/open-skills:handoff
```

`init` and `handoff` are manual entry points only — they never trigger
on their own. `harness-flow` also loads automatically when a session in a
project whose root CLAUDE.md declares harness adoption is about to
produce or modify a deliverable.

## Memory tiers

| Tier | Where | Written by |
| -- | -- | -- |
| Long-term | `.harness/` — `ARCHITECTURE.md`, `CONSTRAINTS.md`, and the `DECISIONS.md` / `FEATURES.md` indexes with per-entry files under `decisions/` and `features/` | The orchestrator only, at merge moments. |
| Short-term | One work-unit state file per work unit at the declared location (default `.project/work-units/`), alongside the work-unit tool declared at init, if any (e.g. OpenSpec, an issue tracker) | The orchestrator. |
| Session | A handoff file at the declared location (default `.project/handoff.md`) | `handoff`. |

### Short-term: work-unit state files

Each work unit gets one state file with the same format whether or not
a work-unit tool is declared: a Contract (Scope, Verification
Standards, Exclusions), a Features table with per-feature status, a
Review Log, and Notes. When a tool is declared, the tool keeps owning
what it records — the state file points at it instead of copying it —
and the state file holds only the loop state and any contract section
the tool has no home for. Closed work units move to `archive/`.

### Long-term: indexes and detail files

`DECISIONS.md` and `FEATURES.md` are one-row-per-entry indexes; the
full record lives in `decisions/D-NNN.md` or `features/F-NNN.md`.
Clock-in reads only the indexes and opens a detail file on demand, so
the context cost stays flat as history grows. A reversed decision, or
a feature a later work unit removes or replaces, is marked superseded,
moved to `archive/`, and dropped from the index.

## init

Surveys the repo, then interviews you one question at a time about VCS
strategy, short-term memory, workflow phases, hard constraints,
and repo structure. Anything inferable from files is confirmed rather
than asked. It drafts a root CLAUDE.md plus the four `.harness/` files,
runs a readiness gate and a fresh-session test, and writes nothing
until you approve the draft.

Run it again on an adopted project to enter update mode: still-correct
content is kept, only missing or stale fields are asked, and the gaps
found are always reported. Update mode also migrates projects adopted
under the former `agent-flow` name: the skill reference, the split
short-term memory bullets, and single-file decision/feature logs.

## harness-flow

Turns the main session into an orchestrator that never produces a
deliverable itself:

| Stage | What happens |
| -- | -- |
| Clock-in | Reads `.harness/` (indexes only for decisions and features), scans for in-flight work units and a handoff file, and runs the declared verification commands to confirm a clean starting state. |
| Dispatch | One active feature at a time. The work unit's state file, with its contract (Scope, Verification Standards, Exclusions), is recorded before the `implementor` agent is dispatched. |
| Review gate | The `reviewer` agent re-runs verification itself and returns an evidence-backed pass/fail verdict. A fail goes back to the implementor; two consecutive fails stop the loop with a root-cause attribution. |
| Merge moment | On a pass, the orchestrator records the verified feature in `FEATURES.md`, plus any new decisions, constraints, or structural changes, and closes the work unit once all its features pass. |
| Clock-out | A five-condition exit checklist (build, all tests, progress recorded, no stray artifacts, startup path works), then `handoff`, then a check that nothing is left outside version control. |

The loop prescribes no VCS operations; commits follow the strategy you
declared at init.

## handoff

Writes a single, overwritten handoff file for a cold-start agent:
in-flight decisions and rationale, dead ends, and ordered next steps.
Goal, completed work, and task state are deliberately excluded — they
belong to short-term memory. When no actionable next step remains, a
stale handoff file is deleted instead.

## Agents

- `implementor` — builds one feature against the sprint contract and
  reports `ready-for-review` or `blocked`. Never writes `.harness/` or
  performs VCS operations.
- `reviewer` — read-only; executes every declared verification command
  itself and scores the feature on evidence it produced, never on the
  implementor's claims.
