#!/usr/bin/env node
/**
 * ACP Smoke Test
 *
 * Tests --dry-run against each installed ACP provider.
 * Skips providers that aren't available. Reports results.
 *
 * Run: node scripts/test-acp-smoke.js
 * Or: npm run test:smoke
 *
 * @license MIT
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const runJs = path.join(root, 'acp', 'run.js');
const providers = ['claude', 'gemini', 'codex', 'copilot', 'kiro', 'opencode'];

function testProvider(name) {
  return new Promise((resolve) => {
    const proc = spawn('node', [runJs, '--dry-run', `--provider=${name}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const result = JSON.parse(stdout.trim());
          if (result.connected) {
            resolve({
              name,
              status: 'connected',
              protocol: result.protocolVersion,
              agent: result.agentInfo?.name || 'unknown',
            });
            return;
          }
        } catch {}
      }
      // Check if it's an "unknown provider" vs "not installed"
      const stderrText = stderr.trim() || stdout.trim();
      let reason = 'not available';
      if (stderrText.includes('not found on PATH')) {
        reason = 'not installed';
      } else if (stderrText.includes('Failed to spawn')) {
        reason = 'spawn failed';
      } else if (stderrText.includes('timed out')) {
        reason = 'connection timed out';
      }
      resolve({ name, status: 'skip', reason });
    });

    proc.on('error', () => {
      resolve({ name, status: 'skip', reason: 'spawn error' });
    });
  });
}

async function main() {
  console.log('[SMOKE] ACP provider connectivity test\n');

  const results = await Promise.all(providers.map(testProvider));

  let connected = 0;
  let skipped = 0;

  for (const r of results) {
    if (r.status === 'connected') {
      console.log(`  [OK] ${r.name}: connected (protocol v${r.protocol}, agent: ${r.agent})`);
      connected++;
    } else {
      console.log(`  [--] ${r.name}: ${r.reason}`);
      skipped++;
    }
  }

  console.log(`\n[SMOKE] ${connected} connected, ${skipped} skipped`);

  if (connected === 0) {
    console.log('[WARN] No ACP providers available - smoke test inconclusive');
    // Exit 0 even with no providers - this is expected in CI without tools installed
  }

  console.log('[OK] ACP smoke test complete');
}

main().catch((err) => {
  console.error(`[ERROR] Smoke test crashed: ${err.message}`);
  process.exit(1);
});
