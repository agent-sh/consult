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

const failures = [];
const sessionIdPattern = /^[A-Za-z0-9._:-]+$/;

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
  /codex exec "QUESTION" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex base template must include --skip-git-repo-check and reasoning effort.',
  failures
);

assertContains(
  skill,
  /codex exec resume "SESSION_ID" "QUESTION" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex resume template must quote SESSION_ID and include required flags.',
  failures
);

assertContains(
  skill,
  /codex exec resume --last "QUESTION" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"/,
  'SKILL.md Codex resume --last template must include required flags.',
  failures
);

assertContains(
  skill,
  /\*\*--continue=SESSION_ID\*\*: If provided, SESSION_ID MUST match `\^\[A-Za-z0-9\._:-\]\+\$`\./,
  'SKILL.md must document SESSION_ID validation.',
  failures
);

const validSessionIds = ['abc-123', 'foo_bar', 'session.id:42'];
for (const id of validSessionIds) {
  if (!validateSessionId(id)) {
    failures.push(`validateSessionId should accept "${id}".`);
  }
}

const invalidSessionIds = ['abc 123', '$(id)', 'x;rm', 'x|cat', '"quoted"'];
for (const id of invalidSessionIds) {
  if (validateSessionId(id)) {
    failures.push(`validateSessionId should reject "${id}".`);
  }
}

assertContains(
  skill,
  /codex exec resume "SESSION_ID" "\$\(\s*cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\s*\)" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"/,
  'SKILL.md safe Codex resume template must quote SESSION_ID and include required flags.',
  failures
);

assertContains(
  skill,
  /codex exec resume --last "\$\(\s*cat "\{AI_STATE_DIR\}\/consult\/question\.tmp"\s*\)" --json -m "MODEL" --skip-git-repo-check -c model_reasoning_effort="LEVEL"/,
  'SKILL.md safe Codex resume --last template must include required flags.',
  failures
);

assertContains(
  agent,
  /question-1\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check -c model_reasoning_effort="high"/,
  'consult-agent.md question-1 example must include safe flags.',
  failures
);

assertContains(
  agent,
  /question-2\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check -c model_reasoning_effort="high"/,
  'consult-agent.md question-2 example must include safe flags.',
  failures
);

assertContains(
  agent,
  /question-3\.tmp"\)" --json -m "gpt-5\.3-codex" --skip-git-repo-check -c model_reasoning_effort="high"/,
  'consult-agent.md question-3 example must include safe flags.',
  failures
);

assertContains(
  command,
  /- MUST use safe-mode defaults \(`env -u CLAUDECODE \.\.\. --allowedTools "Read,Glob,Grep"` for Claude, `--skip-git-repo-check -c model_reasoning_effort` for Codex non-interactive exec mode only\)/,
  'commands/consult.md constraints line must explicitly include Claude and Codex safety requirements.',
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
