// src/routes/managed-hosts.js — CRUD API for managed SSH hosts

import { parseSSHConfig } from '../services/ssh-config.js';
import { dockerListContext, listRunningContainersWithContext } from '../services/docker.js';
import { deleteSshKey, listSshKeys, saveSshKey } from '../services/ssh-keys.js';
import { installTmux, testHost } from '../services/managed-host-diagnostics.js';
import { attachGateway } from '../services/hosts.js';
import { apiError } from '../lib/api-error.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { mapWithConcurrency } from '../lib/async-utils.js';
import { noStoreResponse } from '../lib/response-headers.js';
import {
  countManagedHosts,
  deleteManagedHost,
  gatewayExists,
  getManagedHostRow,
  groupManagedHostRows,
  hostNameExists,
  importSshConfigHosts,
  insertManagedHost,
  listEnabledManagedHostRows,
  listHostsUsingIdentityFile,
  listIdentityFileUsageRows,
  listManagedHostRows,
  updateManagedHost,
  updateManagedHostTestResult,
  wouldCreateGatewayCycle,
} from '../lib/managed-host-store.js';
import { normalizeHostPayload } from '../lib/host-payload.js';
import { resolveDockerListGateway } from '../lib/docker-container-query.js';
import { parsePositiveRouteId } from '../lib/route-params.js';
import { redactPath } from '../lib/path-redaction.js';

export const MANAGED_HOST_TEST_CONCURRENCY = 4;
export const DOCKER_CONTAINER_RATE_LIMIT_MAX = 30;
export const DOCKER_CONTAINER_RATE_LIMIT_WINDOW = '1 minute';
export const HOST_TEST_RATE_LIMIT_MAX = 60;
export const HOST_TEST_RATE_LIMIT_WINDOW = '1 minute';
export const HOST_INSTALL_RATE_LIMIT_MAX = 10;
export const HOST_INSTALL_RATE_LIMIT_WINDOW = '10 minutes';
export const HOST_TEST_ALL_RATE_LIMIT_MAX = 10;
export const HOST_TEST_ALL_RATE_LIMIT_WINDOW = '1 minute';

function listKeysWithUsage(db) {
  const hosts = listIdentityFileUsageRows(db);
  return listSshKeys().map(key => sshKeyResponse(key, hosts));
}

export function sshKeyResponse(key, hosts = []) {
  return {
    ...key,
    displayPath: redactPath(key.path),
    usedByHosts: hosts
      .filter(host => host.identity_file === key.path)
      .map(host => ({ id: host.id, name: host.name })),
  };
}

export default async function managedHostsRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/api/docker/containers', {
    config: {
      rateLimit: {
        max: DOCKER_CONTAINER_RATE_LIMIT_MAX,
        timeWindow: DOCKER_CONTAINER_RATE_LIMIT_WINDOW,
      },
    },
  }, async (request, reply) => {
    noStoreResponse(reply);
    let context = null;
    try {
      const gateway = resolveDockerListGateway(db, request.query);
      context = dockerListContext(gateway);
      return await listRunningContainersWithContext(gateway);
    } catch (err) {
      return apiError(reply, err, err.statusCode || 503, {
        ...(context ? { context } : {}),
      });
    }
  });

  fastify.get('/api/ssh-keys', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return { keys: listKeysWithUsage(db) };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  fastify.post('/api/ssh-keys', async (request, reply) => {
    try {
      const key = saveSshKey(request.body || {});
      recordAuditEvent(db, {
        request,
        action: 'ssh_key.create',
        targetType: 'ssh_key',
        targetName: key.name,
        details: { path: key.path },
      });
      reply.code(201);
      return key;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'ssh_key.create',
        targetType: 'ssh_key',
        targetName: request.body?.name,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err);
    }
  });

  fastify.delete('/api/ssh-keys/:name', async (request, reply) => {
    try {
      const key = listSshKeys().find(k => k.name === request.params.name && k.managed);
      if (key) {
        const usedBy = listHostsUsingIdentityFile(db, key.path);
        if (usedBy.length > 0) {
          return apiError(reply, 'SSH key is used by one or more hosts', 409, {
            usedByHosts: usedBy,
          });
        }
      }
      const deleted = deleteSshKey(request.params.name);
      recordAuditEvent(db, {
        request,
        action: 'ssh_key.delete',
        targetType: 'ssh_key',
        targetName: request.params.name,
        details: deleted ? { path: deleted.path } : null,
      });
      return deleted;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'ssh_key.delete',
        targetType: 'ssh_key',
        targetName: request.params.name,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err);
    }
  });

  // List all managed hosts
  fastify.get('/api/managed-hosts', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      const hosts = listManagedHostRows(db);
      return { hosts, groups: groupManagedHostRows(hosts), count: hosts.length };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Get single host
  fastify.get('/api/managed-hosts/:id', async (request, reply) => {
    noStoreResponse(reply);
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const host = getManagedHostRow(db, id);
      if (!host) return apiError(reply, 'Host not found', 404, { id });
      return host;
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Create host
  fastify.post('/api/managed-hosts', async (request, reply) => {
    const normalized = normalizeHostPayload(request.body || {});
    if (normalized.error) return apiError(reply, normalized.error, 400);
    const hostInput = normalized.value;
    try {
      if (hostInput.gateway_host_id) {
        if (!gatewayExists(db, hostInput.gateway_host_id)) return apiError(reply, 'Gateway host not found', 400);
      }

      // Check for duplicate name
      if (hostNameExists(db, hostInput.name)) {
        return apiError(reply, `Host "${hostInput.name}" already exists`, 409);
      }

      const host = insertManagedHost(db, hostInput);
      recordAuditEvent(db, {
        request,
        action: 'managed_host.create',
        targetType: 'managed_host',
        targetId: host.id,
        targetName: host.name,
        details: {
          connectionType: host.connection_type,
          gatewayHostId: host.gateway_host_id,
          enabled: !!host.enabled,
        },
      });
      reply.code(201);
      return host;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.create',
        targetType: 'managed_host',
        targetName: hostInput.name,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { name: hostInput.name });
    }
  });

  // Update host
  fastify.put('/api/managed-hosts/:id', async (request, reply) => {
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const existing = getManagedHostRow(db, id);
      if (!existing) return apiError(reply, 'Host not found', 404, { id });

      const normalized = normalizeHostPayload(request.body || {}, existing);
      if (normalized.error) return apiError(reply, normalized.error, 400, { id });
      const hostInput = normalized.value;

      // Check for name collision with other hosts
      if (hostInput.name !== existing.name) {
        if (hostNameExists(db, hostInput.name, existing.id)) return apiError(reply, `Host "${hostInput.name}" already exists`, 409);
      }
      if (hostInput.gateway_host_id) {
        if (hostInput.gateway_host_id === existing.id) return apiError(reply, 'Host cannot use itself as gateway', 400);
        if (!gatewayExists(db, hostInput.gateway_host_id)) return apiError(reply, 'Gateway host not found', 400);
        if (wouldCreateGatewayCycle(db, existing.id, hostInput.gateway_host_id)) {
          return apiError(reply, 'Gateway chain cannot contain a cycle', 400);
        }
      }

      const updated = updateManagedHost(db, existing.id, hostInput);
      recordAuditEvent(db, {
        request,
        action: 'managed_host.update',
        targetType: 'managed_host',
        targetId: updated.id,
        targetName: updated.name,
        details: {
          previousName: existing.name,
          connectionType: updated.connection_type,
          gatewayHostId: updated.gateway_host_id,
          enabled: !!updated.enabled,
        },
      });
      return updated;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.update',
        targetType: 'managed_host',
        targetId: Number.isFinite(Number(id)) ? id : null,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Delete host
  fastify.delete('/api/managed-hosts/:id', async (request, reply) => {
    let existing = null;
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      existing = deleteManagedHost(db, id);
      if (!existing) return apiError(reply, 'Host not found', 404, { id });
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.delete',
        targetType: 'managed_host',
        targetId: Number.isFinite(Number(id)) ? id : null,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }

    recordAuditEvent(db, {
      request,
      action: 'managed_host.delete',
      targetType: 'managed_host',
      targetId: existing.id,
      targetName: existing.name,
    });
    return { deleted: true, name: existing.name };
  });

  // Import hosts from SSH config
  fastify.post('/api/managed-hosts/import-ssh-config', async (request, reply) => {
    try {
      const result = importSshConfigHosts(db, parseSSHConfig());
      recordAuditEvent(db, {
        request,
        action: 'managed_host.import_ssh_config',
        targetType: 'managed_host',
        details: result,
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.import_ssh_config',
        targetType: 'managed_host',
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Check if any managed hosts exist (for auto-import on first load)
  fastify.get('/api/managed-hosts/count', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return { count: countManagedHosts(db) };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Test connectivity and tmux availability for a single host
  fastify.post('/api/managed-hosts/:id/test', {
    config: {
      rateLimit: {
        max: HOST_TEST_RATE_LIMIT_MAX,
        timeWindow: HOST_TEST_RATE_LIMIT_WINDOW,
      },
    },
  }, async (request, reply) => {
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const host = attachGateway(db, getManagedHostRow(db, id));
      if (!host) return apiError(reply, 'Host not found', 404, { id });

      const result = await testHost(host);
      updateManagedHostTestResult(db, host.id, result);
      recordAuditEvent(db, {
        request,
        action: 'managed_host.test',
        targetType: 'managed_host',
        targetId: host.id,
        targetName: host.name,
        status: result.status === 'ok' ? 'ok' : 'error',
        details: {
          tmuxAvailable: result.tmuxAvailable,
          durationMs: result.durationMs,
          osId: result.osId,
        },
        error: result.error,
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.test',
        targetType: 'managed_host',
        targetId: Number.isFinite(Number(id)) ? id : null,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Install tmux on a reachable host after user confirmation in the UI
  fastify.post('/api/managed-hosts/:id/install-tmux', {
    config: {
      rateLimit: {
        max: HOST_INSTALL_RATE_LIMIT_MAX,
        timeWindow: HOST_INSTALL_RATE_LIMIT_WINDOW,
      },
    },
  }, async (request, reply) => {
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const host = attachGateway(db, getManagedHostRow(db, id));
      if (!host) return apiError(reply, 'Host not found', 404, { id });

      const result = await installTmux(host);
      updateManagedHostTestResult(db, host.id, result.test);
      recordAuditEvent(db, {
        request,
        action: 'managed_host.install_tmux',
        targetType: 'managed_host',
        targetId: host.id,
        targetName: host.name,
        status: result.test?.status === 'ok' ? 'ok' : 'error',
        details: {
          installed: result.installed,
          alreadyInstalled: result.alreadyInstalled,
          installCommand: result.installCommand,
        },
        error: result.test?.error,
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'managed_host.install_tmux',
        targetType: 'managed_host',
        targetId: Number.isFinite(Number(id)) ? id : null,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Test all enabled hosts with bounded parallelism
  fastify.post('/api/managed-hosts/test-all', {
    config: {
      rateLimit: {
        max: HOST_TEST_ALL_RATE_LIMIT_MAX,
        timeWindow: HOST_TEST_ALL_RATE_LIMIT_WINDOW,
      },
    },
  }, async (_request, reply) => {
    let hosts = [];
    try {
      hosts = listEnabledManagedHostRows(db).map(host => attachGateway(db, host));
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }

    const results = await mapWithConcurrency(
      hosts,
      MANAGED_HOST_TEST_CONCURRENCY,
      async (host) => {
        try {
          const result = await testHost(host);
          updateManagedHostTestResult(db, host.id, result);
          return { status: 'fulfilled', value: { id: host.id, name: host.name, ...result } };
        } catch (err) {
          return { status: 'rejected', reason: err, host };
        }
      }
    );

    const completed = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    const failed = results
      .filter(r => r.status === 'rejected')
      .map(r => ({ id: r.host.id, name: r.host.name, error: r.reason?.message }));

    recordAuditEvent(db, {
      request: _request,
      action: 'managed_host.test_all',
      targetType: 'managed_host',
      status: failed.length ? 'error' : 'ok',
      details: {
        tested: completed.length,
        failed: failed.length,
      },
      error: failed.length ? `${failed.length} host tests failed` : null,
    });
    return { tested: completed.length, results: [...completed, ...failed] };
  });
}
