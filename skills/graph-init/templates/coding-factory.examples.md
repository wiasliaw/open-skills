# coding-factory — canonical phase walks (non-normative)

The routing truth is the edges + guards of `graphs/coding-factory.json`; this
file is only a human-readable set of canonical walks, and the validator never
reads it. Phase values are filled in by the interview into the
`{{phase_values}}` slot; the reserved value `maintenance` must be included.

## feat — a capability that needs a new contract

trigger → research → spec → ticket → build → (loop per ticket) → review → wrap → ship

- When build finishes a ticket and tickets are still pending, it returns to
  ticket to pick the next one (selection-only re-entry).
- review fail goes to build-direct (the whole-change fix) and then back to
  review, not to build; a contract contradiction found at ticket returns to
  spec.

## fix — a defect an existing contract already covers

trigger → research → ticket → build → (loop per ticket) → review → wrap → ship

- Does not pass through spec; research's approval also records the existing
  contract that covers the defect (contract_ref).
- A contract contradiction found at ticket returns to research (the contract
  is not owned by this unit).
- review fail goes to build-direct (the whole-change fix) and then back to
  review, not to build.

## chore — housekeeping that changes neither behavior nor contract

trigger → research → build-direct → review → wrap → ship

- No ticket decomposition; the whole change is implemented once and verified
  once.

## maintenance — memory apply (triggered only by maintenance-due)

trigger → research → maintain → review → wrap → ship

- maintain folds pending deltas into the current-truth documents and flips
  their status, governed by its own set of restrictions (no VCS, touches only
  the memory documents under .harness/).

## Common endings

- Any human task that judges not-needed → end (the abandonment terminal;
  the worktree is force-removed, drafts are left in place and archived).
- Once wrap passes its independent check: commit → push → open the delivery
  channel → remove the worktree → ship (the success terminal; the handoff is
  copied to the folder root and archived).
