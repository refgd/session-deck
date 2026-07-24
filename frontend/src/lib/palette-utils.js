export function filterCommands(commands = [], query = '') {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter(command => {
    const label = String(command.label || '').toLowerCase();
    const category = String(command.category || '').toLowerCase();
    const hint = String(command.hint || '').toLowerCase();
    return label.includes(normalized) || category.includes(normalized) || hint.includes(normalized);
  });
}

export function nextPaletteIndex(currentIndex, commandCount, direction) {
  if (commandCount <= 0) return 0;
  const current = Number.isFinite(currentIndex) ? currentIndex : 0;
  if (direction === 'down') return Math.min(current + 1, commandCount - 1);
  if (direction === 'up') return Math.max(current - 1, 0);
  return Math.min(Math.max(current, 0), commandCount - 1);
}

export function buildPaletteCommands({
  workspaces = [],
  sessions = [],
  activeId = null,
  focusedId = null,
  zoomedPane = null,
  t = key => key,
  onWorkspace = () => {},
  onNewWorkspace = () => {},
  onZoomFocused = () => {},
  onToggleProperties = () => {},
  onFocusSession = () => {},
  onSessionManager = () => {},
  onSettings = () => {},
  onSaveTemplate = () => {},
} = {}) {
  const commands = [];

  for (const [index, workspace] of workspaces.entries()) {
    commands.push({
      id: `ws-${workspace.id}`,
      label: `${t('switchWorkspace')}: ${workspace.name}`,
      action: () => onWorkspace(workspace.id),
      category: t('currentWorkspace'),
    });
  }

  commands.push({
    id: 'ws-new',
    label: t('newWorkspace'),
    action: onNewWorkspace,
    category: t('currentWorkspace'),
  });

  if (focusedId) {
    commands.push({
      id: 'zoom',
      label: zoomedPane ? t('restore') : t('zoomUnzoomPane'),
      action: onZoomFocused,
      category: t('paneControl'),
    });
  }

  commands.push({
    id: 'props',
    label: t('toggleProperties'),
    action: onToggleProperties,
    category: t('paneControl'),
  });

  for (const session of sessions) {
    commands.push({
      id: `focus-${session.host}-${session.name}`,
      label: `${t('sessions')}: ${session.name}`,
      hint: session.host,
      action: () => onFocusSession(session),
      category: t('sessions'),
    });
  }

  commands.push({
    id: 'session-mgr',
    label: t('manageSessions'),
    action: onSessionManager,
    category: t('sessions'),
  });

  for (const section of ['servers', 'sessions', 'diagnostics', 'appearance', 'help']) {
    commands.push({
      id: `settings-${section}`,
      label: `${t('settings')}: ${t(section)}`,
      action: () => onSettings(section),
      category: t('settings'),
    });
  }

  if (activeId) {
    commands.push({
      id: 'save-template',
      label: t('saveAsTemplate'),
      action: () => onSaveTemplate(activeId),
      category: t('currentWorkspace'),
    });
  }

  return commands;
}
