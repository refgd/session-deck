import { DEFAULT_HOST } from './constants.js';
import { paneSessionKey } from './pane-key-utils.js';
import {
  autoArrangeLayout,
  countPanes,
  getSessionPanesWithPaths,
  leaf,
  movePane,
  removePane,
  splitPaneAt,
} from './stores/layout.js';

export function splitPaneLayout(layout, path, direction, defaultHost = DEFAULT_HOST) {
  if (!layout) return null;
  return autoArrangeLayout(splitPaneAt(cloneLayout(layout), path, direction, null, defaultHost));
}

export function closePaneLayout(layout, path) {
  if (!layout) return { layout: null, error: 'missing-layout' };
  if (countPanes(layout) <= 1) return { layout: null, error: 'last-pane' };
  const removed = removePane(cloneLayout(layout), path);
  return { layout: removed ? autoArrangeLayout(removed) : null, error: null };
}

export function movePaneLayout(layout, sourcePane, targetPane, position) {
  if (!layout) return null;
  return movePane(cloneLayout(layout), sourcePane, targetPane, position);
}

export function selectSessionTargetPane(layout, {
  pendingPath = null,
  focusedId = null,
  defaultHost = DEFAULT_HOST,
} = {}) {
  const panes = getSessionPanesWithPaths(layout);
  if (panes.length === 0) return { target: null, paneIndex: -1, error: 'no-panes' };

  const pendingPane = pendingPath
    ? panes.find(pane => pathKey(pane.path) === pathKey(pendingPath))
    : null;
  const focusedPane = focusedId
    ? panes.find(pane => paneSessionKey(pane.host, pane.session, defaultHost) === focusedId)
    : null;
  const target = pendingPane || focusedPane || panes[0];
  return {
    target,
    paneIndex: panes.findIndex(pane => pathKey(pane.path) === pathKey(target.path)),
    error: null,
  };
}

export function scheduleLayoutCommit({
  workspaceId,
  layout,
  clearActive = () => {},
  restoreActive = () => {},
  updateLayout = () => {},
  schedule = (callback, delay) => setTimeout(callback, delay),
  delay = 50,
} = {}) {
  if (!workspaceId || !layout) return false;
  clearActive();
  schedule(() => {
    restoreActive(workspaceId);
    updateLayout(workspaceId, layout);
  }, delay);
  return true;
}

export function workspaceCreateDraft(name, defaultHost = DEFAULT_HOST) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  return {
    name: trimmed,
    layout: leaf(null, defaultHost),
  };
}

export function workspaceNameById(workspaces = [], id, fallback = 'workspace') {
  return workspaces.find(workspace => workspace.id === id)?.name || fallback;
}

function pathKey(path = []) {
  return Array.isArray(path) ? path.join('.') : '';
}

export function cloneLayout(layout) {
  if (!layout || typeof layout !== 'object') return layout;
  const size = Number.isFinite(layout.size) ? layout.size : undefined;

  if (Array.isArray(layout.children)) {
    const node = {
      split: layout.split === 'v' ? 'v' : 'h',
      children: layout.children.map(child => cloneLayout(child)).filter(Boolean),
    };
    if (size !== undefined) node.size = size;
    return node;
  }

  const node = {
    session: typeof layout.session === 'string' ? layout.session : null,
    host: typeof layout.host === 'string' ? layout.host : DEFAULT_HOST,
  };
  if (size !== undefined) node.size = size;
  if (typeof layout.paneTitle === 'string' && layout.paneTitle) node.paneTitle = layout.paneTitle;
  return node;
}
