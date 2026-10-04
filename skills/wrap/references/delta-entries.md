# Delta entries

One markdown file per entry in the delta ledger under `.harness/`. One entry per file, so concurrent runs merge as whole-file additions, never as in-place conflicts. Use the memory script (`scripts/memory.mjs`) to regenerate or inspect the index; never hand-write the index and never commit it.

## Frontmatter

```yaml
---
id: <unit-id>.<node-id>.<n>
target: architecture        # the current-truth document it proposes to change
date: 2026-10-05T12:00:00Z  # ISO-8601 UTC
title: Use SQLite for local state
type: decision              # decision | feature | constraint-change | architecture-change
status: pending             # close-out always writes pending
supersedes: []              # lists of entry ids; may reference existing
depends-on: []              #   entries or sibling drafts of the same unit
decided-by: []
verified-by: []
---
```

- `<n>` is counted per stage directory, so ids are unique across concurrent units and stages.
- The body states the outcome and its rationale.
- `status` is the only mutable field and only the maintenance apply unit flips it (`applied` or `rejected`). Close-out always writes `pending`.

## Consolidation

1. Gather every `delta-<n>.md` from the unit's stage directories.
2. Drop drafts that a reviewer report rejected by id.
3. Deduplicate drafts that state the same outcome; keep the clearest.
4. Resolve relations so each referenced id exists (a ledger entry or a surviving sibling draft).
5. Write each survivor into the ledger as a pending entry.

## Superseding

When a decision replaces an earlier one, list the old entry id under `supersedes` in the new entry. Leave the old file in place, unedited.
