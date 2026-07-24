import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function listRunningContainers() {
  const { stdout } = await execFileAsync(
    'docker',
    ['ps', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}'],
    { timeout: 5000 }
  );

  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [id, name, image, status] = line.split('\t');
    return { id, name, image, status };
  });
}

export async function execDocker(container, args, timeout = 5000) {
  const { stdout } = await execFileAsync('docker', ['exec', container, ...args], { timeout });
  return stdout;
}

export async function execDockerShell(container, command, timeout = 5000) {
  return execDocker(container, ['sh', '-lc', command], timeout);
}

export function dockerHostLabel(host) {
  return host.dockerContainer || host.hostname;
}
