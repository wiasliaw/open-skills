---
name: graph-build
description: Use when a project needs its factory built before any graph-run — bootstrapping the project config (.harness/config.json), instantiating a shipped template graph definition into the project's own definition, or editing an existing definition — or when graph-run refuses to start because no validated definition exists. Interviews the user, writes the config through scripts/init.mjs, and accepts a definition only after scripts/graph.mjs passes the full validation and the tool gate. Do not use to run work units (that is graph-run).
---

# graph-build

Build the factory: the project's facts (config) and the project's graph definition (nodes, edges, verification, mounts). Nothing runs until both exist and the definition has been accepted by the validator. This page is the entry; load a reference only when its step is reached.

Resolve scripts as `${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs` and run them with `node` from the consumer project. Each prints exactly one JSON object on stdout; branch on `ok` and the stable error code, never on prose. Node.js >= 20 is a prerequisite. If a script is unavailable or fails for a non-input reason, report it. Never hand-write the config, and never accept a definition the validator did not pass.

## Pick the mode

Ask which applies, or infer from the repo:

- No `.harness/config.json`: run Tier 1, then Tier 2.
- Config present, `graph` absent or the file missing: run Tier 2 only.
- Definition present and the user wants a change: run Tier 3.

## Tier 1 - Bootstrap (init)

Survey before asking: directory structure, README and any root CLAUDE.md, manifests and lockfiles, CI config, git history and remote, untracked-but-needed files (env files, fixtures). The survey produces recommendations, never answers: every config section MUST be confirmed by the user, one question at a time, each question presenting the recommended answer and its source. A section never put to the user is not answered — stop and ask rather than draft around it. Then draft the config JSON in a scratch file outside the repo, validate it, show it to the user, and only then write it:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" validate --from <draft.json>
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" write    --from <draft.json>
```

The config has a schema version and one section per fact: `vcs`, `locations` (work units, archive, worktrees), `worktree_setup` (always present, explicit empty lists when nothing is needed), optional `memory` and `graph`. It holds no command catalog. After the write, create each budgeted current-truth document that does not exist as a skeleton under `.harness/` (never overwrite one). Section-by-section interview guidance and a full example: `references/bootstrap.md`.

## Tier 2 - Instantiate a template

1. Copy the shipped template `${CLAUDE_PLUGIN_ROOT}/skills/graph-build/templates/coding-factory.json` into the project's own definition path (default `.harness/graph.json`). The copy is the project's from now on; never edit the template in the plugin.
2. Interview to fill every command slot the template declares under `slots`. A node executes only what it mounts, so each answer becomes a mounted command. Recommend the project's real commands found in the survey, but every slot MUST be confirmed by the user — never filled from the survey alone. When the project declares no remote and the template's delivery steps assume one, put the template's declared delivery variants to the user (see `references/templates.md`) and apply exactly the chosen one; any structural deviation outside the declared variants is a Tier 3 edit the user must request.
3. Substitute each `{{slot}}` placeholder throughout the copy and remove the build-time `slots` block.
4. Check mounts: every mounted skill must be installed, or be a skill without graph profile obligations (it then degrades to instructions at run time). A mounted skill that defines a graph profile and is unavailable blocks the stage, so install it or choose another.
5. Run the full validation: structure first, then the tool gate (every mounted command and every worktree-setup command is probed for existence and startability only, never run for effect). Do not reach this step with any slot or config section the user never confirmed — stop and ask first:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/graph.mjs" validate <definition.json> --config .harness/config.json
```

Accept only on exit 0 with `"accepted": true`. Exit 1 lists violated invariants by node, edge, cycle, or phase; exit 4 names each missing or not-startable tool. Fix the definition (or ask the user to install the tool) and re-run; do not proceed past a rejection.

6. Record the definition path in the config's `graph` field by drafting the updated config and writing it through `init.mjs write` (the bootstrap is the single writer of the config).

Template structure, slot catalog, and consumption details: `references/templates.md`.

## Tier 3 - Edit an existing definition

Node behavior changes by editing the definition, never an agent file. Make the edit, then re-run the full validation command above; the edit is accepted only when it passes. Changing a command means the tool gate re-probes it. Say which units in flight (if any) are affected and recommend finishing or abandoning them first. Edit rules and common edits: `references/editing.md`.

## Invariants

- The definition is data: routing lives in structured guards, never prose.
- Every command any node or step runs is declared in that node's mounts; a command no node mounts is not part of the graph.
- Exactly one node mounts the close-out skill; exactly one success and one abandonment terminal; every phase path ends at success through the close-out node.
- No human-gate, advisor, blocked, or escalation node or edge exists.
- Mounted standalone skills are the same skills used on their own; the graph profile applies only when mounted.

## Report

State what was written (config, definition path), the confirmed interview answers (question, answer, and whether the user took the recommendation or corrected it), the validator summary (nodes, edges, phases), the tool gate result, and the next step: graph-run.
