# consult

Cross-tool AI consultation - get a second opinion from another AI CLI tool without leaving your current session.

## Why

You are mid-task in Claude Code, Codex, or OpenCode and want to sanity-check a decision, compare approaches, or get a different model's perspective. Switching tools manually breaks your flow. consult queries another AI tool in the background and returns the response inline.

Use cases:

- Validate an architecture decision with a second model before committing to it
- Cross-check a code review finding against a different AI's analysis
- Get a fast sanity check (`--effort=low`) or a deep analysis (`--effort=high`)
- Resume a previous consultation to ask follow-up questions (`--continue`)
- Run parallel consultations to compare multiple responses (`--count=3`)

## Installation

```bash
agentsys install consult
```

Requires at least one AI CLI tool installed:

| Tool | Install |
|------|---------|
| Claude | `npm install -g @anthropic-ai/claude-code` |
| Gemini | See https://gemini.google.com/cli |
| Codex | `npm install -g @openai/codex` |
| OpenCode | `npm install -g opencode-ai` |
| Copilot | `gh extension install github/copilot-cli` |

## Quick Start

```bash
# Ask Gemini about your current approach
/consult with gemini about my auth approach

# Get a thorough review from Codex
/consult "Review this function" --tool=codex --effort=high

# Include the current diff as context
/consult "Explain this error" --context=diff --tool=gemini
```

## How It Works

1. **Detect** - scans PATH for installed AI CLI tools (cross-platform)
2. **Resolve** - if no tool is specified, presents an interactive picker showing only installed tools
3. **Map effort to model** - selects the appropriate model and reasoning depth for the chosen tool
4. **Execute** - runs the tool non-interactively with a 120-second timeout, sandboxed to read-only permissions
5. **Return** - parses the response, redacts any leaked credentials, and displays the result with session info

Responses from tools that support sessions (Claude, Gemini, Codex, OpenCode) include a session ID. Use `--continue` to resume.

## Usage

### Natural language

```bash
/consult with codex about my auth approach
/consult gemini should I use redis or postgres
/consult thoroughly ask claude about error handling
/consult ask 3 codex about this design          # 3 parallel consultations
```

### Explicit flags

```bash
/consult "Is this the right approach?" --tool=gemini --effort=high
/consult "Review this function" --tool=codex --count=3
/consult "Suggest improvements" --tool=opencode --model=github-copilot/claude-opus-4-6
/consult --continue                             # resume last session
/consult "Review this file" --context=file=src/index.js --tool=claude
```

### Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--tool` | gemini, codex, claude, opencode, copilot, kiro | interactive | Target AI tool |
| `--effort` | low, medium, high, max | interactive | Reasoning depth |
| `--model` | any model identifier | from effort | Override model selection |
| `--context` | diff, file=PATH, none | none | Attach context to the question |
| `--continue` | flag or SESSION_ID | - | Resume a previous session |
| `--count` | 1-5 | 1 | Parallel consultations |

### Effort-to-model mapping

| Effort | Claude | Gemini | Codex |
|--------|--------|--------|-------|
| low | claude-haiku-4-5 | gemini-3-flash-preview | gpt-5.3-codex (low reasoning) |
| medium | claude-sonnet-4-6 | gemini-3-flash-preview | gpt-5.3-codex (medium reasoning) |
| high | claude-opus-4-6 | gemini-3.1-pro-preview | gpt-5.3-codex (high reasoning) |
| max | claude-opus-4-6 | gemini-3.1-pro-preview | gpt-5.3-codex (high reasoning) |

OpenCode uses user-selected models. Copilot does not expose effort control.

## Requirements

- [agentsys](https://github.com/agent-sh/agentsys) runtime
- Node.js (for ACP transport detection)
- At least one supported AI CLI tool on PATH

## Related Plugins

- [debate](https://github.com/agent-sh/debate) - structured multi-round debate between two AI tools
- [agentsys](https://github.com/agent-sh/agentsys) - plugin runtime and orchestration

## License

MIT
