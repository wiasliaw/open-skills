## ADDED Requirements

### Requirement: Script location, invocation, and runtime
The change SHALL define a single zero-dependency Node.js script at `scripts/init.mjs` (plugin root, the stable path contract shared with `worktree-script`) that owns the config mechanics for the init skill: schema validation and atomic writing of `.harness/worktree-setup.json` and `.harness/config.json`. The script MUST use only Node.js built-in modules and sibling modules under `scripts/shared/` (which themselves use only Node.js built-ins); the only external program it may invoke is `git` (to resolve the repository root). The worktree-setup schema validation SHALL be the same shared implementation the `worktree-script` consumer runs, so producer and consumer cannot drift. It SHALL be invoked as `node "<path>/init.mjs" <subcommand> ...`, MUST NOT rely on a shebang or the executable bit, requires Node.js >= 20 checked at startup before any other work, and MUST remain parseable on older Node versions up to that check. It SHALL treat its current working directory as inside the consumer project, resolving the repo root with git when available and falling back to the working directory otherwise, and MUST NOT write anything into the plugin directory.

#### Scenario: Invoked through node
- **WHEN** a consumer runs the script
- **THEN** it SHALL run as `node "<path>/init.mjs" <subcommand> ...` without requiring the executable bit

#### Scenario: Old Node version
- **WHEN** the script starts under Node.js older than 20
- **THEN** it SHALL print a diagnostic to stderr, the failure JSON to stdout, and exit with the Node-version exit code before touching the filesystem

### Requirement: Validate and write subcommands
The script SHALL provide two subcommands over two config kinds (`worktree-setup` and `config`): `validate --kind <kind> --from <draft-path>` checks a draft JSON file against the kind's schema without writing, and `write --kind <kind> --from <draft-path>` validates then atomically writes the canonical file (`.harness/worktree-setup.json` or `.harness/config.json`) at the repo root, creating `.harness/` when missing and overwriting an existing file (update mode). The `worktree-setup` schema SHALL be identical to the one `worktree-script` consumes: `{"version": 1, "setup": [<string>...], "copy": [{"path": <repo-relative, no "..", not absolute>, "readonly": <boolean, optional>}...]}`. The `config` schema SHALL be `{"version": 1, "vcs": <non-empty string>, "workflow": [{"phase": <non-empty string>, "how": <non-empty string>, "kind": "command"|"manual"|"tbd"}...]}` with at least one workflow entry and no unknown keys at any level. A draft that fails validation SHALL be rejected with the config error code and nothing written.

#### Scenario: Valid draft written
- **WHEN** `write --kind worktree-setup --from draft.json` runs with a schema-valid draft
- **THEN** the script SHALL write `.harness/worktree-setup.json` at the repo root and report `"ok": true` with the written path

#### Scenario: Invalid draft rejected
- **WHEN** a draft contains an unknown key, a non-list `setup`, an absolute or `..` copy path, or a workflow entry with an unknown `kind`
- **THEN** the script SHALL report `"ok": false` with the config error code and SHALL NOT write or modify the canonical file

#### Scenario: Validate only
- **WHEN** `validate --kind config --from draft.json` runs
- **THEN** the script SHALL report validity without writing anything

### Requirement: Output and exit-code contract
Every invocation SHALL write exactly one JSON object to stdout and diagnostics only to stderr, following the `worktree-script` conventions: success carries `"ok": true` and an `"action"` (`valid`, `written`), failure carries `"ok": false`, a stable `"error"` code, and a `"message"`. Exit codes SHALL be 0 on success and distinct non-zero codes per failure class (usage, invalid config, write failure, Node version, internal), documented in the script header.

#### Scenario: Failure shape
- **WHEN** a subcommand fails
- **THEN** stdout SHALL be one JSON object with `"ok": false`, an `"error"` code, and a `"message"`, with the matching non-zero exit code

### Requirement: Committed test suite
The script SHALL ship with a committed `node --test` suite at `scripts/init.test.mjs` using only `node:test`/`node:assert` and temp-dir fixtures, covering at minimum: both kinds validating and writing successfully, each schema rejection class, overwrite of an existing canonical file, `.harness/` directory creation, refusal of unknown kinds and missing flags, and the single-JSON-on-stdout contract.

#### Scenario: Suite passes
- **WHEN** `node --test "scripts/*.test.mjs"` runs
- **THEN** the init script's suite SHALL pass alongside the worktree suite
