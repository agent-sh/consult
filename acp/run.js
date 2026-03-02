#!/usr/bin/env node
/**
 * ACP Runner - CLI entry point for ACP consultations
 *
 * Encapsulates the full ACP lifecycle (spawn, initialize, session, prompt,
 * collect response, shutdown) into a single command invocable via Bash.
 *
 * Usage:
 *   node acp/run.js --provider=claude --question-file=q.tmp --timeout=120000
 *   node acp/run.js --detect --provider=claude
 *
 * Output: JSON envelope on stdout matching consult skill format.
 * Errors: JSON on stderr, non-zero exit code.
 *
 * @license MIT
 */

'use strict';

const { readFileSync } = require('fs');
const { resolve: resolvePath } = require('path');
const { AcpClient } = require('./client');
const { ACP_PROVIDERS, detectAcpSupport } = require('./providers');

// --- Output sanitization patterns ---

const REDACTION_PATTERNS = [
  [/sk-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
  [/sk-proj-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
  [/sk-ant-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]'],
  [/AIza[a-zA-Z0-9_-]{30,}/g, '[REDACTED_API_KEY]'],
  [/ghp_[a-zA-Z0-9]{36,}/g, '[REDACTED_TOKEN]'],
  [/gho_[a-zA-Z0-9]{36,}/g, '[REDACTED_TOKEN]'],
  [/github_pat_[a-zA-Z0-9_]{20,}/g, '[REDACTED_TOKEN]'],
  [/ANTHROPIC_API_KEY=[^\s]+/g, 'ANTHROPIC_API_KEY=[REDACTED]'],
  [/OPENAI_API_KEY=[^\s]+/g, 'OPENAI_API_KEY=[REDACTED]'],
  [/GOOGLE_API_KEY=[^\s]+/g, 'GOOGLE_API_KEY=[REDACTED]'],
  [/GEMINI_API_KEY=[^\s]+/g, 'GEMINI_API_KEY=[REDACTED]'],
  [/AKIA[A-Z0-9]{16}/g, '[REDACTED_AWS_KEY]'],
  [/ASIA[A-Z0-9]{16}/g, '[REDACTED_AWS_KEY]'],
  [/Bearer [a-zA-Z0-9_-]{20,}/g, 'Bearer [REDACTED]'],
];

function sanitize(text) {
  let result = text;
  let redacted = false;
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) redacted = true;
  }
  if (redacted) {
    result += '\n[WARN] Sensitive tokens were redacted from the response.';
  }
  return result;
}

// --- Argument parsing ---

const SESSION_ID_PATTERN = /^(?!-)[A-Za-z0-9._:-]+$/;

function parseArgs(argv) {
  const args = { detect: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--detect') {
      args.detect = true;
    } else if (arg.startsWith('--provider=')) {
      args.provider = arg.slice('--provider='.length);
    } else if (arg.startsWith('--question-file=')) {
      args.questionFile = arg.slice('--question-file='.length);
    } else if (arg.startsWith('--timeout=')) {
      args.timeout = parseInt(arg.slice('--timeout='.length), 10);
    } else if (arg.startsWith('--model=')) {
      args.model = arg.slice('--model='.length);
    } else if (arg.startsWith('--session-id=')) {
      args.sessionId = arg.slice('--session-id='.length);
    }
  }
  return args;
}

function validateArgs(args) {
  const errors = [];
  if (!args.provider) {
    errors.push('--provider is required');
  } else if (!ACP_PROVIDERS[args.provider]) {
    errors.push(`Unknown provider: ${args.provider}. Valid: ${Object.keys(ACP_PROVIDERS).join(', ')}`);
  }
  if (!args.detect) {
    if (!args.questionFile) {
      errors.push('--question-file is required');
    }
    if (args.timeout !== undefined && (isNaN(args.timeout) || args.timeout <= 0)) {
      errors.push('--timeout must be a positive integer');
    }
    if (args.sessionId && !SESSION_ID_PATTERN.test(args.sessionId)) {
      errors.push('--session-id contains invalid characters');
    }
    if (args.model && !/^[A-Za-z0-9._:/-]+$/.test(args.model)) {
      errors.push('--model contains invalid characters');
    }
  }
  return errors;
}

// --- Detect mode ---

async function runDetect(providerName) {
  const result = await detectAcpSupport(providerName);
  const output = {
    provider: providerName,
    acp_available: result.available,
    name: result.provider ? result.provider.name : providerName,
  };
  if (!result.available) {
    output.reason = result.reason;
  }
  console.log(JSON.stringify(output));
  process.exit(result.available ? 0 : 1);
}

// --- Consultation mode ---

async function runConsult(args) {
  const provider = ACP_PROVIDERS[args.provider];
  const timeout = args.timeout || 120000;
  const startTime = Date.now();

  let question;
  try {
    question = readFileSync(resolvePath(args.questionFile), 'utf8');
  } catch (err) {
    writeError(`Cannot read question file: ${err.message}`);
    process.exit(1);
  }

  if (!question.trim()) {
    writeError('Question file is empty');
    process.exit(1);
  }

  const client = new AcpClient({
    command: provider.command,
    args: provider.args,
    env: provider.env,
    cwd: process.cwd(),
    timeout,
  });

  try {
    await client.connect();
    const initResult = await client.initialize();
    const agentInfo = initResult.agentInfo || {};
    await client.newSession(process.cwd());
    const result = await client.prompt(question);

    const durationMs = Date.now() - startTime;
    const responseText = sanitize(result.text || '');

    const output = {
      tool: args.provider,
      model: args.model || agentInfo.name || args.provider,
      effort: 'medium',
      duration_ms: durationMs,
      response: responseText,
      session_id: client.sessionId || null,
      continuable: provider.supportsContinue,
      transport: 'acp',
    };

    console.log(JSON.stringify(output));
  } catch (err) {
    const durationMs = Date.now() - startTime;
    writeError(err.message, durationMs);
    process.exit(1);
  } finally {
    await client.close();
  }
}

function writeError(message, durationMs) {
  const output = {
    error: message,
    transport: 'acp',
  };
  if (durationMs !== undefined) output.duration_ms = durationMs;
  process.stderr.write(JSON.stringify(output) + '\n');
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv);
  const errors = validateArgs(args);

  if (errors.length > 0) {
    writeError(errors.join('; '));
    process.exit(1);
  }

  if (args.detect) {
    await runDetect(args.provider);
  } else {
    await runConsult(args);
  }
}

main().catch((err) => {
  writeError(err.message);
  process.exit(1);
});
