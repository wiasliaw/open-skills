## Context

WOR-33 finalized an execution graph for coding work: nodes (units of work), edges (routing conditions over state), state (the work-unit folder, with `state.json` as routing state), and skills mounted on nodes. This change turns that design into specs.

## Goals / Non-Goals

**Goals:**
- One spec per node plus init, each with purpose, type, inputs, outputs, guarded outgoing edges, and mounted skills.
- One cross-cutting spec that holds the shared rules so node specs do not repeat them.

**Non-Goals:**
- Implementing the graph or altering existing skills, agents, or docs.
- Defining the schema of the work-unit folder and its `state.json` beyond the fields each node reads and writes.

## Decisions

- **One capability per node.** Each node maps to its own capability `graph-node-<name>`, so each can evolve and be reviewed independently. Alternative: a single `graph` capability; rejected because per-node changes would collide.
- **init is separate and named `graph-init-bootstrap`.** It is outside the graph and must not look like a node; the name also avoids confusion with the existing `init` skill.
- **Shared rules live in `graph-execution-model`.** The complete edge table, principles, and the static-relation ruling are stated once there; node specs list only their own outgoing edges.
- **Every node spec uses the same six requirement shapes** (purpose and type, inputs, outputs, edges, skills, plus node-specific rules) for uniform review.
- **Review edge guards are ordered.** The fast-path failure guard takes precedence over the generic fail-below-2 edge, so the latter is stated for non-fast paths.

- **Advisor is the cheap escalation tier before the human.** Human intervention stays a last resort; the Advisor (an LLM node, read-only analysis) absorbs the first escalations. Every blocked stage and every repeated failure routes to Advisor, which returns root-cause analysis and retry guidance and sends the work back to the `blocked_at` node. Consultations are capped at 2 per problem; after two failed consultations the work goes to Human Escalation. Alternative: keep the direct stage-to-Human-Escalation edges; rejected because the human would absorb every routine failure.
- **Human Escalation resumes at `blocked_at`.** The orchestrator records `blocked_at` in state when a stage blocks, so both Advisor and Human Escalation resume at the originating node rather than only at Build. This generalizes the former Escalation to Build edge.
- **Edge counting convention.** The edge set now has 26 edges (was 23). Wildcard-source edges ("any stage" to Advisor, in-node second failure of Research, Spec, Ticket, or Wrap to Advisor) and `blocked_at`-target edges each count as one edge; the Build blocked edge and the Review fail-twice edge to Human Escalation are replaced by edges to Advisor.

## Risks / Trade-offs

- [Edge tables duplicated between the model spec and node specs] -> Node specs are authoritative for their own edges; the model spec is the audit list.
- [State field names are left unspecified] -> Outputs are described by content; a later change can fix the schema.
