import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dockerExecCommand, shellJoin, sshBaseArgs, sshTarget } from './connection.js';

const execFileAsync = promisify(execFile);

const DOCKER_PS_FORMAT = '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}';
export const MAX_DOCKER_CONTAINERS = 500;

export function dockerListCommand(gatewayHost = null) {
  const dockerPs = ['docker', 'ps', '--format', DOCKER_PS_FORMAT];

  if (gatewayHost?.connectionType === 'ssh') {
    return {
      command: 'ssh',
      args: [...sshBaseArgs(gatewayHost, { timeoutMs: 5000 }), sshTarget(gatewayHost), shellJoin(dockerPs)],
    };
  }

  if (gatewayHost?.connectionType === 'docker') {
    return {
      command: 'docker',
      args: ['exec', gatewayHost.dockerContainer || gatewayHost.hostname, ...dockerPs],
    };
  }

  return {
    command: 'docker',
    args: ['ps', '--format', DOCKER_PS_FORMAT],
  };
}

export function dockerListContext(gatewayHost = null) {
  if (gatewayHost?.connectionType === 'ssh') {
    return {
      scope: 'gateway',
      gatewayType: 'ssh',
      gatewayName: gatewayHost.name || gatewayHost.hostname,
      gatewayTarget: sshTarget(gatewayHost),
      operation: 'docker ps',
    };
  }

  if (gatewayHost?.connectionType === 'docker') {
    return {
      scope: 'gateway',
      gatewayType: 'docker',
      gatewayName: gatewayHost.name || gatewayHost.dockerContainer || gatewayHost.hostname,
      gatewayContainer: gatewayHost.dockerContainer || gatewayHost.hostname,
      operation: 'docker ps',
    };
  }

  return {
    scope: 'local',
    operation: 'docker ps',
  };
}

export async function listRunningContainers(gatewayHost = null) {
  const cmd = dockerListCommand(gatewayHost);
  const { stdout } = await execFileAsync(cmd.command, cmd.args, { timeout: gatewayHost ? 7000 : 5000 });

  return parseDockerPsOutput(stdout);
}

export async function listRunningContainersWithContext(gatewayHost = null) {
  return {
    containers: await listRunningContainers(gatewayHost),
    context: dockerListContext(gatewayHost),
  };
}

export function parseDockerPsOutput(stdout, maxContainers = MAX_DOCKER_CONTAINERS) {
  const limit = Number.isFinite(maxContainers) && maxContainers > 0
    ? Math.floor(maxContainers)
    : MAX_DOCKER_CONTAINERS;
  const containers = [];

  for (const line of String(stdout || '').trim().split('\n')) {
    if (!line.trim()) continue;
    const [id, name, image, status] = line.split('\t');
    if (!id || !name) continue;
    containers.push({ id, name, image: image || '', status: status || '' });
    if (containers.length >= limit) break;
  }

  return containers;
}

export async function execDocker(container, args, timeout = 5000) {
  const { stdout } = await execFileAsync('docker', ['exec', container, ...args], { timeout });
  return stdout;
}

export async function execDockerOnHost(host, args, timeout = 5000, options = {}) {
  const { maxBuffer, ...commandOptions } = options;
  const cmd = dockerExecCommand(host, args, commandOptions);
  const { stdout } = await execFileAsync(cmd.command, cmd.args, {
    timeout,
    ...(maxBuffer ? { maxBuffer } : {}),
  });
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
