import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearHostError,
  connectionErrorMessage,
  createdSessionMessage,
  deletedSessionMessage,
  formatSessionHostError,
  findManagedHostForSessionHost,
  groupManagedHosts,
  groupSessionsByHost,
  hasVisibleHostErrors,
  hostLoadingState,
  removeHostSessions,
  replaceHostSessions,
  renamedSessionMessage,
  sessionCapableHosts,
  sessionCreateDraft,
  sessionRenameDraft,
  setHostError,
} from '../frontend/src/lib/session-utils.js';

test('formatSessionHostError keeps diagnostic fields for server errors', () => {
  const message = formatSessionHostError('reliant', {
    error: 'Internal Server Error',
    status: 'no-tmux',
    code: 'ENOENT',
    exitCode: 1,
    syscall: 'open',
    path: '/root/.ssh/config',
    stderr: 'error connecting to /tmp/tmux-0/default\n',
    command: 'tmux list-sessions -F #{session_name}',
  }, {
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
  });

  assert.equal(
    message,
    'status: no-tmux | code: ENOENT | exit: 1 | syscall: open | path: /root/.ssh/config | stderr: error connecting to /tmp/tmux-0/default | command: tmux list-sessions -F #{session_name} | HTTP 500 Internal Server Error',
  );
});

test('groupManagedHosts places Local first and sorts the rest', () => {
  const grouped = groupManagedHosts([
    { name: 'nas', group_name: 'NAS' },
    { name: 'local', group_name: 'Local' },
    { name: 'misc' },
    { name: 'docker', group_name: 'Docker' },
  ]);

  assert.deepEqual(grouped.map(([groupName]) => groupName), ['Local', 'Docker', 'NAS', 'Other']);
});

test('sessionCapableHosts excludes disabled and non-terminal inventory groups', () => {
  const hosts = sessionCapableHosts([
    { name: 'local', enabled: true, group_name: 'Local' },
    { name: 'router', enabled: true, group_name: 'Network' },
    { name: 'client', enabled: true, group_name: 'Client' },
    { name: 'disabled', enabled: false, group_name: 'VPS' },
  ]);

  assert.deepEqual(hosts.map(host => host.name), ['local']);
});

test('findManagedHostForSessionHost resolves exact and local fallback hosts', () => {
  const hosts = [
    { id: 1, name: 'local', is_local: true },
    { id: 2, name: 'vps' },
  ];

  assert.equal(findManagedHostForSessionHost('vps', hosts, 'local')?.id, 2);
  assert.equal(findManagedHostForSessionHost('local', [{ id: 3, name: 'machine', isLocal: true }], 'local')?.id, 3);
  assert.equal(findManagedHostForSessionHost('missing', hosts, 'local'), null);
});

test('groupSessionsByHost includes errored hosts and keeps default host first', () => {
  const groups = groupSessionsByHost({
    defaultHost: 'local',
    sessions: [
      { name: 'remote-shell', host: 'vps' },
      { name: 'local-shell' },
    ],
    errors: {
      docker: 'Docker unavailable',
      vps: 'SSH failed',
    },
  });

  assert.deepEqual(groups, [
    { hostName: 'local', hostSessions: [{ name: 'local-shell' }], error: undefined },
    { hostName: 'docker', hostSessions: [], error: 'Docker unavailable' },
    { hostName: 'vps', hostSessions: [{ name: 'remote-shell', host: 'vps' }], error: 'SSH failed' },
  ]);
});

test('groupSessionsByHost respects host filters while preserving matching errors', () => {
  const groups = groupSessionsByHost({
    defaultHost: 'local',
    hostFilter: 'docker',
    sessions: [{ name: 'local-shell' }, { name: 'remote-shell', host: 'vps' }],
    errors: {
      docker: 'Docker unavailable',
      vps: 'SSH failed',
    },
  });

  assert.deepEqual(groups, [
    { hostName: 'docker', hostSessions: [], error: 'Docker unavailable' },
  ]);
});

test('session host state helpers update errors and loading immutably', () => {
  assert.equal(connectionErrorMessage(new Error('SSH failed')), 'SSH failed');
  assert.equal(connectionErrorMessage(null), 'Connection failed');

  const errors = setHostError({ old: 'kept' }, 'box', new Error('timeout'));
  assert.deepEqual(errors, { old: 'kept', box: 'timeout' });
  assert.deepEqual(clearHostError(errors, 'box'), { old: 'kept' });

  assert.deepEqual(hostLoadingState({ old: true }, 'box', true), { old: true, box: true });
  assert.deepEqual(hostLoadingState({ old: true, box: true }, 'box', false), { old: true, box: false });
});

test('session host list helpers replace and remove sessions by host', () => {
  const sessions = [
    { name: 'local-shell' },
    { name: 'old-remote', host: 'box' },
    { name: 'other', host: 'vps' },
  ];

  assert.deepEqual(removeHostSessions(sessions, 'box', 'local'), [
    { name: 'local-shell' },
    { name: 'other', host: 'vps' },
  ]);
  assert.deepEqual(removeHostSessions(sessions, 'local', 'local'), [
    { name: 'old-remote', host: 'box' },
    { name: 'other', host: 'vps' },
  ]);
  assert.deepEqual(replaceHostSessions(sessions, 'box', [{ name: 'new', host: 'box' }], 'local'), [
    { name: 'local-shell' },
    { name: 'other', host: 'vps' },
    { name: 'new', host: 'box' },
  ]);
});

test('hasVisibleHostErrors respects the active host filter', () => {
  assert.equal(hasVisibleHostErrors({}, null), false);
  assert.equal(hasVisibleHostErrors({ box: 'failed' }, null), true);
  assert.equal(hasVisibleHostErrors({ box: 'failed' }, 'box'), true);
  assert.equal(hasVisibleHostErrors({ box: 'failed' }, 'vps'), false);
});

test('session action drafts normalize user input', () => {
  assert.equal(sessionCreateDraft({ name: '   ' }), null);
  assert.deepEqual(sessionCreateDraft({
    name: ' main ',
    host: '',
    startDir: ' /srv/app ',
  }, 'local'), {
    name: 'main',
    host: 'reliant',
    startDir: '/srv/app',
  });

  assert.equal(sessionRenameDraft(null, 'next'), null);
  assert.equal(sessionRenameDraft({ name: 'old', host: 'box' }, '   '), null);
  assert.deepEqual(sessionRenameDraft({ name: 'old', host: 'box' }, ' next '), {
    oldName: 'old',
    newName: 'next',
    host: 'box',
  });
});

test('session action messages stay consistent across callers', () => {
  assert.equal(
    createdSessionMessage({ name: 'main', host: 'box' }, false),
    'Created session "main" on box',
  );
  assert.equal(
    createdSessionMessage({ name: 'main', host: 'box' }, true),
    'Created and opened session "main" on box',
  );
  assert.equal(
    renamedSessionMessage({ oldName: 'main', newName: 'api', host: 'box' }),
    'Renamed "main" to "api" on box',
  );
  assert.equal(
    deletedSessionMessage({ name: 'api', host: 'box' }),
    'Deleted session "api" on box',
  );
});
