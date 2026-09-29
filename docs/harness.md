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
project that declares harness adoption — in its root CLAUDE.md, or in the
`HARNESS.md` its root `CLAUDE.local.md` imports — is about to produce or
modify a deliverable.

## Storage modes

`init` asks this first, because it decides where everything is written.

| Mode | Where the harness lives | Choose it when |
| -- | -- | -- |
| Shared (default) | In the repo: root `CLAUDE.md`, `.harness/`, and `.project/`, all git-tracked. | You own the repo and want the team, and the history, to share the harness. |
| Private | Outside the repo at `~/.open-skills/<slug>/`; nothing harness-related is committed. | The repo is maintained by others and harness files do not belong in it. |

An existing adoption keeps its mode: re-running `init` updates it in
place and never migrates between shared and private.

### Private layout

```
~/.open-skills/<slug>/
├── HARNESS.md      # harness declaration (same sections as a shared-mode CLAUDE.md)
├── .harness/       # ARCHITECTURE.md, CONSTRAINTS.md, DECISIONS.md, FEATURES.md
└── .project/
    ├── work-units/ # short-term memory (default)
    └── handoff.md  # session memory (default)
```

The slug is the repo's absolute path with every character other than
ASCII letters, digits, and `-` replaced by `-`: `/Users/wiasliaw/Github/foobar`
becomes `-Users-wiasliaw-Github-foobar`. If that directory already exists
and is not this repo's harness, `init` appends `-2`, `-3`, … `HARNESS.md` records the
repo path in a `project root:` bullet and uses absolute paths for the
memory locations.

The repo keeps only a `CLAUDE.local.md` shim that `@`-imports the absolute
path of `HARNESS.md`, so Claude Code loads the declaration at session
start. The shim is the only pointer from the repo to its harness; the slug
is never looked up again. `init` lists `CLAUDE.local.md` in the repo's
local `.git/info/exclude` (skipped outside a git repo) and never edits
`.gitignore`, `CLAUDE.md`, or any tracked file.

`~/.open-skills/` is not git-managed: in private mode the harness files,
work-unit state, and handoff file have no version history. Back the
directory up yourself if you need that.

Caveats:

- On the first session after `init`, Claude Code shows a one-time
  approval dialog for the external `HARNESS.md` import. Approve it, or the
  harness is not loaded.
- A `CLAUDE.local.md` makes Claude Code stop reading the repo's
  `AGENTS.md` by default. To read both, set the Project instructions
  setting (`/config`) to `claude-md-and-agents-md`.
- The shim exists only in the clone or worktree where `init` ran.

## Memory tiers

Paths are relative to the harness root: the project root in shared mode,
`~/.open-skills/<slug>/` in private mode.

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

Surveys the repo, then interviews you one question at a time about
storage mode, VCS strategy, short-term memory, workflow phases, hard
constraints, and repo structure. Anything inferable from files is
confirmed rather than asked. It drafts the harness declaration — a root
CLAUDE.md, or `HARNESS.md` in private mode — plus the four `.harness/`
files, runs a readiness gate and a fresh-session test, and writes nothing
until you approve the draft. In private mode it also writes the
`CLAUDE.local.md` shim and its local exclude entry.

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
| Clock-out | A five-condition exit checklist (build, all tests, progress recorded, no stray artifacts, startup path works), then `handoff`, then a check that nothing is left outside version control (a private harness root excepted). |

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
