# Changelog

## [Unreleased]

## [1.1.0] - 2026-09-24

### Changed
- Rewrote the command, agent and skill for current models: goal, constraints with reasons and the output contract, instead of step scripts and MUST lists. Provider templates, model defaults, parsing and redaction moved to `skills/consult/references/providers.md`, stated once.
- Default models: Claude `claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5-5` / `claude-fable-5-1`; Codex `gpt-6-sol` (low, medium) and `gpt-6-astra` (high, max); Gemini `gemini-3.5-flash-lite` / `gemini-3.8-flash` / `gemini-3.1-pro-preview`. The Bedrock id rewrite is replaced by Claude Code's `haiku`/`sonnet`/`opus` aliases.
- The model picker is no longer forced. Effort defaults to medium and the model to the effort default; without AskUserQuestion the tool defaults to the first installed tool that is not the host harness.
- The command reads the skill file instead of loading it with the Skill tool, which resolved to the command itself.

### Fixed
- ACP ignored `--model`: the runner never passed it to the agent and reported the requested model as the one used. It now selects the model through the session's `model` config option (or `session/set_model`), reports `provider-default` when none was asked for, and exits 3 (`model-unsupported`) when the agent does not offer the model, so the caller falls back to the CLI.
- ACP ignored `--session-id`: every run opened a new session. It now resumes with `session/load` when the agent supports it and exits 3 (`resume-unsupported`) otherwise.
- The ACP runner called `process.exit()` inside `try`, which skipped the `finally` that deletes the question file and closes the agent.
- consult-agent loaded the skill with `Skill(consult)`, which resolves to the `/consult` command: a subagent then hit AskUserQuestion and, for several instances, spawned itself again. It now reads the skill file and no longer has the Skill tool. Found by revuto.
- Copilot install hint pointed at the retired `gh extension install github/copilot-cli`.


### Fixed
- Corrected consult command templates for Codex non-interactive execution and resume flows (`codex exec` with `--skip-git-repo-check` + reasoning effort).
- Added nested-session-safe Claude templates using `env -u CLAUDECODE` for print/resume patterns.
- Added strict `SESSION_ID` guidance (`^(?!-)[A-Za-z0-9._:-]+$`) and quoted resume examples.

### Added
- Added `npm test` / `npm run validate` regression checks for consult command template safety and consistency.
- Added explicit Codex trust-gate documentation and matching assertions in template tests.

## [1.0.0] - 2026-02-21

Initial release. Extracted from [agentsys](https://github.com/agent-sh/agentsys) monorepo.
