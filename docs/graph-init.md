# graph-init

Initializes the factory that graph-run operates: the project's skeleton (when the project is empty), the project's config, and the project's own graph definition, assembled from a shipped library. Nothing can run until config and definition exist, the definition has been accepted by the validator, and the repository is worktree-able.

graph-init runs only from the main checkout: the harness writers (`init.mjs write`, `types.mjs write`, `graph.mjs assemble`) refuse a linked worktree with the stable error code `in_worktree` / `IN_WORKTREE`, so `.harness/` cannot diverge from the main checkout.

## What it does

0. **Scaffold (empty project only).** A repository with no commits or no project sources blocks the factory: the worktree provisioner refuses a repo with no commits, and the interview answers would describe a project that does not exist. graph-init interviews the project type and runs only scaffold commands you explicitly confirm (ecosystem generators such as `cargo init` or `npm create <starter>`; never improvised, never on a non-empty project), before any survey, so every recorded fact describes the scaffolded project. It never commits the result itself — see the close-out gate below.
1. **Bootstrap.** Surveys the repo, interviews you one question at a time, and writes `.harness/config.json` through `scripts/init.mjs` (validated against a schema version and written atomically; never by hand). The config records VCS facts, locations for work units, archive, and worktrees, what a fresh worktree needs, memory budgets and ledger location, and the definition path.
2. **Assemble from the library.** The interview is assembly over the layered library in `skills/graph-init/templates/`: a type catalog, tasks (one definition per file), nodes (each an ordered pipeline of tasks), and an assembly graph holding the caps and edges. It asks one question at a time for every slot, each with a recommended answer and its source: the project's phase vocabulary (which must keep the reserved `maintenance`) and the test, lint, and open-PR commands. Nothing is filled without your confirmation. It then walks you through the composed graph, node by node, one line each (the pipeline of tasks with their executors, and the outcomes the node surfaces), plus the canonical phase walks, and asks whether this is how you want the factory to run. A node you reject is swapped or edited from the library in the same session; anything outside the library happens only when you ask for it.
3. **Extend the types.** A wrapped external skill that needs a new state field gets a draft type entry, confirmed one by one and written to `.harness/types.json` through `scripts/types.mjs write`. Entries are pure types: nothing about nodes or tasks. The project's `phase` type is not written by hand; assemble instantiates it from your confirmed phase values.
4. **Assemble.** `scripts/graph.mjs assemble` flattens the composition into `.harness/graph.json`: every referenced task inlined into one task catalog, slots filled, nothing left that points back at the library. It validates in memory first and writes nothing on rejection, and it is the only writer of the definition. The canonical walks are copied to `.harness/graph.examples.md`, a non-normative companion the validator never reads.
5. **Validate.** `scripts/graph.mjs validate` checks structure: every pipeline entry maps all the exit outcomes of its task, loops are capped, one success and one abandonment terminal exist, edge guards are exclusive and exhaustive, every node is reachable, exactly one task mounts the close-out skill and its node lies on every route to success, and every phase value has a route to success. The tool gate then probes that every command in any task's equipment or run lines exists and starts, without running its real effect. A missing tool is reported by name and blocks acceptance.
6. **Close out.** graph-init performs no VCS writes: it prompts you to commit the scaffolded skeleton and the `.harness/` files, then verifies read-only that HEAD resolves to a commit and the written `.harness/` files are tracked. Only then does it point to graph-run; until then it names exactly what is missing and repeats the prompt.
7. **Edit.** A change to an existing definition is a re-assembly, never a hand edit of `.harness/graph.json`, and is re-validated the same way before it counts. If it changes a walk, the examples copy is updated to match.

The assembled definition belongs to your project from then on; plugin updates never change it, and there is no default factory. The one thing read from the plugin at run time is its type catalog, merged in memory with `.harness/types.json`.

## When to use

- First time setting up a project for graph-run — including a brand-new empty repository, which gets its skeleton scaffolded first.
- graph-run refuses to start because no validated definition is declared, or because the definition predates schema 2.0 (re-assemble it).
- You want to change what a task does, which commands it may run, which skills it mounts, how a node's pipeline is ordered, or which phases exist.

Skip it to run work (use graph-run) or to answer one-off questions.

## How it is invoked

Ask for it in a session, for example "build the graph for this project", or invoke `/open-skills:graph-init`. It needs Node.js 20 or later and runs with the project as the working directory.

```
node "$CLAUDE_PLUGIN_ROOT/scripts/init.mjs" write --from draft.json
node "$CLAUDE_PLUGIN_ROOT/scripts/types.mjs" write --from types-draft.json     # only with confirmed type extensions
node "$CLAUDE_PLUGIN_ROOT/scripts/graph.mjs" assemble assembly.json --slots slots.json
node "$CLAUDE_PLUGIN_ROOT/scripts/graph.mjs" validate .harness/graph.json --config .harness/config.json
```

`assemble` exits 0 when it wrote the definition and 1 when it rejected the composition (for example `SLOT_UNFILLED`, naming the slot), writing nothing. For `validate`, accepted means exit code 0 with `"accepted": true`; exit 1 is a structure violation, exit 4 a tool-gate failure.

## Graph profile

None. graph-init is used only before runs and is not mounted on any task.
