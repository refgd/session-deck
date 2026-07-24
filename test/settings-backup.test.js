import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_IMPORT_MANAGED_HOSTS,
  MAX_IMPORT_SESSION_TYPES,
  MAX_IMPORT_WORKSPACE_TEMPLATES,
  createSettingsExport,
  importSettingsExport,
} from '../src/services/settings-backup.js';
import { createMemoryDb } from '../test-support/db.js';

test('settings export includes gateway names and excludes private key material and sensitive paths by default', () => {
  const db = createMemoryDb();
  const gateway = db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, port, identity_file, group_name, sort_order)
    VALUES ('jump', 'jump.example', 'ops', 2222, '/keys/jump', 'VPS', 1)
  `).run();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file, gateway_host_id, sort_order)
    VALUES ('app', 'app.internal', 'root', '/keys/app', ?, 2)
  `).run(gateway.lastInsertRowid);
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('accent_color', '#123456')").run();

  const exported = createSettingsExport(db, {
    listSshKeys: () => [{
      name: 'app',
      path: '/keys/app',
      managed: true,
      privateKey: '-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----',
    }],
  });

  const app = exported.managedHosts.find(host => host.name === 'app');
  assert.equal(exported.version, 1);
  assert.equal(exported.sensitivePathsIncluded, false);
  assert.equal(exported.appSettings.accent_color, '#123456');
  assert.equal(app.gateway_host_name, 'jump');
  assert.equal(app.identity_file, null);
  assert.equal(app.identity_file_hint, '/.../app');
  assert.deepEqual(exported.sshKeys, [{
    name: 'app',
    path: null,
    displayPath: '/.../app',
    managed: true,
    privateKeyIncluded: false,
  }]);
  assert.equal(JSON.stringify(exported).includes('secret'), false);
  assert.equal(JSON.stringify(exported).includes('/keys/app'), false);
});

test('settings export can explicitly include sensitive local paths', () => {
  const db = createMemoryDb();
  db.prepare(`
    INSERT INTO managed_hosts (name, hostname, user, identity_file)
    VALUES ('app', 'app.internal', 'root', '/keys/app')
  `).run();

  const exported = createSettingsExport(db, {
    includeSensitivePaths: true,
    listSshKeys: () => [{ name: 'app', path: '/keys/app', managed: true }],
  });

  const app = exported.managedHosts.find(host => host.name === 'app');
  assert.equal(exported.sensitivePathsIncluded, true);
  assert.equal(app.identity_file, '/keys/app');
  assert.equal(app.identity_file_hint, '/.../app');
  assert.deepEqual(exported.sshKeys, [{
    name: 'app',
    path: '/keys/app',
    displayPath: '/.../app',
    managed: true,
    privateKeyIncluded: false,
  }]);
});

test('settings import upserts hosts, resolves gateway names, settings, types, and templates', () => {
  const db = createMemoryDb();
  const result = importSettingsExport(db, {
    version: 1,
    appSettings: {
      accent_color: '#abcdef',
      unsupported_secret: 'ignore-me',
    },
    managedHosts: [
      { name: 'jump', hostname: 'jump.example', user: 'ops', port: 2222, group_name: 'VPS', sort_order: 1 },
      { name: 'app', hostname: 'app.internal', user: 'root', gateway_host_name: 'jump', sort_order: 2 },
      { name: 'bad-no-hostname' },
    ],
    sessionTypes: [
      { process_name: 'nvim', display_name: 'Neovim', color: '#98c379', sort_order: 10 },
      { process_name: '../../bad', display_name: 'Bad', color: '#ffffff' },
    ],
    workspaceTemplates: [
      { name: 'single', description: 'One pane', layout: { type: 'leaf', session: null }, pane_count: 1 },
    ],
  });

  assert.deepEqual(result.imported, {
    settings: 1,
    managedHosts: 2,
    sessionTypes: 1,
    workspaceTemplates: 1,
  });
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'accent_color'").get().value, '#abcdef');
  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'unsupported_secret'").get(), undefined);

  const app = db.prepare(`
    SELECT h.name, g.name as gateway_name
    FROM managed_hosts h
    LEFT JOIN managed_hosts g ON g.id = h.gateway_host_id
    WHERE h.name = 'app'
  `).get();
  assert.deepEqual(app, { name: 'app', gateway_name: 'jump' });
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get().count, 2);
  assert.equal(db.prepare("SELECT display_name FROM session_types WHERE process_name = 'nvim'").get().display_name, 'Neovim');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM session_types').get().count, 1);
  assert.equal(
    db.prepare("SELECT layout_json FROM workspace_templates WHERE name = 'single'").get().layout_json,
    JSON.stringify({ type: 'leaf', session: null })
  );
});

test('settings import rejects unsupported export versions', () => {
  const db = createMemoryDb();

  assert.throws(
    () => importSettingsExport(db, { version: 99 }),
    /Unsupported export version: 99/
  );
});

test('settings import rolls back invalid color changes', () => {
  const db = createMemoryDb();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('accent_color', '#111111')").run();

  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      appSettings: { accent_color: 'red' },
      managedHosts: [{ name: 'app', hostname: 'app.internal' }],
    }),
    /accent_color must be a #RRGGBB color/
  );

  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'accent_color'").get().value, '#111111');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get().count, 0);
});

test('settings import rejects gateway cycles and rolls back host changes', () => {
  const db = createMemoryDb();

  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      managedHosts: [
        { name: 'first', hostname: '10.0.0.1', gateway_host_name: 'third' },
        { name: 'second', hostname: '10.0.0.2', gateway_host_name: 'first' },
        { name: 'third', hostname: '10.0.0.3', gateway_host_name: 'second' },
      ],
    }),
    /Gateway chain cannot contain a cycle:/
  );

  assert.equal(db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get().count, 0);
});

test('settings import rejects oversized template layouts and rolls back changes', () => {
  const db = createMemoryDb();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('accent_color', '#111111')").run();

  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      appSettings: { accent_color: '#222222' },
      workspaceTemplates: [{
        name: 'too-large',
        layout_json: JSON.stringify({ note: 'x'.repeat(64 * 1024) }),
      }],
    }),
    Object.assign(/layout_json is too large/, { statusCode: 400 }),
  );

  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'accent_color'").get().value, '#111111');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM workspace_templates').get().count, 0);
});

test('settings import rejects invalid collection shapes before writing', () => {
  const db = createMemoryDb();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('accent_color', '#111111')").run();

  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      appSettings: [],
      managedHosts: [{ name: 'app', hostname: 'app.internal' }],
    }),
    Object.assign(/appSettings must be an object/, { statusCode: 400 }),
  );

  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'accent_color'").get().value, '#111111');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get().count, 0);
});

test('settings import rejects oversized collections before writing', () => {
  const db = createMemoryDb();
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('accent_color', '#111111')").run();

  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      appSettings: { accent_color: '#222222' },
      managedHosts: Array.from({ length: MAX_IMPORT_MANAGED_HOSTS + 1 }, (_, index) => ({
        name: `host-${index}`,
        hostname: `host-${index}.internal`,
      })),
    }),
    Object.assign(/managedHosts must contain 500 items or fewer/, { statusCode: 400 }),
  );
  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      sessionTypes: Array.from({ length: MAX_IMPORT_SESSION_TYPES + 1 }, (_, index) => ({
        process_name: `proc_${index}`,
      })),
    }),
    Object.assign(/sessionTypes must contain 200 items or fewer/, { statusCode: 400 }),
  );
  assert.throws(
    () => importSettingsExport(db, {
      version: 1,
      workspaceTemplates: Array.from({ length: MAX_IMPORT_WORKSPACE_TEMPLATES + 1 }, (_, index) => ({
        name: `template-${index}`,
        layout: { session: null },
      })),
    }),
    Object.assign(/workspaceTemplates must contain 100 items or fewer/, { statusCode: 400 }),
  );

  assert.equal(db.prepare("SELECT value FROM app_settings WHERE key = 'accent_color'").get().value, '#111111');
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM managed_hosts').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM session_types').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) as count FROM workspace_templates').get().count, 0);
});
