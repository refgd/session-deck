// src/routes/workspaces.js — Workspace CRUD API with SQLite persistence

export default async function workspaceRoutes(fastify) {
  const db = fastify.db;

  // Older builds seeded example workspaces on first run. Remove only those
  // generated defaults so new installs start empty and show the setup flow.
  removeLegacyDefaults(db);

  // List all workspaces
  fastify.get('/api/workspaces', async () => {
    const rows = db.prepare('SELECT * FROM layout_presets ORDER BY sort_order, id').all();
    return {
      workspaces: rows.map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        layout: JSON.parse(r.layout_json),
        isDefault: !!r.is_default,
        sortOrder: r.sort_order || 0,
      })),
    };
  });

  // Get single workspace
  fastify.get('/api/workspaces/:id', async (request, reply) => {
    const row = db.prepare('SELECT * FROM layout_presets WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Workspace not found' });
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      layout: JSON.parse(row.layout_json),
      isDefault: !!row.is_default,
    };
  });

  // Create workspace
  fastify.post('/api/workspaces', async (request, reply) => {
    const { name, layout, description } = request.body || {};
    if (!name) return reply.code(400).send({ error: 'Name is required' });
    if (!layout) return reply.code(400).send({ error: 'Layout is required' });

    try {
      const result = db.prepare(
        'INSERT INTO layout_presets (name, description, layout_json) VALUES (?, ?, ?)'
      ).run(name, description || '', JSON.stringify(layout));

      fastify.log.info({ id: result.lastInsertRowid, name }, 'Workspace created');
      return reply.code(201).send({
        id: result.lastInsertRowid,
        name,
        layout,
      });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return reply.code(409).send({ error: `Workspace "${name}" already exists` });
      }
      throw err;
    }
  });

  // Update workspace layout
  fastify.put('/api/workspaces/:id', async (request, reply) => {
    const { layout, name, description } = request.body || {};
    const row = db.prepare('SELECT * FROM layout_presets WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Workspace not found' });

    const updates = [];
    const params = [];
    if (layout) { updates.push('layout_json = ?'); params.push(JSON.stringify(layout)); }
    if (name) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    updates.push("updated_at = datetime('now')");
    params.push(request.params.id);

    db.prepare(`UPDATE layout_presets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    fastify.log.info({ id: request.params.id }, 'Workspace updated');
    return { success: true, id: Number(request.params.id) };
  });

  // Delete workspace
  fastify.delete('/api/workspaces/:id', async (request, reply) => {
    const row = db.prepare('SELECT * FROM layout_presets WHERE id = ?').get(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Workspace not found' });

    db.prepare('DELETE FROM layout_presets WHERE id = ?').run(request.params.id);
    fastify.log.info({ id: request.params.id, name: row.name }, 'Workspace deleted');
    return { success: true };
  });
}

function removeLegacyDefaults(db) {
  db.prepare(`
    DELETE FROM layout_presets
    WHERE is_default = 1
      AND name IN ('claude-focus', 'quad', 'deck')
  `).run();
}
