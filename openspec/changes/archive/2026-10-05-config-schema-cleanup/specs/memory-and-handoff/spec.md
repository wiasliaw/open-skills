## MODIFIED Requirements

### Requirement: Memory is current truth plus accumulated deltas

Long-term memory SHALL live under the project's `.harness/` namespace in two layers: a declared set of current-truth documents (reference set: architecture, constraints), each with a declared size budget and loaded whole at every run — each document is declared in the config under a bare file name (no path separators) resolved to `.harness/<name>`, created as a minimal skeleton by the project bootstrap, and a document missing at run time still reads as empty; and a delta ledger — one file per delta entry (reference types: decision, feature, constraint-change, architecture-change) recording a durable outcome as a proposed change to current truth. Deltas accumulate append-only — entry bodies are immutable, and `status` is the one mutable frontmatter field, flipped only by the apply unit; current-truth documents are never the direct target of an ordinary unit's write.

#### Scenario: Current truth stays bounded
- **WHEN** a current-truth document exceeds its declared budget
- **THEN** the memory script SHALL report due maintenance — and nothing else: run starts and ordinary close-outs proceed (deltas keep accumulating in the ledger), because only the maintenance unit can distill, and blocking anything on the breach would deadlock the cure

#### Scenario: History grows, the read surface does not
- **WHEN** the delta ledger grows over the project's life
- **THEN** the always-loaded set SHALL remain the budgeted current-truth documents plus a generated index, never the ledger itself

#### Scenario: One key grammar across writer and reader
- **WHEN** the config writer validates a memory budget key
- **THEN** it SHALL apply the same bare-file-name grammar the memory script applies when resolving the document, so a config that validates can never name a document the memory script refuses
