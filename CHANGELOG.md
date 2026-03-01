# Changelog

## [Unreleased]

### Fixed
- Corrected consult command templates for Codex non-interactive execution and resume flows (`codex exec` with `--skip-git-repo-check` + reasoning effort).
- Added nested-session-safe Claude templates using `env -u CLAUDECODE` for print/resume patterns.
- Added strict `SESSION_ID` guidance (`^(?!-)[A-Za-z0-9._:-]+$`) and quoted resume examples.

### Added
- Added `npm test` / `npm run validate` regression checks for consult command template safety and consistency.
- Added explicit Codex trust-gate documentation and matching assertions in template tests.

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
