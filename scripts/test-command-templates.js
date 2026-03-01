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
  /--skip-git-repo-check -c model_reasoning_effort="high"/,
  'consult-agent.md multi-instance Codex examples must include safe flags.',
  failures
);

assertContains(
  command,
  /env -u CLAUDECODE .* --allowedTools "Read,Glob,Grep".*--skip-git-repo-check -c model_reasoning_effort/,
  'commands/consult.md constraints must include Claude and Codex safety requirements.',
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
