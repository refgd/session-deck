import { mapManagedHost } from './hosts.js';
import { sshTarget } from './connection.js';
import { execHostShell, execTmux } from './host-exec.js';
import { addDiagnosticStep, cleanHostError, getInstallCommand, parseOsRelease } from '../lib/host-diagnostics.js';

function normalizeHost(host) {
  if (!host) return host;
  if (host.connectionType) return host;
  const normalized = mapManagedHost(host);
  if (host.gatewayHost) normalized.gatewayHost = host.gatewayHost;
  if (host.gateway_host_id && !normalized.gatewayHost) normalized.gatewayHostId = host.gateway_host_id;
  return normalized;
}

export async function testHost(host) {
  const startMs = Date.now();
  const result = {
    status: 'error',
    tmuxAvailable: false,
    os: null,
    osId: null,
    tmuxVersion: null,
    installCommand: null,
    gateway: null,
    steps: [],
    error: null,
    durationMs: 0,
  };

  try {
    const normalizedHost = normalizeHost(host);
    const connectionType = normalizedHost.connectionType || host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh');
    if (normalizedHost.gatewayHost) {
      result.gateway = await testGateway(normalizedHost.gatewayHost);
      addDiagnosticStep(result, 'gateway', result.gateway.status, {
        durationMs: result.gateway.durationMs,
        error: result.gateway.error,
        detail: result.gateway.name,
      });
      if (result.gateway.status !== 'ok') {
        throw new Error(`Gateway "${result.gateway.name}" failed: ${result.gateway.error}`);
      }
    }

    if (connectionType === 'docker') {
      await testDockerHost(normalizedHost, result);
    } else if (normalizedHost.isLocal) {
      await testLocalHost(result);
    } else {
      await testSshHost(normalizedHost, result);
    }

    if (!result.tmuxAvailable && result.osId) {
      result.installCommand = getInstallCommand(result.osId);
    }
  } catch (err) {
    result.status = 'error';
    result.error = cleanHostError(err);
  }

  result.durationMs = Date.now() - startMs;
  return result;
}

async function testDockerHost(host, result) {
  const dockerStartedAt = Date.now();
  try {
    await execHostShell(host, 'true', 5000);
  } catch (err) {
    addDiagnosticStep(result, 'docker', 'error', {
      durationMs: Date.now() - dockerStartedAt,
      error: cleanHostError(err),
      detail: host.dockerContainer || host.hostname,
    });
    throw err;
  }
  addDiagnosticStep(result, 'docker', 'ok', {
    durationMs: Date.now() - dockerStartedAt,
    detail: host.dockerContainer || host.hostname,
  });
  result.status = 'ok';

  try {
    const tmuxStartedAt = Date.now();
    const stdout = await execTmux(host, ['-V'], 5000);
    result.tmuxAvailable = true;
    result.tmuxVersion = stdout.trim();
    addDiagnosticStep(result, 'tmux', 'ok', {
      durationMs: Date.now() - tmuxStartedAt,
      detail: result.tmuxVersion,
    });
  } catch (err) {
    result.tmuxAvailable = false;
    addDiagnosticStep(result, 'tmux', 'error', { error: cleanHostError(err) });
    await detectDockerOs(host, result, err);
  }
}

async function detectDockerOs(host, result, tmuxError) {
  try {
    const osStartedAt = Date.now();
    const stdout = await execHostShell(host, 'cat /etc/os-release', 5000);
    Object.assign(result, parseOsRelease(stdout));
    addDiagnosticStep(result, 'os', 'ok', {
      durationMs: Date.now() - osStartedAt,
      detail: result.os || result.osId,
    });
  } catch (err) {
    result.os = 'Container';
    addDiagnosticStep(result, 'os', 'error', { error: cleanHostError(err || tmuxError) });
  }
}

async function testLocalHost(result) {
  addDiagnosticStep(result, 'local', 'ok', { detail: 'localhost' });
  const host = { name: 'localhost', hostname: '127.0.0.1', isLocal: true, connectionType: 'ssh' };
  try {
    const tmuxStartedAt = Date.now();
    const stdout = await execTmux(host, ['-V'], 5000);
    result.tmuxAvailable = true;
    result.tmuxVersion = stdout.trim();
    addDiagnosticStep(result, 'tmux', 'ok', {
      durationMs: Date.now() - tmuxStartedAt,
      detail: result.tmuxVersion,
    });
  } catch (err) {
    result.tmuxAvailable = false;
    addDiagnosticStep(result, 'tmux', 'error', { error: cleanHostError(err) });
  }

  try {
    const osStartedAt = Date.now();
    const stdout = await execHostShell(host, 'cat /etc/os-release', 3000);
    Object.assign(result, parseOsRelease(stdout));
    addDiagnosticStep(result, 'os', 'ok', {
      durationMs: Date.now() - osStartedAt,
      detail: result.os || result.osId,
    });
  } catch (err) {
    result.os = 'Linux';
    addDiagnosticStep(result, 'os', 'error', { error: cleanHostError(err) });
  }

  result.status = 'ok';
}

async function testSshHost(normalizedHost, result) {
  const sshStartedAt = Date.now();
  try {
    await execHostShell(normalizedHost, 'echo ok', 6000);
  } catch (err) {
    addDiagnosticStep(result, 'ssh', 'error', {
      durationMs: Date.now() - sshStartedAt,
      error: cleanHostError(err),
      detail: sshTarget(normalizedHost),
    });
    throw err;
  }
  addDiagnosticStep(result, 'ssh', 'ok', {
    durationMs: Date.now() - sshStartedAt,
    detail: sshTarget(normalizedHost),
  });
  result.status = 'ok';

  try {
    const tmuxStartedAt = Date.now();
    const stdout = await execTmux(normalizedHost, ['-V'], 5000);
    result.tmuxAvailable = true;
    result.tmuxVersion = stdout.trim();
    addDiagnosticStep(result, 'tmux', 'ok', {
      durationMs: Date.now() - tmuxStartedAt,
      detail: result.tmuxVersion,
    });
  } catch (err) {
    result.tmuxAvailable = false;
    addDiagnosticStep(result, 'tmux', 'error', { error: cleanHostError(err) });
    await detectSshOs(normalizedHost, result, err);
  }
}

async function detectSshOs(host, result, tmuxError) {
  try {
    const osStartedAt = Date.now();
    const stdout = await execHostShell(host, 'cat /etc/os-release', 5000);
    Object.assign(result, parseOsRelease(stdout));
    addDiagnosticStep(result, 'os', 'ok', {
      durationMs: Date.now() - osStartedAt,
      detail: result.os || result.osId,
    });
  } catch (err) {
    try {
      const osStartedAt = Date.now();
      const stdout = await execHostShell(host, 'uname -s', 5000);
      result.os = stdout.trim();
      addDiagnosticStep(result, 'os', 'ok', {
        durationMs: Date.now() - osStartedAt,
        detail: result.os,
      });
    } catch (fallbackErr) {
      result.os = 'Unknown';
      addDiagnosticStep(result, 'os', 'error', { error: cleanHostError(fallbackErr || err || tmuxError) });
    }
  }
}

async function testGateway(gateway) {
  const startedAt = Date.now();
  try {
    await execHostShell(gateway, 'true', 5000);
    return { name: gateway.name || gateway.hostname, type: gateway.connectionType || 'ssh', status: 'ok', durationMs: Date.now() - startedAt };
  } catch (err) {
    return {
      name: gateway.name || gateway.hostname,
      type: gateway.connectionType || 'ssh',
      status: 'error',
      error: cleanHostError(err),
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function installTmux(host) {
  const test = await testHost(host);
  if (test.status !== 'ok') {
    throw Object.assign(new Error(test.error || 'Host is not reachable'), { statusCode: 503 });
  }
  if (test.tmuxAvailable) {
    return { installed: false, alreadyInstalled: true, test };
  }

  if (!test.osId) {
    throw Object.assign(new Error('Could not detect OS for tmux installation'), { statusCode: 400 });
  }

  const normalizedHost = normalizeHost(host);
  const connectionType = normalizedHost.connectionType || host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh');
  const useSudo = connectionType !== 'docker';
  const installCommand = getInstallCommand(test.osId, { sudo: useSudo });

  if (!installCommand || installCommand.startsWith('#')) {
    throw Object.assign(new Error(`Unsupported OS for automatic install: ${test.osId}`), { statusCode: 400 });
  }

  await execHostShell(normalizedHost, installCommand, 120000);

  const after = await testHost(host);
  return { installed: after.tmuxAvailable, alreadyInstalled: false, installCommand, test: after };
}
