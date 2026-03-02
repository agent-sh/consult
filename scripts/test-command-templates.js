#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function assertContains(text, pattern, message, failures) {
  if (!pattern.test(text)) {
    failures.push(message);
  }
}

function assertNotContains(text, pattern, message, failures) {
  if (pattern.test(text)) {
    failures.push(message);
  }
}

const skill = read('skills/consult/SKILL.md');
const agent = read('agents/consult-agent.md');
const command = read('commands/consult.md');
const constraintsStart = command.indexOf('## Constraints');
const executionStart = command.indexOf('## Execution');
const constraintsSection = (constraintsStart !== -1 && executionStart !== -1 && executionStart > constraintsStart)
  ? command.slice(constraintsStart, executionStart)
  : '';

const failures = [];
const sessionIdPattern = /^(?!-)[A-Za-z0-9._:-]+$/;

function validateSessionId(value) {
  return sessionIdPattern.test(value);
}

assertNotContains(skill, /codex -q/, 'SKILL.md must not use codex -q.', failures);
assertNotContains(skill, /-a suggest/, 'SKILL.md must not use -a suggest.', failures);

assertContains(
  skill,
  /env -u CLAUDECODE claude -p "QUESTION"/,
  'SKILL.md must use env -u CLAUDECODE for Claude command templates.',
  failures
);

assertContains(
  skill,
  /env -u CLAUDECODE claude -p - --output-format json --model "MODEL" --max-turns TURNS --allowedTools "Read,Glob,Grep" < "\{AI_STATE_DIR\}\/consult\/question\.tmp"/,
  'SKILL.md must include Claude safe temp-file command template.',
  failures
);

assertContains(
  skill,
  /env -u CLAUDECODE claude -p - --output-format json --model "MODEL" --max-turns TURNS --allowedTools "Read,Glob,Grep" --resume "SESSION_ID" < "\{AI_STATE_DIR\}\/consult\/question\.tmp"/,
  'SKILL.md must include Claude safe resume temp-file command template.',
  failures
);

assertContains(
  skill,
  /codex exec "QUESTION" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex base template must use conditional {SKIP_GIT_FLAG} and reasoning effort.',
  failures
);

assertContains(
  skill,
  /codex exec resume "SESSION_ID" "QUESTION" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex resume template must quote SESSION_ID and use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  skill,
  /codex exec resume --last "QUESTION" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex resume --last template must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  skill,
  /Non-interactive resume uses `codex exec resume "SESSION_ID" "follow-up prompt" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md must pin the Codex continuable resume guidance.',
  failures
);

assertContains(
  skill,
  /\*\*Codex\*\*: use `codex exec resume "SESSION_ID" "QUESTION" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md Step-2 Codex resume guidance must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  skill,
  /\*\*Claude or Gemini\*\*: append `--resume "SESSION_ID"` to the command\./,
  'SKILL.md must pin quoted resume guidance for Claude/Gemini.',
  failures
);

assertContains(
  skill,
  /\*\*--continue=SESSION_ID\*\*: If provided, SESSION_ID MUST match `\^\(\?!-\)\[A-Za-z0-9\._:-\]\+\$`\./,
  'SKILL.md must document SESSION_ID validation.',
  failures
);

const validSessionIds = ['abc-123', 'foo_bar', 'session.id:42'];
for (const id of validSessionIds) {
  if (!validateSessionId(id)) {
    failures.push(`validateSessionId should accept "${id}".`);
  }
}

const invalidSessionIds = ['abc 123', '$(id)', 'x;rm', 'x|cat', '"quoted"', '-abc123'];
for (const id of invalidSessionIds) {
  if (validateSessionId(id)) {
    failures.push(`validateSessionId should reject "${id}".`);
  }
}

assertContains(
  skill,
  /codex exec "\$\(\s*cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\s*\)" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md safe Codex base temp-file template must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  skill,
  /codex exec resume "SESSION_ID" "\$\(\s*cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\s*\)" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md safe Codex resume template must quote SESSION_ID and use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  skill,
  /codex exec resume --last "\$\(\s*cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\s*\)" --json -m "MODEL" \{SKIP_GIT_FLAG} -c model_reasoning_effort="LEVEL"/,
  'SKILL.md safe Codex resume --last template must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  agent,
  /question-1\.tmp"\)" --json -m "gpt-5\.3-codex" \{SKIP_GIT_FLAG} -c model_reasoning_effort="high"/,
  'consult-agent.md question-1 example must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  agent,
  /question-2\.tmp"\)" --json -m "gpt-5\.3-codex" \{SKIP_GIT_FLAG} -c model_reasoning_effort="high"/,
  'consult-agent.md question-2 example must use conditional {SKIP_GIT_FLAG}.',
  failures
);

assertContains(
  agent,
  /question-3\.tmp"\)" --json -m "gpt-5\.3-codex" \{SKIP_GIT_FLAG} -c model_reasoning_effort="high"/,
  'consult-agent.md question-3 example must use conditional {SKIP_GIT_FLAG}.',
  failures
);

if (!constraintsSection) {
  failures.push('commands/consult.md must contain ## Constraints and ## Execution sections.');
}

assertContains(
  constraintsSection,
  /env -u CLAUDECODE/,
  'commands/consult.md constraints must include the Claude env-unset safety requirement.',
  failures
);

assertContains(
  constraintsSection,
  /-c model_reasoning_effort/,
  'commands/consult.md constraints must include the Codex reasoning-effort safety requirement.',
  failures
);

assertContains(
  constraintsSection,
  /resolve `SKIP_GIT_FLAG` via trust gate: empty in trusted git repos, `--skip-git-repo-check` only for trusted non-repo execution/,
  'commands/consult.md constraints must define conditional SKIP_GIT_FLAG behavior.',
  failures
);

assertContains(
  constraintsSection,
  /MUST enforce the Codex trust gate before setting `SKIP_GIT_FLAG` \(same project working directory \+ resolved active tool is Codex, including flag\/NLP\/picker\/`--continue` restore paths\)/,
  'commands/consult.md constraints must require Codex trust-gate enforcement.',
  failures
);

assertContains(
  skill,
  /### Step 1b: Trust Gate for Codex `--skip-git-repo-check`/,
  'SKILL.md must define an explicit Codex trust gate step.',
  failures
);

assertContains(
  skill,
  /Refusing Codex --skip-git-repo-check outside trusted working directory/,
  'SKILL.md trust gate must define a hard failure message.',
  failures
);

assertContains(
  skill,
  /`\{SKIP_GIT_FLAG\}` MUST be set by Step 1b only\. Do not read `SKIP_GIT_FLAG` from inherited shell environment\./,
  'SKILL.md must forbid inherited-environment SKIP_GIT_FLAG usage.',
  failures
);

assertContains(
  skill,
  /Run `git rev-parse --is-inside-work-tree`/,
  'SKILL.md trust gate must define git repo detection for SKIP_GIT_FLAG.',
  failures
);

assertContains(
  skill,
  /if true: set `\{SKIP_GIT_FLAG}` to empty string/,
  'SKILL.md trust gate must define empty SKIP_GIT_FLAG in trusted git repos.',
  failures
);

assertContains(
  skill,
  /if false and checks 1-2 passed: set `\{SKIP_GIT_FLAG}` to `--skip-git-repo-check`/,
  'SKILL.md trust gate must define conditional skip flag in trusted non-repo contexts.',
  failures
);

assertContains(
  skill,
  /Verify the resolved active tool is Codex \(flag, NLP, picker, or restored `--continue` session\)\./,
  'SKILL.md trust gate must account for all resolved Codex selection paths.',
  failures
);

assertContains(
  skill,
  /model must match `\^\[A-Za-z0-9\._:\/-\]\+\$` \(reject spaces and shell metacharacters\)/,
  'SKILL.md must require restored model validation for --continue flows.',
  failures
);

assertContains(
  skill,
  /tool must still be in allow-list: gemini, codex, claude, opencode, copilot/,
  'SKILL.md must require restored tool allow-list validation.',
  failures
);

assertContains(
  skill,
  /session_id must match `\^\(\?!-\)\[A-Za-z0-9\._:-\]\+\$`/,
  'SKILL.md must require restored session_id validation.',
  failures
);

assertContains(
  skill,
  /reject with `\[ERROR\] Invalid restored session data`/,
  'SKILL.md must define fail-closed behavior for invalid restored session data.',
  failures
);

assertNotContains(
  skill,
  /codex exec resume SESSION_ID /,
  'SKILL.md must not include unquoted Codex SESSION_ID resume templates.',
  failures
);

assertNotContains(
  skill,
  /Command: codex exec "QUESTION" --json -m "MODEL" --skip-git-repo-check/,
  'SKILL.md must not hardcode skip-git in the Codex base provider template.',
  failures
);

assertNotContains(
  skill,
  /Session resume: codex exec resume "SESSION_ID" "QUESTION" --json -m "MODEL" --skip-git-repo-check/,
  'SKILL.md must not hardcode skip-git in the Codex resume provider template.',
  failures
);

assertNotContains(
  skill,
  /Session resume \(latest\): codex exec resume --last "QUESTION" --json -m "MODEL" --skip-git-repo-check/,
  'SKILL.md must not hardcode skip-git in the Codex resume-latest provider template.',
  failures
);

assertNotContains(
  skill,
  /\*\*Codex\*\*: use `codex exec resume "SESSION_ID" "QUESTION" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md Step-2 Codex resume guidance must not hardcode skip-git.',
  failures
);

assertNotContains(
  skill,
  /\| Codex \| `codex exec "\$\(cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\)" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md safe table Codex base entry must not hardcode skip-git.',
  failures
);

assertNotContains(
  skill,
  /\| Codex \(resume\) \| `codex exec resume "SESSION_ID" "\$\(cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\)" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md safe table Codex resume entry must not hardcode skip-git.',
  failures
);

assertNotContains(
  skill,
  /\| Codex \(resume latest\) \| `codex exec resume --last "\$\(cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\)" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"`/,
  'SKILL.md safe table Codex resume-latest entry must not hardcode skip-git.',
  failures
);

assertNotContains(
  agent,
  /question-1\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check/,
  'consult-agent.md question-1 example must not hardcode skip-git.',
  failures
);

assertNotContains(
  agent,
  /question-2\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check/,
  'consult-agent.md question-2 example must not hardcode skip-git.',
  failures
);

assertNotContains(
  agent,
  /question-3\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check/,
  'consult-agent.md question-3 example must not hardcode skip-git.',
  failures
);

assertNotContains(skill, /Command: claude -p "QUESTION"/, 'SKILL.md must not include Claude command templates without env -u CLAUDECODE.', failures);

// --- ACP Transport assertions ---

assertContains(
  skill,
  /## ACP Transport/,
  'SKILL.md must contain ACP Transport section.',
  failures
);

assertContains(
  skill,
  /\| Claude \| `npx -y @anthropic-ai\/claude-code-acp`/,
  'SKILL.md must include Claude ACP adapter in provider table.',
  failures
);

assertContains(
  skill,
  /\| Gemini \| `gemini` \(native ACP\)/,
  'SKILL.md must include Gemini native ACP in provider table.',
  failures
);

assertContains(
  skill,
  /\| Codex \| `npx -y @zed-industries\/codex-acp`/,
  'SKILL.md must include Codex ACP adapter in provider table.',
  failures
);

assertContains(
  skill,
  /\| Copilot \| `copilot --acp --stdio`/,
  'SKILL.md must include Copilot ACP adapter in provider table.',
  failures
);

assertContains(
  skill,
  /\| Kiro \| `kiro-cli acp`/,
  'SKILL.md must include Kiro ACP adapter in provider table.',
  failures
);

assertContains(
  skill,
  /\| OpenCode \| `opencode acp`/,
  'SKILL.md must include OpenCode ACP adapter in provider table.',
  failures
);

assertContains(
  skill,
  /node acp\/run\.js --provider="PROVIDER" --question-file="\{AI_STATE_DIR\}\/consult\/question\.tmp"/,
  'SKILL.md ACP command template must use safe question-file passing.',
  failures
);

assertContains(
  skill,
  /If ACP available: use ACP transport/,
  'SKILL.md must document ACP transport preference.',
  failures
);

assertContains(
  skill,
  /If ACP unavailable: fall back to CLI transport/,
  'SKILL.md must document CLI fallback.',
  failures
);

assertContains(
  skill,
  /"transport": "acp"/,
  'SKILL.md session schema must include transport field.',
  failures
);

assertContains(
  command,
  /Bash\(node:\*\)/,
  'commands/consult.md must allow Bash(node:*) for ACP runner.',
  failures
);

assertContains(
  command,
  /gemini, codex, claude, opencode, copilot, kiro/,
  'commands/consult.md must include kiro in tool allow-list.',
  failures
);

assertContains(
  command,
  /node acp\/run\.js --detect --provider=/,
  'commands/consult.md must include ACP detection commands.',
  failures
);

assertContains(
  agent,
  /Bash\(node:\*\)/,
  'agents/consult-agent.md must allow Bash(node:*) for ACP runner.',
  failures
);

assertContains(
  agent,
  /Bash\(kiro-cli:\*\)/,
  'agents/consult-agent.md must allow Bash(kiro-cli:*) for Kiro.',
  failures
);

assertContains(
  skill,
  /Kiro is ACP-only/,
  'SKILL.md must note Kiro as ACP-only provider.',
  failures
);

if (failures.length > 0) {
  console.error('[ERROR] command template validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[OK] command template validation passed');
