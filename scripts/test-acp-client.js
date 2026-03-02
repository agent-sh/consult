#!/usr/bin/env node
/**
 * ACP Client Unit Tests
 *
 * Tests for acp/client.js, acp/providers.js, and acp/run.js argument parsing.
 * Uses a mock ACP agent subprocess for protocol testing.
 *
 * @license MIT
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const failures = [];
let passCount = 0;

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  } else {
    passCount++;
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    failures.push(`Expected error: ${message}`);
  } catch {
    passCount++;
  }
}

// --- Test 1: AcpClient constructor validation ---

const { AcpClient, PROTOCOL_VERSION } = require(path.join(root, 'acp', 'client'));

assertThrows(
  () => new AcpClient(),
  'AcpClient() with no args should throw'
);

assertThrows(
  () => new AcpClient({}),
  'AcpClient({}) with no command should throw'
);

assertThrows(
  () => new AcpClient({ command: '' }),
  'AcpClient({command: ""}) with empty command should throw'
);

{
  const client = new AcpClient({ command: 'echo', args: ['hello'] });
  assert(client.command === 'echo', 'AcpClient should store command');
  assert(client.args[0] === 'hello', 'AcpClient should store args');
  assert(client.sessionId === null, 'AcpClient sessionId should start null');
}

// --- Test 2: PROTOCOL_VERSION ---

assert(PROTOCOL_VERSION === 1, 'PROTOCOL_VERSION should be 1');

// --- Test 3: Provider registry ---

const { ACP_PROVIDERS, detectAcpSupport, isCommandAvailable } = require(path.join(root, 'acp', 'providers'));

const requiredProviders = ['claude', 'gemini', 'codex', 'copilot', 'kiro', 'opencode'];
for (const name of requiredProviders) {
  assert(ACP_PROVIDERS[name] !== undefined, `ACP_PROVIDERS must include ${name}`);
  const p = ACP_PROVIDERS[name];
  assert(typeof p.command === 'string' && p.command.length > 0, `${name} must have command`);
  assert(Array.isArray(p.args), `${name} must have args array`);
  assert(typeof p.detect === 'string', `${name} must have detect string`);
  assert(typeof p.name === 'string', `${name} must have display name`);
  assert(typeof p.supportsModel === 'boolean', `${name} must have supportsModel boolean`);
  assert(typeof p.supportsContinue === 'boolean', `${name} must have supportsContinue boolean`);
}

// Provider-specific checks
assert(ACP_PROVIDERS.claude.command === 'npx', 'Claude ACP should use npx');
assert(ACP_PROVIDERS.gemini.command === 'gemini', 'Gemini ACP should use gemini directly');
assert(ACP_PROVIDERS.codex.command === 'npx', 'Codex ACP should use npx');
assert(ACP_PROVIDERS.copilot.args.includes('--acp'), 'Copilot ACP should include --acp flag');
assert(ACP_PROVIDERS.copilot.args.includes('--stdio'), 'Copilot ACP should include --stdio flag');
assert(ACP_PROVIDERS.kiro.command === 'kiro-cli', 'Kiro ACP should use kiro-cli');
assert(ACP_PROVIDERS.kiro.args.includes('acp'), 'Kiro ACP should include acp arg');
assert(ACP_PROVIDERS.opencode.command === 'opencode', 'OpenCode ACP should use opencode');
assert(ACP_PROVIDERS.opencode.args.includes('acp'), 'OpenCode ACP should include acp arg');
assert(ACP_PROVIDERS.kiro.supportsModel === false, 'Kiro should not support model selection');
assert(ACP_PROVIDERS.copilot.supportsContinue === false, 'Copilot should not support continue');
assert(ACP_PROVIDERS.kiro.supportsContinue === false, 'Kiro should not support continue');

// --- Test 4: detectAcpSupport with unknown provider ---

(async () => {
  const result = await detectAcpSupport('nonexistent');
  assert(result.available === false, 'Unknown provider should not be available');
  assert(result.provider === null, 'Unknown provider should return null provider');
  assert(result.reason.includes('Unknown provider'), 'Should explain unknown provider');
})();

// --- Test 5: isCommandAvailable rejects unsafe characters ---

(async () => {
  const result = await isCommandAvailable('echo;rm');
  assert(result === false, 'isCommandAvailable should reject commands with semicolons');
})();

(async () => {
  const result = await isCommandAvailable('$(id)');
  assert(result === false, 'isCommandAvailable should reject commands with shell metacharacters');
})();

// --- Test 6: run.js argument parsing ---

// We test run.js by spawning it with invalid args and checking exit code/stderr
function testRunJs(args, expectedExitCode, stderrCheck, testName) {
  return new Promise((resolve) => {
    const proc = spawn('node', [path.join(root, 'acp', 'run.js'), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== expectedExitCode) {
        failures.push(`${testName}: expected exit code ${expectedExitCode}, got ${code}`);
      } else if (stderrCheck && !stderr.includes(stderrCheck)) {
        failures.push(`${testName}: stderr should contain "${stderrCheck}", got: ${stderr.slice(0, 200)}`);
      } else {
        passCount++;
      }
      resolve();
    });

    proc.on('error', () => {
      failures.push(`${testName}: failed to spawn process`);
      resolve();
    });
  });
}

async function runAsyncTests() {
  // Test: missing --provider
  await testRunJs(
    ['--question-file=test.tmp'],
    1, '--provider is required',
    'run.js should fail without --provider'
  );

  // Test: unknown provider
  await testRunJs(
    ['--provider=unknown', '--question-file=test.tmp'],
    1, 'Unknown provider',
    'run.js should fail with unknown provider'
  );

  // Test: missing question file (non-detect mode)
  await testRunJs(
    ['--provider=claude'],
    1, '--question-file is required',
    'run.js should fail without --question-file'
  );

  // Test: invalid timeout
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--timeout=-1'],
    1, '--timeout must be a positive integer',
    'run.js should fail with negative timeout'
  );

  // Test: invalid session ID
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--session-id=$(id)'],
    1, '--session-id contains invalid characters',
    'run.js should fail with shell metacharacters in session ID'
  );

  // Test: invalid model
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--model=bad model name'],
    1, '--model contains invalid characters',
    'run.js should fail with spaces in model name'
  );

  // Test: detect mode with a provider that's definitely not installed
  await testRunJs(
    ['--detect', '--provider=nonexistent'],
    1, 'Unknown provider',
    'run.js --detect should fail with unknown provider'
  );

  // Test: question file not found
  await testRunJs(
    ['--provider=gemini', '--question-file=/nonexistent/path/q.tmp', '--timeout=5000'],
    1, 'Cannot read question file',
    'run.js should fail when question file does not exist'
  );
}

// --- Test 7: ACP client env handling ---

{
  const client = new AcpClient({
    command: 'echo',
    env: { CLAUDECODE: undefined, CUSTOM_VAR: 'test' },
  });
  // Verify env merging logic (tested via constructor storage)
  assert(client.env.CLAUDECODE === undefined, 'Client should store undefined env values');
  assert(client.env.CUSTOM_VAR === 'test', 'Client should store custom env values');
}

// --- Test 8: Output sanitization in run.js ---

// Read run.js source and verify redaction patterns are present
const runSource = fs.readFileSync(path.join(root, 'acp', 'run.js'), 'utf8');
assert(runSource.includes('REDACTION_PATTERNS'), 'run.js must contain REDACTION_PATTERNS');
assert(runSource.includes('[REDACTED_API_KEY]'), 'run.js must contain API key redaction');
assert(runSource.includes('[REDACTED_TOKEN]'), 'run.js must contain token redaction');
assert(runSource.includes('[REDACTED_AWS_KEY]'), 'run.js must contain AWS key redaction');
assert(runSource.includes('Bearer [REDACTED]'), 'run.js must contain bearer redaction');
assert(runSource.includes('ANTHROPIC_API_KEY=[REDACTED]'), 'run.js must contain Anthropic key redaction');
assert(runSource.includes('OPENAI_API_KEY=[REDACTED]'), 'run.js must contain OpenAI key redaction');
assert(runSource.includes('GOOGLE_API_KEY=[REDACTED]'), 'run.js must contain Google key redaction');
assert(runSource.includes('GEMINI_API_KEY=[REDACTED]'), 'run.js must contain Gemini key redaction');

// --- Test 9: ACP client module exports ---

const clientModule = require(path.join(root, 'acp', 'client'));
assert(typeof clientModule.AcpClient === 'function', 'client.js must export AcpClient');
assert(typeof clientModule.PROTOCOL_VERSION === 'number', 'client.js must export PROTOCOL_VERSION');

const providersModule = require(path.join(root, 'acp', 'providers'));
assert(typeof providersModule.ACP_PROVIDERS === 'object', 'providers.js must export ACP_PROVIDERS');
assert(typeof providersModule.detectAcpSupport === 'function', 'providers.js must export detectAcpSupport');
assert(typeof providersModule.detectAllAcpSupport === 'function', 'providers.js must export detectAllAcpSupport');
assert(typeof providersModule.isCommandAvailable === 'function', 'providers.js must export isCommandAvailable');

// --- Test 10: ACP files exist ---

const acpFiles = ['acp/client.js', 'acp/providers.js', 'acp/run.js'];
for (const f of acpFiles) {
  assert(fs.existsSync(path.join(root, f)), `${f} must exist`);
}

// --- Run async tests and report ---

runAsyncTests().then(() => {
  // Small delay for any outstanding async assertions
  setTimeout(() => {
    if (failures.length > 0) {
      console.error(`[ERROR] ACP client tests: ${failures.length} failures, ${passCount} passed`);
      for (const f of failures) {
        console.error(`  - ${f}`);
      }
      process.exit(1);
    }
    console.log(`[OK] ACP client tests: ${passCount} passed`);
  }, 500);
});
