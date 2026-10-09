## ADDED Requirements

### Requirement: Two type catalogs keyed by state field name

State-field type definitions SHALL live in exactly two catalogs and nowhere else: the plugin catalog (`templates/types.json`, shipped with the plugin, read-only for projects) and the project catalog (`.harness/types.json`, written only by graph-build). Each catalog SHALL be a JSON object keyed by state field name. A TaskDef SHALL carry zero type information: a task's `produces` entry `state:<field>` is both the write authorization for that field and the type reference — the field name is the catalog key. A reference that resolves to no catalog entry is a dangling reference and SHALL be rejected at validation time.

#### Scenario: Field resolved by name
- **WHEN** a task declares `produces: ["state:contract_ref"]`
- **THEN** the type of `contract_ref` SHALL be resolved by looking up the key `contract_ref` in the merged catalogs, with no type declaration on the task itself

#### Scenario: Dangling reference rejected
- **WHEN** a task produces `state:<field>` and no catalog defines that field
- **THEN** validation SHALL reject the definition naming the task and the field

### Requirement: Pure type schema

A catalog entry SHALL contain only the pure type fields `type`, `values`, `nullable`, `default`, `items`, `fields`, and nothing else. The primitive type vocabulary SHALL be `string`, `integer`, `number`, `boolean`, `object`, `list`, `command` (a run-time-generated invocation), `evidence-ref` (an evidence reference `{kind, ref}`), and `pointer` (a folder-relative file pointer) — the last three promoted from 1.x value markers. Mechanism semantics SHALL NOT appear in a type: which node executes a stored command is declared by the consuming task's equipment (`{source, family}` entry), and per-item failure scoping is implied by a node's `re_entry` declaration. An entry naming a node, task, or mechanism SHALL be rejected by the catalog writer at write time — purity is enforced at the only authoring surface, not re-validated downstream.

#### Scenario: Mechanism field rejected at the source
- **WHEN** a catalog entry draft carries a field such as `executes` or `scope_kind`
- **THEN** the write SHALL be rejected naming the entry and the offending field, and no downstream validator SHALL need a purity rule

#### Scenario: Command-typed value
- **WHEN** a field's items declare `"type": "command"`
- **THEN** values stored there SHALL be validated as invocations, and their execution coverage SHALL be checked against the consuming task's equipment, not against the type

### Requirement: Parameterized plugin types instantiate into the project catalog

A plugin catalog entry MAY carry `{{slot}}` placeholders (reference: the `phase` type's `values`). A parameterized entry SHALL NOT be referenced directly: graph-build fills its slots from the interview and writes the completed entry under the same key into the project catalog. This instantiation is the only legal same-key override between the catalogs; any other name collision between plugin and project catalogs SHALL be rejected at load. The instantiated `phase` type's values SHALL contain the reserved value `maintenance`.

#### Scenario: Unfilled parameterized type referenced
- **WHEN** a task references a field whose only definition is a plugin entry still carrying a slot
- **THEN** validation SHALL reject it, pointing at the graph-build instantiation step

#### Scenario: Project adds its own phase values
- **WHEN** the interview records a project phase vocabulary (for example adding `docs`)
- **THEN** graph-build SHALL write the completed `phase` entry into the project catalog with those values plus `maintenance`, and the validator SHALL reject an instance missing `maintenance`

#### Scenario: Illegal collision
- **WHEN** the project catalog defines a field name the plugin catalog already defines without parameters
- **THEN** the load SHALL be rejected naming the key and both sources

### Requirement: The registry is merged in memory and never written to disk

Consumers (`graph.mjs`, `work-unit.mjs`) SHALL build the state-field registry by merging the two catalogs in memory at load time. No materialized registry SHALL be written to any file: the project `graph.json` has no `state_fields` section, and no generated registry artifact exists — a written registry is a second definition that drifts. Project type extension happens only at graph-build time (new entries for wrapped external skills, instantiated parameterized entries); after assembly the catalogs are fixed for runs until the next graph-build edit.

#### Scenario: No registry on disk
- **WHEN** a 2.0 project is inspected
- **THEN** state-field types SHALL be found only in `templates/types.json` and `.harness/types.json`, and `graph.json` SHALL contain no type section

#### Scenario: Both gates resolve identically
- **WHEN** the graph validator checks an edge guard's field and the write gate validates a state write to the same field
- **THEN** both SHALL resolve the field from the same merged-catalog rule, yielding the same type
