# graph-build

Builds the factory that graph-run operates: the project's config and the project's own graph definition. Nothing can run until both exist and the definition has been accepted by the validator.

## What it does

1. **Bootstrap.** Surveys the repo, interviews you one question at a time, and writes `.harness/config.json` through `scripts/init.mjs` (validated against a schema version and written atomically; never by hand). The config records VCS facts, locations for work units, archive, and worktrees, what a fresh worktree needs, memory budgets and ledger location, and the definition path.
2. **Instantiate a template.** Copies a shipped template (`skills/graph-build/templates/coding-factory.json`) into your project's own definition, interviews you to fill every command slot (test, lint, open-PR), then runs `scripts/graph.mjs`. The validator checks structure (loops capped, one success and one abandonment terminal, complete edge coverage, exactly one close-out node, valid phase paths). The tool gate then probes that every mounted command exists and starts, without running its real effect. A missing tool is reported by name and blocks acceptance.
3. **Edit.** Changes to an existing definition are re-validated the same way before they count.

The copied definition belongs to your project from then on; plugin updates never change it, and there is no default factory.

## When to use

- First time setting up a project for graph-run.
- graph-run refuses to start because no validated definition is declared.
- You want to change what a node does, which commands it may run, which skills it mounts, or which phases exist.

Skip it to run work (use graph-run) or to answer one-off questions.

## How it is invoked

Ask for it in a session, for example "build the graph for this project", or invoke `/open-skills:graph-build`. It needs Node.js 20 or later and runs with the project as the working directory.

```
node "$CLAUDE_PLUGIN_ROOT/scripts/init.mjs" write --from draft.json
node "$CLAUDE_PLUGIN_ROOT/scripts/graph.mjs" validate .harness/graph.json --config .harness/config.json
```

Accepted means exit code 0 with `"accepted": true`; exit 1 is a structure violation, exit 4 a tool-gate failure.

## Graph profile

None. graph-build is used only before runs and is not mounted on any node.
