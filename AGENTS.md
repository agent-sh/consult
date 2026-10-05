# consult

This repo is the consult plugin: cross-tool AI consultation for second opinions from Gemini, Codex, Claude, OpenCode, Copilot or Kiro. Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem; skills follow https://agentskills.io.

## Rules

- Output is plain text: no emojis or ASCII art. Status markers are `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]`.
- Commit only product files. Summaries, plans and audit notes belong in the PR or the conversation.
- A change is done when its tests pass; a feature or fix comes with a test that covers it.
- Non-trivial changes go through a PR, not a direct push to main. Run the git hooks; do not bypass them.
- In prose use ` - ` (single dash with spaces), not ` -- `.
- If a script fails, report the failure before doing the step by hand, so broken tooling gets fixed.
- Agent models: Opus for complex reasoning and planning, Sonnet for validation and most agents, Haiku for mechanical work.
- Priorities, in order: plugin users' experience, automation that needs no babysitting, token efficiency, output quality, simplicity.

## Layout

- `commands/consult.md`: the `/consult` command (parsing, resolution, report).
- `skills/consult/SKILL.md`: validation, transport, the Codex trust gate, sessions and output; provider templates, model defaults, parsing and redaction are in `skills/consult/references/providers.md`.
- `agents/consult-agent.md`: runs pre-resolved consultations, including several parallel instances with a synthesis.
- `acp/`: the ACP runner (`acp/run.js`), client and provider table.
- `lib/` is synced from [agent-core](https://github.com/agent-sh/agent-core), so change library code there.

`scripts/test-command-templates.js` pins the exact command templates, model ids and safety wording in the skill, the reference, the agent and the command. When you change one of those on purpose, update the test in the same change.

## Checks

```bash
npm test             # template contract test and ACP client tests (same as npm run validate)
npm run test:smoke   # ACP smoke test against installed CLIs
agnix .              # agent config lint (also runs in CI)
```

User-visible changes get a CHANGELOG entry under `[Unreleased]`.
