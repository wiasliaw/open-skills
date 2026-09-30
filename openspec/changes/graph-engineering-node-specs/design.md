## Context

WOR-33 finalized an execution graph for coding work: nodes (units of work), edges (routing conditions over state), state (`work-unit.json`), and skills mounted on nodes. This change turns that design into specs.

## Goals / Non-Goals

**Goals:**
- One spec per node plus init, each with purpose, type, inputs, outputs, guarded outgoing edges, and mounted skills.
- One cross-cutting spec that holds the shared rules so node specs do not repeat them.

**Non-Goals:**
- Implementing the graph or altering existing skills, agents, or docs.
- Defining the JSON schema of `work-unit.json` beyond the fields each node reads and writes.

## Decisions

- **One capability per node.** Each node maps to its own capability `graph-node-<name>`, so each can evolve and be reviewed independently. Alternative: a single `graph` capability; rejected because per-node changes would collide.
- **init is separate and named `graph-init-bootstrap`.** It is outside the graph and must not look like a node; the name also avoids confusion with the existing `init` skill.
- **Shared rules live in `graph-execution-model`.** The complete edge table, principles, and the static-relation ruling are stated once there; node specs list only their own outgoing edges.
- **Every node spec uses the same six requirement shapes** (purpose and type, inputs, outputs, edges, skills, plus node-specific rules) for uniform review.
- **Review edge guards are ordered.** The fast-path failure guard takes precedence over the generic fail-below-2 edge, so the latter is stated for non-fast paths.

## Risks / Trade-offs

- [Edge tables duplicated between the model spec and node specs] -> Node specs are authoritative for their own edges; the model spec is the audit list.
- [State field names are left unspecified] -> Outputs are described by content; a later change can fix the schema.
