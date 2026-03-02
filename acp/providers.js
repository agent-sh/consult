#!/usr/bin/env node
/**
 * ACP Provider Registry
 *
 * Maps provider names to their ACP adapter spawn configurations.
 * Each provider entry defines how to start the ACP agent subprocess.
 *
 * @license MIT
 */

'use strict';

const { spawn } = require('child_process');

const isWindows = process.platform === 'win32';

/**
 * ACP provider configurations.
 *
 * Each entry defines:
 * - command: Binary to spawn
 * - args: Arguments for ACP mode
 * - detect: Command name to check availability (via which/where.exe)
 * - env: Extra env vars (set to undefined to delete from inherited env)
 * - name: Human-readable display name
 * - supportsModel: Whether the ACP agent accepts model selection
 * - supportsContinue: Whether session resume is supported
 */
const ACP_PROVIDERS = {
  claude: {
    command: 'npx',
    args: ['-y', '@anthropic-ai/claude-code-acp'],
    detect: 'npx',
    env: { CLAUDECODE: undefined },
    name: 'Claude',
    supportsModel: true,
    supportsContinue: true,
  },
  gemini: {
    command: 'gemini',
    args: [],
    detect: 'gemini',
    env: {},
    name: 'Gemini CLI',
    supportsModel: true,
    supportsContinue: true,
  },
  codex: {
    command: 'npx',
    args: ['-y', '@zed-industries/codex-acp'],
    detect: 'npx',
    env: {},
    name: 'Codex',
    supportsModel: true,
    supportsContinue: true,
  },
  copilot: {
    command: 'copilot',
    args: ['--acp', '--stdio'],
    detect: 'copilot',
    env: {},
    name: 'GitHub Copilot',
    supportsModel: true,
    supportsContinue: false,
  },
  kiro: {
    command: 'kiro-cli',
    args: ['acp'],
    detect: 'kiro-cli',
    env: {},
    name: 'Kiro',
    supportsModel: false,
    supportsContinue: false,
  },
  opencode: {
    command: 'opencode',
    args: ['acp'],
    detect: 'opencode',
    env: {},
    name: 'OpenCode',
    supportsModel: true,
    supportsContinue: true,
  },
};

/**
 * Check if a command is available on PATH.
 *
 * @param {string} command - Command name to check
 * @returns {Promise<boolean>}
 */
function isCommandAvailable(command) {
  return new Promise((resolve) => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(command)) {
      return resolve(false);
    }

    const checker = isWindows
      ? spawn('where.exe', [command], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
      : spawn('which', [command], { stdio: ['pipe', 'pipe', 'ignore'] });

    const timeout = setTimeout(() => {
      checker.kill();
      resolve(false);
    }, 5000);

    checker.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    checker.on('close', (code) => {
      clearTimeout(timeout);
      resolve(code === 0);
    });
  });
}

/**
 * Detect ACP support for a given provider.
 *
 * @param {string} providerName - Key from ACP_PROVIDERS
 * @returns {Promise<{available: boolean, provider: Object|null, reason: string}>}
 */
async function detectAcpSupport(providerName) {
  const provider = ACP_PROVIDERS[providerName];
  if (!provider) {
    return { available: false, provider: null, reason: `Unknown provider: ${providerName}` };
  }

  const available = await isCommandAvailable(provider.detect);
  if (!available) {
    return {
      available: false,
      provider,
      reason: `${provider.detect} not found on PATH`,
    };
  }

  return { available: true, provider, reason: 'ok' };
}

/**
 * Detect ACP support for all providers in parallel.
 *
 * @returns {Promise<Object>} Map of providerName -> { available, provider, reason }
 */
async function detectAllAcpSupport() {
  const names = Object.keys(ACP_PROVIDERS);
  const results = await Promise.all(names.map(detectAcpSupport));
  const map = {};
  names.forEach((name, i) => { map[name] = results[i]; });
  return map;
}

module.exports = {
  ACP_PROVIDERS,
  detectAcpSupport,
  detectAllAcpSupport,
  isCommandAvailable,
};
