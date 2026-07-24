// src/routes/workspaces.js — Workspace CRUD API with SQLite persistence

import { apiError } from '../lib/api-error.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { countLayoutPanes } from '../lib/layout-utils.js';
import { normalizeResourceDescription, normalizeResourceName } from '../lib/name-description-limits.js';
import { parsePositiveRouteId } from '../lib/route-params.js';
import { noStoreResponse } from '../lib/response-headers.js';
import {
  createWorkspaceRow,
  deleteWorkspaceRow,
  getWorkspaceRow,
  listWorkspaceRows,
  removeLegacyDefaultLayoutPresets,
  serializeWorkspace,
  updateWorkspaceRow,
} from '../lib/workspace-store.js';

export default async function workspaceRoutes(fastify) {
  const db = fastify.db;

  // Older builds seeded example workspaces on first run. Remove only those
  // generated defaults so new installs start empty and show the setup flow.
  removeLegacyDefaultLayoutPresets(db);

  // List all workspaces
  fastify.get('/api/workspaces', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return {
        workspaces: listWorkspaceRows(db).map(row => serializeWorkspace(row, { includeSortOrder: true })),
      };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Get single workspace
  fastify.get('/api/workspaces/:id', async (request, reply) => {
    noStoreResponse(reply);
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const row = getWorkspaceRow(db, id);
      if (!row) return apiError(reply, 'Workspace not found', 404, { id });
      return serializeWorkspace(row);
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Create workspace
  fastify.post('/api/workspaces', async (request, reply) => {
    const { name, layout, description } = request.body || {};
    const normalizedName = normalizeResourceName(name, { required: true });
    if (normalizedName.error) return apiError(reply, normalizedName.error, 400);
    const normalizedDescription = normalizeResourceDescription(description, { defaultValue: '' });
    if (normalizedDescription.error) return apiError(reply, normalizedDescription.error, 400);
    if (!layout) return apiError(reply, 'Layout is required', 400);

    try {
      const row = createWorkspaceRow(db, { name: normalizedName.value, description: normalizedDescription.value, layout });

      fastify.log.info({ id: row.id, name: normalizedName.value }, 'Workspace created');
      recordAuditEvent(db, {
        request,
        action: 'workspace.create',
        targetType: 'workspace',
        targetId: row.id,
        targetName: normalizedName.value,
        details: { paneCount: countLayoutPanes(layout) },
      });
      return reply.code(201).send({
        id: row.id,
        name: normalizedName.value,
        layout,
      });
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'workspace.create',
        targetType: 'workspace',
        targetName: normalizedName.value,
        status: 'error',
        error: err.message,
      });
      if (err.statusCode) return apiError(reply, err, err.statusCode);
      if (err.message?.includes('UNIQUE')) {
        return apiError(reply, `Workspace "${normalizedName.value}" already exists`, 409, { name: normalizedName.value });
      }
      return apiError(reply, err, 500, { name: normalizedName.value });
    }
  });

  // Update workspace layout
  fastify.put('/api/workspaces/:id', async (request, reply) => {
    const { layout, name, description } = request.body || {};
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const row = getWorkspaceRow(db, id);
      if (!row) return apiError(reply, 'Workspace not found', 404, { id });

      const updates = { layout };
      if (name !== undefined) {
        const normalizedName = normalizeResourceName(name, { required: true });
        if (normalizedName.error) return apiError(reply, normalizedName.error, 400);
        updates.name = normalizedName.value;
      }
      if (description !== undefined) {
        const normalizedDescription = normalizeResourceDescription(description);
        if (normalizedDescription.error) return apiError(reply, normalizedDescription.error, 400);
        updates.description = normalizedDescription.value;
      }
      const changed = updateWorkspaceRow(db, id, updates);
      if (!changed) return apiError(reply, 'Nothing to update', 400, { id });
      fastify.log.info({ id }, 'Workspace updated');
      recordAuditEvent(db, {
        request,
        action: 'workspace.update',
        targetType: 'workspace',
        targetId: id,
        targetName: updates.name || row.name,
        details: {
          renamed: updates.name !== undefined && updates.name !== row.name,
          descriptionChanged: updates.description !== undefined,
          layoutChanged: layout !== undefined,
          paneCount: layout ? countLayoutPanes(layout) : countLayoutPanes(JSON.parse(row.layout_json)),
        },
      });
      return { success: true, id };
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'workspace.update',
        targetType: 'workspace',
        targetId: Number.isFinite(Number(id)) ? id : null,
        status: 'error',
        error: err.message,
      });
      if (err.statusCode) return apiError(reply, err, err.statusCode);
      return apiError(reply, err, 500, { id: err.id ?? id });
    }
  });

  // Delete workspace
  fastify.delete('/api/workspaces/:id', async (request, reply) => {
    let row = null;
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      row = deleteWorkspaceRow(db, id);
      if (!row) return apiError(reply, 'Workspace not found', 404, { id });
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }

    fastify.log.info({ id, name: row.name }, 'Workspace deleted');
    recordAuditEvent(db, {
      request,
      action: 'workspace.delete',
      targetType: 'workspace',
      targetId: row.id,
      targetName: row.name,
    });
    return { success: true };
  });
}
