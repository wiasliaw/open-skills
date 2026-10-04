## 1. Spec delta

- [x] 1.1 Modify the Tiered escalation requirement: edge-revisit advisor-tier clause (at most one diagnostic consultation, then the human ruling; no traversal on advice) and the reset scope (progress resets every `edge:<from>-<to>` counter of the unit in the same write), with one scenario each

## 2. Implementation alignment (verify only — no behavior change expected)

- [x] 2.1 `skills/graph-run/references/escalation.md`: confirm it already states "advisor consulted once, then the human ruling" for edge-revisit problems and "remove every `edge:*` key on recorded progress in the same write" — it does (Progress section and the consultation decision list)
- [x] 2.2 Zero consultation cap needs no handling: `scripts/graph.mjs` rejects non-positive caps (`CAP_INVALID`), so a definition with `advisor_consultations: 0` cannot be accepted

## 3. Validation

- [x] 3.1 `openspec validate --no-interactive` passes for the change and all specs
