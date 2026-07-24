import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dockerExecCommand, shellJoin, sshBaseArgs, sshTarget } from './connection.js';

const execFileAsync = promisify(execFile);

export async function listRunningContainers(gatewayHost = null) {
  const dockerPs = ['docker', 'ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'];
  let stdout;

  if (gatewayHost?.connectionType === 'ssh') {
    const result = await execFileAsync(
      'ssh',
      [...sshBaseArgs(gatewayHost, { timeoutMs: 5000 }), sshTarget(gatewayHost), shellJoin(dockerPs)],
      { timeout: 7000 }
    );
    stdout = result.stdout;
  } else if (gatewayHost?.connectionType === 'docker') {
    const result = await execFileAsync(
      'docker',
      ['exec', gatewayHost.dockerContainer || gatewayHost.hostname, ...dockerPs],
      { timeout: 7000 }
    );
    stdout = result.stdout;
  } else {
    const result = await execFileAsync(
      'docker',
      ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'],
      { timeout: 5000 }
    );
    stdout = result.stdout;
  }

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [id, name, image, status] = line.split('\t');
    return { id, name, image, status };
  });
}

export async function execDocker(container, args, timeout = 5000) {
  const { stdout } = await execFileAsync('docker', ['exec', container, ...args], { timeout });
  return stdout;
}

export async function execDockerOnHost(host, args, timeout = 5000, options = {}) {
  const cmd = dockerExecCommand(host, args, options);
  const { stdout } = await execFileAsync(cmd.command, cmd.args, { timeout });
  return stdout;
}

export async function execDockerShell(container, command, timeout = 5000) {
  return execDocker(container, ['sh', '-lc', command], timeout);
}

export async function execDockerShellOnHost(host, command, timeout = 5000) {
  return execDockerOnHost(host, ['sh', '-lc', command], timeout);
}

export function dockerHostLabel(host) {
  return host.dockerContainer || host.hostname;
}
