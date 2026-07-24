import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import settingsRoutes from '../src/routes/settings.js';
import sessionsRoutes from '../src/routes/sessions.js';
import templateRoutes from '../src/routes/templates.js';
import workspaceRoutes from '../src/routes/workspaces.js';
import { createMemoryDb } from '../test-support/db.js';

async function buildRouteServer() {
  const app = Fastify({ logger: false });
  const db = createMemoryDb();
  app.decorate('db', db);
  app.addHook('onClose', () => db.close());
  await app.register(workspaceRoutes);
  await app.register(templateRoutes);
  return app;
}

async function buildBrokenSessionServer() {
  const app = Fastify({ logger: false });
  app.decorate('db', {
    prepare() {
      throw Object.assign(new Error('database unavailable'), {
        code: 'SQLITE_IOERR',
        path: '/data/session-deck.db',
      });
    },
  });
  await app.register(sessionsRoutes);
  return app;
}

async function buildBrokenSettingsServer() {
  const app = Fastify({ logger: false });
  app.decorate('db', {
    prepare() {
      throw Object.assign(new Error('database unavailable'), {
        code: 'SQLITE_IOERR',
        path: '/data/session-deck.db',
      });
    },
    transaction() {
      throw Object.assign(new Error('database unavailable'), {
        code: 'SQLITE_IOERR',
        path: '/data/session-deck.db',
      });
    },
  });
  await app.register(settingsRoutes);
  return app;
}

function makeDbUnavailable(db) {
  db.prepare = () => {
    throw Object.assign(new Error('database unavailable'), {
      code: 'SQLITE_IOERR',
      path: '/data/session-deck.db',
    });
  };
}

test('workspace route errors use stable apiError payloads', async () => {
  const app = await buildRouteServer();
  try {
    const missingName = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { layout: { session: 'main' } },
    });
    assert.equal(missingName.statusCode, 400);
    assert.deepEqual(missingName.json(), {
      error: 'Name is required',
      message: 'Name is required',
      statusCode: 400,
    });

    const longWorkspaceName = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'x'.repeat(81), layout: { session: 'main' } },
    });
    assert.equal(longWorkspaceName.statusCode, 400);
    assert.equal(longWorkspaceName.json().message, 'Name is too long');

    const longWorkspaceDescription = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'described', description: 'x'.repeat(513), layout: { session: 'main' } },
    });
    assert.equal(longWorkspaceDescription.statusCode, 400);
    assert.equal(longWorkspaceDescription.json().message, 'Description is too long');

    const oversizedWorkspaceLayout = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'too-large', layout: { note: 'x'.repeat(64 * 1024) } },
    });
    assert.equal(oversizedWorkspaceLayout.statusCode, 400);
    assert.equal(oversizedWorkspaceLayout.json().message, 'layout_json is too large');

    const missing = await app.inject('/api/workspaces/999');
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), {
      error: 'Workspace not found',
      message: 'Workspace not found',
      statusCode: 404,
      id: 999,
    });

    await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'main', layout: { session: 'main' } },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'main', layout: { session: 'main' } },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(duplicate.json(), {
      error: 'Workspace "main" already exists',
      message: 'Workspace "main" already exists',
      statusCode: 409,
      name: 'main',
    });

    const emptyUpdate = await app.inject({
      method: 'PUT',
      url: '/api/workspaces/1',
      payload: {},
    });
    assert.equal(emptyUpdate.statusCode, 400);
    assert.deepEqual(emptyUpdate.json(), {
      error: 'Nothing to update',
      message: 'Nothing to update',
      statusCode: 400,
      id: 1,
    });

    const invalidId = await app.inject('/api/workspaces/abc');
    assert.equal(invalidId.statusCode, 400);
    assert.deepEqual(invalidId.json(), {
      error: 'id must be a positive integer',
      message: 'id must be a positive integer',
      statusCode: 400,
      id: 'abc',
    });
  } finally {
    await app.close();
  }
});

test('workspace unexpected database errors use stable apiError payloads', async () => {
  const app = await buildRouteServer();
  try {
    makeDbUnavailable(app.db);

    const list = await app.inject('/api/workspaces');
    assert.equal(list.statusCode, 500);
    assert.equal(list.headers['cache-control'], 'no-store');
    assert.equal(list.headers.pragma, 'no-cache');
    assert.deepEqual(list.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const get = await app.inject('/api/workspaces/1');
    assert.equal(get.statusCode, 500);
    assert.equal(get.headers['cache-control'], 'no-store');
    assert.equal(get.headers.pragma, 'no-cache');
    assert.deepEqual(get.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      id: 1,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const update = await app.inject({
      method: 'PUT',
      url: '/api/workspaces/1',
      payload: { name: 'main' },
    });
    assert.equal(update.statusCode, 500);
    assert.equal(update.json().message, 'database unavailable');
    assert.equal(update.json().id, 1);
  } finally {
    await app.close();
  }
});

test('template route errors use stable apiError payloads', async () => {
  const app = await buildRouteServer();
  try {
    const missingLayout = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'single' },
    });
    assert.equal(missingLayout.statusCode, 400);
    assert.deepEqual(missingLayout.json(), {
      error: 'Layout is required',
      message: 'Layout is required',
      statusCode: 400,
    });

    const longTemplateName = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'x'.repeat(81), layout: { session: 'main' } },
    });
    assert.equal(longTemplateName.statusCode, 400);
    assert.equal(longTemplateName.json().message, 'Name is too long');

    const longTemplateDescription = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'described', description: 'x'.repeat(513), layout: { session: 'main' } },
    });
    assert.equal(longTemplateDescription.statusCode, 400);
    assert.equal(longTemplateDescription.json().message, 'Description is too long');

    const oversizedTemplateLayout = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'too-large', layout: { note: 'x'.repeat(64 * 1024) } },
    });
    assert.equal(oversizedTemplateLayout.statusCode, 400);
    assert.equal(oversizedTemplateLayout.json().message, 'layout_json is too large');

    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/templates/999',
    });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.json(), {
      error: 'Template not found',
      message: 'Template not found',
      statusCode: 404,
      id: 999,
    });

    const layout = { session: 'main' };
    await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'single', layout },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'single', layout },
    });
    assert.equal(duplicate.statusCode, 409);
    assert.deepEqual(duplicate.json(), {
      error: 'Template "single" already exists',
      message: 'Template "single" already exists',
      statusCode: 409,
      name: 'single',
    });

    const invalidId = await app.inject({
      method: 'DELETE',
      url: '/api/templates/abc',
    });
    assert.equal(invalidId.statusCode, 400);
    assert.deepEqual(invalidId.json(), {
      error: 'id must be a positive integer',
      message: 'id must be a positive integer',
      statusCode: 400,
      id: 'abc',
    });
  } finally {
    await app.close();
  }
});

test('template unexpected database errors use stable apiError payloads', async () => {
  const app = await buildRouteServer();
  try {
    makeDbUnavailable(app.db);

    const list = await app.inject('/api/templates');
    assert.equal(list.statusCode, 500);
    assert.equal(list.headers['cache-control'], 'no-store');
    assert.equal(list.headers.pragma, 'no-cache');
    assert.deepEqual(list.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const update = await app.inject({
      method: 'PUT',
      url: '/api/templates/1',
      payload: { name: 'single' },
    });
    assert.equal(update.statusCode, 500);
    assert.equal(update.json().message, 'database unavailable');
    assert.equal(update.json().id, 1);

    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/templates/1',
    });
    assert.equal(remove.statusCode, 500);
    assert.equal(remove.json().message, 'database unavailable');
    assert.equal(remove.json().id, 1);
  } finally {
    await app.close();
  }
});

test('workspace and template write routes record audit metadata', async () => {
  const app = await buildRouteServer();
  try {
    const layout = {
      direction: 'h',
      children: [
        { session: 'main' },
        { session: 'logs' },
      ],
    };

    const workspace = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'audited-workspace', layout },
    });
    assert.equal(workspace.statusCode, 201);

    const template = await app.inject({
      method: 'POST',
      url: '/api/templates',
      payload: { name: 'audited-template', layout },
    });
    assert.equal(template.statusCode, 201);

    const events = app.db.prepare('SELECT action, target_type, target_name, status, details_json FROM audit_events ORDER BY id').all();
    assert.deepEqual(events.map(({ action, target_type, target_name, status }) => ({ action, target_type, target_name, status })), [
      { action: 'workspace.create', target_type: 'workspace', target_name: 'audited-workspace', status: 'ok' },
      { action: 'template.create', target_type: 'template', target_name: 'audited-template', status: 'ok' },
    ]);
    assert.deepEqual(events.map(event => JSON.parse(event.details_json)), [
      { paneCount: 2 },
      { paneCount: 2 },
    ]);
  } finally {
    await app.close();
  }
});

test('settings route validation errors remain client errors', async () => {
  const app = await buildRouteServer();
  try {
    await app.register(settingsRoutes);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/accent_color',
      payload: { value: 'orange' },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'accent_color must be a #RRGGBB color',
      message: 'accent_color must be a #RRGGBB color',
      statusCode: 400,
      key: 'accent_color',
    });

    const invalidSessionTypeId = await app.inject({
      method: 'PUT',
      url: '/api/session-types/abc',
      payload: { display_name: 'Node' },
    });
    assert.equal(invalidSessionTypeId.statusCode, 400);
    assert.deepEqual(invalidSessionTypeId.json(), {
      error: 'id must be a positive integer',
      message: 'id must be a positive integer',
      statusCode: 400,
      id: 'abc',
    });
  } finally {
    await app.close();
  }
});

test('settings read responses are not cached', async () => {
  const app = await buildRouteServer();
  try {
    await app.register(settingsRoutes);

    const settings = await app.inject('/api/settings');
    const sessionTypes = await app.inject('/api/session-types');
    const exported = await app.inject('/api/settings/export');

    for (const response of [settings, sessionTypes, exported]) {
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers.pragma, 'no-cache');
    }
    assert.deepEqual(settings.json(), {});
    assert.deepEqual(sessionTypes.json(), { types: [] });
    assert.equal(exported.json().version, 1);
  } finally {
    await app.close();
  }
});

test('settings write routes record audit events', async () => {
  const app = await buildRouteServer();
  try {
    await app.register(settingsRoutes);

    const setting = await app.inject({
      method: 'PUT',
      url: '/api/settings/accent_color',
      payload: { value: '#123456' },
    });
    assert.equal(setting.statusCode, 200);

    const createType = await app.inject({
      method: 'POST',
      url: '/api/session-types',
      payload: { process_name: 'node', display_name: 'Node', color: '#98c379' },
    });
    assert.equal(createType.statusCode, 201);

    const events = app.db.prepare('SELECT action, target_type, target_name, status FROM audit_events ORDER BY id').all();
    assert.deepEqual(events, [
      { action: 'setting.update', target_type: 'setting', target_name: 'accent_color', status: 'ok' },
      { action: 'session_type.create', target_type: 'session_type', target_name: 'node', status: 'ok' },
    ]);
  } finally {
    await app.close();
  }
});

test('settings route unexpected errors remain server errors', async () => {
  const app = await buildBrokenSettingsServer();
  try {
    const settings = await app.inject('/api/settings');
    assert.equal(settings.statusCode, 500);
    assert.equal(settings.headers['cache-control'], 'no-store');
    assert.equal(settings.headers.pragma, 'no-cache');
    assert.deepEqual(settings.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const update = await app.inject({
      method: 'PUT',
      url: '/api/settings/accent_color',
      payload: { value: '#123456' },
    });
    assert.equal(update.statusCode, 500);
    assert.deepEqual(update.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      key: 'accent_color',
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const createType = await app.inject({
      method: 'POST',
      url: '/api/session-types',
      payload: { process_name: 'node', display_name: 'Node', color: '#123456' },
    });
    assert.equal(createType.statusCode, 500);
    assert.equal(createType.json().message, 'database unavailable');
    assert.equal(createType.json().process_name, 'node');

    const sessionTypes = await app.inject('/api/session-types');
    assert.equal(sessionTypes.statusCode, 500);
    assert.equal(sessionTypes.headers['cache-control'], 'no-store');
    assert.equal(sessionTypes.headers.pragma, 'no-cache');
    assert.deepEqual(sessionTypes.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });
  } finally {
    await app.close();
  }
});

test('session host route unexpected errors use stable apiError payloads', async () => {
  const app = await buildBrokenSessionServer();
  try {
    const inventory = await app.inject('/api/sessions');
    assert.equal(inventory.statusCode, 500);
    assert.equal(inventory.headers['cache-control'], 'no-store');
    assert.equal(inventory.headers.pragma, 'no-cache');
    assert.deepEqual(inventory.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });

    const response = await app.inject('/api/sessions/reliant');
    assert.equal(response.statusCode, 500);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers.pragma, 'no-cache');
    assert.deepEqual(response.json(), {
      error: 'database unavailable',
      message: 'database unavailable',
      statusCode: 500,
      host: 'reliant',
      code: 'SQLITE_IOERR',
      path: '/.../session-deck.db',
    });
  } finally {
    await app.close();
  }
});

test('session action routes reject invalid session names before host lookup', async () => {
  const app = await buildBrokenSessionServer();
  try {
    const requests = [
      { method: 'PUT', url: '/api/sessions/local/bad$name', payload: { newName: 'good-name' } },
      { method: 'DELETE', url: '/api/sessions/local/bad$name' },
      { method: 'POST', url: '/api/sessions/local/bad$name/render-test' },
      { method: 'GET', url: '/api/sessions/local/bad$name/capture' },
    ];

    for (const request of requests) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 400);
      if (request.method === 'GET') {
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.equal(response.headers.pragma, 'no-cache');
      }
      assert.deepEqual(response.json(), {
        error: 'Invalid session name. Use only letters, digits, hyphens, underscores, and dots.',
        message: 'Invalid session name. Use only letters, digits, hyphens, underscores, and dots.',
        statusCode: 400,
      });
    }
  } finally {
    await app.close();
  }
});
