// src/routes/settings.js — App settings and session type colors API

import { apiError } from '../lib/api-error.js';
import { appSettingValidators } from '../lib/app-setting-validation.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { noStoreResponse } from '../lib/response-headers.js';
import { parsePositiveRouteId } from '../lib/route-params.js';
import { listSshKeys } from '../services/ssh-keys.js';
import {
  createSessionType,
  deleteSessionType,
  getSessionType,
  insertDiscoveredSessionTypes,
  listAppSettings,
  listSessionTypes,
  PROCESS_NAME_RE,
  sessionTypeExists,
  updateSessionType,
  upsertAppSetting,
} from '../lib/settings-store.js';
import { getManagedHosts } from '../services/hosts.js';
import {
  createSettingsExport,
  importSettingsExport,
  validateColor,
  validateLabel,
} from '../services/settings-backup.js';
import { discoverSessionTypeProcesses } from '../services/session-type-scanner.js';

export default async function settingsRoutes(fastify) {
  const db = fastify.db;

  // --- App Settings ---

  // Get all settings
  fastify.get('/api/settings', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return listAppSettings(db);
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Update a setting
  fastify.put('/api/settings/:key', async (request, reply) => {
    const { key } = request.params;
    const { value } = request.body;
    const validate = appSettingValidators[key];
    if (!validate) {
      return apiError(reply, 'Unknown setting', 404, { key });
    }
    try {
      const nextValue = validate(value);
      const setting = upsertAppSetting(db, key, nextValue);
      recordAuditEvent(db, {
        request,
        action: 'setting.update',
        targetType: 'setting',
        targetName: key,
        details: { value: nextValue },
      });
      return setting;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'setting.update',
        targetType: 'setting',
        targetName: key,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { key });
    }
  });

  fastify.get('/api/settings/export', async (request, reply) => {
    noStoreResponse(reply);
    const includeSensitivePaths = request.query?.include_sensitive_paths === 'true';
    return createSettingsExport(db, { listSshKeys, includeSensitivePaths });
  });

  fastify.post('/api/settings/import', async (request, reply) => {
    try {
      const result = importSettingsExport(db, request.body || {});
      recordAuditEvent(db, {
        request,
        action: 'settings.import',
        targetType: 'settings',
        details: result.imported,
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'settings.import',
        targetType: 'settings',
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // --- Session Types ---

  // List all session types
  fastify.get('/api/session-types', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return { types: listSessionTypes(db) };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Update a session type color/display name
  fastify.put('/api/session-types/:id', async (request, reply) => {
    let existing = null;
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      existing = getSessionType(db, id);
      if (!existing) return apiError(reply, 'Session type not found', 404, { id });

      const { display_name, color } = request.body;
      const updated = updateSessionType(db, existing.id, {
        displayName: validateLabel(display_name ?? existing.display_name, existing.display_name),
        color: validateColor(color ?? existing.color, existing.color),
      });
      recordAuditEvent(db, {
        request,
        action: 'session_type.update',
        targetType: 'session_type',
        targetId: updated.id,
        targetName: updated.process_name,
        details: {
          displayName: updated.display_name,
          color: updated.color,
        },
      });
      return updated;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session_type.update',
        targetType: 'session_type',
        targetId: existing?.id ?? (Number.isFinite(Number(id)) ? id : null),
        targetName: existing?.process_name,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: existing?.id ?? err.id ?? id });
    }
  });

  // Add a new session type
  fastify.post('/api/session-types', async (request, reply) => {
    const { process_name, display_name, color } = request.body;
    const processName = String(process_name || '').trim();
    if (!PROCESS_NAME_RE.test(processName)) {
      return apiError(reply, 'process_name must be 1-64 characters and use letters, numbers, _, ., :, or -', 400);
    }

    try {
      if (sessionTypeExists(db, processName)) {
        return apiError(reply, `Type "${processName}" already exists`, 409, { process_name: processName });
      }

      const created = createSessionType(db, {
        processName,
        displayName: validateLabel(display_name, processName),
        color: validateColor(color),
      });
      recordAuditEvent(db, {
        request,
        action: 'session_type.create',
        targetType: 'session_type',
        targetId: created.id,
        targetName: created.process_name,
        details: {
          displayName: created.display_name,
          color: created.color,
        },
      });
      reply.code(201);
      return created;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session_type.create',
        targetType: 'session_type',
        targetName: processName,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { process_name: processName });
    }
  });

  // Delete a session type
  fastify.delete('/api/session-types/:id', async (request, reply) => {
    let existing = null;
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      existing = deleteSessionType(db, id);
      if (!existing) return apiError(reply, 'Session type not found', 404, { id });
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session_type.delete',
        targetType: 'session_type',
        targetId: existing?.id ?? (Number.isFinite(Number(id)) ? id : null),
        targetName: existing?.process_name,
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }

    recordAuditEvent(db, {
      request,
      action: 'session_type.delete',
      targetType: 'session_type',
      targetId: existing.id,
      targetName: existing.process_name,
    });
    return { deleted: true, process_name: existing.process_name };
  });

  // Scan: discover currently running process names across all sessions
  fastify.post('/api/session-types/scan', async (request, reply) => {
    try {
      const hosts = getManagedHosts(db);
      const processNames = await discoverSessionTypeProcesses(hosts);
      const inserted = insertDiscoveredSessionTypes(db, processNames);
      const result = {
        discovered: processNames,
        added: inserted.added,
        total: inserted.total,
      };
      recordAuditEvent(db, {
        request,
        action: 'session_type.scan',
        targetType: 'session_type',
        details: {
          discovered: processNames.length,
          added: inserted.added,
          total: inserted.total,
        },
      });
      return result;
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'session_type.scan',
        targetType: 'session_type',
        status: 'error',
        error: err.message,
      });
      return apiError(reply, err, err.statusCode || 500);
    }
  });
}
