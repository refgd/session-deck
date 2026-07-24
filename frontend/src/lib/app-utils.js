import { DEFAULT_HOST } from './constants.js';
import { paneSessionKey } from './pane-key-utils.js';

export { paneSessionKey };

export const DEFAULT_SESSION_TYPE_COLOR = '#6b7688';

export const STATUS_COLORS = {
  asking:  { bg: 'rgba(255,180,84,0.15)', border: '#ffb454', dot: '#ffb454', shadow: 'rgba(255,180,84,0.6)', label: 'ASKING' },
  error:   { bg: 'rgba(240,113,120,0.15)', border: '#f07178', dot: '#f07178', shadow: 'rgba(240,113,120,0.6)', label: 'ERROR' },
  done:    { bg: 'rgba(127,217,98,0.15)', border: '#7fd962', dot: '#7fd962', shadow: 'rgba(127,217,98,0.6)', label: 'DONE' },
  working: { bg: 'rgba(61,139,253,0.15)', border: '#3d8bfd', dot: '#3d8bfd', shadow: 'rgba(61,139,253,0.4)', label: 'WORKING' },
  idle:    { bg: 'rgba(107,118,136,0.1)', border: '#6b7688', dot: '#6b7688', shadow: 'none', label: 'IDLE' },
};

export function parseFocusedPaneId(focusedId, defaultHost = DEFAULT_HOST) {
  if (!focusedId) return null;
  const [hostPart, ...rest] = String(focusedId).split(':');
  const session = rest.join(':');
  if (!session || session.startsWith('split-')) return null;
  return { host: hostPart || defaultHost, session };
}

export function focusedSessionForId(focusedId, sessions = [], defaultHost = DEFAULT_HOST) {
  const focused = parseFocusedPaneId(focusedId, defaultHost);
  if (!focused) return null;
  return sessions.find(session =>
    session.name === focused.session &&
    (session.host || defaultHost) === focused.host
  ) || { name: focused.session, host: focused.host, type: 'terminal' };
}

export function hostForFocusedPane(focusedId, defaultHost = DEFAULT_HOST) {
  if (!focusedId) return null;
  const [host] = String(focusedId).split(':');
  return host || defaultHost;
}

export function buildWorkspaceHash(workspace, paneId = null) {
  if (!workspace?.name) return '';
  const parts = [`ws=${encodeURIComponent(workspace.name)}`];
  if (paneId) parts.push(`pane=${encodeURIComponent(paneId)}`);
  return `#${parts.join('&')}`;
}

export function parseWorkspaceHash(hash = '') {
  const input = String(hash).startsWith('#') ? String(hash).slice(1) : String(hash);
  if (!input) return { workspaceName: null, paneId: null };
  const params = new URLSearchParams(input);
  return {
    workspaceName: params.get('ws'),
    paneId: params.get('pane'),
  };
}

export function nextWorkspaceHash(workspaces = [], workspaceId = null, paneId = null, currentHash = '') {
  const workspace = workspaces.find(item => item.id === workspaceId);
  const hash = buildWorkspaceHash(workspace, paneId);
  return hash && hash !== currentHash ? hash : null;
}

export function workspaceStateFromHash(hash = '', workspaces = [], activeId = null) {
  const { workspaceName, paneId } = parseWorkspaceHash(hash);
  const workspace = workspaceName
    ? workspaces.find(item => item.name === workspaceName)
    : null;
  return {
    activeId: workspace && workspace.id !== activeId ? workspace.id : null,
    focusedId: paneId || null,
  };
}

export function formatSessionTimestamp(ts, {
  language = 'en',
  now = new Date(),
  translate = (key, params) => `${params?.count ?? ''}${key}`,
} = {}) {
  if (!ts) return '--';
  const date = new Date(ts);
  const diff = new Date(now) - date;
  if (Number.isFinite(diff) && diff >= 0 && diff < 3600000) {
    return translate('minutesAgo', { count: Math.floor(diff / 60000) });
  }
  if (Number.isFinite(diff) && diff >= 0 && diff < 86400000) {
    return translate('hoursAgo', { count: Math.floor(diff / 3600000) });
  }
  return date.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function sessionTypeLabel(type, sessionTypeMap = {}) {
  return sessionTypeMap[type]?.display_name || type || 'Terminal';
}

export function sessionTypeColor(type, sessionTypeMap = {}) {
  return sessionTypeMap[type]?.color || DEFAULT_SESSION_TYPE_COLOR;
}

export function sessionTypeInfo(sessionName, host, sessions = [], sessionTypeMap = {}, defaultHost = DEFAULT_HOST) {
  const session = sessions.find(item =>
    item.name === sessionName &&
    (host === undefined || (item.host || defaultHost) === (host || defaultHost))
  );
  const type = session?.type || 'bash';
  return {
    color: sessionTypeColor(type, sessionTypeMap),
    label: sessionTypeLabel(type, sessionTypeMap).toUpperCase().slice(0, 6),
    type,
    context: session?.repoName || null,
  };
}

export function workspacesContainingSession(workspaces = [], sessionName, host, defaultHost = DEFAULT_HOST) {
  const targetKey = paneSessionKey(host, sessionName, defaultHost);
  if (!targetKey) return [];
  return workspaces.filter(workspace =>
    getLayoutSessionKeys(workspace.layout, defaultHost).includes(targetKey)
  );
}

export function paneFocusIdAtIndex(layout, index, defaultHost = DEFAULT_HOST) {
  if (!Number.isInteger(index) || index < 0) return null;
  return getLayoutSessionKeys(layout, defaultHost)[index] || null;
}

function getLayoutSessionKeys(node, defaultHost = DEFAULT_HOST) {
  if (!node) return [];
  if (node.children) return node.children.flatMap(child => getLayoutSessionKeys(child, defaultHost));
  return node.session ? [paneSessionKey(node.host, node.session, defaultHost)] : [];
}
