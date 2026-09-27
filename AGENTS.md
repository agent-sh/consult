# consult

> Cross-tool AI consultation: get second opinions from Gemini, Codex, Claude, OpenCode, or Copilot CLI

## Agents

- consult-agent

## Skills

- consult

## Commands

- consult

## Critical Rules

1. **Plain text output** - No emojis, no ASCII art. Use `[OK]`, `[ERROR]`, `[WARN]`, `[CRITICAL]` for status markers.
2. **No unnecessary files** - Don't create summary files, plan files, audit files, or temp docs.
3. **Task is not done until tests pass** - Every feature/fix must have quality tests.
4. **Create PRs for non-trivial changes** - No direct pushes to main.
5. **Always run git hooks** - Never bypass pre-commit or pre-push hooks.
6. **Use single dash for em-dashes** - In prose, use ` - ` (single dash with spaces), never ` -- `.
7. **Report script failures before manual fallback** - Never silently bypass broken tooling.
8. **Token efficiency** - Save tokens over decorations.

## Model Selection

| Model | When to Use |
|-------|-------------|
| **Opus** | Complex reasoning, analysis, planning |
| **Sonnet** | Validation, pattern matching, most agents |
| **Haiku** | Mechanical execution, no judgment needed |

## Core Priorities

1. User DX (plugin users first)
2. Worry-free automation
3. Token efficiency
4. Quality output
5. Simplicity

## Dev Commands

```bash
npm test          # Run tests
npm run validate  # All validators
```

## References

- Part of the [agentsys](https://github.com/agent-sh/agentsys) ecosystem
- https://agentskills.io

## Worktree and tmp hygiene (owner, 2026-08-17)

- When work in a git worktree is finished - merged, banked, or abandoned - clean it up
  as part of finishing: `git worktree remove <path>` AND delete its branch
  (`git branch -d`; `-D` only once the owner's merge/abandon decision is recorded).
  A closed lane leaves no `wt-*` directory and no stale branch behind.
- Every use of /tmp (or any scratch space) is cleaned by the task that created it:
  delete scratch files and dirs when the task closes, not when disk pressure finds
  them. Motivating incident 2026-08-17: 7 GB of dead lane dirs in /tmp plus an
  unthrottled upload storm flooded 25 GB of swap and stalled the rig.

## Validation scope

Choose checks that cover the changed behavior. For CPU-only tooling, documentation
and configuration changes, run the relevant CPU tests, static checks and configuration
validation. Do not require a blanket GPU gate for those changes. Require GPU
qualification when GPU, runtime or model behavior, or related claims, change.
Preserve applicable native, model and hardware qualification gates. CPU checks do
not qualify GPU behavior.
