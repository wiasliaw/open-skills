## MODIFIED Requirements

### Requirement: Script location, invocation, and runtime
The change SHALL define a single zero-dependency Node.js script at `scripts/worktree.mjs` (plugin root) that owns the dangerous worktree mechanics for two consumers: the Build node (through the `use-worktree` skill) and the `codewalk` skill (detach mode). The script MUST use only Node.js built-in modules and `git`; it MUST NOT depend on any third-party package, bundled package, or shell other than the one used to run user-declared setup commands. The script SHALL be invoked as `node "<path>/worktree.mjs" <subcommand> ...` and MUST NOT rely on a shebang or the executable bit. The script requires Node.js >= 20 and SHALL check `process.versions.node` at startup, before any other work, exiting with the Node-version exit code and a stderr message when the version is lower. The script file MUST remain parseable on older Node versions up to that check (no syntax newer than the check can guard). Supported platforms are macOS and Linux; Windows is explicitly unverified and the spec makes no claim for it. The script's directory `scripts/` at the plugin root is a stable path contract that consumers may rely on; the former location `skills/use-worktree/scripts/` is no longer a contract.

#### Scenario: Invoked through node
- **WHEN** a consumer runs the script
- **THEN** it SHALL run it as `node "<path>/worktree.mjs" <subcommand> ...` and the script SHALL NOT require the executable bit

#### Scenario: Old Node version
- **WHEN** the script starts under Node.js older than 20
- **THEN** it SHALL print a diagnostic to stderr, print the failure JSON to stdout, and exit with the Node-version exit code before touching git or the filesystem

#### Scenario: No third-party dependency
- **WHEN** the script is inspected
- **THEN** it SHALL import only Node.js built-in modules and SHALL invoke only `git` and the user-declared setup commands as external programs

#### Scenario: Plugin-root location
- **WHEN** the plugin directory is inspected
- **THEN** `worktree.mjs` and its test SHALL live under `scripts/` at the plugin root and no script SHALL remain under `skills/use-worktree/scripts/`
