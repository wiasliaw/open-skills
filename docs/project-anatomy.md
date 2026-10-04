# Project anatomy

What a consumer project looks like after graph-build has bootstrapped it and a few work units have run, and who is allowed to write each path. File shapes are in [file formats](file-formats.md).

## Layout

```
consumer-project/
├── .harness/                      # long-term memory + configuration namespace
│   ├── config.json                # the one project config (sectioned, schema-versioned)
│   ├── graph.json                 # the project's own graph definition, instantiated
│   │                              #   from a plugin template and owned by the project;
│   │                              #   no graph declared = no run
│   ├── ARCHITECTURE.md            # current-truth documents (reference set), line-budgeted,
│   ├── CONSTRAINTS.md             #   loaded whole at every run; changed only by the
│   │                              #   maintenance apply unit, never mid-run
│   └── deltas/                    # the delta ledger: append-only, one file per entry
│       └── <unit>.<node>.<n>.md   #   pending entries merged in by close-out; applied and
│                                  #   rejected files stay as history
├── .project/                      # short-term execution namespace (locations are
│   ├── work-units/                #   declared in config; these are the reference defaults)
│   │   ├── <unit-id>/             # a live work unit (id: ^[a-z0-9][a-z0-9-]*$)
│   │   │   ├── state.json         # routing truth
│   │   │   ├── log.ndjson         # append-only event log
│   │   │   ├── handoff.md         # closing summary (once a terminal is reached)
│   │   │   └── <node-id>/         # one directory per executed node: deliverables,
│   │   │                          #   review-<n>.md, advice-<n>.md, decision-<n>.md,
│   │   │                          #   delta-<n>.md drafts, worktree.md
│   │   └── archive/               # archived units, moved whole and frozen
│   └── worktrees/                 # disposable workspaces, kept out of git via info/exclude
│       └── <unit-id>/             # the unit's isolated checkout on branch wu/<id>
└── (the project's own files)
```

The two namespaces are deliberately separate: unit folders are durable records with an archive lifecycle; worktrees are disposable workspaces, and a registered worktree never sits inside a folder that archival moves whole.

## Write authority

| Path | Writer |
|---|---|
| `.harness/config.json` | bootstrap only, through `scripts/init.mjs` |
| `.harness/graph.json` | graph-build (humans review and edit it; every edit is re-validated by `scripts/graph.mjs`) |
| `state.json`, `log.ndjson` | orchestrator only, through `scripts/work-unit.mjs` |
| `<node-id>/` stage artifacts | the actor that produced them (reviewer → `review-<n>.md`, advisor → `advice-<n>.md`), directly into the dispatched stage directory |
| `<node-id>/delta-<n>.md` drafts | the stage that made the durable decision, at the moment it happens |
| `<node-id>/decision-<n>.md` | orchestrator, recording the human's answer (humans write nothing themselves) |
| `handoff.md` | close-out worker (copied to the root by the terminal's steps); the orchestrator directly at the abandonment terminal |
| `.harness/deltas/` new entries | close-out stage only, consolidated from the unit's drafts, carried on the unit's branch |
| `.harness/` current-truth documents | the maintenance apply unit only (phase-level restriction override) |
| memory index | generated on demand by `scripts/memory.mjs`, never hand-written, never committed |
| worktree contents | the build worker (no VCS operations); the orchestrator owns commits, pushes, and removal |

Everything in the table is enforced the plugin's way: deterministic gates where a script owns the path (`init.mjs`, `work-unit.mjs`), contractual restrictions checked by the reviewer everywhere else.
