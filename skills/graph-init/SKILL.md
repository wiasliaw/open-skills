---
name: graph-init
description: Use when a project needs its factory initialized before any graph-run — scaffolding an empty project's skeleton, bootstrapping the project config (.harness/config.json), assembling the project's graph definition from the shipped template library, or editing an existing definition — or when graph-run refuses to start because no validated definition exists. Interviews the user, writes the config through scripts/init.mjs, writes the definition through scripts/graph.mjs assemble, and accepts a definition only after scripts/graph.mjs passes the full validation and the tool gate. Do not use to run work units (that is graph-run).
---

# graph-init

Initialize the factory: the project's skeleton (when the project is empty), the project's facts (config), and the project's graph definition (nodes as task pipelines, edges, and the equipment each task mounts). Nothing runs until config and definition exist, the definition has been accepted by the validator, and the repository is worktree-able. This page is the entry; load a reference only when its step is reached.

Run graph-init from the main checkout, never from a linked worktree: the harness writers (`init.mjs write`, `types.mjs write`, `graph.mjs assemble`) detect a linked worktree and refuse with the stable error code `in_worktree` / `IN_WORKTREE`, so `.harness/` cannot diverge from the main checkout. If a writer refuses with that code, move to the main checkout and continue there.

Resolve scripts as `${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs` and run them with `node` from the consumer project. Each prints exactly one JSON object on stdout; branch on `ok` and the stable error code, never on prose. Node.js >= 20 is a prerequisite. If a script is unavailable or fails for a non-input reason, report it. Never hand-write the config, the project definition, or the project type catalog (`init.mjs`, `graph.mjs assemble`, and `types.mjs write` are their only writers), and never accept a definition the validator did not pass.

## Pick the mode

Ask which applies, or infer from the repo:

- Empty project — HEAD resolves to no commit, or nothing beyond VCS and harness metadata (no manifests, no sources): run Tier 0 first, then Tier 1 and Tier 2.
- No `.harness/config.json`: run Tier 1, then Tier 2.
- Config present, `graph` absent or the file missing: run Tier 2 only.
- Definition present and the user wants a change: run Tier 3.

Every full build (Tier 1 or 2 ran) ends at the close-out gate below before reporting.

## Tier 0 - Scaffold (empty project only)

An empty project blocks the factory twice over: the worktree provisioner refuses a repository with no commits, and the Tier 1/2 answers (`test_command`, `worktree_setup`, …) would describe a project that does not exist. So the skeleton comes first, and only then the surveys — the ordering invariant is that Tier 0 completes before any Tier 1/2 survey or interview, so every recorded fact and every confirmed slot answer describes the scaffolded project.

1. Confirm the project is empty (the detection above is a recommendation, not a gate — put it to the user).
2. Interview the project type, one question at a time, presenting the recommended scaffold command and its source (the user's stated intent, the repo name, an existing README). Ecosystem generators are the recommendation (`cargo init`, `npm create <starter>`, `uv init`, …); never invent a bespoke layout unless the user asks for one.
3. Execute only commands the user has explicitly confirmed, one at a time, from the main checkout. A session with an unconfirmed scaffold command stops and asks. Never scaffold a non-empty project.
4. Re-survey: the scaffolded manifests and scripts are now the sources the Tier 1/2 recommendations cite.

graph-init performs no VCS writes at any tier: the scaffold output is committed by the user at the close-out gate, not by graph-init.

## Tier 1 - Bootstrap (init)

Survey before asking: directory structure, README and any root CLAUDE.md, manifests and lockfiles, CI config, git history and remote, untracked-but-needed files (env files, fixtures). The survey produces recommendations, never answers: every config section MUST be confirmed by the user, one question at a time, each question presenting the recommended answer and its source. A section never put to the user is not answered — stop and ask rather than draft around it. Then draft the config JSON in a scratch file outside the repo, validate it, show it to the user, and only then write it:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" validate --from <draft.json>
node "${CLAUDE_PLUGIN_ROOT}/scripts/init.mjs" write    --from <draft.json>
```

The config has a schema version and one section per fact: `vcs`, `locations` (work units, archive, worktrees), `worktree_setup` (always present, explicit empty lists when nothing is needed), optional `memory` and `graph`. It holds no command catalog. After the write, create each budgeted current-truth document that does not exist as a skeleton under `.harness/` (never overwrite one). Section-by-section interview guidance and a full example: `references/bootstrap.md`.

## Tier 2 - Assemble the factory (interview as assembly)

The library is `${CLAUDE_PLUGIN_ROOT}/skills/graph-init/templates/`: the plugin type catalog, tasks (one TaskDef per file), nodes (each an ordered pipeline of task references), the assembly graph `graphs/coding-factory.json`, and the canonical walks `coding-factory.examples.md`. The project's definition is generated from it; never edit the library in the plugin.

1. Survey as in Tier 1, plus the commands the project really runs (manifest scripts, CI, Makefile). The survey produces recommendations, never answers.
2. Draft the project assembly in a scratch file outside the repo, as a copy of `graphs/coding-factory.json` (`slots`, `caps`, `nodes` as library node ids, `edges`, optional `tasks`). A node id resolves from `nodes/`; a task id resolves in the assembly's `tasks` first, then from `tasks/`. A confirmed swap or edit is expressed as an inline node object in `nodes` or an entry in `tasks`.
3. Interview one question at a time, each presenting the recommended answer and its source, for every slot the assembly declares (as shipped: `phase_values`, the project's phase vocabulary, which MUST include `maintenance`; `test_command`; `lint_command`; `open_pr_command`). Caps keep the library's values unless the user asks for others. Every slot MUST be confirmed by the user — never filled from the survey alone. Slot meanings and interviewing: `references/templates.md`.
4. Delivery. The library ships only remote delivery (`deliver`: push, `{{open_pr_command}}`, worktree removal). When the config declares no remote the factory cannot be delivered as shipped: say so, and offer a user-requested edit — an inline TaskDef in the assembly's `tasks` that replaces `deliver` in the `wrap` node, with the `open_pr_command` slot removed together with its only use. Do not choose for the user or improvise one (`references/templates.md`).
5. Type extensions. A new state field a wrapped external skill needs is put to the user as a draft entry (field, type, values, default, producing task) and confirmed one by one. The `phase` type is not written by hand: assemble instantiates it from the confirmed `phase_values` answer. Entry rules: `references/templates.md`.
6. Check equipment: every skill a composed task mounts is installed, or has no graph profile (it then degrades to instructions at run time). A mounted skill that defines a graph profile and is unavailable blocks the task, so install it or choose another.
7. Walk through the composed graph with the user before any Tier 2 write: node by node, one line each (the pipeline as task ids with their executors, and the outcomes the node surfaces), the caps, any confirmed edit and type extension, and the canonical walks from `coding-factory.examples.md`. Ask whether this is how the user wants the factory to run. A rejected node is swapped or edited from the library in the same session: different nodes or tasks, rebinding a task's `with` params, editing edges. After a swap or edit, redo the delivery, type-extension, and equipment steps (4-6) for what changed and show the composition again with the updated walks, not only the library's canonical ones. Composition outside the shipped library happens only when the user explicitly asks for it, never improvised. A session with any slot, node, or type entry never put to the user stops and asks instead of assembling or validating.
8. Write the confirmed type extensions (a scratch draft `{<field>: <entry>}`), then assemble. Both come after step 7, types first, because assemble validates the composition against the project catalog. The `types.mjs write` step applies only when there are confirmed extensions; skip it otherwise, because an empty draft is rejected with `DRAFT_INVALID`:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/types.mjs" write --from <draft.json>    # only with confirmed type extensions
node "${CLAUDE_PLUGIN_ROOT}/scripts/graph.mjs" assemble <assembly draft> --slots <slot values.json>
```

The slot values file is a scratch JSON object `{slot: value}` with one value per declared slot (`phase_values` is a list). Assemble resolves the nodes and tasks from the library, inlines every referenced task into the definition's task catalog, fills the slots, instantiates the `phase` type into `.harness/types.json`, validates the composition in memory, and only then writes `.harness/graph.json`. On rejection (exit 1, `errors[]`; for example `SLOT_UNFILLED` naming the slot) nothing is written: fix the draft or the values and re-run. Assemble is the only writer of `.harness/graph.json`; never edit its output.
9. Copy `templates/coding-factory.examples.md` to `.harness/graph.examples.md`. The walks are non-normative and the validator never reads them; when a confirmed edit changes a walk, update the copy to match.
10. Run the full validation: structure first, then the tool gate (every command in any task's equipment or `run` lines, and every worktree-setup command, is probed for existence and startability only, never run for effect):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/graph.mjs" validate .harness/graph.json --config .harness/config.json
```

Accept only on exit 0 with `"accepted": true`. Exit 1 lists violated invariants by node, task, pipeline entry, edge, outcome, field, phase, or cycle; exit 4 names each missing or not-startable tool. Fix the assembly draft or the slot values and re-assemble (or ask the user to install the tool), then re-run; do not proceed past a rejection.
11. Record the definition path in the config's `graph` field by drafting the updated config and writing it through `init.mjs write` (the bootstrap is the single writer of the config).

Assembly format, slot catalog, and output reading: `references/templates.md`.

## Tier 3 - Edit an existing definition

The definition is generated, so an edit is a re-assembly, never a hand edit of `.harness/graph.json` and never an agent file. Copy the current `.harness/graph.json` to a scratch file outside the repo and add `"slots": {}`: the flattened file is then a valid assembly (every node inline, every task in `tasks`), and re-assembling it unchanged reproduces the file byte for byte. Apply the edit in the scratch file once the user has confirmed it (only the change being made is confirmed, not the whole factory again), run `assemble` on it with a slots file holding `{}`, then re-run the full validation command above; the edit is accepted only when it passes. If the edit changes any walk, update `.harness/graph.examples.md` to match. Type changes go through `types.mjs write` first (changing phase values is writing a new instantiated `phase` entry, `maintenance` included). Changing a command means the tool gate re-probes it. Say which units in flight (if any) are affected — their state is checked against the graph and the catalogs — and recommend finishing or abandoning them first. Procedure, edit rules, and common edits: `references/editing.md`.

## Close-out gate - the repository must be worktree-able

graph-init never commits; the user does. After the definition is accepted, prompt the user to commit the scaffolded skeleton (if any) and the `.harness/` files, then verify with read-only VCS queries:

```
git rev-parse --verify --quiet "HEAD^{commit}"     # HEAD resolves to a commit
git ls-files --error-unmatch .harness/...          # each written .harness/ file is tracked
```

Both must hold before the report may name graph-run as the next step: the worktree provisioner refuses a repository with no commits, and the delta mechanism depends on `.harness/` being carried on unit branches. Until they hold, the report names exactly what is missing (no commit at HEAD, or the untracked files by name), repeats the commit prompt, and does not point to graph-run.

## Invariants

- The definition is data: routing lives in edges and structured guards, never prose.
- Every command a task can run is declared in its equipment or its `run` lines; a command no task declares is not part of the graph.
- Exactly one task mounts the close-out skill, and its node lies on every route to the success terminal; exactly one success and one abandonment terminal; every phase value, `maintenance` included, has a route to success.
- No advisor, blocked, or escalation node or edge exists, and `blocked` is never declared (it is universal). A human decision is a human task in a pipeline.
- Mounted standalone skills are the same skills used on their own; the graph profile applies only when mounted.

## Report

State what was written (config, definition path, types, examples), the scaffold answers when Tier 0 ran (project type, each confirmed command, what it created), the confirmed interview answers (question, recommendation and its source, answer, and whether the user took the recommendation or corrected it), the validator summary (nodes, edges, tasks, phases), the tool gate result, and the close-out gate result. The next step is graph-run only when the close-out gate passed; otherwise the next step is the commit the gate is waiting on.
