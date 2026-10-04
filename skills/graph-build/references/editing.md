# Editing reference

Load at Tier 3. The definition is project-owned reviewable data. Behavior changes by editing it; no agent definition is touched, and the change takes effect through dispatch construction at the next dispatch.

## Procedure

1. Read the current definition and the config.
2. Make the smallest edit that does what the user asked; show the diff.
3. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/graph.mjs" validate <definition> --config .harness/config.json`.
4. On rejection, fix and re-run; if the user's intent cannot be satisfied within the invariants, explain which invariant blocks it.
5. Accept only on `"accepted": true`.

## Common edits

| Edit | Rule |
|---|---|
| Change a command | Update it in the node's mounts and anywhere verification or steps use it; the tool gate re-probes it |
| Add a verification command | It must be covered by the same node's mounts |
| Add a skill or MCP mount | Declare it on the node; a profile-bearing skill must be installed |
| Add or change a phase | Declare its `path` (first node is the shared phase-approval node, ends at success through the close-out node) and bind any needed state fields; keep `maintenance` declared |
| Add a node | Declare every contract field; cover every routable outcome with exclusive, exhaustive guards; never add human-gate, advisor, blocked, or escalation nodes or edges |
| Add a loop | Needs an exit and the declared caps |
| Add a state field | Declare type, values, applicability (owning node or phases), and default |
| Change caps | Positive integers; edge-revisit and consultation caps bound the in-place fallback chain |

## Config edits

Config changes (locations, worktree setup, memory thresholds, the `graph` path) are bootstrap work: draft the full new config and write it through `init.mjs write`. Never edit `.harness/config.json` by hand.

## In-flight units

A definition change applies to later dispatches. Recommend finishing or abandoning live units before a structural change, and say so when a change could invalidate a unit's recorded path.
