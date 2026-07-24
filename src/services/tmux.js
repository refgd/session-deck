// src/services/tmux.js - tmux session query and type detection

import { mapWithConcurrency } from '../lib/async-utils.js';
import { shellQuote } from './connection.js';
import { execHostShell, execTmux } from './host-exec.js';
import {
  assertValidSessionName,
  classifyTmuxError,
  cleanTmuxError,
  isTmuxServerNotRunning,
  normalizeStartDir,
  tmuxErrorDiagnostics,
} from './tmux-utils.js';

const SESSION_FORMAT = '#{session_name}|#{session_windows}|#{session_attached}|#{session_created}|#{session_activity}';
const ACTIVITY_FORMAT = '#{session_name}|#{session_activity}';
const PANE_FORMAT = '#{pane_current_command}';
const PANE_PATH_FORMAT = '#{pane_current_path}';
export const SESSION_ENRICH_CONCURRENCY = 4;
export const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
export const CAPTURE_TRUNCATION_NOTICE = `\n[Session Deck: capture truncated at ${MAX_CAPTURE_BYTES} bytes]\n`;
const CAPTURE_EXEC_MAX_BUFFER = MAX_CAPTURE_BYTES + 256 * 1024;

const TYPE_MAP = {
  claude: 'claude-code',
  gsd: 'gsd',
  pi: 'gsd',
};

// Dynamic type map loaded from DB (falls back to TYPE_MAP if DB unavailable)
let dynamicTypeMap = null;

/**
 * Load session type mappings from the database.
 * Call this after DB is initialized to enable dynamic type detection.
 */
export function loadTypeMap(db) {
  try {
    const types = db.prepare('SELECT process_name, display_name FROM session_types').all();
    dynamicTypeMap = {};
    for (const t of types) {
      dynamicTypeMap[t.process_name] = t.process_name; // return raw process name as type
    }
  } catch {
    dynamicTypeMap = null;
  }
}

/**
 * List tmux sessions on a host.
 * @param {object} host — host entry from ssh-config parser
 * @param {object} [options]
 * @param {number} [options.timeout=5000] — SSH connect timeout in ms
 * @returns {Promise<{host: string, status: string, sessions: Array, error?: string, queryMs: number}>}
 */
export async function listSessions(host, options = {}) {
  const timeout = options.timeout || 5000;
  const start = Date.now();

  try {
    const rawSessions = await execTmux(host, ['list-sessions', '-F', SESSION_FORMAT], timeout);

    if (!rawSessions.trim()) {
      return result(host.name, 'online', [], start);
    }

    const sessions = [];
    const lines = rawSessions.trim().split('\n');
    const parsed = lines.map(line => {
      const [name, windows, attached, created, activity] = line.split('|');
      return { name, windows, attached, created, activity };
    }).filter(p => p.name);

    // Run type + context detection in parallel for all sessions
    const enriched = await mapWithConcurrency(parsed, SESSION_ENRICH_CONCURRENCY, async (p) => {
      const [type, context] = await Promise.all([
        detectType(host, p.name, timeout),
        detectContext(host, p.name, timeout),
      ]);
      return {
        name: p.name,
        windows: parseInt(p.windows, 10),
        attached: parseInt(p.attached, 10) > 0,
        attachedCount: parseInt(p.attached, 10),
        created: parseInt(p.created, 10) * 1000,
        lastActivity: parseInt(p.activity, 10) * 1000,
        type,
        workingDir: context.workingDir,
        repoName: context.repoName,
      };
    });

    return result(host.name, 'online', enriched, start);
  } catch (err) {
    if (isTmuxServerNotRunning(err)) {
      return result(host.name, 'online', [], start);
    }
    const status = classifyTmuxError(err);
    return result(host.name, status, [], start, cleanTmuxError(err), tmuxErrorDiagnostics(err));
  }
}

/**
 * Query all hosts for tmux sessions in parallel.
 * @param {Array<object>} hosts — host entries from ssh-config parser
 * @param {object} [options]
 * @returns {Promise<Array>}
 */
export async function listAllSessions(hosts, options = {}) {
  const results = await Promise.allSettled(
    hosts.map(host => listSessions(host, options))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return result(hosts[i].name, 'error', [], Date.now(), r.reason?.message);
  });
}

/**
 * Lightweight activity-only query. Returns just session names + lastActivity timestamps.
 * Skips type detection, context detection — intended for high-frequency polling.
 * @param {object} host
 * @param {object} [options]
 * @returns {Promise<{host: string, sessions: Array<{name: string, lastActivity: number}>, error?: string}>}
 */
export async function listActivity(host, options = {}) {
  const timeout = options.timeout || 3000;
  try {
    const raw = await execTmux(host, ['list-sessions', '-F', ACTIVITY_FORMAT], timeout);

    if (!raw.trim()) return { host: host.name, sessions: [] };

    const sessions = [];
    for (const line of raw.trim().split('\n')) {
      const [name, activity] = line.split('|');
      if (!name) continue;
      sessions.push({
        name,
        lastActivity: parseInt(activity, 10) * 1000,
      });
    }
    return { host: host.name, sessions };
  } catch (err) {
    return { host: host.name, sessions: [], error: err.message };
  }
}

/**
 * Query activity timestamps from all hosts in parallel.
 * @param {Array<object>} hosts
 * @param {object} [options]
 * @returns {Promise<Array<{host: string, sessions: Array}>>}
 */
export async function listAllActivity(hosts, options = {}) {
  const results = await Promise.allSettled(
    hosts.map(host => listActivity(host, options))
  );
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return { host: hosts[i].name, sessions: [], error: r.reason?.message };
  });
}

/**
 * Detect session type by inspecting running command in the first pane.
 */
async function detectType(host, sessionName, timeout) {
  try {
    const raw = await execTmux(host, ['list-panes', '-t', sessionName, '-F', PANE_FORMAT], timeout);

    const commands = raw.trim().split('\n').map(c => c.trim().toLowerCase());
    // Check all panes — first non-shell match wins, then fall back to shell type
    for (const cmd of commands) {
      // If we have a dynamic map, check if this process is a "notable" one (not a shell)
      if (dynamicTypeMap) {
        // Skip common shells to find the "interesting" process
        if (!['bash', 'zsh', 'fish', 'sh', 'dash', 'tcsh', 'csh'].includes(cmd) && dynamicTypeMap[cmd]) {
          return cmd;
        }
      } else if (TYPE_MAP[cmd]) {
        return TYPE_MAP[cmd];
      }
    }
    // Return the first command (usually the shell) as the type
    return commands[0] || 'terminal';
  } catch {
    return 'terminal'; // default if detection fails
  }
}

/**
 * Detect working directory and git repo name for a session.
 */
async function detectContext(host, sessionName, timeout) {
  const ctx = { workingDir: null, repoName: null };
  try {
    // Get the current path of the first pane
    const raw = await execTmux(host, ['list-panes', '-t', sessionName, '-F', PANE_PATH_FORMAT], timeout);

    const panePath = raw.trim().split('\n')[0]?.trim();
    if (!panePath) return ctx;

    ctx.workingDir = panePath;

    // Try to detect git repo name
    try {
      const gitOut = await execHostShell(host, gitRepoRootCommand(panePath), timeout);
      const repoRoot = gitOut.trim();
      if (repoRoot) {
        ctx.repoName = repoRoot.split('/').pop();
      }
    } catch {
      // not a git repo or git is unavailable
    }

    // If no git repo, use the directory name as a fallback context
    if (!ctx.repoName) {
      ctx.repoName = panePath.split('/').pop() || null;
    }
  } catch { /* ignore detection failures */ }
  return ctx;
}

export function gitRepoRootCommand(path) {
  return `cd ${shellQuote(path)} && git rev-parse --show-toplevel 2>/dev/null`;
}

function result(hostName, status, sessions, startMs, error, diagnostics = {}) {
  return {
    host: hostName,
    status,
    sessions,
    sessionCount: sessions.length,
    queryMs: Date.now() - startMs,
    ...(error ? { error } : {}),
    ...diagnostics,
  };
}

// --- Session mutation operations ---

/**
 * Create a new tmux session on a host.
 * @param {object} host
 * @param {string} name — session name
 * @param {string} [startDir] — starting directory
 * @returns {Promise<{success: boolean, host: string, session: string}>}
 */
export async function createSession(host, name, startDir) {
  assertValidSessionName(name);
  const normalizedStartDir = normalizeStartDir(startDir);

  const args = ['new-session', '-d', '-s', name];
  if (normalizedStartDir) args.push('-c', normalizedStartDir);

  try {
    await execTmux(host, args, 5000);
    return { success: true, host: host.name, session: name };
  } catch (err) {
    if (err.stderr?.includes('duplicate session') || err.message?.includes('duplicate session')) {
      throw Object.assign(new Error(`Session "${name}" already exists on ${host.name}`), { statusCode: 409 });
    }
    throw Object.assign(new Error(`Failed to create session on ${host.name}: ${cleanTmuxError(err)}`), { statusCode: 500 });
  }
}

/**
 * Rename a tmux session on a host.
 * @param {object} host
 * @param {string} oldName
 * @param {string} newName
 * @returns {Promise<{success: boolean, host: string, oldName: string, newName: string}>}
 */
export async function renameSession(host, oldName, newName) {
  assertValidSessionName(oldName);
  assertValidSessionName(newName);

  try {
    await execTmux(host, ['rename-session', '-t', oldName, newName], 5000);
    return { success: true, host: host.name, oldName, newName };
  } catch (err) {
    if (err.stderr?.includes('no such session') || err.message?.includes("can't find session")) {
      throw Object.assign(new Error(`Session "${oldName}" not found on ${host.name}`), { statusCode: 404 });
    }
    throw Object.assign(new Error(`Failed to rename session on ${host.name}: ${cleanTmuxError(err)}`), { statusCode: 500 });
  }
}

/**
 * Delete (kill) a tmux session on a host.
 * @param {object} host
 * @param {string} name
 * @returns {Promise<{success: boolean, host: string, session: string}>}
 */
export async function deleteSession(host, name) {
  assertValidSessionName(name);

  try {
    await execTmux(host, ['kill-session', '-t', name], 5000);
    return { success: true, host: host.name, session: name };
  } catch (err) {
    if (err.stderr?.includes('no such session') || err.message?.includes("can't find session")) {
      throw Object.assign(new Error(`Session "${name}" not found on ${host.name}`), { statusCode: 404 });
    }
    throw Object.assign(new Error(`Failed to delete session on ${host.name}: ${cleanTmuxError(err)}`), { statusCode: 500 });
  }
}

/**
 * Scroll the active pane in a tmux session using tmux copy-mode history.
 * @param {object} host
 * @param {string} sessionName
 * @param {number} lines Positive scrolls down, negative scrolls up.
 */
export async function scrollSession(host, sessionName, lines) {
  assertValidSessionName(sessionName);

  const count = Math.max(1, Math.min(200, Math.abs(parseInt(lines, 10) || 1)));
  const direction = lines > 0 ? 'scroll-down' : 'scroll-up';
  const timeout = 2000;

  await execTmux(host, ['copy-mode', '-e', '-t', sessionName], timeout);
  await execTmux(host, ['send-keys', '-t', sessionName, '-X', '-N', String(count), direction], timeout);
}

export async function sendLinesToSession(host, sessionName, lines, options = {}) {
  assertValidSessionName(sessionName);
  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : 50;
  const timeout = options.timeout || 5000;

  for (const line of lines || []) {
    await execTmux(host, ['send-keys', '-t', sessionName, String(line), 'Enter'], timeout);
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Capture the full scrollback of all panes in a tmux session.
 * Returns a single string with pane separators.
 * @param {object} host
 * @param {string} sessionName
 * @returns {Promise<string>}
 */
export async function captureSession(host, sessionName) {
  assertValidSessionName(sessionName);

  const timeout = 10000;
  try {
    // List all window.pane indices in the session
    const paneList = await execTmux(
      host,
      ['list-panes', '-t', sessionName, '-a', '-F', '#{session_name}:#{window_index}.#{pane_index}'],
      timeout
    );

    // Filter to only panes belonging to this session (the -a flag lists all)
    const panes = paneList.trim().split('\n').filter(p => p.startsWith(sessionName + ':'));
    if (!panes.length) {
      throw Object.assign(new Error(`No panes found in session "${sessionName}" on ${host.name}`), { statusCode: 404 });
    }

    const chunks = [];
    for (const paneTarget of panes) {
      if (chunks.length > 0) {
        chunks.push(`\n${'='.repeat(60)}\n=== Pane: ${paneTarget}\n${'='.repeat(60)}\n`);
      } else {
        chunks.push(`=== Pane: ${paneTarget}\n${'='.repeat(60)}\n`);
      }

      try {
        const output = await execTmux(host, ['capture-pane', '-t', paneTarget, '-p', '-S', '-'], timeout, {
          maxBuffer: CAPTURE_EXEC_MAX_BUFFER,
        });
        chunks.push(output);
        if (captureTextByteLength(chunks) > MAX_CAPTURE_BYTES) break;
      } catch (paneErr) {
        chunks.push(`[Error capturing pane: ${paneErr.message}]\n`);
      }
    }

    return truncateCaptureText(chunks.join(''));
  } catch (err) {
    if (err.statusCode) throw err;
    const kind = classifyTmuxError(err);
    if (kind === 'unreachable') {
      throw Object.assign(new Error(`Host ${host.name} is unreachable`), { statusCode: 503 });
    }
    if (kind === 'no-tmux') {
      throw Object.assign(new Error(`tmux not running on ${host.name}`), { statusCode: 503 });
    }
    throw Object.assign(new Error(`Failed to capture session on ${host.name}: ${cleanTmuxError(err)}`), { statusCode: 500 });
  }
}

export function truncateCaptureText(text, maxBytes = MAX_CAPTURE_BYTES) {
  if (Buffer.byteLength(text) <= maxBytes) return text;
  const noticeBytes = Buffer.byteLength(CAPTURE_TRUNCATION_NOTICE);
  const contentLimit = Math.max(0, maxBytes - noticeBytes);
  return `${utf8Prefix(text, contentLimit)}${CAPTURE_TRUNCATION_NOTICE}`;
}

function captureTextByteLength(chunks) {
  return chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk), 0);
}

function utf8Prefix(value, maxBytes) {
  let bytes = 0;
  let output = '';
  for (const char of String(value)) {
    const nextBytes = Buffer.byteLength(char);
    if (bytes + nextBytes > maxBytes) break;
    output += char;
    bytes += nextBytes;
  }
  return output;
}
