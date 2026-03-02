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

const { readFileSync, unlinkSync } = require('fs');
const { resolve: resolvePath, join: joinPath } = require('path');
const { homedir } = require('os');
const { AcpClient } = require('./client');
const { ACP_PROVIDERS, detectAcpSupport, loadProviders } = require('./providers');

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

/**
 * Detect high-entropy strings that may be secrets missed by pattern matching.
 * Checks for base64-like or hex strings >= 32 chars with Shannon entropy > 4.0.
 */
function hasHighEntropy(token) {
  if (token.length < 32) return false;
  const freq = {};
  for (const ch of token) freq[ch] = (freq[ch] || 0) + 1;
  let entropy = 0;
  const len = token.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy > 4.0;
}

const HIGH_ENTROPY_PATTERN = /(?<![a-zA-Z0-9_/.-])[A-Za-z0-9+/=_-]{32,}(?![a-zA-Z0-9_/.-])/g;

function sanitize(text) {
  let result = text;
  let redacted = false;

  // Phase 1: known patterns (blocklist)
  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) redacted = true;
  }

  // Phase 2: entropy-based fallback for unknown secret formats
  result = result.replace(HIGH_ENTROPY_PATTERN, (match) => {
    // Skip known safe patterns: file paths, URLs, model IDs, common base64 content
    if (match.includes('/') && match.includes('.')) return match; // likely a path
    if (match.startsWith('eyJ')) return match; // JWT header (intentional content, not a secret)
    if (/^[0-9a-f]+$/i.test(match) && match.length === 40) return match; // git SHA
    if (hasHighEntropy(match)) {
      redacted = true;
      return '[REDACTED_HIGH_ENTROPY]';
    }
    return match;
  });

  if (redacted) {
    result += '\n[WARN] Sensitive tokens were redacted from the response.';
  }
  return result;
}

// --- Argument parsing ---

const SESSION_ID_PATTERN = /^(?!-)[A-Za-z0-9._:-]+$/;

function parseArgs(argv) {
  const args = { detect: false, dryRun: false, showConfig: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--detect') {
      args.detect = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--show-resolved-config') {
      args.showConfig = true;
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
    } else if (arg.startsWith('--effort=')) {
      args.effort = arg.slice('--effort='.length);
    } else if (arg.startsWith('--max-turns=')) {
      args.maxTurns = parseInt(arg.slice('--max-turns='.length), 10);
    }
  }
  return args;
}

function validateArgs(args) {
  const errors = [];
  if (args.showConfig) return errors; // no validation needed for config display
  if (!args.provider) {
    errors.push('--provider is required');
  } else if (!ACP_PROVIDERS[args.provider]) {
    errors.push(`Unknown provider: ${args.provider}. Valid: ${Object.keys(ACP_PROVIDERS).join(', ')}`);
  }
  if (!args.detect && !args.dryRun && !args.showConfig) {
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

// --- Show resolved config mode ---

function runShowConfig() {
  const { providers, sources } = loadProviders({ reportSources: true });
  const output = { providers: {}, sources };
  for (const [name, config] of Object.entries(providers)) {
    output.providers[name] = {
      command: config.command,
      args: config.args,
      detect: config.detect,
      name: config.name,
      supportsModel: config.supportsModel,
      supportsContinue: config.supportsContinue,
    };
  }
  console.log(JSON.stringify(output, null, 2));
}

// --- Dry-run mode ---

async function runDryRun(providerName) {
  const provider = ACP_PROVIDERS[providerName];
  const client = new AcpClient({
    command: provider.command,
    args: provider.args,
    env: provider.env,
    cwd: process.cwd(),
    timeout: 15000,
  });

  try {
    await client.connect();
    const initResult = await client.initialize();
    const output = {
      provider: providerName,
      connected: true,
      protocolVersion: initResult.protocolVersion || 1,
      agentInfo: initResult.agentInfo || {},
      agentCapabilities: initResult.agentCapabilities || {},
    };
    console.log(JSON.stringify(output));
  } catch (err) {
    const output = {
      provider: providerName,
      connected: false,
      error: sanitize(err.message),
    };
    console.log(JSON.stringify(output));
    process.exit(1);
  } finally {
    await client.close();
  }
}

// --- Consultation mode ---

async function runConsult(args) {
  const provider = ACP_PROVIDERS[args.provider];
  const timeout = args.timeout || 120000;
  const startTime = Date.now();

  const resolvedQuestionPath = resolvePath(args.questionFile);
  const cwd = process.cwd();
  const home = homedir();
  const safePrefixes = [
    cwd + '/',
    joinPath(home, '.claude/'),
    joinPath(home, '.opencode/'),
    joinPath(home, '.codex/'),
  ];
  if (!safePrefixes.some(p => resolvedQuestionPath.startsWith(p))) {
    writeError('--question-file must be within cwd or a known state directory');
    process.exit(1);
  }

  let question;
  try {
    question = readFileSync(resolvedQuestionPath, 'utf8');
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
    await client.initialize();
    await client.newSession(process.cwd());
    const result = await client.prompt(question);

    const durationMs = Date.now() - startTime;
    const responseText = sanitize(result.text || '');

    // Validate response - provider returned something meaningful
    if (!responseText.trim()) {
      writeError(`Provider ${args.provider} returned an empty response (stopReason: ${result.stopReason})`, durationMs);
      process.exit(1);
    }

    const output = {
      tool: args.provider,
      model: args.model || args.provider,
      effort: args.effort || 'medium',
      duration_ms: durationMs,
      response: responseText,
      session_id: client.sessionId || null,
      continuable: provider.supportsContinue,
      transport: 'acp',
    };

    console.log(JSON.stringify(output));
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err.message || '';

    // Surface actionable error messages for common failures
    if (msg.includes('Failed to spawn')) {
      writeError(`Provider "${args.provider}" not installed. Install ${provider.command} or check PATH.`, durationMs);
    } else if (msg.includes('timed out')) {
      writeError(`Provider "${args.provider}" timed out after ${timeout}ms. Try --effort=low or increase --timeout.`, durationMs);
    } else if (msg.includes('API') && (msg.includes('key') || msg.includes('401') || msg.includes('403'))) {
      writeError(`Provider "${args.provider}" authentication failed. Check your API key / credentials.`, durationMs);
    } else if (msg.includes('invalid model')) {
      writeError(`Invalid model for "${args.provider}": ${args.model || 'default'}. Check --model value.`, durationMs);
    } else {
      writeError(msg, durationMs);
    }
    process.exit(1);
  } finally {
    cleanupTempFile(resolvedQuestionPath);
    await client.close();
  }
}

function cleanupTempFile(filePath) {
  if (!filePath) return;
  try { unlinkSync(filePath); } catch { /* already gone */ }
}

function writeError(message, durationMs) {
  const output = {
    error: sanitize(message),
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

  if (args.showConfig) {
    runShowConfig();
  } else if (args.detect) {
    await runDetect(args.provider);
  } else if (args.dryRun) {
    await runDryRun(args.provider);
  } else {
    await runConsult(args);
  }
}

main().catch((err) => {
  writeError(err.message);
  process.exit(1);
});
