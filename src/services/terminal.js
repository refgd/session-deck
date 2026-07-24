// src/services/terminal.js — PTY lifecycle manager for terminal connections

import pty from 'node-pty';
import { parseSSHConfig } from './ssh-config.js';
import { findHost } from './hosts.js';
import { dockerExecCommand, terminalAttachCommand } from './connection.js';

const activePTYs = new Map();

/**
 * Spawn a PTY connected to a tmux session.
 * @param {string} sessionName — tmux session name
 * @param {string} hostName — host name (from SSH config) or 'reliant' for local
 * @param {object} options
 * @param {number} [options.cols=80]
 * @param {number} [options.rows=24]
 * @returns {{ pty, id }}
 */
export function spawnTerminal(sessionName, hostName, options = {}) {
  const cols = options.cols || 80;
  const rows = options.rows || 24;
  const id = `${hostName}:${sessionName}:${Date.now()}`;

  let shell, args;
  const host = resolveHost(hostName, options.db);

  if (host?.connectionType === 'docker') {
    const cmd = dockerExecCommand(host, [
      'tmux',
      '-u',
      'attach-session',
      '-t',
      sessionName,
    ], {
      interactive: true,
      execOptions: ['-e', 'TERM=xterm-256color', '-e', 'LANG=C.UTF-8', '-e', 'LC_ALL=C.UTF-8'],
    });
    shell = cmd.command;
    args = cmd.args;
  } else if (!host || host.isLocal) {
    // Local tmux attach — -u forces UTF-8 mode regardless of host locale
    shell = 'tmux';
    args = ['-u', 'attach-session', '-t', sessionName];
  } else {
    // Remote via SSH
    const cmd = terminalAttachCommand(host, sessionName);
    shell = cmd.command;
    args = cmd.args;
  }

  const term = pty.spawn(shell, args, {
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

  activePTYs.set(id, { term, sessionName, hostName, createdAt: Date.now() });

  return { pty: term, id };
}

/**
 * Resize an active PTY. Debounced per-terminal to prevent redraw storms.
 */
const resizeTimers = new Map();
export function resizeTerminal(id, cols, rows) {
  const entry = activePTYs.get(id);
  if (!entry) return;

  // Skip if dimensions haven't changed
  if (entry.lastCols === cols && entry.lastRows === rows) return;

  // Debounce: wait 100ms for resize to settle
  clearTimeout(resizeTimers.get(id));
  resizeTimers.set(id, setTimeout(() => {
    resizeTimers.delete(id);
    const e = activePTYs.get(id);
    if (!e) return;
    try {
      e.term.resize(cols, rows);
      e.lastCols = cols;
      e.lastRows = rows;
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

function resolveHost(hostName, db) {
  if (!hostName || hostName === 'localhost') {
    return { isLocal: true };
  }
  if (db) {
    const managed = findHost(db, hostName);
    if (managed) return managed;
  }
  // Check managed hosts DB via SSH config — don't hardcode any host as local
  const hosts = parseSSHConfig();
  const found = hosts.find(h => h.name === hostName || h.aliases?.includes(hostName));
  if (found) return found;
  // If not in SSH config, check if it looks like this machine
  if (hostName === 'reliant' && process.env.HOSTNAME?.includes('reliant')) {
    return { isLocal: true };
  }
  return null;
}
