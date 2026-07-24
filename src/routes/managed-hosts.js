// src/routes/managed-hosts.js — CRUD API for managed SSH hosts

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseSSHConfig } from '../services/ssh-config.js';
import { execDocker, listRunningContainers } from '../services/docker.js';
import { deleteSshKey, listSshKeys, saveSshKey } from '../services/ssh-keys.js';

const execFileAsync = promisify(execFile);

/**
 * Test SSH connectivity and tmux availability for a host.
 */
async function testHost(host) {
  const startMs = Date.now();
  const result = {
    status: 'error',
    tmuxAvailable: false,
    os: null,
    osId: null,
    tmuxVersion: null,
    installCommand: null,
    error: null,
    durationMs: 0,
  };

  try {
    const connectionType = host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh');

    if (connectionType === 'docker') {
      const container = host.docker_container || host.hostname;
      const { stdout: running } = await execFileAsync('docker', ['inspect', '-f', '{{.State.Running}}', container], { timeout: 5000 });
      if (running.trim() !== 'true') {
        throw new Error('Container is not running');
      }
      result.status = 'ok';

      try {
        const stdout = await execDocker(container, ['tmux', '-V'], 5000);
        result.tmuxAvailable = true;
        result.tmuxVersion = stdout.trim();
      } catch {
        result.tmuxAvailable = false;
        try {
          const stdout = await execDocker(container, ['cat', '/etc/os-release'], 5000);
          const idMatch = stdout.match(/^ID=(.+)$/m);
          const nameMatch = stdout.match(/^PRETTY_NAME="?(.+?)"?$/m);
          result.osId = idMatch?.[1]?.replace(/"/g, '') || null;
          result.os = nameMatch?.[1] || result.osId;
        } catch {
          result.os = 'Container';
        }
      }
    } else if (host.is_local) {
      // Local host — direct exec
      try {
        const { stdout } = await execFileAsync('tmux', ['-V'], { timeout: 5000 });
        result.tmuxAvailable = true;
        result.tmuxVersion = stdout.trim();
      } catch {
        result.tmuxAvailable = false;
      }

      // Get OS info
      try {
        const { stdout } = await execFileAsync('cat', ['/etc/os-release'], { timeout: 3000 });
        const idMatch = stdout.match(/^ID=(.+)$/m);
        const nameMatch = stdout.match(/^PRETTY_NAME="?(.+?)"?$/m);
        result.osId = idMatch?.[1]?.replace(/"/g, '') || null;
        result.os = nameMatch?.[1] || result.osId;
      } catch {
        result.os = 'Linux';
      }

      result.status = 'ok';
    } else {
      // Remote host — SSH
      const sshArgs = buildSSHArgs(host);

      // Step 1: connectivity test
      await execFileAsync('ssh', [...sshArgs, 'echo', 'ok'], { timeout: 8000 });
      result.status = 'ok';

      // Step 2: tmux check
      try {
        const { stdout } = await execFileAsync('ssh', [...sshArgs, 'tmux', '-V'], { timeout: 5000 });
        result.tmuxAvailable = true;
        result.tmuxVersion = stdout.trim();
      } catch (err) {
        result.tmuxAvailable = false;
        // tmux not found — get OS info for install guidance
        try {
          const { stdout } = await execFileAsync('ssh', [...sshArgs, 'cat', '/etc/os-release'], { timeout: 5000 });
          const idMatch = stdout.match(/^ID=(.+)$/m);
          const nameMatch = stdout.match(/^PRETTY_NAME="?(.+?)"?$/m);
          result.osId = idMatch?.[1]?.replace(/"/g, '') || null;
          result.os = nameMatch?.[1] || result.osId;
        } catch {
          // Try uname as fallback
          try {
            const { stdout } = await execFileAsync('ssh', [...sshArgs, 'uname', '-s'], { timeout: 5000 });
            result.os = stdout.trim();
          } catch {
            result.os = 'Unknown';
          }
        }
      }
    }

    // Generate install command based on OS
    if (!result.tmuxAvailable && result.osId) {
      result.installCommand = getInstallCommand(result.osId);
    }
  } catch (err) {
    result.status = 'error';
    const msg = err.stderr || err.message || 'Connection failed';
    // Trim verbose SSH errors to just the key part
    if (msg.includes('Connection timed out')) result.error = 'Connection timed out';
    else if (msg.includes('Connection refused')) result.error = 'Connection refused';
    else if (msg.includes('No route to host')) result.error = 'No route to host';
    else if (msg.includes('Permission denied')) result.error = 'Permission denied (auth failed)';
    else if (msg.includes('Host key verification')) result.error = 'Host key verification failed';
    else result.error = msg.split('\n')[0].slice(0, 120);
  }

  result.durationMs = Date.now() - startMs;
  return result;
}

async function installTmux(host) {
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

  const connectionType = host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh');
  const useSudo = connectionType !== 'docker';
  const installCommand = getInstallCommand(test.osId, { sudo: useSudo });

  if (!installCommand || installCommand.startsWith('#')) {
    throw Object.assign(new Error(`Unsupported OS for automatic install: ${test.osId}`), { statusCode: 400 });
  }

  if (connectionType === 'docker') {
    await execFileAsync('docker', ['exec', host.docker_container || host.hostname, 'sh', '-lc', installCommand], { timeout: 120000 });
  } else if (host.is_local) {
    await execFileAsync('sh', ['-lc', installCommand], { timeout: 120000 });
  } else {
    const sshArgs = buildSSHArgs(host);
    await execFileAsync('ssh', [...sshArgs, installCommand], { timeout: 120000 });
  }

  const after = await testHost(host);
  return { installed: after.tmuxAvailable, alreadyInstalled: false, installCommand, test: after };
}

/**
 * Build SSH command arguments for a host.
 */
function buildSSHArgs(host) {
  const args = [
    '-o', 'ConnectTimeout=5',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];
  if (host.identity_file) args.push('-i', host.identity_file.replace('~', process.env.HOME));
  if (host.port && host.port !== 22) args.push('-p', String(host.port));
  const target = host.user ? `${host.user}@${host.hostname}` : host.hostname;
  args.push(target);
  return args;
}

/**
 * Get tmux install command for a given OS ID.
 */
function getInstallCommand(osId, options = {}) {
  const sudo = options.sudo === false ? '' : 'sudo ';
  const commands = {
    ubuntu: `${sudo}apt-get update && ${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y tmux`,
    debian: `${sudo}apt-get update && ${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y tmux`,
    fedora: `${sudo}dnf install -y tmux`,
    centos: `${sudo}yum install -y tmux`,
    rhel: `${sudo}yum install -y tmux`,
    arch: `${sudo}pacman -Sy --noconfirm tmux`,
    alpine: `${sudo}apk add --no-cache tmux`,
    opensuse: `${sudo}zypper install -y tmux`,
    freebsd: `${sudo}pkg install -y tmux`,
    darwin: 'brew install tmux',
  };
  return commands[osId] || `# Install tmux for ${osId}`;
}

export default async function managedHostsRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/api/docker/containers', async (request, reply) => {
    try {
      return { containers: await listRunningContainers() };
    } catch (err) {
      return reply.code(503).send({ error: err.message || 'Failed to list Docker containers' });
    }
  });

  fastify.get('/api/ssh-keys', async () => {
    return { keys: listSshKeys() };
  });

  fastify.post('/api/ssh-keys', async (request, reply) => {
    try {
      const key = saveSshKey(request.body || {});
      reply.code(201);
      return key;
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  fastify.delete('/api/ssh-keys/:name', async (request, reply) => {
    try {
      return deleteSshKey(request.params.name);
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  // List all managed hosts
  fastify.get('/api/managed-hosts', async () => {
    const hosts = db.prepare('SELECT * FROM managed_hosts ORDER BY sort_order, name').all();
    const groups = {};
    for (const host of hosts) {
      const g = host.group_name || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(host);
    }
    return { hosts, groups, count: hosts.length };
  });

  // Get single host
  fastify.get('/api/managed-hosts/:id', async (request, reply) => {
    const host = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(request.params.id);
    if (!host) return reply.code(404).send({ error: 'Host not found' });
    return host;
  });

  // Create host
  fastify.post('/api/managed-hosts', async (request, reply) => {
    const { name, hostname, user, port, identity_file, auth_method, group_name, is_local, enabled, connection_type, docker_container } = request.body;
    const connectionType = connection_type === 'docker' ? 'docker' : 'ssh';
    const containerName = docker_container?.trim() || null;
    const resolvedHostname = connectionType === 'docker' ? containerName : hostname?.trim();
    if (!name?.trim() || !resolvedHostname) {
      return reply.code(400).send({ error: 'Name and hostname are required' });
    }

    // Check for duplicate name
    const existing = db.prepare('SELECT id FROM managed_hosts WHERE name = ?').get(name.trim());
    if (existing) {
      return reply.code(409).send({ error: `Host "${name.trim()}" already exists` });
    }

    const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM managed_hosts').get();
    const nextSort = (maxSort?.m ?? -1) + 1;

    const result = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, port, identity_file, auth_method, group_name, is_local, connection_type, docker_container, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      resolvedHostname,
      connectionType === 'docker' ? null : (user?.trim() || null),
      connectionType === 'docker' ? 0 : (port || 22),
      connectionType === 'docker' ? null : (identity_file?.trim() || null),
      connectionType === 'docker' ? 'docker' : (auth_method || 'key'),
      group_name?.trim() || (connectionType === 'docker' ? 'Docker' : 'Other'),
      connectionType === 'docker' ? 0 : (is_local ? 1 : 0),
      connectionType,
      containerName,
      enabled !== false ? 1 : 0,
      nextSort
    );

    const host = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(result.lastInsertRowid);
    reply.code(201);
    return host;
  });

  // Update host
  fastify.put('/api/managed-hosts/:id', async (request, reply) => {
    const existing = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(request.params.id);
    if (!existing) return reply.code(404).send({ error: 'Host not found' });

    const { name, hostname, user, port, identity_file, auth_method, group_name, is_local, enabled, connection_type, docker_container } = request.body;
    const connectionType = connection_type === 'docker' ? 'docker' : (connection_type || existing.connection_type || 'ssh');
    const containerName = docker_container?.trim() || existing.docker_container || null;
    const resolvedHostname = connectionType === 'docker' ? containerName : (hostname?.trim() ?? existing.hostname);

    // Check for name collision with other hosts
    if (name && name.trim() !== existing.name) {
      const dup = db.prepare('SELECT id FROM managed_hosts WHERE name = ? AND id != ?').get(name.trim(), existing.id);
      if (dup) return reply.code(409).send({ error: `Host "${name.trim()}" already exists` });
    }

    db.prepare(`
      UPDATE managed_hosts SET
        name = ?, hostname = ?, user = ?, port = ?, identity_file = ?,
        auth_method = ?, group_name = ?, is_local = ?, connection_type = ?, docker_container = ?, enabled = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name?.trim() ?? existing.name,
      resolvedHostname,
      connectionType === 'docker' ? null : (user?.trim() ?? existing.user),
      connectionType === 'docker' ? 0 : (port ?? existing.port),
      connectionType === 'docker' ? null : (identity_file?.trim() ?? existing.identity_file),
      connectionType === 'docker' ? 'docker' : (auth_method ?? existing.auth_method),
      group_name?.trim() ?? existing.group_name,
      connectionType === 'docker' ? 0 : (is_local !== undefined ? (is_local ? 1 : 0) : existing.is_local),
      connectionType,
      connectionType === 'docker' ? containerName : null,
      enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
      existing.id
    );

    return db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(existing.id);
  });

  // Delete host
  fastify.delete('/api/managed-hosts/:id', async (request, reply) => {
    const existing = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(request.params.id);
    if (!existing) return reply.code(404).send({ error: 'Host not found' });

    db.prepare('DELETE FROM managed_hosts WHERE id = ?').run(existing.id);
    return { deleted: true, name: existing.name };
  });

  // Import hosts from SSH config
  fastify.post('/api/managed-hosts/import-ssh-config', async () => {
    const sshHosts = parseSSHConfig();
    const existing = db.prepare('SELECT name FROM managed_hosts').all().map(h => h.name);
    const existingSet = new Set(existing);

    const insertStmt = db.prepare(`
      INSERT INTO managed_hosts (name, hostname, user, identity_file, auth_method, group_name, is_local, enabled, sort_order)
      VALUES (?, ?, ?, ?, 'key', ?, ?, 1, ?)
    `);

    let imported = 0;
    let skipped = 0;
    const importTransaction = db.transaction(() => {
      const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM managed_hosts').get();
      let nextSort = (maxSort?.m ?? -1) + 1;

      for (const host of sshHosts) {
        if (existingSet.has(host.name)) {
          skipped++;
          continue;
        }
        insertStmt.run(
          host.name,
          host.hostname || host.name,
          host.user || null,
          host.identityFile || null,
          host.group || 'Other',
          host.isLocal ? 1 : 0,
          nextSort++
        );
        imported++;
      }
    });

    importTransaction();

    return { imported, skipped, total: existing.length + imported };
  });

  // Check if any managed hosts exist (for auto-import on first load)
  fastify.get('/api/managed-hosts/count', async () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get();
    return { count: result.count };
  });

  // Test connectivity and tmux availability for a single host
  fastify.post('/api/managed-hosts/:id/test', async (request, reply) => {
    const host = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(request.params.id);
    if (!host) return reply.code(404).send({ error: 'Host not found' });

    const result = await testHost(host);

    // Update DB with test results
    db.prepare(`
      UPDATE managed_hosts SET
        last_test_status = ?, last_test_at = datetime('now'), tmux_available = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(result.status, result.tmuxAvailable ? 1 : 0, host.id);

    return result;
  });

  // Install tmux on a reachable host after user confirmation in the UI
  fastify.post('/api/managed-hosts/:id/install-tmux', async (request, reply) => {
    const host = db.prepare('SELECT * FROM managed_hosts WHERE id = ?').get(request.params.id);
    if (!host) return reply.code(404).send({ error: 'Host not found' });

    try {
      const result = await installTmux(host);
      db.prepare(`
        UPDATE managed_hosts SET
          last_test_status = ?, last_test_at = datetime('now'), tmux_available = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(result.test.status, result.test.tmuxAvailable ? 1 : 0, host.id);
      return result;
    } catch (err) {
      return reply.code(err.statusCode || 500).send({ error: err.message });
    }
  });

  // Test all enabled hosts in parallel
  fastify.post('/api/managed-hosts/test-all', async () => {
    const hosts = db.prepare('SELECT * FROM managed_hosts WHERE enabled = 1').all();

    const results = await Promise.allSettled(
      hosts.map(async (host) => {
        const result = await testHost(host);
        db.prepare(`
          UPDATE managed_hosts SET
            last_test_status = ?, last_test_at = datetime('now'), tmux_available = ?,
            updated_at = datetime('now')
          WHERE id = ?
        `).run(result.status, result.tmuxAvailable ? 1 : 0, host.id);
        return { id: host.id, name: host.name, ...result };
      })
    );

    const completed = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    const failed = results
      .filter(r => r.status === 'rejected')
      .map((r, i) => ({ id: hosts[i].id, name: hosts[i].name, error: r.reason?.message }));

    return { tested: completed.length, results: [...completed, ...failed] };
  });
}
