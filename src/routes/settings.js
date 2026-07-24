// src/routes/settings.js — App settings and session type colors API

export default async function settingsRoutes(fastify) {
  const db = fastify.db;
  const settingValidators = {
    accent_color(value) {
      if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw Object.assign(new Error('accent_color must be a #RRGGBB color'), { statusCode: 400 });
      }
      return value;
    },
  };
  const PROCESS_NAME_RE = /^[a-zA-Z0-9_.:-]{1,64}$/;

  function validateColor(color, fallback = '#6b7688') {
    if (color === undefined || color === null || color === '') return fallback;
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw Object.assign(new Error('color must be a #RRGGBB color'), { statusCode: 400 });
    }
    return color;
  }

  function validateLabel(value, fallback) {
    const label = String(value || fallback || '').trim();
    if (!label) throw Object.assign(new Error('display_name is required'), { statusCode: 400 });
    if (label.length > 64) throw Object.assign(new Error('display_name must be 64 characters or fewer'), { statusCode: 400 });
    return label;
  }

  // --- App Settings ---

  // Get all settings
  fastify.get('/api/settings', async () => {
    const rows = db.prepare('SELECT key, value FROM app_settings').all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    return settings;
  });

  // Update a setting
  fastify.put('/api/settings/:key', async (request, reply) => {
    const { key } = request.params;
    const { value } = request.body;
    const validate = settingValidators[key];
    if (!validate) {
      return reply.code(404).send({ error: 'Unknown setting' });
    }
    const nextValue = validate(value);
    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')"
    ).run(key, nextValue, nextValue);
    return { key, value: nextValue };
  });

  // --- Session Types ---

  // List all session types
  fastify.get('/api/session-types', async () => {
    const types = db.prepare('SELECT * FROM session_types ORDER BY sort_order, process_name').all();
    return { types };
  });

  // Update a session type color/display name
  fastify.put('/api/session-types/:id', async (request, reply) => {
    const existing = db.prepare('SELECT * FROM session_types WHERE id = ?').get(request.params.id);
    if (!existing) return reply.code(404).send({ error: 'Session type not found' });

    const { display_name, color } = request.body;
    try {
      db.prepare(
        "UPDATE session_types SET display_name = ?, color = ?, created_at = COALESCE(created_at, datetime('now')) WHERE id = ?"
      ).run(
        validateLabel(display_name ?? existing.display_name, existing.display_name),
        validateColor(color ?? existing.color, existing.color),
        existing.id
      );
    } catch (err) {
      return reply.code(err.statusCode || 400).send({ error: err.message });
    }

    return db.prepare('SELECT * FROM session_types WHERE id = ?').get(existing.id);
  });

  // Add a new session type
  fastify.post('/api/session-types', async (request, reply) => {
    const { process_name, display_name, color } = request.body;
    const processName = String(process_name || '').trim();
    if (!PROCESS_NAME_RE.test(processName)) {
      return reply.code(400).send({ error: 'process_name must be 1-64 characters and use letters, numbers, _, ., :, or -' });
    }

    const existing = db.prepare('SELECT id FROM session_types WHERE process_name = ?').get(processName);
    if (existing) {
      return reply.code(409).send({ error: `Type "${processName}" already exists` });
    }

    const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM session_types').get();
    let result;
    try {
      result = db.prepare(
        'INSERT INTO session_types (process_name, display_name, color, sort_order) VALUES (?, ?, ?, ?)'
      ).run(
        processName,
        validateLabel(display_name, processName),
        validateColor(color),
        (maxSort?.m ?? 99) + 1
      );
    } catch (err) {
      return reply.code(err.statusCode || 400).send({ error: err.message });
    }

    reply.code(201);
    return db.prepare('SELECT * FROM session_types WHERE id = ?').get(result.lastInsertRowid);
  });

  // Delete a session type
  fastify.delete('/api/session-types/:id', async (request, reply) => {
    const existing = db.prepare('SELECT * FROM session_types WHERE id = ?').get(request.params.id);
    if (!existing) return reply.code(404).send({ error: 'Session type not found' });

    db.prepare('DELETE FROM session_types WHERE id = ?').run(existing.id);
    return { deleted: true, process_name: existing.process_name };
  });

  // Scan: discover currently running process names across all sessions
  fastify.post('/api/session-types/scan', async () => {
    // Get all sessions from the sessions API logic
    const { parseSSHConfig } = await import('../services/ssh-config.js');
    const { listSessions } = await import('../services/tmux.js');

    // Get enabled hosts
    const hosts = db.prepare('SELECT * FROM managed_hosts WHERE enabled = 1').all();
    const mappedHosts = hosts.map(h => ({
      name: h.name,
      hostname: h.hostname,
      user: h.user,
      identityFile: h.identity_file,
      isLocal: !!h.is_local,
    }));

    // If no managed hosts, try local
    if (mappedHosts.length === 0) {
      mappedHosts.push({ name: 'localhost', hostname: '127.0.0.1', isLocal: true });
    }

    // Collect all process names from all sessions
    const processNames = new Set();
    const results = await Promise.allSettled(
      mappedHosts.map(h => listSessions(h, { timeout: 5000 }))
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const s of r.value.sessions || []) {
        if (s.type && s.type !== 'terminal') {
          // The current type detection gives us 'claude-code', 'gsd', 'terminal'
          // We need the raw process name. Let's get it from the session.
        }
      }
    }

    // Direct approach: query tmux for pane commands on local host
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    try {
      const { stdout } = await execFileAsync('tmux', [
        'list-panes', '-a', '-F', '#{pane_current_command}'
      ], { timeout: 5000 });
      for (const cmd of stdout.trim().split('\n')) {
        const name = cmd.trim().toLowerCase();
        if (name) processNames.add(name);
      }
    } catch { /* no local tmux */ }

    // Also try remote hosts
    for (const host of mappedHosts.filter(h => !h.isLocal)) {
      try {
        const args = [
          '-o', 'ConnectTimeout=3', '-o', 'BatchMode=yes',
          '-o', 'StrictHostKeyChecking=accept-new',
        ];
        if (host.identityFile) args.push('-i', host.identityFile.replace('~', process.env.HOME));
        const target = host.user ? `${host.user}@${host.hostname}` : host.hostname;
        args.push(target, "tmux list-panes -a -F '#{pane_current_command}'");
        const { stdout } = await execFileAsync('ssh', args, { timeout: 8000 });
        for (const cmd of stdout.trim().split('\n')) {
          const name = cmd.trim().toLowerCase();
          if (name) processNames.add(name);
        }
      } catch { /* skip unreachable hosts */ }
    }

    // Insert any new process names that aren't already in the table
    const existing = new Set(
      db.prepare('SELECT process_name FROM session_types').all().map(r => r.process_name)
    );

    const insertStmt = db.prepare(
      'INSERT INTO session_types (process_name, display_name, color, sort_order) VALUES (?, ?, ?, ?)'
    );
    const maxSort = db.prepare('SELECT MAX(sort_order) as m FROM session_types').get();
    let nextSort = (maxSort?.m ?? 99) + 1;
    let added = 0;

    for (const name of processNames) {
      if (!existing.has(name)) {
        insertStmt.run(name, name, '#6b7688', nextSort++);
        added++;
      }
    }

    return {
      discovered: [...processNames].sort(),
      added,
      total: existing.size + added,
    };
  });
}
