import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaletteCommands, filterCommands, nextPaletteIndex } from '../frontend/src/lib/palette-utils.js';

test('filterCommands returns all commands for empty queries', () => {
  const commands = [{ label: 'Open Session' }, { label: 'Settings' }];
  assert.equal(filterCommands(commands, ''), commands);
  assert.equal(filterCommands(commands, '   '), commands);
});

test('filterCommands matches labels, categories, and hints case-insensitively', () => {
  const commands = [
    { label: 'Open Session', category: 'Sessions', hint: 'Enter' },
    { label: 'New Workspace', category: 'Current Workspace', hint: 'workspace action' },
    { label: 'Toggle Properties', category: 'Pane Control', hint: 'pane action' },
  ];

  assert.deepEqual(filterCommands(commands, 'session').map(command => command.label), ['Open Session']);
  assert.deepEqual(filterCommands(commands, 'pane').map(command => command.label), ['Toggle Properties']);
  assert.deepEqual(filterCommands(commands, 'alt').map(command => command.label), []);
  assert.deepEqual(filterCommands(commands, ' action ').map(command => command.label), ['New Workspace', 'Toggle Properties']);
});

test('nextPaletteIndex clamps navigation within available commands', () => {
  assert.equal(nextPaletteIndex(0, 3, 'down'), 1);
  assert.equal(nextPaletteIndex(2, 3, 'down'), 2);
  assert.equal(nextPaletteIndex(2, 3, 'up'), 1);
  assert.equal(nextPaletteIndex(0, 3, 'up'), 0);
  assert.equal(nextPaletteIndex(10, 3, 'stay'), 2);
  assert.equal(nextPaletteIndex(-5, 3, 'stay'), 0);
  assert.equal(nextPaletteIndex(Number.NaN, 3, 'stay'), 0);
  assert.equal(nextPaletteIndex(1, 0, 'down'), 0);
});

test('buildPaletteCommands creates workspace, pane, session, settings, and template commands', () => {
  const calls = [];
  const commands = buildPaletteCommands({
    workspaces: [{ id: 7, name: 'Ops' }],
    sessions: [{ host: 'box', name: 'main' }],
    activeId: 7,
    focusedId: 'box:main',
    zoomedPane: null,
    t: key => key,
    onWorkspace: id => calls.push(['workspace', id]),
    onNewWorkspace: () => calls.push(['new']),
    onZoomFocused: () => calls.push(['zoom']),
    onToggleProperties: () => calls.push(['props']),
    onFocusSession: session => calls.push(['focus', session.host, session.name]),
    onSessionManager: () => calls.push(['session-manager']),
    onSettings: section => calls.push(['settings', section]),
    onSaveTemplate: id => calls.push(['template', id]),
  });

  assert.deepEqual(commands.map(command => command.id), [
    'ws-7',
    'ws-new',
    'zoom',
    'props',
    'focus-box-main',
    'session-mgr',
    'settings-servers',
    'settings-sessions',
    'settings-diagnostics',
    'settings-appearance',
    'settings-help',
    'save-template',
  ]);
  assert.equal(commands.find(command => command.id === 'zoom').label, 'zoomUnzoomPane');

  commands.find(command => command.id === 'ws-7').action();
  commands.find(command => command.id === 'focus-box-main').action();
  commands.find(command => command.id === 'settings-diagnostics').action();
  commands.find(command => command.id === 'save-template').action();

  assert.deepEqual(calls, [
    ['workspace', 7],
    ['focus', 'box', 'main'],
    ['settings', 'diagnostics'],
    ['template', 7],
  ]);
});

test('buildPaletteCommands hides conditional commands without focused or active context', () => {
  const commands = buildPaletteCommands({ t: key => key });

  assert.equal(commands.some(command => command.id === 'zoom'), false);
  assert.equal(commands.some(command => command.id === 'save-template'), false);
  assert.equal(commands.some(command => command.id === 'props'), true);
  assert.equal(commands.some(command => command.id === 'session-mgr'), true);
});
