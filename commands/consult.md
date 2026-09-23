---
name: consult
description: Consult another AI CLI tool for a second opinion. Use when you want to cross-check ideas, get alternative approaches, or validate decisions with Gemini, Codex, Claude, OpenCode, or Copilot.
codex-description: 'Use when user asks to "consult gemini", "ask codex", "get second opinion", "cross-check with claude", "consult another AI", "ask opencode", "copilot opinion", "ask 3 codex", "multi-consult". Queries another AI CLI tool and returns the response.'
argument-hint: "[natural language or flags] [--tool] [--effort] [--model] [--context] [--continue] [--count=N]"
allowed-tools: Skill, Task, Bash(git:*), Bash(claude:*), Bash(gemini:*), Bash(codex:*), Bash(opencode:*), Bash(copilot:*), Bash(kiro-cli:*), Bash(node:*), Bash(npx:*), Bash(where.exe:*), Bash(which:*), Bash(timeout:*), Bash(env:*), Read, Write, AskUserQuestion
---

# /consult

Get a second opinion from another AI CLI and show it to the user.

Arguments: `$ARGUMENTS`, as flags, natural language, or both. Flags win when both set the same thing.

## Constraints

- Never expose API keys in commands or output, and never run a tool with permission-bypassing flags (`--dangerously-skip-permissions`, `bypassPermissions`). The consulted tool reads the user's repo; it must not be able to change it.
- Safe-mode defaults per provider: `env -u CLAUDECODE ... --allowedTools "Read,Glob,Grep"` for Claude, `-c model_reasoning_effort` for Codex. For Codex non-interactive exec mode, resolve `SKIP_GIT_FLAG` via trust gate: empty in trusted git repos, `--skip-git-repo-check` only for trusted non-repo execution.
- MUST enforce the Codex trust gate before setting `SKIP_GIT_FLAG` (same project working directory + resolved active tool is Codex, including flag/NLP/picker/`--continue` restore paths).
- Only consult tools the user asked for, or the one picked by the defaults below. Validate tool names against the allow-list (gemini, codex, claude, opencode, copilot, kiro) and quote every value that goes into a command.
- 120-second limit on every run.

## Parse

- **Flags**: `--tool`, `--effort` (low, medium, high, max), `--model`, `--context` (diff, file=PATH, none), `--continue[=SESSION_ID]`, `--count=N` (1 to 5).
- **Natural language**: "with codex", "ask gemini", "consult claude", "codex about ..." name the tool; "ask 3 codex" or "3 instances" set the count; "quick" means low effort, "thorough" or "deep" high, "max effort" or "exhaustive" max. Text after "about" is the question; otherwise the question is what remains.

No question and no `--continue`: `[ERROR] Usage: /consult "your question" or /consult with gemini about your question`. Count outside 1 to 5: `[ERROR] Instance count must be 1-5. Got: {count}`. `--continue` with a count above 1: `[ERROR] Cannot use --continue with --count > 1. Use --continue for single session resume.`

## Resolve

The consult skill defines tool choice, validation, templates and model defaults. Read it from this plugin (`skills/consult/SKILL.md` and its `references/providers.md`); do not load it with the Skill tool, which would resolve to this command again.

- **Tool** missing: ask with AskUserQuestion, offering only installed tools. Without AskUserQuestion, use the skill's default order.
- **Effort** missing: medium. Ask only if the request is ambiguous about depth.
- **Model** missing: the effort default from the reference. When the user is present and asked to choose, offer the reference's picker options plus a typed id.
- **Count**: 1 unless the user asked for several ("few", "multiple"); ask how many only in that case.
- **--continue**: restore tool, model and session id from `{AI_STATE_DIR}/consult/last-session.json` and re-validate them as the skill says.

## Run

- **One instance**: follow the skill's steps (question file, transport, trust gate, run, parse, redact, clean up, save session).
- **Several**: spawn `consult:consult-agent` with the resolved tool, model, effort, question, count and context. Without Task, run the instances yourself in parallel with one question file each (`question-1.tmp` ...), then synthesize as the agent does.

## Report

```
Tool: {tool}, Model: {model}, Effort: {effort}, Duration: {duration_ms}ms.

The results of the consultation are:
{response}
```

For continuable tools add `Session: {session_id} - use /consult --continue to resume`. On failure: `[ERROR] {tool} failed: {error}. Try a different tool with --tool=[other]`; on timeout suggest `--effort=low`; for a missing tool give its install hint.

## Examples

```bash
/consult with codex about my auth approach
/consult ask 3 codex about this design
/consult "Is this the right approach?" --tool=gemini --effort=high
/consult "Review this file" --context=file=src/index.js --tool=claude
/consult --continue
```
