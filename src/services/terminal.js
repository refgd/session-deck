// src/services/terminal.js — PTY lifecycle manager for terminal connections

import { createRequire } from 'node:module';
import { parseSSHConfig } from './ssh-config.js';
import { findHost } from './hosts.js';
import { dockerExecCommand, terminalAttachCommand } from './connection.js';
import { DEFAULT_HOST } from '../lib/constants.js';
import { normalizeTerminalSize, resolveTerminalHost, terminalId, terminalSpawnCommand } from '../lib/terminal-utils.js';

const require = createRequire(import.meta.url);
export const MAX_ACTIVE_TERMINALS = 100;
const activePTYs = new Map();
let ptyModule = null;

export function loadPtyModule() {
  if (!ptyModule) {
    ptyModule = require('node-pty');
  }
  if (typeof ptyModule.spawn !== 'function') {
    throw Object.assign(new Error('node-pty loaded without a spawn function'), { statusCode: 500 });
  }
  return ptyModule;
}

/**
 * Spawn a PTY connected to a tmux session.
 * @param {string} sessionName — tmux session name
 * @param {string} hostName — host name (from SSH config) or default local host
 * @param {object} options
 * @param {number} [options.cols=80]
 * @param {number} [options.rows=24]
 * @returns {{ pty, id }}
 */
export function spawnTerminal(sessionName, hostName, options = {}) {
  const { cols, rows } = normalizeTerminalSize(options);
  const id = terminalId(hostName, sessionName);

  const host = resolveTerminalHost(hostName, {
    defaultHost: DEFAULT_HOST,
    db: options.db,
    findHost,
    parseSSHConfig,
    hostname: process.env.HOSTNAME || '',
  });
  const cmd = terminalSpawnCommand(host, sessionName, { dockerExecCommand, terminalAttachCommand });
  const pty = options.pty || loadPtyModule();

  const term = pty.spawn(cmd.command, cmd.args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.env.HOME,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
    },
  });

  registerActiveTerminal(id, { term, sessionName, hostName });

  return { pty: term, id };
}

/**
 * Resize an active PTY. Debounced per-terminal to prevent redraw storms.
 */
const resizeTimers = new Map();

export function registerActiveTerminal(id, entry, options = {}) {
  if (!id || !entry?.term) {
    throw Object.assign(new Error('Terminal id and PTY instance are required.'), { statusCode: 500 });
  }

  killTerminal(id);
  activePTYs.set(id, {
    ...entry,
    createdAt: entry.createdAt ?? Date.now(),
  });

  pruneActiveTerminals(options.maxActive ?? MAX_ACTIVE_TERMINALS);
  return activePTYs.get(id);
}

export function resizeTerminal(id, cols, rows) {
  const entry = activePTYs.get(id);
  if (!entry) return;
  const size = normalizeTerminalSize({ cols, rows });

  // Skip if dimensions haven't changed
  if (entry.lastCols === size.cols && entry.lastRows === size.rows) return;

  // Debounce: wait 100ms for resize to settle
  clearTimeout(resizeTimers.get(id));
  resizeTimers.set(id, setTimeout(() => {
    resizeTimers.delete(id);
    const e = activePTYs.get(id);
    if (!e) return;
    try {
      e.term.resize(size.cols, size.rows);
      e.lastCols = size.cols;
      e.lastRows = size.rows;
    } catch {
      // PTY may already be closed
    }
  }, 100));
}

/**
 * Kill an active PTY and clean up.
 */
export function killTerminal(id) {
  const entry = activePTYs.get(id);
  if (entry) {
    try {
      entry.term.kill();
    } catch {
      // Already dead
    }
    activePTYs.delete(id);
  }
  // Clean up any pending resize timer
  clearTimeout(resizeTimers.get(id));
  resizeTimers.delete(id);
}

/**
 * Get count of active terminals.
 */
export function getActiveCount() {
  return activePTYs.size;
}

function pruneActiveTerminals(maxActive) {
  const limit = Number.parseInt(maxActive, 10);
  if (!Number.isFinite(limit) || limit < 1) return;

  while (activePTYs.size > limit) {
    const oldestId = activePTYs.keys().next().value;
    if (!oldestId) return;
    killTerminal(oldestId);
  }
}
