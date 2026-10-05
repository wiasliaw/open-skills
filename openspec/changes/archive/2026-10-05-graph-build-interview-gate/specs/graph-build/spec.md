## ADDED Requirements

### Requirement: The instantiation interview is a hard gate

Graph-build SHALL NOT write a config section or fill a template slot without the user's explicit confirmation of that answer. The repository survey produces recommendations to present — one question at a time, each with the recommended answer and its source — never answers to adopt silently; a session with no user confirmation for a section or slot SHALL stop and ask rather than proceed to validation. The confirmed answers SHALL be recorded in graph-build's final report alongside what was written. The gate scopes to initial builds (bootstrap and template instantiation); an edit to an existing definition confirms only the change being made. Where a template's structure cannot fit the project as shipped (reference: a delivery flow that assumes a remote in a project that has none), the template's documentation SHALL declare the permitted variants, the interview SHALL put that choice to the user, and any deviation outside the declared variants remains a user-requested edit — never an improvisation by the instantiating session.

#### Scenario: Survey answer still asked
- **WHEN** the survey finds an obvious answer for a slot (for example `npm test` in the package manifest)
- **THEN** graph-build SHALL present it as the recommendation and wait for confirmation or correction, and SHALL NOT fill the slot from the survey alone

#### Scenario: No-remote project chooses a declared variant
- **WHEN** the project declares no git remote and the template's delivery steps assume one
- **THEN** the interview SHALL offer the template's declared delivery variants (remote delivery, or local merge into the default branch with the delivery slot and its uses removed together), record the user's choice, and apply exactly the chosen variant before validation

#### Scenario: Unconfirmed build refused
- **WHEN** a session reaches the validation step with a slot or config section that was never put to the user
- **THEN** it SHALL stop and ask instead of validating, because an unconfirmed answer is not an answer
