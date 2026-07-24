import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dockerExecCommand, shellQuote, sshCommand } from './connection.js';

const execFileAsync = promisify(execFile);

export function hostShellCommand(host, command, { timeoutMs = 5000 } = {}) {
  if (host.connectionType === 'docker') {
    return {
      ...dockerExecCommand(host, ['sh', '-lc', command]),
      timeout: timeoutMs,
    };
  }

  if (host.isLocal) {
    return {
      command: 'sh',
      args: ['-lc', command],
      timeout: timeoutMs,
    };
  }

  return {
    ...sshCommand(host, command, { timeoutMs }),
    timeout: timeoutMs + 2000,
  };
}

export function tmuxExecCommand(host, args, { timeoutMs = 5000 } = {}) {
  if (host.connectionType === 'docker') {
    return {
      ...dockerExecCommand(host, ['tmux', ...args]),
      timeout: timeoutMs,
    };
  }

  if (host.isLocal) {
    return {
      command: 'tmux',
      args,
      timeout: timeoutMs,
    };
  }

  return {
    ...sshCommand(host, `tmux ${args.map(shellQuote).join(' ')}`, { timeoutMs }),
    timeout: timeoutMs + 2000,
  };
}

export async function execHostShell(host, command, timeout, options = {}) {
  const cmd = hostShellCommand(host, command, { timeoutMs: timeout });
  return execCommandSpec(cmd, options);
}

export async function execTmux(host, args, timeout, options = {}) {
  const cmd = tmuxExecCommand(host, args, { timeoutMs: timeout });
  return execCommandSpec(cmd, options);
}

export async function execCommandSpec(commandSpec, options = {}) {
  const { stdout } = await execFileAsync(commandSpec.command, commandSpec.args, {
    timeout: commandSpec.timeout,
    ...options,
  });
  return stdout;
}
