## MODIFIED Requirements

### Requirement: Script resolution
The page SHALL state how the script path is resolved: when `${CLAUDE_PLUGIN_ROOT}` is available, the path is `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs`; otherwise the orchestrator SHALL pass the absolute path of the script in the Build dispatch, which is the agent-agnostic fallback. The directory `scripts/` at the plugin root SHALL be treated as a stable path contract; the former directory `skills/use-worktree/scripts/` is no longer a contract. The script SHALL always be run with the consumer project as the working directory, never from the plugin directory.

#### Scenario: Plugin root available
- **WHEN** `${CLAUDE_PLUGIN_ROOT}` is available
- **THEN** the page SHALL resolve the script as `${CLAUDE_PLUGIN_ROOT}/scripts/worktree.mjs` and run it with `node` from the consumer project

#### Scenario: Plugin root unavailable
- **WHEN** `${CLAUDE_PLUGIN_ROOT}` is not available
- **THEN** the page SHALL use the absolute script path passed by the orchestrator in the dispatch
