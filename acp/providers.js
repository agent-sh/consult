/**
 * ACP Provider Registry
 *
 * Loads provider configs from providers.json (bundled defaults) and merges
 * user overrides from {stateDir}/consult/providers.json if present.
 *
 * @license MIT
 */

'use strict';

const { spawn } = require('child_process');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

const isWindows = process.platform === 'win32';

// Load bundled defaults
const BUNDLED_PROVIDERS = require('./providers.json');

// Convert JSON null env values to undefined (JSON can't represent undefined)
function normalizeEnv(provider) {
  if (!provider.env) return provider;
  const env = {};
  for (const [k, v] of Object.entries(provider.env)) {
    env[k] = v === null ? undefined : v;
  }
  return { ...provider, env };
}

/**
 * Load providers: bundled defaults merged with user overrides.
 *
 * SECURITY: Only loads overrides from user home directory (~/.claude/consult/providers.json).
 * Repo-scoped overrides (.claude/consult/providers.json in cwd) are NOT loaded
 * because a malicious repo could redirect consultations to attacker-controlled endpoints.
 *
 * @param {Object} [options]
 * @param {boolean} [options.reportSources=false] If true, track which source contributed each provider
 * @returns {Object} providers map (or {providers, sources} if reportSources)
 */
function loadProviders(options) {
  const reportSources = options && options.reportSources;
  const providers = {};
  const sources = {};

  for (const [name, config] of Object.entries(BUNDLED_PROVIDERS)) {
    providers[name] = normalizeEnv(config);
    if (reportSources) sources[name] = 'bundled (acp/providers.json)';
  }

  // Only trust home-dir overrides (not repo-scoped - supply chain risk)
  const trustedPaths = [
    join(homedir(), '.claude', 'consult', 'providers.json'),
    join(homedir(), '.opencode', 'consult', 'providers.json'),
    join(homedir(), '.codex', 'consult', 'providers.json'),
  ];

  for (const userFile of trustedPaths) {
    if (existsSync(userFile)) {
      try {
        const userProviders = JSON.parse(readFileSync(userFile, 'utf8'));
        for (const [name, config] of Object.entries(userProviders)) {
          if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
          providers[name] = normalizeEnv({ ...providers[name], ...config });
          if (reportSources) sources[name] = userFile;
        }
      } catch {
        // Ignore malformed user config
      }
      break; // Use first found
    }
  }

  if (reportSources) return { providers, sources };
  return providers;
}

// Loaded once at module init
const ACP_PROVIDERS = loadProviders();

/**
 * Check if a command is available on PATH.
 * @param {string} command
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
 * @param {string} providerName
 * @returns {Promise<{available: boolean, provider: Object|null, reason: string}>}
 */
async function detectAcpSupport(providerName) {
  const provider = ACP_PROVIDERS[providerName];
  if (!provider) {
    return { available: false, provider: null, reason: `Unknown provider: ${providerName}` };
  }

  const available = await isCommandAvailable(provider.detect);
  if (!available) {
    return { available: false, provider, reason: `${provider.detect} not found on PATH` };
  }

  return { available: true, provider, reason: 'ok' };
}

/**
 * Detect ACP support for all providers in parallel.
 * @returns {Promise<Object>}
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
  loadProviders,
  detectAcpSupport,
  detectAllAcpSupport,
  isCommandAvailable,
};
