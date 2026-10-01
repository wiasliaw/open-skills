## 1. Author specs

- [ ] 1.1 Write `graph-plugin-actor-model` spec
- [ ] 1.2 Write `graph-plugin-dispatch-construction` spec
- [ ] 1.3 Write `graph-plugin-review-gating` spec
- [ ] 1.4 Write `graph-plugin-work-unit-state` spec
- [ ] 1.5 Revise all four specs for the Advisor tier (fourth role, `blocked_at`, `advisor_consults`, escalation flow)
- [ ] 1.6 Deepen `graph-plugin-work-unit-state` into a field-level schema (fields, lifecycle, invariants, normative example) and reconcile proposal and design
- [ ] 1.7 Revise from a single `work-unit.json` to a per-work-unit folder (`state.json`, `log.ndjson`, stage directories): split write authority, slim `state.json` to routing data plus file pointers, and reconcile the actor-model, dispatch-construction, review-gating specs, proposal, and design
- [ ] 1.8 Reword storage vocabulary in the `graph-engineering-node-specs` specs from `work-unit.json` to the work-unit folder

## 2. Validate

- [ ] 2.1 Run `openspec validate graph-plugin-architecture --strict --no-interactive` and `openspec validate graph-engineering-node-specs --strict --no-interactive`
- [ ] 2.2 Run `claude plugin validate .`
