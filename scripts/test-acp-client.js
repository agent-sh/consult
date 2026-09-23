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
assert(ACP_PROVIDERS.kiro.supportsContinue === true, 'Kiro supports session continue via ACP loadSession');

// Tests 4-5 are collected into runAsyncTests below

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
  // --- Test 4: detectAcpSupport with unknown provider ---
  {
    const result = await detectAcpSupport('nonexistent');
    assert(result.available === false, 'Unknown provider should not be available');
    assert(result.provider === null, 'Unknown provider should return null provider');
    assert(result.reason.includes('Unknown provider'), 'Should explain unknown provider');
  }

  // --- Test 5: isCommandAvailable ---
  {
    const r1 = await isCommandAvailable('echo;rm');
    assert(r1 === false, 'isCommandAvailable should reject commands with semicolons');

    const r2 = await isCommandAvailable('$(id)');
    assert(r2 === false, 'isCommandAvailable should reject commands with shell metacharacters');

    const r3 = await isCommandAvailable('node');
    assert(r3 === true, 'isCommandAvailable should find node on PATH');
  }

  // --- Test 5b: detectAllAcpSupport ---
  {
    const { detectAllAcpSupport } = require(path.join(root, 'acp', 'providers'));
    const allResults = await detectAllAcpSupport();
    assert(typeof allResults === 'object', 'detectAllAcpSupport returns an object');
    for (const name of ['claude', 'gemini', 'codex', 'copilot', 'kiro', 'opencode']) {
      assert(name in allResults, `detectAllAcpSupport result includes ${name}`);
      assert('available' in allResults[name], `${name} has available field`);
    }
  }

  // --- Test 6: run.js argument parsing ---

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

  // Test: timeout=0 should fail
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--timeout=0'],
    1, '--timeout must be a positive integer',
    'run.js should fail with timeout=0'
  );

  // Test: NaN timeout should fail
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--timeout=abc'],
    1, '--timeout must be a positive integer',
    'run.js should fail with NaN timeout'
  );

  // Test: leading-dash session ID should fail
  await testRunJs(
    ['--provider=claude', '--question-file=test.tmp', '--session-id=-bad'],
    1, '--session-id contains invalid characters',
    'run.js should fail with leading-dash session ID'
  );

  // Test: question file not found (relative path within cwd)
  await testRunJs(
    ['--provider=gemini', '--question-file=nonexistent-file-xyz.tmp', '--timeout=5000'],
    1, 'Cannot read question file',
    'run.js should fail when question file does not exist'
  );

  // Test: question file outside cwd (absolute path)
  await testRunJs(
    ['--provider=gemini', '--question-file=/tmp/outside-cwd-test.tmp', '--timeout=5000'],
    1, '--question-file must be within cwd or a known state directory',
    'run.js should reject question file outside cwd'
  );
}

// --- Test 6b: Mock ACP protocol test ---

const MOCK_AGENT_SCRIPT = `
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', chunk => {
  buf += chunk;
  const lines = buf.split('\\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.method === 'initialize') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: msg.id,
          result: { protocolVersion: 1, agentCapabilities: {}, agentInfo: { name: 'mock-agent', version: '1.0.0' } }
        }) + '\\n');
      } else if (msg.method === 'session/new') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: msg.id,
          result: { sessionId: 'mock-session-123' }
        }) + '\\n');
      } else if (msg.method === 'session/prompt') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', method: 'session/update',
          params: { sessionId: 'mock-session-123', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello from mock' } } }
        }) + '\\n');
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0', id: msg.id,
          result: { stopReason: 'end_turn', usage: null }
        }) + '\\n');
      }
    } catch {}
  }
});
`;

async function testMockAcpProtocol() {
  const client = new AcpClient({ command: 'node', args: ['-e', MOCK_AGENT_SCRIPT], timeout: 10000 });

  await client.connect();
  assert(true, 'Mock ACP agent connects successfully');

  const initResult = await client.initialize();
  assert(initResult.protocolVersion === 1, 'Initialize returns protocolVersion 1');
  assert(initResult.agentInfo.name === 'mock-agent', 'Initialize returns agent name');

  const sessionResult = await client.newSession();
  assert(sessionResult.sessionId === 'mock-session-123', 'Session/new returns sessionId');
  assert(client.sessionId === 'mock-session-123', 'Client stores sessionId');

  const chunks = [];
  client.on('chunk', (text) => chunks.push(text));

  const promptResult = await client.prompt('test question');
  assert(promptResult.text === 'Hello from mock', 'Prompt collects response text');
  assert(promptResult.stopReason === 'end_turn', 'Prompt returns stop reason');
  assert(chunks.length === 1, 'Chunk event fired once');
  assert(chunks[0] === 'Hello from mock', 'Chunk contains correct text');

  await client.close();
  assert(true, 'Mock ACP agent closes cleanly');
}

// --- Test 6c: model selection and session resume against a mock agent ---

const MOCK_AGENT_CONFIG = `
process.stdin.setEncoding('utf8');
let buf = '';
let model = 'm-small';
const seen = [];
const send = o => process.stdout.write(JSON.stringify(o) + '\\n');
process.stdin.on('data', chunk => {
  buf += chunk;
  const lines = buf.split('\\n');
  buf = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    seen.push(msg.method);
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true } } });
    } else if (msg.method === 'session/new' || msg.method === 'session/load') {
      if (msg.method === 'session/load') {
        send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: msg.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'REPLAYED' } } } });
      }
      send({ jsonrpc: '2.0', id: msg.id, result: { sessionId: msg.params.sessionId || 'cfg-1', configOptions: [
        { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: model,
          options: [{ group: 'g', name: 'G', options: [{ value: 'm-small', name: 'S' }, { value: 'm-big', name: 'B' }] }] } ] } });
    } else if (msg.method === 'session/set_config_option') {
      model = msg.params.value;
      send({ jsonrpc: '2.0', id: msg.id, result: { configOptions: [] } });
    } else if (msg.method === 'session/prompt') {
      send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: msg.params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'answered by ' + model + ' after ' + seen.join(',') } } } });
      send({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } });
    }
  }
});
`;

async function testMockModelAndResume() {
  const client = new AcpClient({ command: 'node', args: ['-e', MOCK_AGENT_CONFIG], timeout: 10000 });
  await client.connect();
  await client.initialize();
  assert(client.canLoadSession === true, 'canLoadSession reflects agentCapabilities.loadSession');
  const session = await client.newSession();
  const used = await client.setModel('m-big', session);
  assert(used === 'm-big', 'setModel returns the selected model');
  let unsupportedCode = null;
  try { await client.setModel('m-huge', session); } catch (e) { unsupportedCode = e.code; }
  assert(unsupportedCode === 'model-unsupported', 'setModel rejects a model the agent does not offer');
  const r = await client.prompt('q');
  assert(r.text.startsWith('answered by m-big'), 'prompt runs on the selected model');
  await client.close();

  const resumed = new AcpClient({ command: 'node', args: ['-e', MOCK_AGENT_CONFIG], timeout: 10000 });
  await resumed.connect();
  await resumed.initialize();
  await resumed.loadSession('prev-7');
  assert(resumed.sessionId === 'prev-7', 'loadSession keeps the resumed session id');
  const r2 = await resumed.prompt('q2');
  assert(!r2.text.includes('REPLAYED'), 'replayed history is not returned as the answer');
  assert(r2.text.includes('session/load'), 'resume uses session/load, not session/new');
  await resumed.close();

  // An agent without model options: setModel must refuse instead of pretending.
  const plain = new AcpClient({ command: 'node', args: ['-e', MOCK_AGENT_SCRIPT], timeout: 10000 });
  await plain.connect();
  await plain.initialize();
  const s = await plain.newSession();
  let code = null;
  try { await plain.setModel('anything', s); } catch (e) { code = e.code; }
  assert(code === 'model-unsupported', 'setModel refuses when the agent exposes no model selection');
  let loadErr = null;
  try { await plain.loadSession('x'); } catch (e) { loadErr = e.message; }
  assert(/does not support session\/load/.test(loadErr || ''), 'loadSession refuses without the capability');
  await plain.close();
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

async function runAllAsyncTests() {
  await testMockAcpProtocol();
  await testMockModelAndResume();
  await runAsyncTests();
}

runAllAsyncTests().then(() => {
  if (failures.length > 0) {
    console.error(`[ERROR] ACP client tests: ${failures.length} failures, ${passCount} passed`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
  console.log(`[OK] ACP client tests: ${passCount} passed`);
}).catch((err) => {
  console.error(`[ERROR] Test suite crashed: ${err.message}`);
  process.exit(1);
});
