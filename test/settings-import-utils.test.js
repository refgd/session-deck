import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeImportedManagedHost,
  normalizeImportedSessionType,
  normalizeImportedWorkspaceTemplate,
  safeJson,
  safeLayoutJson,
  validateColor,
  validateLabel,
} from '../src/lib/settings-import-utils.js';

test('normalizeImportedManagedHost normalizes docker hosts', () => {
  const normalized = normalizeImportedManagedHost({
    name: '  app-container  ',
    connection_type: 'docker',
    docker_container: '  app_1  ',
    user: 'ignored',
    port: 2222,
    identity_file: '/ignored',
    group_name: '',
    is_local: true,
    enabled: false,
    sort_order: '7',
    gateway_host_name: '  docker-gateway  ',
  });

  assert.deepEqual(normalized, {
    name: 'app-container',
    hostname: 'app_1',
    user: null,
    port: 0,
    identity_file: null,
    auth_method: 'docker',
    group_name: 'Docker',
    is_local: 0,
    connection_type: 'docker',
    docker_container: 'app_1',
    enabled: 0,
    sort_order: 7,
    gateway_host_name: 'docker-gateway',
  });
});

test('normalizeImportedManagedHost normalizes ssh hosts and skips duplicates', () => {
  const seen = new Set();
  const normalized = normalizeImportedManagedHost({
    name: '  app  ',
    hostname: ' app.internal ',
    user: ' root ',
    port: '2200',
    identity_file: ' /keys/app ',
    auth_method: 'password',
    group_name: ' Servers ',
    is_local: true,
    sort_order: 'not-a-number',
  }, seen);

  assert.deepEqual(normalized, {
    name: 'app',
    hostname: 'app.internal',
    user: 'root',
    port: 2200,
    identity_file: '/keys/app',
    auth_method: 'password',
    group_name: 'Servers',
    is_local: 1,
    connection_type: 'ssh',
    docker_container: null,
    enabled: 1,
    sort_order: 0,
    gateway_host_name: '',
  });
  assert.equal(normalizeImportedManagedHost({ name: 'app', hostname: 'other.internal' }, seen), null);
});

test('normalizeImportedManagedHost rejects missing required host fields', () => {
  assert.equal(normalizeImportedManagedHost(null), null);
  assert.equal(normalizeImportedManagedHost({ name: 'no-hostname' }), null);
  assert.equal(normalizeImportedManagedHost({ hostname: 'no-name.internal' }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'no-container', connection_type: 'docker' }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'bad-auth', hostname: 'bad.internal', auth_method: 'agent' }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'bad-port', hostname: 'bad.internal', port: 0 }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'bad-port-high', hostname: 'bad.internal', port: 70000 }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'bad-port-text', hostname: 'bad.internal', port: '22/tcp' }), null);
});

test('normalizeImportedManagedHost rejects oversized host fields', () => {
  assert.equal(normalizeImportedManagedHost({ name: 'x'.repeat(81), hostname: 'host.internal' }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'long-host', hostname: 'h'.repeat(254) }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'long-user', hostname: 'host.internal', user: 'u'.repeat(129) }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'long-key', hostname: 'host.internal', identity_file: `/keys/${'x'.repeat(4092)}` }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'long-group', hostname: 'host.internal', group_name: 'g'.repeat(65) }), null);
  assert.equal(normalizeImportedManagedHost({ name: 'long-gateway', hostname: 'host.internal', gateway_host_name: 'g'.repeat(81) }), null);
});

test('normalizeImportedSessionType validates process names and defaults values', () => {
  assert.deepEqual(normalizeImportedSessionType({
    process_name: ' node:worker ',
    display_name: '',
    color: '',
    sort_order: '12',
  }), {
    process_name: 'node:worker',
    display_name: 'node:worker',
    color: '#6b7688',
    sort_order: 12,
  });

  assert.equal(normalizeImportedSessionType({ process_name: '../../bad' }), null);
  assert.throws(
    () => normalizeImportedSessionType({ process_name: 'nvim', color: 'green' }),
    /color must be a #RRGGBB color/
  );
});

test('normalizeImportedWorkspaceTemplate validates layout payloads', () => {
  assert.deepEqual(normalizeImportedWorkspaceTemplate({
    name: '  single  ',
    description: 123,
    layout: { type: 'leaf', session: null },
    pane_count: '2',
    sort_order: '5',
  }), {
    name: 'single',
    description: '123',
    layout_json: JSON.stringify({ type: 'leaf', session: null }),
    pane_count: 2,
    sort_order: 5,
  });

  assert.equal(normalizeImportedWorkspaceTemplate({ layout: { type: 'leaf' } }), null);
  assert.equal(normalizeImportedWorkspaceTemplate({ name: 'x'.repeat(81), layout: { type: 'leaf', session: null } }), null);
  assert.equal(normalizeImportedWorkspaceTemplate({
    name: 'bad-description',
    description: 'x'.repeat(513),
    layout: { type: 'leaf', session: null },
  }), null);
  assert.throws(
    () => normalizeImportedWorkspaceTemplate({ name: 'bad', layout: [] }),
    /layout_json must be a JSON object/
  );
});

test('settings import utility validators preserve public errors', () => {
  assert.equal(safeJson('{"ok":true}', null).ok, true);
  assert.equal(safeJson('{bad', 'fallback'), 'fallback');
  assert.equal(safeLayoutJson('{"type":"leaf","session":null}'), JSON.stringify({ type: 'leaf', session: null }));
  assert.equal(validateColor('', '#123456'), '#123456');
  assert.equal(validateLabel('  Neovim  '), 'Neovim');
  assert.throws(() => validateLabel(''), /display_name is required/);
});
