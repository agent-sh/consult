#!/usr/bin/env node
/**
 * ACP (Agent Client Protocol) Client
 *
 * JSON-RPC 2.0 client for communicating with ACP agents over stdio.
 * Uses only Node.js builtins (child_process, readline, events).
 *
 * Protocol spec: https://agentclientprotocol.com
 * Protocol version: 1 (integer)
 *
 * @license MIT
 */

'use strict';

const { spawn } = require('child_process');
const { createInterface } = require('readline');
const { EventEmitter } = require('events');

const PROTOCOL_VERSION = 1;

class AcpClient extends EventEmitter {
  #proc = null;
  #rl = null;
  #nextId = 0;
  #pending = new Map(); // id -> { resolve, reject, timer }
  #sessionId = null;
  #responseChunks = [];
  #closed = false;
  #timeout;

  /**
   * @param {Object} options
   * @param {string} options.command - Binary to spawn (e.g., 'gemini', 'npx')
   * @param {string[]} options.args - Arguments (e.g., ['-y', '@zed-industries/codex-acp'])
   * @param {Object} [options.env] - Extra env vars to merge with process.env
   * @param {string} [options.cwd] - Working directory for subprocess
   * @param {number} [options.timeout=120000] - Request timeout in ms
   */
  constructor(options) {
    super();
    if (!options || !options.command) {
      throw new Error('AcpClient requires options.command');
    }
    this.command = options.command;
    this.args = options.args || [];
    this.env = options.env || {};
    this.cwd = options.cwd || process.cwd();
    this.#timeout = options.timeout || 120000;
  }

  /** Spawn the ACP agent subprocess and wire up stdio streams. */
  async connect() {
    if (this.#proc) throw new Error('Already connected');

    const env = { ...process.env };
    for (const [key, val] of Object.entries(this.env)) {
      if (val === undefined) delete env[key];
      else env[key] = val;
    }

    this.#proc = spawn(this.command, this.args, {
      cwd: this.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    await new Promise((resolve, reject) => {
      this.#proc.once('spawn', resolve);
      this.#proc.once('error', (err) => {
        this.#proc = null;
        reject(new Error(`Failed to spawn ${this.command}: ${err.message}`));
      });
    });

    this.#rl = createInterface({ input: this.#proc.stdout });
    this.#rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        this.#dispatch(JSON.parse(trimmed));
      } catch {
        // Ignore non-JSON lines (agent diagnostics)
      }
    });

    this.#proc.on('close', () => {
      this.#closed = true;
      if (this.#rl) { this.#rl.close(); this.#rl = null; }
      for (const [id, pending] of this.#pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error('ACP agent process exited'));
      }
      this.#pending.clear();
      this.emit('close');
    });

    this.#proc.stderr.on('data', (chunk) => {
      this.emit('stderr', chunk.toString());
    });
  }

  /** Send initialize handshake. Returns agent capabilities. */
  async initialize(clientInfo) {
    const result = await this.#request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: clientInfo || { name: 'agentsys-consult', version: '1.0.0' },
    });
    return result;
  }

  /** Create a new session. Returns { sessionId, modes, models, configOptions }. */
  async newSession(cwd, mcpServers) {
    const result = await this.#request('session/new', {
      cwd: cwd || this.cwd,
      mcpServers: mcpServers || [],
    });
    this.#sessionId = result.sessionId;
    return result;
  }

  /**
   * Send a prompt and collect the full response.
   * Blocks until the agent finishes the turn.
   *
   * @param {string} text - Prompt text
   * @param {string} [sessionId] - Override session ID
   * @returns {Promise<{text: string, stopReason: string, usage: Object|null}>}
   */
  async prompt(text, sessionId) {
    this.#responseChunks = [];
    const sid = sessionId || this.#sessionId;
    if (!sid) throw new Error('No session ID - call newSession() first');

    const result = await this.#request('session/prompt', {
      sessionId: sid,
      prompt: [{ type: 'text', text }],
    });

    return {
      text: this.#responseChunks.join(''),
      stopReason: result.stopReason || 'end_turn',
      usage: result.usage || null,
    };
  }

  /** Cancel an in-progress prompt (notification, no response). */
  cancel(sessionId) {
    this.#send({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: { sessionId: sessionId || this.#sessionId },
    });
  }

  /** Get the current session ID. */
  get sessionId() {
    return this.#sessionId;
  }

  /** Gracefully shut down the subprocess. Drains in-flight requests first. */
  async close() {
    if (!this.#proc || this.#closed) return;

    // Drain: cancel in-flight prompt and wait up to 2s for pending responses
    if (this.#sessionId && this.#pending.size > 0) {
      this.cancel();
      await new Promise(r => setTimeout(r, 2000));
    }

    this.#proc.kill('SIGTERM');

    await new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        if (this.#proc && !this.#closed) {
          this.#proc.kill('SIGKILL');
        }
      }, 5000);

      const onClose = () => {
        clearTimeout(killTimer);
        resolve();
      };

      if (this.#closed) {
        clearTimeout(killTimer);
        resolve();
      } else {
        this.#proc.once('close', onClose);
      }
    });

    if (this.#rl) {
      this.#rl.close();
      this.#rl = null;
    }
    this.#proc = null;
  }

  #send(msg) {
    if (this.#closed || !this.#proc) return;
    const line = JSON.stringify(msg) + '\n';
    try {
      this.#proc.stdin.write(line);
    } catch {
      // Subprocess stdin may be closed
    }
  }

  #request(method, params) {
    return new Promise((resolve, reject) => {
      if (this.#closed) {
        return reject(new Error('ACP client is closed'));
      }
      const id = this.#nextId++;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`ACP request '${method}' timed out after ${this.#timeout}ms`));
      }, this.#timeout);

      this.#pending.set(id, { resolve, reject, timer });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  #dispatch(msg) {
    if ('id' in msg && !('method' in msg)) {
      const pending = this.#pending.get(msg.id);
      if (!pending) return;
      this.#pending.delete(msg.id);
      clearTimeout(pending.timer);

      if ('error' in msg) {
        const err = msg.error;
        pending.reject(new Error(`ACP error ${err.code}: ${err.message}`));
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    if ('id' in msg && 'method' in msg) {
      this.#handleAgentRequest(msg);
      return;
    }

    if ('method' in msg && !('id' in msg)) {
      this.#handleNotification(msg);
    }
  }

  #handleAgentRequest(msg) {
    const { id, method, params } = msg;

    if (method === 'session/request_permission') {
      // Auto-approve read operations, reject writes
      const toolCall = params && params.toolCall;
      const kind = toolCall && toolCall.kind;
      const isReadOnly = kind === 'read' || kind === 'search' || kind === 'think';

      if (isReadOnly) {
        const allowOption = (params.options || []).find(o =>
          o.kind === 'allow_once'
        );
        this.#send({
          jsonrpc: '2.0',
          id,
          result: {
            outcome: {
              outcome: 'selected',
              optionId: allowOption ? allowOption.optionId : 'allow',
            },
          },
        });
      } else {
        // Reject non-read operations for safety
        this.#send({
          jsonrpc: '2.0',
          id,
          result: { outcome: { outcome: 'cancelled' } },
        });
      }
      return;
    }

    // Unknown agent request - return method not found
    this.#send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not supported: ${method}` },
    });
  }

  #handleNotification(msg) {
    if (msg.method === 'session/update' && msg.params) {
      const update = msg.params.update;
      if (!update) return;

      if (update.sessionUpdate === 'agent_message_chunk') {
        const content = update.content;
        if (content && content.type === 'text' && content.text) {
          this.#responseChunks.push(content.text);
          this.emit('chunk', content.text);
        }
      } else if (update.sessionUpdate === 'tool_call') {
        this.emit('tool_call', update);
      } else if (update.sessionUpdate === 'tool_call_update') {
        this.emit('tool_call_update', update);
      }
    }
  }
}

module.exports = { AcpClient, PROTOCOL_VERSION };
