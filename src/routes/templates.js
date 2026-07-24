// src/routes/templates.js — Workspace template CRUD
// Templates store layout structure (splits, sizes) without session assignments.
// When creating a workspace from a template, sessions are auto-assigned from available sessions.

import { apiError } from '../lib/api-error.js';
import { recordAuditEvent } from '../lib/audit-log.js';
import { normalizeResourceDescription, normalizeResourceName } from '../lib/name-description-limits.js';
import { parsePositiveRouteId } from '../lib/route-params.js';
import { noStoreResponse } from '../lib/response-headers.js';
import {
  createTemplateRow,
  deleteTemplateRow,
  getTemplateRow,
  listTemplateRows,
  serializeTemplate,
  updateTemplateRow,
} from '../lib/template-store.js';

export default async function templateRoutes(fastify) {
  const db = fastify.db;

  // List all templates
  fastify.get('/api/templates', async (_request, reply) => {
    noStoreResponse(reply);
    try {
      return {
        templates: listTemplateRows(db).map(serializeTemplate),
      };
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500);
    }
  });

  // Create a template (typically from "Save as Template" on an existing workspace)
  fastify.post('/api/templates', async (request, reply) => {
    const { name, description, layout } = request.body || {};
    const normalizedName = normalizeResourceName(name, { required: true });
    if (normalizedName.error) return apiError(reply, normalizedName.error, 400);
    const normalizedDescription = normalizeResourceDescription(description, { defaultValue: '' });
    if (normalizedDescription.error) return apiError(reply, normalizedDescription.error, 400);
    if (!layout) return apiError(reply, 'Layout is required', 400);

    try {
      const created = createTemplateRow(db, { name: normalizedName.value, description: normalizedDescription.value, layout });

      fastify.log.info({ id: created.row.id, name: normalizedName.value, paneCount: created.paneCount }, 'Template created');
      recordAuditEvent(db, {
        request,
        action: 'template.create',
        targetType: 'template',
        targetId: created.row.id,
        targetName: normalizedName.value,
        details: { paneCount: created.paneCount },
      });
      return reply.code(201).send({
        id: created.row.id,
        name: normalizedName.value,
        description: normalizedDescription.value,
        layout: created.layout,
        paneCount: created.paneCount,
      });
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'template.create',
        targetType: 'template',
        targetName: normalizedName.value,
        status: 'error',
        error: err.message,
      });
      if (err.statusCode) return apiError(reply, err, err.statusCode);
      if (err.message?.includes('UNIQUE')) {
        return apiError(reply, `Template "${normalizedName.value}" already exists`, 409, { name: normalizedName.value });
      }
      return apiError(reply, err, 500, { name: normalizedName.value });
    }
  });

  // Rename a template
  fastify.put('/api/templates/:id', async (request, reply) => {
    const { name, description } = request.body || {};
    const updates = {};
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      const row = getTemplateRow(db, id);
      if (!row) return apiError(reply, 'Template not found', 404, { id });

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
      const changed = updateTemplateRow(db, id, updates);
      if (!changed) return apiError(reply, 'Nothing to update', 400, { id });
      recordAuditEvent(db, {
        request,
        action: 'template.update',
        targetType: 'template',
        targetId: id,
        targetName: updates.name || row.name,
        details: {
          renamed: updates.name !== undefined && updates.name !== row.name,
          descriptionChanged: updates.description !== undefined,
        },
      });
      return { success: true };
    } catch (err) {
      recordAuditEvent(db, {
        request,
        action: 'template.update',
        targetType: 'template',
        targetId: Number.isFinite(Number(id)) ? id : null,
        targetName: updates.name,
        status: 'error',
        error: err.message,
      });
      if (err.message?.includes('UNIQUE')) {
        return apiError(reply, `Template "${updates.name}" already exists`, 409, { name: updates.name });
      }
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }
  });

  // Delete a template
  fastify.delete('/api/templates/:id', async (request, reply) => {
    let row = null;
    let id = request.params.id;
    try {
      id = parsePositiveRouteId(request.params.id);
      row = deleteTemplateRow(db, id);
      if (!row) return apiError(reply, 'Template not found', 404, { id });
    } catch (err) {
      return apiError(reply, err, err.statusCode || 500, { id: err.id ?? id });
    }

    fastify.log.info({ id, name: row.name }, 'Template deleted');
    recordAuditEvent(db, {
      request,
      action: 'template.delete',
      targetType: 'template',
      targetId: row.id,
      targetName: row.name,
    });
    return { success: true, name: row.name };
  });
}
