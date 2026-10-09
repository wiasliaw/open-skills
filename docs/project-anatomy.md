# Project anatomy

What a consumer project looks like after graph-init has bootstrapped it and a few work units have run, and who is allowed to write each path. File shapes are in [file formats](file-formats.md).

## Layout

```
consumer-project/
├── .harness/                      # long-term memory + configuration namespace
│   ├── config.json                # the one project config (sectioned, schema-versioned)
│   ├── graph.json                 # the project's own graph definition, assembled from
│   │                              #   the plugin's template library and owned by the
│   │                              #   project; no graph declared = no run
│   ├── types.json                 # the project type catalog (state-field types, at
│   │                              #   least the instantiated `phase`); merged in memory
│   │                              #   with the plugin catalog, never written merged
│   ├── graph.examples.md          # canonical phase walks, non-normative: the validator
│   │                              #   never reads it
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
│   │   │                          #   review-<n>.md, verify-<n>.md, advice-<n>.md,
│   │   │                          #   decision-<n>.md, delta-<n>.md drafts, worktree.md
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
| `.harness/graph.json` | `scripts/graph.mjs assemble` only, run by graph-init (humans review it as a diff; an edit is a re-assembly, then re-validated by `scripts/graph.mjs validate`) |
| `.harness/types.json` | graph-init only, through `scripts/types.mjs write` (and `assemble`, which writes the instantiated `phase` entry through the same writer); the in-memory merge with the plugin catalog is never written |
| `.harness/graph.examples.md` | graph-init, copied from the library's canonical walks and kept in step with confirmed edits; non-normative |
| `state.json`, `log.ndjson` | orchestrator only, through `scripts/work-unit.mjs` |
| `<node-id>/` stage artifacts | the actor that produced them (reviewer → `review-<n>.md`, advisor → `advice-<n>.md`), directly into the dispatched stage directory |
| `<node-id>/delta-<n>.md` drafts | the stage that made the durable decision, at the moment it happens |
| `<node-id>/decision-<n>.md` | orchestrator, recording the human's answer (humans write nothing themselves) |
| `<node-id>/verify-<n>.md` | orchestrator, recording the verdict of an orchestrator-run validator task |
| `handoff.md` | close-out worker (copied to the root by the success terminal's script task); the orchestrator directly at the abandonment terminal |
| `.harness/deltas/` new entries | close-out stage only, consolidated from the unit's drafts, carried on the unit's branch |
| `.harness/` current-truth documents | the maintenance apply unit only (its `fold-deltas` task carries that permission in its own restrictions) |
| memory index | generated on demand by `scripts/memory.mjs`, never hand-written, never committed |
| worktree contents | the build worker (no VCS operations); the orchestrator owns commits, pushes, and removal |

Everything in the table is enforced the plugin's way: deterministic gates where a script owns the path (`init.mjs`, `graph.mjs`, `types.mjs`, `work-unit.mjs`), contractual restrictions checked by the reviewer everywhere else. The three `.harness/` writers (`init.mjs write`, `types.mjs write`, `graph.mjs assemble`) additionally refuse to run inside a linked worktree (stable code `in_worktree` / `IN_WORKTREE`): `.harness/` is written only in the main checkout. graph-init itself performs no VCS writes — at its close-out gate the user commits the skeleton and `.harness/` files, and graph-init verifies read-only that HEAD has a commit and the files are tracked before pointing to graph-run.
