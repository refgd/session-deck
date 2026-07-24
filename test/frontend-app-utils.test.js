import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceHash,
  formatSessionTimestamp,
  focusedSessionForId,
  hostForFocusedPane,
  nextWorkspaceHash,
  paneFocusIdAtIndex,
  paneSessionKey,
  parseFocusedPaneId,
  parseWorkspaceHash,
  sessionTypeColor,
  sessionTypeInfo,
  sessionTypeLabel,
  STATUS_COLORS,
  workspacesContainingSession,
  workspaceStateFromHash,
} from '../frontend/src/lib/app-utils.js';

test('paneSessionKey and parseFocusedPaneId keep host and session identity together', () => {
  assert.equal(paneSessionKey(null, 'main', 'local'), 'local:main');
  assert.equal(paneSessionKey('vps', 'main', 'local'), 'vps:main');
  assert.equal(paneSessionKey('vps', '', 'local'), null);

  assert.deepEqual(parseFocusedPaneId('vps:main', 'local'), { host: 'vps', session: 'main' });
  assert.deepEqual(parseFocusedPaneId('vps:work:api', 'local'), { host: 'vps', session: 'work:api' });
  assert.equal(parseFocusedPaneId('vps:split-1', 'local'), null);
  assert.equal(parseFocusedPaneId(null, 'local'), null);
});

test('focusedSessionForId matches duplicate session names by host', () => {
  const sessions = [
    { name: 'main', host: 'local', type: 'bash' },
    { name: 'main', host: 'vps', type: 'node' },
  ];

  assert.deepEqual(focusedSessionForId('vps:main', sessions, 'local'), {
    name: 'main',
    host: 'vps',
    type: 'node',
  });
  assert.deepEqual(focusedSessionForId('docker:main', sessions, 'local'), {
    name: 'main',
    host: 'docker',
    type: 'terminal',
  });
});

test('hostForFocusedPane returns the host segment without requiring a session', () => {
  assert.equal(hostForFocusedPane('vps:main', 'local'), 'vps');
  assert.equal(hostForFocusedPane(':main', 'local'), 'local');
  assert.equal(hostForFocusedPane(null, 'local'), null);
});

test('workspace hash helpers encode and parse workspace and pane ids', () => {
  const hash = buildWorkspaceHash({ name: '默认 work' }, 'local:main');
  assert.equal(hash, '#ws=%E9%BB%98%E8%AE%A4%20work&pane=local%3Amain');
  assert.deepEqual(parseWorkspaceHash(hash), {
    workspaceName: '默认 work',
    paneId: 'local:main',
  });
  assert.deepEqual(parseWorkspaceHash(''), { workspaceName: null, paneId: null });
  assert.equal(buildWorkspaceHash(null, 'local:main'), '');
});

test('workspace hash state helpers avoid redundant history writes and restore state', () => {
  const workspaces = [
    { id: 1, name: 'Ops' },
    { id: 2, name: '默认 work' },
  ];

  assert.equal(nextWorkspaceHash(workspaces, 1, null, ''), '#ws=Ops');
  assert.equal(nextWorkspaceHash(workspaces, 1, null, '#ws=Ops'), null);
  assert.equal(nextWorkspaceHash(workspaces, 9, 'local:main', ''), null);
  assert.equal(
    nextWorkspaceHash(workspaces, 2, 'local:main', ''),
    '#ws=%E9%BB%98%E8%AE%A4%20work&pane=local%3Amain',
  );

  assert.deepEqual(
    workspaceStateFromHash('#ws=%E9%BB%98%E8%AE%A4%20work&pane=local%3Amain', workspaces, 1),
    { activeId: 2, focusedId: 'local:main' },
  );
  assert.deepEqual(
    workspaceStateFromHash('#ws=Ops', workspaces, 1),
    { activeId: null, focusedId: null },
  );
  assert.deepEqual(
    workspaceStateFromHash('#ws=missing&pane=box%3Amain', workspaces, 1),
    { activeId: null, focusedId: 'box:main' },
  );
});

test('formatSessionTimestamp formats relative and absolute times with translations', () => {
  const now = new Date('2026-07-24T12:00:00Z');
  const translate = (key, params) => `${key}:${params.count}`;

  assert.equal(formatSessionTimestamp(null, { now, translate }), '--');
  assert.equal(formatSessionTimestamp('2026-07-24T11:45:00Z', { now, translate }), 'minutesAgo:15');
  assert.equal(formatSessionTimestamp('2026-07-24T09:00:00Z', { now, translate }), 'hoursAgo:3');
  assert.match(
    formatSessionTimestamp('2026-07-20T09:00:00Z', { now, language: 'en', translate }),
    /Jul|20/,
  );
});

test('session type helpers use configured labels and colors with stable fallbacks', () => {
  const typeMap = {
    node: { display_name: 'Node.js', color: '#68a063' },
  };

  assert.equal(sessionTypeLabel('node', typeMap), 'Node.js');
  assert.equal(sessionTypeColor('node', typeMap), '#68a063');
  assert.equal(sessionTypeLabel('', typeMap), 'Terminal');
  assert.equal(sessionTypeColor('missing', typeMap), '#6b7688');
  assert.equal(STATUS_COLORS.error.label, 'ERROR');
});

test('sessionTypeInfo resolves duplicate session names by host', () => {
  const sessions = [
    { name: 'main', host: 'local', type: 'bash', repoName: 'shell' },
    { name: 'main', host: 'vps', type: 'node', repoName: 'api' },
  ];
  const typeMap = {
    bash: { display_name: 'Shell', color: '#aaaaaa' },
    node: { display_name: 'Node.js', color: '#68a063' },
  };

  assert.deepEqual(sessionTypeInfo('main', 'vps', sessions, typeMap, 'local'), {
    color: '#68a063',
    label: 'NODE.J',
    type: 'node',
    context: 'api',
  });
  assert.deepEqual(sessionTypeInfo('missing', 'vps', sessions, typeMap, 'local'), {
    color: '#aaaaaa',
    label: 'SHELL',
    type: 'bash',
    context: null,
  });
});

test('workspacesContainingSession matches panes by host and session', () => {
  const workspaces = [
    {
      id: 1,
      name: 'local',
      layout: { session: 'main', host: 'local' },
    },
    {
      id: 2,
      name: 'remote',
      layout: { session: 'main', host: 'vps' },
    },
    {
      id: 3,
      name: 'mixed',
      layout: {
        split: 'h',
        children: [
          { session: 'api', host: 'vps' },
          { session: null, host: 'local' },
        ],
      },
    },
  ];

  assert.deepEqual(
    workspacesContainingSession(workspaces, 'main', 'vps', 'local').map(workspace => workspace.name),
    ['remote'],
  );
  assert.deepEqual(
    workspacesContainingSession(workspaces, 'main', 'local', 'local').map(workspace => workspace.name),
    ['local'],
  );
  assert.deepEqual(
    workspacesContainingSession(workspaces, 'api', 'vps', 'local').map(workspace => workspace.name),
    ['mixed'],
  );
});

test('paneFocusIdAtIndex preserves pane host order for indexed pane lookup', () => {
  const layout = {
    split: 'h',
    children: [
      { session: 'main', host: 'local' },
      {
        split: 'v',
        children: [
          { session: 'main', host: 'vps' },
          { session: null, host: 'local' },
          { session: 'api', host: 'docker' },
        ],
      },
    ],
  };

  assert.equal(paneFocusIdAtIndex(layout, 0, 'local'), 'local:main');
  assert.equal(paneFocusIdAtIndex(layout, 1, 'local'), 'vps:main');
  assert.equal(paneFocusIdAtIndex(layout, 2, 'local'), 'docker:api');
  assert.equal(paneFocusIdAtIndex(layout, 3, 'local'), null);
  assert.equal(paneFocusIdAtIndex(layout, -1, 'local'), null);
});
