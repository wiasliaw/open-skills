## Why

The rebuild implemented two escalation behaviors the `graph-run` spec does not state, leaving them as silent deviations an advisor review flagged for spec-level resolution:

1. **Edge-revisit problems take a shortened advisor tier.** The spec's generic chain ("a further consultation while the consultation cap allows") makes no sense for a problem opened by an edge-revisit cap: the blocked thing is a route, re-consulting cannot change the validator's verdict, and the write gate gives advice no way to permit a traversal (`blocked_at` must equal the current node). The implementation consults the advisor once — as diagnosis — then stops for the human ruling. A reader of the current spec would expect up to the full consultation cap.
2. **The reset scope of edge revisit counters is unstated.** The spec says they "reset only on recorded progress", but both progress triggers (a scope item transitioning to passed, a monotonic progress field advancing) are unit-level events with no edge attached, so "which counters" is undefined. The implementation removes every `edge:*` counter of the unit in the same write.

A cap of zero consultations is not representable: the graph validator rejects non-positive caps (`CAP_INVALID`), so "at most once" needs no zero-cap clause.

## What Changes

- Modify the `graph-run` capability's **Tiered escalation** requirement:
  - State the shortened advisor tier for problems opened by an edge-revisit cap: at most one diagnostic consultation, then the human ruling; advice cannot permit a traversal of the capped edge — only the human ruling's retry disposition can.
  - Pin the reset scope: recorded progress resets every `edge:<from>-<to>` counter of the unit in the same write that records it.
  - Add one scenario for each clarification.
- No behavior change in the implementation: `skills/graph-run/references/escalation.md` already implements both rules; this change makes the spec say so.

## Capabilities

### Modified Capabilities

- `graph-run`: the Tiered escalation requirement gains the edge-revisit advisor-tier clause and the edge-counter reset scope; all other requirements unchanged.

## Impact

- Spec: `openspec/specs/graph-run/spec.md` (one requirement modified, two scenarios added).
- Implementation: none required — `skills/graph-run/references/escalation.md` and the template caps already conform; tasks only verify the alignment.
