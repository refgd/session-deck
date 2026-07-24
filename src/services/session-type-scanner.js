import { mapWithConcurrency } from '../lib/async-utils.js';
import { execCommandSpec, tmuxExecCommand } from './host-exec.js';
import { mapManagedHost } from './hosts.js';

const PANE_COMMAND_FORMAT = '#{pane_current_command}';
export const SESSION_TYPE_SCAN_CONCURRENCY = 4;
const PANE_COMMAND_ARGS = ['list-panes', '-a', '-F', PANE_COMMAND_FORMAT];

export function mapHostsForSessionTypeScan(rows) {
  const hosts = (rows || []).map(host => host.connectionType ? host : mapManagedHost(host));

  if (hosts.length === 0) {
    hosts.push({ name: 'localhost', hostname: '127.0.0.1', isLocal: true, connectionType: 'ssh' });
  }

  return hosts;
}

export function parsePaneCommands(stdout) {
  return String(stdout || '')
    .split('\n')
    .map(command => command.trim().toLowerCase())
    .filter(Boolean);
}

export function localPaneCommand() {
  return paneCommand({ name: 'localhost', hostname: '127.0.0.1', isLocal: true, connectionType: 'ssh' }, { timeoutMs: 5000 });
}

export function remotePaneCommand(host) {
  return paneCommand(host, { timeoutMs: 3000 });
}

export function paneCommand(host, options = {}) {
  return tmuxExecCommand(host, PANE_COMMAND_ARGS, options);
}

export async function discoverSessionTypeProcesses(hostRows, options = {}) {
  const exec = options.execCommand || execCommandSpec;
  const hosts = mapHostsForSessionTypeScan(hostRows);
  const processNames = new Set();

  await collectCommand(processNames, exec, localPaneCommand());

  await mapWithConcurrency(
    hosts.filter(host => !host.isLocal),
    options.concurrency || SESSION_TYPE_SCAN_CONCURRENCY,
    host => collectCommand(processNames, exec, paneCommand(host, { timeoutMs: 3000 })),
  );

  return [...processNames].sort();
}

async function collectCommand(processNames, exec, commandSpec) {
  try {
    const stdout = await exec(commandSpec);
    for (const name of parsePaneCommands(stdout)) {
      processNames.add(name);
    }
  } catch {
    // Scanning is best-effort; unreachable hosts should not fail the request.
  }
}
