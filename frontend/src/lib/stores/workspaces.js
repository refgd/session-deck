// frontend/src/lib/stores/workspaces.js — Workspace state management

import { DEFAULT_HOST } from '../constants.js';
import { apiJson, apiOk } from '../api-client.js';
import { logError } from '../logger.js';
import { getLeafAtPath } from './layout.js';

let _workspaces = [];
let _activeId = null;
let _listeners = [];
let _saveTimer = null;

function notify() {
  _listeners.forEach(fn => fn({ workspaces: _workspaces, activeId: _activeId }));
}

export function subscribe(fn) {
  _listeners.push(fn);
  fn({ workspaces: _workspaces, activeId: _activeId });
  return () => { _listeners = _listeners.filter(f => f !== fn); };
}

export function getWorkspaces() { return _workspaces; }
export function getActiveId() { return _activeId; }
export function getActiveWorkspace() {
  return _workspaces.find(w => w.id === _activeId) || _workspaces[0];
}

export async function loadWorkspaces() {
  try {
    const data = await apiJson('/api/workspaces');
    _workspaces = data.workspaces || [];
    if (!_activeId && _workspaces.length) {
      _activeId = _workspaces[0].id;
    }
    notify();
  } catch (e) {
    logError('Failed to load workspaces:', e);
  }
}

export function setActive(id) {
  _activeId = id;
  notify();
}

export async function updateLayout(id, layout) {
  const ws = _workspaces.find(w => w.id === id);
  if (ws) {
    ws.layout = layout;
    notify();
    // Debounced save to API
    debouncedSave(id, layout);
  }
}

export async function updatePaneSession(workspaceId, path, session, host) {
  const ws = _workspaces.find(w => w.id === workspaceId);
  if (!ws) return;

  const leaf = getLeafAtPath(ws.layout, path);
  if (!leaf) return;

  leaf.session = session;
  leaf.host = host || DEFAULT_HOST;
  notify();
  debouncedSave(workspaceId, ws.layout);
}

/**
 * Set or clear a custom pane title by path.
 * Pass null or '' to clear the override (reverts to auto-detected name).
 */
export function updatePaneTitle(workspaceId, path, title) {
  const ws = _workspaces.find(w => w.id === workspaceId);
  if (!ws) return;

  const leaf = getLeafAtPath(ws.layout, path);
  if (!leaf) return;

  if (title) {
    leaf.paneTitle = title;
  } else {
    delete leaf.paneTitle;
  }

  notify();
  debouncedSave(workspaceId, ws.layout);
}

/**
 * Rename a session across all workspaces. Finds every pane referencing
 * oldName on the given host and updates it to newName. Persists changes.
 */
export function renameSessionInWorkspaces(oldName, newName, host) {
  let changed = false;

  function walkAndRename(node) {
    if (node.session === oldName && (node.host || DEFAULT_HOST) === (host || DEFAULT_HOST)) {
      node.session = newName;
      changed = true;
    }
    if (node.children) {
      for (const child of node.children) walkAndRename(child);
    }
  }

  for (const ws of _workspaces) {
    changed = false;
    walkAndRename(ws.layout);
    if (changed) {
      debouncedSave(ws.id, ws.layout);
    }
  }

  notify();
}

export async function createWorkspace(name, layout, description) {
  try {
    const data = await apiJson('/api/workspaces', {
      method: 'POST',
      body: { name, layout, description },
    });
    _workspaces.push({ ...data, isDefault: false });
    _activeId = data.id;
    notify();
    return data;
  } catch (e) {
    logError('Failed to create workspace:', e);
    throw e;
  }
}

export async function renameWorkspace(id, name) {
  try {
    await apiOk(`/api/workspaces/${id}`, {
      method: 'PUT',
      body: { name },
    });
    const ws = _workspaces.find(w => w.id === id);
    if (ws) ws.name = name;
    notify();
  } catch (e) {
    logError('Failed to rename workspace:', e);
    throw e;
  }
}

export async function duplicateWorkspace(id) {
  const ws = _workspaces.find(w => w.id === id);
  if (!ws) throw new Error('Workspace not found');
  const newName = `${ws.name} (copy)`;
  // Deep clone layout to avoid shared references
  const layout = JSON.parse(JSON.stringify(ws.layout));
  return createWorkspace(newName, layout, ws.description || '');
}

export async function deleteWorkspace(id) {
  try {
    await apiOk(`/api/workspaces/${id}`, { method: 'DELETE' });
    _workspaces = _workspaces.filter(w => w.id !== id);
    if (_activeId === id) {
      _activeId = _workspaces[0]?.id || null;
    }
    notify();
  } catch (e) {
    logError('Failed to delete workspace:', e);
    throw e;
  }
}

function debouncedSave(id, layout) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await apiOk(`/api/workspaces/${id}`, {
        method: 'PUT',
        body: { layout },
      });
    } catch (e) {
      logError('Failed to save layout:', e);
    }
  }, 1000);
}
