<script>
  import { onMount, onDestroy } from 'svelte';
  import SplitPane from './lib/SplitPane.svelte';
  import Terminal from './lib/Terminal.svelte';
  import MobileKeyBar from './lib/MobileKeyBar.svelte';
  import Modal from './lib/Modal.svelte';
  import SettingsDropdown from './lib/SettingsDropdown.svelte';
  import HelpSection from './lib/HelpSection.svelte';
  import CommandPalette from './lib/CommandPalette.svelte';
  import SessionPicker from './lib/SessionPicker.svelte';
  import PropertiesPanel from './lib/PropertiesPanel.svelte';
  import { languages, normalizeLanguage, translate } from './lib/i18n.js';
  import { countPanes, presets, leaf, removePane, splitPaneAt, getSessionNames, getSessionPanes, getSessionPanesWithPaths, movePane, applySessionsToTemplate, autoArrangeLayout } from './lib/stores/layout.js';
  import {
    loadWorkspaces, getWorkspaces, getActiveId, getActiveWorkspace,
    setActive, updateLayout, subscribe, updatePaneSession,
    createWorkspace, deleteWorkspace, renameWorkspace, duplicateWorkspace,
    renameSessionInWorkspaces, updatePaneTitle,
  } from './lib/stores/workspaces.js';
  import { subscribeActivity, startActivityPolling, stopActivityPolling, markWorkspaceSeen } from './lib/stores/activity.js';
  import { subscribeStatus, startStatusConnection, stopStatusConnection, setViewingPanes, getWorstStatus, requestNotificationPermission } from './lib/stores/status.js';

  let sessions = $state([]);
  let workspaces = $state([]);
  let activeId = $state(null);
  let activeLayout = $state(null);
  let focusedId = $state(null);
  let loading = $state(true);
  let showSessionPicker = $state(null);
  let pendingSessionPath = $state(null);
  let showPropsPanel = $state(false);
  let zoomedPane = $state(null); // { id, session, host } when a pane is zoomed
  let activitySet = $state(new Set()); // workspace IDs with unseen output
  let statusMap = $state({}); // "host:session" → { status, ... } from status WebSocket
  let language = $state('en');

  // Mobile/responsive state
  let isMobile = $state(false);
  let isTablet = $state(false);
  let isTouch = $state(false);
  let isPortrait = $state(false);
  // View mode for touch devices: 'auto' | 'split' | 'single'.
  // 'auto' → single-pane on phones and touch-portrait; split otherwise.
  let viewMode = $state('auto');
  // Whether to render the single-pane (minimap) experience vs the split view.
  let useSinglePane = $derived(
    viewMode === 'single' ||
    (viewMode === 'auto' && (isMobile || (isTouch && isPortrait)))
  );
  // Show the touch view toggle for touch devices (and phones)
  let showViewToggle = $derived(isTouch || isMobile || isTablet);
  let mobileActivePane = $state(0); // index of active pane in mobile single-pane view
  let mobileTermRef = $state(null); // bound Terminal instance for the mobile key bar
  let mobileKeyBarRef = $state(null); // bound MobileKeyBar instance (to clear sticky Ctrl)
  let mobileMinimap = $state(true); // true = minimap grid, false = single terminal
  let readOnlyMode = $state(false);

  // Workspace management modals
  let showNewWsModal = $state(false);
  let newWsName = $state('');
  let showRenameModal = $state(null);
  let renameValue = $state('');
  let showDeleteConfirm = $state(null);
  let contextMenu = $state(null);
  let paneMenu = $state(null);

  // Session management modals
  let showSessionManager = $state(false); // kept for openSessionManager redirect
  let newSessionName = $state('');
  let newSessionHost = $state('reliant');
  let newSessionDir = $state('');
  let showRenameSession = $state(null); // { name, host }
  let renameSessionValue = $state('');
  let showDeleteSession = $state(null); // { name, host }
  let sessionMgrLoading = $state(false);
  let hosts = $state([]);

  // Auth user info
  let authUser = $state(null); // { name, email, method } or null

  // Settings menu/panel
  let showSettingsMenu = $state(false);
  let settingsSection = $state(null); // 'servers' | 'sessions' | 'appearance' | 'help' | null

  // Workspace templates
  let templates = $state([]);
  let showSaveTemplateModal = $state(null); // workspace id to save as template
  let saveTemplateName = $state('');

  // Host management state
  let managedHosts = $state([]);
  let managedHostsLoading = $state(false);
  let hostEditMode = $state(null); // null | 'add' | host.id (editing)
  let hostForm = $state({ name: '', hostname: '', user: '', port: 22, identity_file: '', auth_method: 'key', group_name: 'Other', enabled: true, connection_type: 'ssh', docker_container: '' });
  let hostDeleteConfirm = $state(null); // host id
  let dockerContainers = $state([]);
  let dockerContainersLoading = $state(false);
  let sshKeys = $state([]);
  let sshKeysLoading = $state(false);
  let showAddKeyForm = $state(false);
  let sshKeyForm = $state({ name: '', privateKey: '', publicKey: '' });

  // Settings session management
  let settingsSessionTab = $state('list'); // 'list' | 'create'
  let settingsSessionHostFilter = $state(null); // null = all, or host name
  let sessionHostErrors = $state({}); // { [hostName]: error }
  let sessionHostLoading = $state({}); // { [hostName]: true }

  // Appearance / theming
  let sessionTypes = $state([]); // from /api/session-types
  let sessionTypeMap = $state({}); // { process_name: { display_name, color } }
  let accentColor = $state('#F97316');
  let editingTypeId = $state(null);
  let editTypeColor = $state('');
  let editTypeName = $state('');
  let scanningTypes = $state(false);

  // Pane title rename
  let showRenamePaneModal = $state(null); // { path, session, host, currentTitle }
  let renamePaneValue = $state('');

  // Command palette
  let showCommandPalette = $state(false);
  let paletteQuery = $state('');
  let paletteIndex = $state(0);

  // Setup wizard (first-run)
  let showSetupWizard = $state(false);
  let setupStep = $state(1); // 1: welcome/import, 2: test hosts, 3: create workspace
  let setupImporting = $state(false);
  let setupTesting = $state(false);
  let setupTestResults = $state([]); // { name, status, tmuxAvailable, error }
  let setupWsName = $state('Default');
  let setupWsPreset = $state('quad');

  // Toast notifications
  let toasts = $state([]);
  let toastId = 0;

  function toast(message, type = 'info') {
    const id = ++toastId;
    toasts = [...toasts, { id, message, type }];
    const duration = type === 'error' ? 8000 : 3000;
    setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, duration);
  }

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function setLanguage(nextLanguage) {
    language = normalizeLanguage(nextLanguage);
    localStorage.setItem('session-deck-language', language);
    document.documentElement.lang = language;
  }

  subscribe(({ workspaces: ws, activeId: id }) => {
    workspaces = ws;
    activeId = id;
    const active = ws.find(w => w.id === id);
    activeLayout = active?.layout || null;
  });

  // Derive focused session info from focusedId
  function getFocusedSession() {
    if (!focusedId) return null;
    // focusedId format: "host:session"
    const [host, ...rest] = focusedId.split(':');
    const sessionName = rest.join(':');
    if (!sessionName || sessionName.startsWith('split-')) return null;
    return sessions.find(s => s.name === sessionName) || { name: sessionName, host, type: 'terminal' };
  }

  function getFocusedHost() {
    if (!focusedId) return null;
    return focusedId.split(':')[0] || 'reliant';
  }

  function formatTimestamp(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return t('minutesAgo', { count: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('hoursAgo', { count: Math.floor(diff / 3600000) });
    return d.toLocaleDateString(language === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function typeLabel(type) {
    return sessionTypeMap[type]?.display_name || type || 'Terminal';
  }

  function typeColor(type) {
    return sessionTypeMap[type]?.color || '#6b7688';
  }

  // Status colors — shared by workspace tabs, pane headers, and minimap cards
  const STATUS_COLORS = {
    asking:  { bg: 'rgba(255,180,84,0.15)', border: '#ffb454', dot: '#ffb454', shadow: 'rgba(255,180,84,0.6)', label: 'ASKING' },
    error:   { bg: 'rgba(240,113,120,0.15)', border: '#f07178', dot: '#f07178', shadow: 'rgba(240,113,120,0.6)', label: 'ERROR' },
    done:    { bg: 'rgba(127,217,98,0.15)', border: '#7fd962', dot: '#7fd962', shadow: 'rgba(127,217,98,0.6)', label: 'DONE' },
    working: { bg: 'rgba(61,139,253,0.15)', border: '#3d8bfd', dot: '#3d8bfd', shadow: 'rgba(61,139,253,0.4)', label: 'WORKING' },
    idle:    { bg: 'rgba(107,118,136,0.1)', border: '#6b7688', dot: '#6b7688', shadow: 'none', label: 'IDLE' },
  };
  // Alias for backward compat in workspace tab rendering
  const WS_STATUS_COLORS = STATUS_COLORS;

  function getWorkspaceStatus(ws) {
    if (!ws) return null;
    const panes = getSessionPanes(ws.layout);
    // Pass statusMap so Svelte tracks the reactive dependency
    return getWorstStatus(panes, statusMap);
  }

  function getPaneStatusFromMap(host, session) {
    const key = `${host || 'reliant'}:${session}`;
    return statusMap[key]?.status || null;
  }

  function openMinimapPane(paneIndex) {
    mobileActivePane = paneIndex;
    mobileMinimap = false;
  }

  function backToMinimap() {
    mobileMinimap = true;
  }

  function getTypeInfo(sessionName) {
    // Find the session in our sessions list to get its detected type
    const s = sessions.find(s => s.name === sessionName);
    const type = s?.type || 'bash';
    const color = typeColor(type);
    const label = (sessionTypeMap[type]?.display_name || type || 'TERM').toUpperCase().slice(0, 6);
    const context = s?.repoName || null;
    return { color, label, type, context };
  }

  let refreshTimer;

  async function loadSessionTypes() {
    try {
      const res = await fetch('/api/session-types');
      const data = await res.json();
      sessionTypes = data.types || [];
      const map = {};
      for (const t of sessionTypes) {
        map[t.process_name] = { display_name: t.display_name, color: t.color };
      }
      sessionTypeMap = map;
    } catch { /* ignore */ }
  }

  async function loadAppSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.accent_color) {
        accentColor = data.accent_color;
        applyAccentColor(data.accent_color);
      }
    } catch { /* ignore */ }
  }

  function applyAccentColor(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) return;
    const el = document.querySelector('.app');
    if (!el) return;
    el.style.setProperty('--accent', color);
    // Compute transparent variants
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    el.style.setProperty('--accent-hover', lightenHex(color, 25));
    el.style.setProperty('--accent-bg', `rgba(${r},${g},${b},0.08)`);
    el.style.setProperty('--accent-bg-med', `rgba(${r},${g},${b},0.1)`);
    el.style.setProperty('--accent-bg-strong', `rgba(${r},${g},${b},0.15)`);
    el.style.setProperty('--accent-border', `rgba(${r},${g},${b},0.2)`);
    el.style.setProperty('--accent-border-strong', `rgba(${r},${g},${b},0.3)`);
  }

  function lightenHex(hex, amount) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amount);
    g = Math.min(255, g + amount);
    b = Math.min(255, b + amount);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  async function saveAccentColor(color) {
    accentColor = color;
    applyAccentColor(color);
    await fetch('/api/settings/accent_color', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: color }),
    });
    toast('Accent color updated', 'success');
  }

  async function scanSessionTypes() {
    scanningTypes = true;
    try {
      const res = await fetch('/api/session-types/scan', { method: 'POST' });
      const data = await res.json();
      if (data.added > 0) {
        toast(`Discovered ${data.added} new process types`, 'success');
      } else {
        toast(`Scanned ${data.discovered.length} processes — no new types`, 'info');
      }
      await loadSessionTypes();
    } catch (e) {
      toast('Scan failed: ' + e.message, 'error');
    } finally {
      scanningTypes = false;
    }
  }

  function startEditType(t) {
    editingTypeId = t.id;
    editTypeColor = t.color;
    editTypeName = t.display_name;
  }

  async function saveTypeEdit() {
    if (!editingTypeId) return;
    try {
      await fetch(`/api/session-types/${editingTypeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: editTypeName, color: editTypeColor }),
      });
      editingTypeId = null;
      await loadSessionTypes();
      toast('Session type updated', 'success');
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function loadTemplates() {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      templates = data.templates || [];
    } catch { /* ignore */ }
  }

  async function saveAsTemplate(workspaceId) {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws) return;
    saveTemplateName = ws.name;
    showSaveTemplateModal = workspaceId;
    contextMenu = null;
  }

  async function handleSaveTemplate() {
    if (!saveTemplateName.trim() || !showSaveTemplateModal) return;
    const ws = workspaces.find(w => w.id === showSaveTemplateModal);
    if (!ws) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveTemplateName.trim(), layout: ws.layout }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      showSaveTemplateModal = null;
      await loadTemplates();
      toast(`Saved template "${saveTemplateName.trim()}"`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to save template', 'error');
    }
  }

  async function deleteTemplate(id, name) {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      await loadTemplates();
      toast(`Deleted template "${name}"`, 'success');
    } catch (e) {
      toast('Failed to delete template', 'error');
    }
  }

  async function loadSessions() {
    try {
      sessionHostErrors = {};
      // Load local sessions first (fast), then remote hosts in background
      try {
        sessions = await fetchHostSessions('reliant');
      } catch (e) {
        sessionHostErrors = { ...sessionHostErrors, reliant: e.message || 'Connection failed' };
        sessions = [];
      }

      // Load hosts list (for session manager host picker)
      const hostsRes = await fetch('/api/hosts');
      const hostsData = await hostsRes.json();
      hosts = hostsData.hosts || [];
      const remoteHosts = hosts.filter(h => !h.isLocal);

      if (remoteHosts.length > 0) {
        Promise.allSettled(
          remoteHosts.map(async (h) => {
            try {
              return await fetchHostSessions(h.name);
            } catch (e) {
              sessionHostErrors = { ...sessionHostErrors, [h.name]: e.message || 'Connection failed' };
              return [];
            }
          })
        ).then(results => {
          const remoteSessions = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);
          if (remoteSessions.length > 0) {
            sessions = [...sessions, ...remoteSessions];
          }
        });
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }

  async function retrySessionHost(hostName) {
    sessionHostLoading = { ...sessionHostLoading, [hostName]: true };
    try {
      const hostSessions = await fetchHostSessions(hostName);
      sessions = [...sessions.filter(s => (s.host || 'reliant') !== hostName), ...hostSessions];
      const { [hostName]: _removed, ...rest } = sessionHostErrors;
      sessionHostErrors = rest;
    } catch (e) {
      sessions = sessions.filter(s => (s.host || 'reliant') !== hostName);
      sessionHostErrors = { ...sessionHostErrors, [hostName]: e.message || 'Connection failed' };
    } finally {
      sessionHostLoading = { ...sessionHostLoading, [hostName]: false };
    }
  }

  async function fetchHostSessions(hostName) {
    const res = await fetch(`/api/sessions/${encodeURIComponent(hostName)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(formatSessionHostError(hostName, data, res));
    if (data.status && data.status !== 'online') {
      throw new Error(formatSessionHostError(hostName, data));
    }
    return (data.sessions || []).map(s => ({ ...s, host: hostName }));
  }

  function formatSessionHostError(hostName, data = {}, res = null) {
    const parts = [];
    const primary = data.message && data.message !== data.error ? data.message : data.error;
    if (primary && primary !== 'Internal Server Error') parts.push(primary);
    if (data.status && data.status !== 'online') parts.push(`status: ${data.status}`);
    if (data.code) parts.push(`code: ${data.code}`);
    if (data.syscall) parts.push(`syscall: ${data.syscall}`);
    if (data.path) parts.push(`path: ${data.path}`);
    if (data.host && data.host !== hostName) parts.push(`host: ${data.host}`);
    if (res && !res.ok) parts.push(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
    if (parts.length === 0 && primary) parts.push(primary);
    return parts.length > 0 ? parts.join(' | ') : 'Connection failed';
  }

  function hasVisibleSessionHostErrors() {
    return Object.keys(sessionHostErrors)
      .some(hostName => !settingsSessionHostFilter || settingsSessionHostFilter === hostName);
  }

  async function init() {
    await loadSessionTypes();
    await loadAppSettings();
    await loadSessions();
    await loadWorkspaces();
    await loadTemplates();

    // Check if user is authenticated (auth might be disabled)
    try {
      const res = await fetch('/auth/me');
      if (res.ok) authUser = await res.json();
    } catch { /* auth not enabled */ }

    loading = false;

    // Restore workspace/pane from URL hash
    restoreFromHash();

    // Detect first-run: no workspaces = show setup wizard
    if (workspaces.length === 0) {
      const hostRes = await fetch('/api/managed-hosts/count');
      const { count } = await hostRes.json();
      if (count === 0) {
        showSetupWizard = true;
        setupStep = 1;
      }
    }

  }

  function switchWorkspace(id) {
    focusedId = null;
    zoomedPane = null;
    showSessionPicker = null;
    contextMenu = null;
    mobileActivePane = 0;
    mobileMinimap = true;
    setActive(id);
    markWorkspaceSeen(id);
    updateUrlHash(id, null);
    // Tell status store which panes the user can see (suppress notifications for these)
    const ws = workspaces.find(w => w.id === id);
    if (ws) setViewingPanes(getSessionPanes(ws.layout));
  }

  function handleFocus(id) {
    focusedId = id;
    updateUrlHash(activeId, id);
  }

  function updateUrlHash(wsId, paneId) {
    const ws = workspaces.find(w => w.id === wsId);
    if (!ws) return;
    const parts = [`ws=${encodeURIComponent(ws.name)}`];
    if (paneId) parts.push(`pane=${encodeURIComponent(paneId)}`);
    const hash = parts.join('&');
    if (window.location.hash !== `#${hash}`) {
      history.replaceState(null, '', `#${hash}`);
    }
  }

  function restoreFromHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const wsName = params.get('ws');
    const paneId = params.get('pane');
    if (wsName) {
      const ws = workspaces.find(w => w.name === wsName);
      if (ws && ws.id !== activeId) {
        setActive(ws.id);
      }
    }
    if (paneId) {
      focusedId = paneId;
    }
  }

  function handleZoom(id, session, host, path = []) {
    if (zoomedPane && zoomedPane.id === id) {
      zoomedPane = null; // Unzoom
    } else {
      zoomedPane = { id, session, host, path };
      focusedId = id;
    }
  }

  function handleLayoutChange() {
    if (activeId && activeLayout) updateLayout(activeId, activeLayout);
  }

  function handleSplitPane(path, direction) {
    if (!activeLayout || !activeId) return;
    const newLayout = autoArrangeLayout(splitPaneAt(activeLayout, path, direction, null, 'reliant'));
    if (newLayout) {
      activeLayout = newLayout;
      // Force re-render
      const tmp = activeId;
      activeId = null;
      setTimeout(() => {
        activeId = tmp;
        updateLayout(tmp, newLayout);
      }, 50);
      toast('Pane added', 'info');
    }
  }

  function handleClosePane(path) {
    if (!activeLayout || !activeId) return;
    if (countPanes(activeLayout) <= 1) {
      toast("Can't close the last pane", 'error');
      return;
    }
    const removedLayout = removePane(activeLayout, path);
    const newLayout = removedLayout ? autoArrangeLayout(removedLayout) : null;
    if (newLayout) {
      activeLayout = newLayout;
      focusedId = null;
      zoomedPane = null;
      const tmp = activeId;
      activeId = null;
      setTimeout(() => {
        activeId = tmp;
        updateLayout(tmp, newLayout);
      }, 50);
      toast('Pane closed', 'info');
    }
  }

  function handlePaneDrop(sourceSession, targetSession, position) {
    if (!activeLayout || !activeId) return;
    const newLayout = movePane(activeLayout, sourceSession, targetSession, position);
    if (newLayout) {
      activeLayout = newLayout;
      focusedId = null;
      zoomedPane = null;
      const tmp = activeId;
      activeId = null;
      setTimeout(() => {
        activeId = tmp;
        updateLayout(tmp, newLayout);
      }, 50);
      toast(`Moved ${sourceSession} ${position} of ${targetSession}`, 'info');
    }
  }
  function openSessionPicker(path, currentSession) {
    showSessionPicker = { path, currentSession };
  }

  function assignSession(session) {
    if (showSessionPicker && activeId) {
      updatePaneSession(activeId, showSessionPicker.path, session.name, session.host || 'reliant');
      focusedId = `${session.host || 'reliant'}:${session.name}`;
      showSessionPicker = null;
      // No need to cycle activeId — Terminal.svelte reacts to prop changes
    }
  }

  function closeSessionPicker() { showSessionPicker = null; }

  function openCreateSessionForCurrentPicker() {
    pendingSessionPath = showSessionPicker?.path || null;
    closeSessionPicker();
    openSessionManager();
    settingsSessionTab = 'create';
  }

  function openSessionInCurrentPane(sessionName, hostName = 'reliant') {
    if (!activeId || !activeLayout || !sessionName) {
      toast('No active workspace', 'error');
      return false;
    }

    const panes = getSessionPanesWithPaths(activeLayout);
    if (panes.length === 0) {
      toast('No pane available', 'error');
      return false;
    }

    const pendingPane = pendingSessionPath
      ? panes.find(p => p.path.join('.') === pendingSessionPath.join('.'))
      : null;
    const focusedPane = focusedId
      ? panes.find(p => `${p.host || 'reliant'}:${p.session}` === focusedId)
      : null;
    const target = pendingPane || focusedPane || panes[0];
    updatePaneSession(activeId, target.path, sessionName, hostName);
    focusedId = `${hostName}:${sessionName}`;
    pendingSessionPath = null;

    const paneIndex = panes.findIndex(p => p.path.join('.') === target.path.join('.'));
    if (paneIndex >= 0) mobileActivePane = paneIndex;
    return true;
  }

  // Context menu
  function openContextMenu(e, wsId) {
    e.preventDefault();
    contextMenu = { id: wsId, x: e.clientX, y: e.clientY };
  }

  function openNewWsModal() {
    newWsName = '';
    showNewWsModal = true;
    contextMenu = null;
  }

  async function handleCreateWorkspace() {
    if (!newWsName.trim()) return;
    const layout = leaf(null, 'reliant');
    try {
      await createWorkspace(newWsName.trim(), layout);
      showNewWsModal = false;
      toast(`Created workspace "${newWsName.trim()}"`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to create workspace', 'error');
    }
  }

  function openRename(id) {
    const ws = workspaces.find(w => w.id === id);
    renameValue = ws?.name || '';
    showRenameModal = id;
    contextMenu = null;
  }

  async function handleRename() {
    if (!renameValue.trim() || !showRenameModal) return;
    try {
      await renameWorkspace(showRenameModal, renameValue.trim());
      toast(`Renamed to "${renameValue.trim()}"`, 'success');
      showRenameModal = null;
    } catch (e) {
      toast(e.message || 'Failed to rename', 'error');
    }
  }

  async function handleDuplicate(id) {
    contextMenu = null;
    try {
      await duplicateWorkspace(id);
      const ws = workspaces.find(w => w.id === id);
      toast(`Duplicated "${ws?.name || 'workspace'}"`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to duplicate', 'error');
    }
  }

  function openDeleteConfirm(id) {
    showDeleteConfirm = id;
    contextMenu = null;
  }

  async function handleDelete() {
    if (!showDeleteConfirm) return;
    const ws = workspaces.find(w => w.id === showDeleteConfirm);
    try {
      await deleteWorkspace(showDeleteConfirm);
      toast(`Deleted "${ws?.name || 'workspace'}"`, 'success');
      showDeleteConfirm = null;
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error');
    }
  }

  // --- Settings menu/panel ---

  function toggleSettingsMenu() {
    showSettingsMenu = !showSettingsMenu;
  }

  function openSettingsSection(section) {
    settingsSection = section;
    showSettingsMenu = false;
    if (section === 'servers') {
      autoImportIfEmpty();
    }
    if (section === 'sessions') {
      settingsSessionTab = 'list';
      settingsSessionHostFilter = null;
      if (managedHosts.length === 0) loadManagedHosts();
    }
    if (section === 'appearance') {
      loadSessionTypes();
    }
  }

  function closeSettingsPanel() {
    settingsSection = null;
  }

  let renderTestLoading = $state(false);

  async function runRenderTest() {
    // Find the first pane in the active workspace
    if (!activeLayout) { toast('No active workspace', 'error'); return; }
    const panes = getSessionPanes(activeLayout);
    if (!panes.length) { toast('No panes in workspace', 'error'); return; }
    const { session, host } = panes[0];

    renderTestLoading = true;
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(session)}/render-test`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed');
      }
      toast(`Render test sent to ${session} on ${host}`, 'success');
      closeSettingsPanel();
    } catch (e) {
      toast('Render test failed: ' + e.message, 'error');
    } finally {
      renderTestLoading = false;
    }
  }

  function settingsSectionTitle(section) {
    const titles = { servers: t('servers'), sessions: t('sessions'), appearance: t('appearance'), help: t('help') };
    return titles[section] || '';
  }

  // --- Host management ---

  async function loadManagedHosts() {
    managedHostsLoading = true;
    try {
      const res = await fetch('/api/managed-hosts');
      const data = await res.json();
      managedHosts = data.hosts || [];
    } catch (e) {
      toast('Failed to load hosts', 'error');
    } finally {
      managedHostsLoading = false;
    }
  }

  async function loadSshKeys() {
    sshKeysLoading = true;
    try {
      const res = await fetch('/api/ssh-keys');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load SSH keys');
      sshKeys = data.keys || [];
    } catch (e) {
      sshKeys = [];
      toast(e.message || 'Failed to load SSH keys', 'error');
    } finally {
      sshKeysLoading = false;
    }
  }

  async function saveSshKey() {
    if (!sshKeyForm.name.trim() || !sshKeyForm.privateKey.trim()) return;
    sshKeysLoading = true;
    try {
      const res = await fetch('/api/ssh-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sshKeyForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save SSH key');
      sshKeyForm = { name: '', privateKey: '', publicKey: '' };
      showAddKeyForm = false;
      await loadSshKeys();
      toast(`SSH key "${data.name}" saved`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sshKeysLoading = false;
    }
  }

  async function deleteSshKey(name) {
    sshKeysLoading = true;
    try {
      const res = await fetch(`/api/ssh-keys/${encodeURIComponent(name)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete SSH key');
      if (hostForm.identity_file === data.path) hostForm.identity_file = '';
      await loadSshKeys();
      toast(`SSH key "${name}" deleted`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sshKeysLoading = false;
    }
  }

  async function autoImportIfEmpty() {
    const res = await fetch('/api/managed-hosts/count');
    const { count } = await res.json();
    if (count === 0) {
      await importSSHConfig();
    }
    await loadManagedHosts();
    await loadSshKeys();
  }

  async function importSSHConfig() {
    managedHostsLoading = true;
    try {
      const res = await fetch('/api/managed-hosts/import-ssh-config', { method: 'POST' });
      const data = await res.json();
      toast(`Imported ${data.imported} hosts from SSH config (${data.skipped} already existed)`, 'success');
      await loadManagedHosts();
    } catch (e) {
      toast('Failed to import SSH config', 'error');
    } finally {
      managedHostsLoading = false;
    }
  }

  function startAddHost() {
    hostEditMode = 'add';
    hostForm = { name: '', hostname: '', user: '', port: 22, identity_file: '', auth_method: 'key', group_name: 'Other', enabled: true, connection_type: 'ssh', docker_container: '' };
    loadSshKeys();
  }

  function startEditHost(host) {
    hostEditMode = host.id;
    hostForm = {
      name: host.name,
      hostname: host.hostname,
      user: host.user || '',
      port: host.port || 22,
      identity_file: host.identity_file || '',
      auth_method: host.auth_method || 'key',
      group_name: host.group_name || 'Other',
      enabled: !!host.enabled,
      connection_type: host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh'),
      docker_container: host.docker_container || '',
    };
    if (hostForm.connection_type === 'docker') loadDockerContainers();
    else loadSshKeys();
  }

  function cancelHostEdit() {
    hostEditMode = null;
  }

  async function saveHost() {
    const missingTarget = hostForm.connection_type === 'docker'
      ? !hostForm.docker_container.trim()
      : !hostForm.hostname.trim();
    if (!hostForm.name.trim() || missingTarget) {
      toast(hostForm.connection_type === 'docker' ? 'Name and container are required' : 'Name and hostname are required', 'error');
      return;
    }
    managedHostsLoading = true;
    try {
      if (hostEditMode === 'add') {
        const res = await fetch('/api/managed-hosts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hostForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create host');
        toast(`Added host "${hostForm.name}"`, 'success');
      } else {
        const res = await fetch(`/api/managed-hosts/${hostEditMode}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hostForm),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update host');
        toast(`Updated host "${hostForm.name}"`, 'success');
      }
      hostEditMode = null;
      await loadManagedHosts();
      // Also refresh the main hosts list used by sessions/pickers
      await loadSessions();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      managedHostsLoading = false;
    }
  }

  async function deleteHost(id) {
    managedHostsLoading = true;
    try {
      const res = await fetch(`/api/managed-hosts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete host');
      toast(`Deleted host "${data.name}"`, 'success');
      hostDeleteConfirm = null;
      await loadManagedHosts();
      await loadSessions();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      managedHostsLoading = false;
    }
  }

  function managedHostsByGroup() {
    const grouped = {};
    for (const h of managedHosts) {
      const g = h.group_name || 'Other';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(h);
    }
    // Sort: Local first, then alphabetical
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'Local') return -1;
      if (b === 'Local') return 1;
      return a.localeCompare(b);
    });
  }

  const HOST_GROUPS = ['Local', 'Docker', 'HomeLab LXC', 'HomeLab VM', 'Proxmox', 'NAS', 'VPS', 'Network', 'Client', 'Other'];

  async function loadDockerContainers() {
    dockerContainersLoading = true;
    try {
      const res = await fetch('/api/docker/containers');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to list Docker containers');
      dockerContainers = data.containers || [];
    } catch (e) {
      dockerContainers = [];
      toast(e.message || 'Failed to list Docker containers', 'error');
    } finally {
      dockerContainersLoading = false;
    }
  }

  function setHostConnectionType(type) {
    hostForm.connection_type = type;
    if (type === 'docker') {
      hostForm.group_name = 'Docker';
      hostForm.user = '';
      hostForm.port = 0;
      hostForm.identity_file = '';
      loadDockerContainers();
    } else {
      hostForm.port = hostForm.port || 22;
      if (hostForm.group_name === 'Docker') hostForm.group_name = 'Other';
    }
  }

  function selectDockerContainer(name) {
    hostForm.docker_container = name;
    hostForm.hostname = name;
    if (!hostForm.name.trim()) hostForm.name = name;
  }

  // Host test state
  let hostTesting = $state({}); // { [hostId]: true } while testing
  let hostInstalling = $state({}); // { [hostId]: true } while installing tmux
  let hostInstallConfirm = $state(null); // host object for tmux install confirmation

  async function testHost(id) {
    hostTesting = { ...hostTesting, [id]: true };
    try {
      const res = await fetch(`/api/managed-hosts/${id}/test`, { method: 'POST' });
      const data = await res.json();
      // Update the host in our local list with test results
      managedHosts = managedHosts.map(h => h.id === id ? {
        ...h,
        last_test_status: data.status,
        last_test_at: new Date().toISOString(),
        tmux_available: data.tmuxAvailable ? 1 : 0,
        _testResult: data, // transient — holds OS, error, installCommand for UI
      } : h);
      if (data.status === 'ok') {
        const tmuxMsg = data.tmuxAvailable ? `tmux ${data.tmuxVersion || 'available'}` : 'no tmux';
        toast(`${managedHosts.find(h => h.id === id)?.name}: reachable (${tmuxMsg})`, 'success');
      } else {
        toast(`${managedHosts.find(h => h.id === id)?.name}: ${data.error || 'unreachable'}`, 'error');
      }
    } catch (e) {
      toast(`Test failed: ${e.message}`, 'error');
    } finally {
      hostTesting = { ...hostTesting, [id]: false };
    }
  }

  async function installTmuxOnHost(host) {
    if (!host) return;
    hostInstalling = { ...hostInstalling, [host.id]: true };
    try {
      const res = await fetch(`/api/managed-hosts/${host.id}/install-tmux`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to install tmux');
      managedHosts = managedHosts.map(h => h.id === host.id ? {
        ...h,
        last_test_status: data.test?.status || h.last_test_status,
        last_test_at: new Date().toISOString(),
        tmux_available: data.test?.tmuxAvailable ? 1 : 0,
        _testResult: data.test,
      } : h);
      toast(data.alreadyInstalled ? `${host.name}: tmux already installed` : `${host.name}: tmux installed`, 'success');
      await loadSessions();
    } catch (e) {
      toast(`Install failed: ${e.message}`, 'error');
    } finally {
      hostInstalling = { ...hostInstalling, [host.id]: false };
      hostInstallConfirm = null;
    }
  }

  function managedHostsForSessions() {
    // Return hosts that are enabled and not network/client devices
    return managedHosts.filter(h => h.enabled && h.group_name !== 'Network' && h.group_name !== 'Client');
  }

  function filteredSessionGroups() {
    const filtered = settingsSessionHostFilter
      ? sessions.filter(s => (s.host || 'reliant') === settingsSessionHostFilter)
      : sessions;
    const grouped = {};
    for (const s of filtered) {
      const h = s.host || 'reliant';
      if (!grouped[h]) grouped[h] = [];
      grouped[h].push(s);
    }
    for (const hostName of Object.keys(sessionHostErrors)) {
      if (settingsSessionHostFilter && settingsSessionHostFilter !== hostName) continue;
      if (!grouped[hostName]) grouped[hostName] = [];
    }
    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'reliant') return -1;
      if (b === 'reliant') return 1;
      return a.localeCompare(b);
    }).map(([hostName, hostSessions]) => ({
      hostName,
      hostSessions,
      error: sessionHostErrors[hostName],
    }));
  }

  async function handleSettingsCreateSession() {
    if (!newSessionName.trim()) return;
    sessionMgrLoading = true;
    const createdName = newSessionName.trim();
    const createdHost = newSessionHost;
    try {
      const res = await fetch(`/api/sessions/${createdHost}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createdName, startDir: newSessionDir.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create session');
      newSessionName = '';
      newSessionDir = '';
      settingsSessionTab = 'list';
      await loadSessions();
      const opened = openSessionInCurrentPane(createdName, createdHost);
      if (opened) closeSettingsPanel();
      toast(opened ? `Created and opened session "${createdName}" on ${createdHost}` : `Created session "${createdName}" on ${createdHost}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sessionMgrLoading = false;
    }
  }

  // --- Setup wizard ---

  async function setupImportHosts() {
    setupImporting = true;
    try {
      const res = await fetch('/api/managed-hosts/import-ssh-config', { method: 'POST' });
      const data = await res.json();
      await loadManagedHosts();
      await loadSessions();
      if (data.imported > 0) {
        toast(`Imported ${data.imported} hosts from SSH config`, 'success');
        setupStep = 2;
      } else {
        toast('No hosts found in SSH config. Add hosts manually.', 'info');
      }
    } catch (e) {
      toast('Failed to import: ' + e.message, 'error');
    } finally {
      setupImporting = false;
    }
  }

  async function setupTestAllHosts() {
    setupTesting = true;
    setupTestResults = [];
    try {
      const res = await fetch('/api/managed-hosts/test-all', { method: 'POST' });
      const data = await res.json();
      setupTestResults = data.results || [];
      await loadManagedHosts();
      await loadSessions();
    } catch (e) {
      toast('Test failed: ' + e.message, 'error');
    } finally {
      setupTesting = false;
    }
  }

  async function setupCreateWorkspace() {
    if (!setupWsName.trim()) return;
    const sessionNames = sessions.map(s => s.name);
    const layouts = presets(sessionNames.length ? sessionNames : ['main']);
    const layout = layouts[setupWsPreset] || layouts.quad;
    try {
      await createWorkspace(setupWsName.trim(), layout);
      toast(`Created workspace "${setupWsName.trim()}"`, 'success');
      showSetupWizard = false;
    } catch (e) {
      toast(e.message || 'Failed to create workspace', 'error');
    }
  }

  function setupSkip() {
    showSetupWizard = false;
  }

  // --- Command palette ---

  function getPaletteCommands() {
    const cmds = [];

    // Workspace switching
    workspaces.forEach((ws, i) => {
      cmds.push({ id: `ws-${ws.id}`, label: `${t('switchWorkspace')}: ${ws.name}`, hint: `Alt+${i + 1}`, action: () => switchWorkspace(ws.id), category: t('currentWorkspace') });
    });
    cmds.push({ id: 'ws-new', label: t('newWorkspace'), hint: 'N', action: openNewWsModal, category: t('currentWorkspace') });

    // Pane actions
    if (focusedId) {
      cmds.push({ id: 'zoom', label: zoomedPane ? t('restore') : t('zoomUnzoomPane'), hint: 'Ctrl+Shift+F', action: () => {
        if (zoomedPane) { zoomedPane = null; }
        else if (focusedId) {
          const [h, ...r] = focusedId.split(':');
          const s = r.join(':');
          if (s && !s.startsWith('split-')) handleZoom(focusedId, s, h);
        }
      }, category: t('paneControl') });
    }
    cmds.push({ id: 'props', label: t('toggleProperties'), hint: 'I', action: () => showPropsPanel = !showPropsPanel, category: t('paneControl') });

    // Session actions
    sessions.forEach(s => {
      cmds.push({ id: `focus-${s.host}-${s.name}`, label: `${t('sessions')}: ${s.name}`, hint: s.host, action: () => { focusedId = `${s.host || 'reliant'}:${s.name}`; }, category: t('sessions') });
    });
    cmds.push({ id: 'session-mgr', label: t('manageSessions'), action: openSessionManager, category: t('sessions') });

    // Settings
    cmds.push({ id: 'settings-servers', label: `${t('settings')}: ${t('servers')}`, action: () => openSettingsSection('servers'), category: t('settings') });
    cmds.push({ id: 'settings-sessions', label: `${t('settings')}: ${t('sessions')}`, action: () => openSettingsSection('sessions'), category: t('settings') });
    cmds.push({ id: 'settings-appearance', label: `${t('settings')}: ${t('appearance')}`, action: () => openSettingsSection('appearance'), category: t('settings') });
    cmds.push({ id: 'settings-help', label: `${t('settings')}: ${t('help')}`, action: () => openSettingsSection('help'), category: t('settings') });
    if (activeId) cmds.push({ id: 'save-template', label: t('saveAsTemplate'), action: () => saveAsTemplate(activeId), category: t('currentWorkspace') });

    return cmds;
  }

  function filteredPaletteCommands() {
    const cmds = getPaletteCommands();
    if (!paletteQuery.trim()) return cmds;
    const q = paletteQuery.toLowerCase();
    return cmds.filter(c => c.label.toLowerCase().includes(q) || (c.category || '').toLowerCase().includes(q));
  }

  function openCommandPalette() {
    paletteQuery = '';
    paletteIndex = 0;
    showCommandPalette = true;
  }

  function executePaletteCommand(cmd) {
    showCommandPalette = false;
    cmd.action();
  }

  function handlePaletteKeydown(e) {
    const cmds = filteredPaletteCommands();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteIndex = Math.min(paletteIndex + 1, cmds.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteIndex = Math.max(paletteIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cmds[paletteIndex]) executePaletteCommand(cmds[paletteIndex]);
    } else if (e.key === 'Escape') {
      showCommandPalette = false;
    }
  }

  async function testAllHosts() {
    const enabled = managedHosts.filter(h => h.enabled);
    for (const h of enabled) hostTesting = { ...hostTesting, [h.id]: true };
    try {
      const res = await fetch('/api/managed-hosts/test-all', { method: 'POST' });
      const data = await res.json();
      // Update all hosts with results
      for (const r of data.results) {
        managedHosts = managedHosts.map(h => h.id === r.id ? {
          ...h,
          last_test_status: r.status,
          last_test_at: new Date().toISOString(),
          tmux_available: r.tmuxAvailable ? 1 : 0,
          _testResult: r,
        } : h);
      }
      const okCount = data.results.filter(r => r.status === 'ok').length;
      toast(`Tested ${data.tested} hosts: ${okCount} reachable, ${data.tested - okCount} unreachable`, okCount === data.tested ? 'success' : 'info');
    } catch (e) {
      toast(`Test all failed: ${e.message}`, 'error');
    } finally {
      hostTesting = {};
    }
  }

  // --- Session management ---

  function openSessionManager() {
    settingsSessionTab = 'list';
    settingsSessionHostFilter = null;
    if (managedHosts.length === 0) loadManagedHosts();
    openSettingsSection('sessions');
  }

  function openRenamePaneModal(path, session, host) {
    // Get current pane title from the layout
    let node = activeLayout;
    for (let i = 0; i < path.length; i++) {
      if (node.children) node = node.children[path[i]];
    }
    renamePaneValue = node?.paneTitle || '';
    showRenamePaneModal = { path, session, host };
  }

  function handleRenamePane() {
    if (!showRenamePaneModal || !activeId) return;
    updatePaneTitle(activeId, showRenamePaneModal.path, renamePaneValue.trim());
    const label = renamePaneValue.trim() || showRenamePaneModal.session;
    toast(`Pane renamed to "${label}"`, 'success');
    showRenamePaneModal = null;
  }

  function clearPaneTitle(path) {
    if (!activeId) return;
    updatePaneTitle(activeId, path, null);
    toast('Pane name cleared', 'info');
  }

  function openRenameSessionModal(name, host) {
    renameSessionValue = name;
    showRenameSession = { name, host };
  }

  async function handleRenameSession() {
    if (!renameSessionValue.trim() || !showRenameSession) return;
    sessionMgrLoading = true;
    try {
      const { name, host } = showRenameSession;
      const res = await fetch(`/api/sessions/${host}/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: renameSessionValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rename session');
      toast(`Renamed "${name}" to "${renameSessionValue.trim()}" on ${host}`, 'success');
      // Update all workspace panes that reference the old session name
      renameSessionInWorkspaces(name, renameSessionValue.trim(), host);
      showRenameSession = null;
      await loadSessions();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sessionMgrLoading = false;
    }
  }

  function openDeleteSessionModal(name, host) {
    showDeleteSession = { name, host };
  }

  async function handleDeleteSession() {
    if (!showDeleteSession) return;
    sessionMgrLoading = true;
    try {
      const { name, host } = showDeleteSession;
      const res = await fetch(`/api/sessions/${host}/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete session');
      toast(`Deleted session "${name}" on ${host}`, 'success');
      showDeleteSession = null;
      await loadSessions();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sessionMgrLoading = false;
    }
  }

  function activeName() {
    return workspaces.find(w => w.id === activeId)?.name || '';
  }

  function handleWindowClick() { contextMenu = null; paneMenu = null; showSettingsMenu = false; }

  function handlePaneContextMenu(e, path, session, host) {
    paneMenu = { x: e.clientX, y: e.clientY, path, session, host };
  }

  function getWorkspacesContaining(sessionName) {
    return workspaces.filter(ws => {
      const names = getSessionNames(ws.layout);
      return names.includes(sessionName);
    });
  }

  function nodeIdFromPane(pm) {
    return `${pm.host}:${pm.session}`;
  }

  async function handleExportScrollback(session, host) {
    try {
      toast('Capturing scrollback...', 'info');
      const url = `/api/sessions/${encodeURIComponent(host)}/${encodeURIComponent(session)}/capture?download=true`;
      // Trigger browser download via hidden link
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      toast(`Export failed: ${e.message}`, 'error');
    }
  }

  // Keyboard shortcuts
  function handleKeydown(e) {
    // Don't handle when typing in inputs or modals are open
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (showNewWsModal || showRenameModal || showDeleteConfirm || showSessionPicker || showCommandPalette) return;

    // Ctrl+K to open command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    // Alt+1-9 to switch workspaces
    if (e.altKey && e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey) {
      const idx = parseInt(e.key) - 1;
      if (idx < workspaces.length) {
        e.preventDefault();
        switchWorkspace(workspaces[idx].id);
      }
      return;
    }

    // Alt+Shift+1-9 to focus pane by index
    // Alt+Shift+1-9 to focus pane by index
    if (e.altKey && e.shiftKey && (e.key >= '1' && e.key <= '9' || e.code?.startsWith('Digit'))) {
      const digit = e.code ? parseInt(e.code.replace('Digit', '')) : parseInt(e.key);
      const idx = digit - 1;
      if (!isNaN(idx) && idx >= 0 && activeLayout) {
        const sessions = getSessionNames(activeLayout);
        if (idx < sessions.length) {
          e.preventDefault();
          const sessionName = sessions[idx];
          focusedId = `reliant:${sessionName}`;
        }
      }
      return;
    }

    // N to create new workspace
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      openNewWsModal();
      return;
    }

    // Ctrl+Shift+F to zoom/unzoom focused pane
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
      e.preventDefault();
      if (zoomedPane) {
        zoomedPane = null;
      } else if (focusedId) {
        const [host, ...rest] = focusedId.split(':');
        const sessionName = rest.join(':');
        if (sessionName && !sessionName.startsWith('split-')) {
          handleZoom(focusedId, sessionName, host);
        }
      }
      return;
    }

    // I to toggle properties panel
    if (e.key === 'i' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      showPropsPanel = !showPropsPanel;
      return;
    }

    // Escape to close panels/menus/unzoom
    if (e.key === 'Escape') {
      if (showCommandPalette) { showCommandPalette = false; return; }
      if (settingsSection) { settingsSection = null; return; }
      if (showSettingsMenu) { showSettingsMenu = false; return; }
      if (zoomedPane) { zoomedPane = null; return; }
      contextMenu = null;
      paneMenu = null;
      return;
    }
  }

  onMount(() => {
    const savedLanguage = localStorage.getItem('session-deck-language') || navigator.language;
    setLanguage(savedLanguage);

    window.addEventListener('keydown', handleKeydown);
    // Start activity polling for workspace badges
    const unsubActivity = subscribeActivity(set => { activitySet = set; });
    startActivityPolling();

    // Connect to status WebSocket for real-time pane status
    startStatusConnection();
    const unsubStatus = subscribeStatus(map => { statusMap = map; });
    // Request notification permission on first interaction
    const requestNotifOnce = () => {
      requestNotificationPermission();
      window.removeEventListener('click', requestNotifOnce);
    };
    window.addEventListener('click', requestNotifOnce);

    // Viewport detection for responsive layout
    function checkViewport() {
      isMobile = window.innerWidth < 768;
      isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      isPortrait = window.innerHeight >= window.innerWidth;
    }
    checkViewport();
    window.addEventListener('resize', checkViewport);

    return () => {
      unsubActivity();
      unsubStatus();
      stopActivityPolling();
      stopStatusConnection();
      window.removeEventListener('resize', checkViewport);
      window.removeEventListener('click', requestNotifOnce);
    };
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    clearInterval(refreshTimer);
    stopActivityPolling();
  });

  $effect(() => { init(); });
</script>

<div class="app" role="presentation" onclick={handleWindowClick}>
  <nav class="topnav">
    <div class="logo-wrap">
      <button class="logo" onclick={(e) => { e.stopPropagation(); toggleSettingsMenu(); }} title={t('settings')}>
        <img class="logo-icon" src="/icon.svg" alt="" width="18" height="18" />
        <span class="logo-text">Session<b>Deck</b></span>
      </button>
      {#if showSettingsMenu}
        <SettingsDropdown {language} onOpen={openSettingsSection} />
      {/if}
    </div>
    <span class="sep"></span>
    <div class="ws-tabs">
      {#each workspaces as ws, i}
        {@const wsStatus = getWorkspaceStatus(ws)}
        {@const statusColor = wsStatus && WS_STATUS_COLORS[wsStatus]}
        <button
          class="wt"
          class:active={ws.id === activeId}
          class:has-activity={activitySet.has(ws.id) || (wsStatus && wsStatus !== 'idle')}
          onclick={() => switchWorkspace(ws.id)}
          oncontextmenu={(e) => openContextMenu(e, ws.id)}
          title="{ws.description || ws.name} (Alt+{i + 1}){wsStatus ? ' [' + wsStatus + ']' : ''}"
        >
          {#if statusColor && ws.id !== activeId}
            <span class="activity-dot" style="background:{statusColor.dot};box-shadow:0 0 6px {statusColor.shadow}" class:asking-pulse={wsStatus === 'asking'}></span>
          {:else if activitySet.has(ws.id)}
            <span class="activity-dot"></span>
          {/if}
          {ws.name}
          <span class="cnt" title="{countPanes(ws.layout)} panes">{countPanes(ws.layout)}p</span>
        </button>
      {/each}
      <button class="wt add-btn" onclick={openNewWsModal} title="New workspace (N)">+</button>
    </div>
    <span class="spacer"></span>
    {#if zoomedPane}
      <span class="pane-count zoom-indicator">ZOOM: {zoomedPane.session}</span>
    {:else if activeLayout}
      <span class="pane-count">{countPanes(activeLayout)} panes</span>
    {/if}
    {#if authUser}
      <span class="auth-user">{authUser.name}</span>
      <a class="auth-logout" href="/auth/logout" title={t('signOut')}>{t('signOut')}</a>
    {/if}
    {#if showViewToggle}
      <button
        class="topnav-btn view-toggle"
        onclick={() => viewMode = useSinglePane ? 'split' : 'single'}
        title={useSinglePane ? t('switchSplitView') : t('switchSingleView')}
      >{useSinglePane ? `▦ ${t('split')}` : `▯ ${t('single')}`}</button>
    {/if}
    <button
      class="topnav-btn"
      class:active={showPropsPanel}
      onclick={() => showPropsPanel = !showPropsPanel}
      title={`${t('properties')} (I)`}
    >{showPropsPanel ? 'I' : 'I'}</button>
  </nav>

  <div class="main-row">
    <main class="content">
      {#if loading}
        <div class="center-msg">{t('loadingWorkspaces')}</div>
      {:else if zoomedPane && activeId}
        <div class="zoomed-container">
          <Terminal
            session={zoomedPane.session}
            host={zoomedPane.host}
            focused={true}
            zoomed={true}
            sessionTypeColor={getTypeInfo(zoomedPane.session).color}
            sessionTypeLabel={getTypeInfo(zoomedPane.session).label}
            sessionContext={getTypeInfo(zoomedPane.session).context}
            {language}
            onZoom={() => { zoomedPane = null; }}
            onSessionClick={() => openSessionPicker(zoomedPane.path || [], zoomedPane.session)}
            onContextMenu={(e) => handlePaneContextMenu(e, zoomedPane.path || [], zoomedPane.session, zoomedPane.host)}
          />
        </div>
      {:else if useSinglePane && activeLayout && activeId}
        {@const panes = getSessionPanesWithPaths(activeLayout)}
        {#if panes.length === 0}
          <div class="center-msg">{t('noPanes')}</div>
        {:else if mobileMinimap}
          <!-- Mobile minimap: compact list view for portrait, efficient use of space -->
          <div class="minimap-container">
            {#each panes as pane, idx}
              {@const status = pane.session ? getPaneStatusFromMap(pane.host, pane.session) : null}
              {@const sc = STATUS_COLORS[status] || STATUS_COLORS.idle}
              {@const info = pane.session ? getTypeInfo(pane.session) : { color: '#6b7688', label: 'EMPTY' }}
              <button
                class="minimap-row"
                class:asking={status === 'asking'}
                style="border-left-color:{sc.border}"
                onclick={() => openMinimapPane(idx)}
              >
                  <span class="minimap-row-left">
                  <span class="minimap-row-dot" style="background:{sc.border}"></span>
                  <span class="minimap-row-session">{pane.session || t('addSession')}</span>
                  <span class="minimap-row-host">{pane.host || 'reliant'}</span>
                </span>
                <span class="minimap-row-right">
                  {#if status && status !== 'idle' && status !== 'unknown'}
                    <span class="minimap-row-status" style="background:{sc.bg};color:{sc.border}">{sc.label}</span>
                  {/if}
                  <span class="minimap-row-type" style="color:{info.color}">{info.label}</span>
                </span>
              </button>
            {/each}
          </div>
        {:else}
          <!-- Mobile terminal: single pane with back button -->
          {#key `${activeId}-${mobileActivePane}`}
            {@const pane = panes[mobileActivePane % panes.length]}
            {@const status = pane.session ? getPaneStatusFromMap(pane.host, pane.session) : null}
            {@const sc = STATUS_COLORS[status] || STATUS_COLORS.idle}
            <div class="mobile-terminal">
              <div class="mobile-terminal-header">
                <button class="mobile-back-btn" onclick={backToMinimap} title={t('backToMinimap')}>
                  <span class="mobile-back-arrow">&#8592;</span> {t('minimap')}
                </button>
                <span class="mobile-terminal-info">
                  <span class="mobile-terminal-name">{pane.session || t('addSession')}</span>
                  {#if status && status !== 'idle' && status !== 'unknown'}
                    <span class="mobile-terminal-status" style="color:{sc.border}">{sc.label}</span>
                  {/if}
                </span>
                <div class="mobile-pane-switcher">
                  {#each panes as p, i}
                    {@const pSt = p.session ? getPaneStatusFromMap(p.host, p.session) : null}
                    {@const pSc = STATUS_COLORS[pSt] || STATUS_COLORS.idle}
                    <button
                      class="mobile-pane-pip"
                      class:active={mobileActivePane === i}
                      style="background:{mobileActivePane === i ? pSc.border : pSc.dot}"
                      title={p.session || t('addSession')}
                      onclick={() => mobileActivePane = i}
                    ></button>
                  {/each}
                </div>
              </div>
              <div class="mobile-pane">
                {#if pane.session}
                  <Terminal
                    bind:this={mobileTermRef}
                    session={pane.session}
                    host={pane.host}
                    focused={true}
                    isMobile={true}
                    sessionTypeColor={getTypeInfo(pane.session).color}
                    sessionTypeLabel={getTypeInfo(pane.session).label}
                    sessionContext={getTypeInfo(pane.session).context}
                    {language}
                    onSessionClick={() => openSessionPicker(pane.path, pane.session)}
                    onContextMenu={(e) => handlePaneContextMenu(e, pane.path, pane.session, pane.host)}
                    onCtrlConsumed={() => mobileKeyBarRef?.clearCtrl()}
                  />
                {:else}
                  <div class="mobile-empty-pane">
                    <button class="add-session-btn" onclick={() => openSessionPicker(pane.path, null)}>
                      <span class="add-session-plus">+</span>
                      <span>{t('addSession')}</span>
                    </button>
                  </div>
                {/if}
              </div>
              {#if pane.session}
                <MobileKeyBar
                  bind:this={mobileKeyBarRef}
                  onKey={(seq) => mobileTermRef?.sendInput(seq)}
                  onShowKeyboard={() => mobileTermRef?.focusTerminal()}
                  onCtrlToggle={(active) => mobileTermRef?.setCtrlPending(active)}
                  {language}
                />
              {/if}
            </div>
          {/key}
        {/if}
      {:else if activeLayout && activeId}
        {#key activeId}
          <SplitPane
            node={activeLayout}
            {focusedId}
            zoomedId={null}
            onFocus={handleFocus}
            onLayoutChange={handleLayoutChange}
            onSessionPick={openSessionPicker}
            onZoom={handleZoom}
            onSplit={handleSplitPane}
            onClose={handleClosePane}
            onDrop={handlePaneDrop}
            onPaneContextMenu={handlePaneContextMenu}
            {getTypeInfo}
            {language}
          />
        {/key}
      {:else}
        <div class="center-msg">{t('noWorkspaces')}</div>
      {/if}
    </main>

    <!-- Properties panel -->
    {#if showPropsPanel}
      <PropertiesPanel
        {language}
        {activeId}
        session={focusedId ? getFocusedSession() : null}
        host={getFocusedHost()}
        activeWorkspaceName={activeName()}
        paneCount={activeLayout ? countPanes(activeLayout) : 0}
        workspaces={focusedId && getFocusedSession() ? getWorkspacesContaining(getFocusedSession().name) : []}
        {typeColor}
        {typeLabel}
        {formatTimestamp}
        onClose={() => showPropsPanel = false}
        onRename={openRenameSessionModal}
        onDelete={openDeleteSessionModal}
        onSwitchWorkspace={(id) => { switchWorkspace(id); showPropsPanel = false; }}
      />
    {/if}
  </div>

  <!-- Settings panel (slide-over from left) -->
  {#if settingsSection}
    <div class="settings-overlay" role="dialog" aria-modal="true" aria-label={settingsSectionTitle(settingsSection)} tabindex="-1" onclick={closeSettingsPanel} onkeydown={(e) => e.key === 'Escape' && closeSettingsPanel()}>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="settings-panel" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
        <div class="settings-panel-hdr">
          <button class="settings-back" aria-label={t('close')} title={t('close')} onclick={closeSettingsPanel}>
            <span class="back-arrow"></span>
          </button>
          <span class="settings-panel-title">{settingsSectionTitle(settingsSection)}</span>
          <button class="picker-close" aria-label={t('close')} title={t('close')} onclick={closeSettingsPanel}>&times;</button>
        </div>
        <div class="settings-panel-body">
          {#if settingsSection === 'servers'}
            <div class="host-mgr">
              <div class="host-mgr-toolbar">
                <span class="host-mgr-count">{t('hostsCount', { count: managedHosts.length })}</span>
                <span class="spacer"></span>
                <button class="host-toolbar-btn" onclick={testAllHosts} disabled={managedHostsLoading || Object.values(hostTesting).some(Boolean)} title="Test connectivity on all enabled hosts">
                  {Object.values(hostTesting).some(Boolean) ? t('testing') : t('testAll')}
                </button>
                <button class="host-toolbar-btn" onclick={importSSHConfig} disabled={managedHostsLoading} title="Re-import from ~/.ssh/config">
                  {t('importSshConfig')}
                </button>
                <button class="host-toolbar-btn primary" onclick={startAddHost} disabled={managedHostsLoading}>
                  {t('addHost')}
                </button>
              </div>

              <div class="ssh-key-section">
                <div class="ssh-key-header">
                  <span class="appearance-section-title">{t('sshKeys')}</span>
                  <span class="spacer"></span>
                  <button class="host-toolbar-btn" onclick={loadSshKeys} disabled={sshKeysLoading}>
                    {sshKeysLoading ? t('loading') : t('refresh')}
                  </button>
                  <button class="host-toolbar-btn primary" onclick={() => showAddKeyForm = !showAddKeyForm}>
                    {showAddKeyForm ? t('cancel') : t('addSshKey')}
                  </button>
                </div>
                {#if showAddKeyForm}
                  <div class="ssh-key-form">
                    <label class="host-field">
                      <span class="host-field-label">{t('keyName')}</span>
                      <input class="field-input" bind:value={sshKeyForm.name} placeholder="id_ed25519_prod" />
                    </label>
                    <label class="host-field full-width">
                      <span class="host-field-label">{t('privateKey')}</span>
                      <textarea class="field-input key-textarea" bind:value={sshKeyForm.privateKey} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
                    </label>
                    <label class="host-field full-width">
                      <span class="host-field-label">{t('publicKeyOptional')}</span>
                      <input class="field-input" bind:value={sshKeyForm.publicKey} placeholder="ssh-ed25519 ..." />
                    </label>
                    <div class="host-form-actions">
                      <button class="action-btn" onclick={saveSshKey} disabled={!sshKeyForm.name.trim() || !sshKeyForm.privateKey.trim() || sshKeysLoading}>
                        {sshKeysLoading ? t('saving') : t('save')}
                      </button>
                    </div>
                  </div>
                {/if}
                <div class="ssh-key-list">
                  {#each sshKeys as key}
                    <div class="ssh-key-row">
                      <span class="ssh-key-name">{key.name}</span>
                      <span class="ssh-key-path">{key.path}</span>
                      <span class="host-badge disabled-badge">{key.managed ? t('managed') : t('discovered')}</span>
                      {#if key.managed}
                        <button class="mgr-act danger" title={t('delete')} onclick={() => deleteSshKey(key.name)}>
                          <span class="mgr-icon-delete"></span>
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <div class="host-empty compact">{t('noSshKeys')}</div>
                  {/each}
                </div>
              </div>

              {#if hostEditMode}
                <div class="host-form">
                  <div class="host-form-title">{hostEditMode === 'add' ? t('addHost') : t('editHost')}</div>
                  <div class="host-form-grid">
                    <label class="host-field full-width">
                      <span class="host-field-label">{t('connectionType')}</span>
                      <div class="host-type-toggle">
                        <button
                          type="button"
                          class="host-type-btn"
                          class:active={hostForm.connection_type !== 'docker'}
                          onclick={() => setHostConnectionType('ssh')}
                        >SSH</button>
                        <button
                          type="button"
                          class="host-type-btn"
                          class:active={hostForm.connection_type === 'docker'}
                          onclick={() => setHostConnectionType('docker')}
                        >Docker</button>
                      </div>
                    </label>
                    <label class="host-field">
                      <span class="host-field-label">{t('name')} *</span>
                      <input class="field-input" type="text" bind:value={hostForm.name} placeholder="my-server" />
                    </label>
                    {#if hostForm.connection_type === 'docker'}
                      <label class="host-field">
                        <span class="host-field-label">{t('dockerContainer')} *</span>
                        <select class="field-input" bind:value={hostForm.docker_container} onchange={(e) => selectDockerContainer(e.target.value)}>
                          <option value="">{dockerContainersLoading ? t('loadingContainers') : t('selectContainer')}</option>
                          {#each dockerContainers as c}
                            <option value={c.name}>{c.name} ({c.image})</option>
                          {/each}
                        </select>
                      </label>
                      <label class="host-field full-width">
                        <span class="host-field-label">{t('runningContainers')}</span>
                        <div class="docker-container-actions">
                          <button type="button" class="host-toolbar-btn" onclick={loadDockerContainers} disabled={dockerContainersLoading}>
                            {dockerContainersLoading ? t('loadingContainers') : t('refreshContainers')}
                          </button>
                          {#if hostForm.docker_container}
                            <span class="docker-selected">{hostForm.docker_container}</span>
                          {/if}
                        </div>
                      </label>
                    {:else}
                      <label class="host-field">
                        <span class="host-field-label">{t('hostnameIp')}</span>
                        <input class="field-input" type="text" bind:value={hostForm.hostname} placeholder="192.168.1.100" />
                      </label>
                      <label class="host-field">
                        <span class="host-field-label">{t('user')}</span>
                        <input class="field-input" type="text" bind:value={hostForm.user} placeholder="claude" />
                      </label>
                      <label class="host-field">
                        <span class="host-field-label">{t('port')}</span>
                        <input class="field-input" type="number" bind:value={hostForm.port} />
                      </label>
                      <label class="host-field full-width">
                        <span class="host-field-label">{t('identityFile')}</span>
                        <select class="field-input" bind:value={hostForm.identity_file}>
                          <option value="">{t('defaultSshKey')}</option>
                          {#each sshKeys as key}
                            <option value={key.path}>{key.name} - {key.path}</option>
                          {/each}
                        </select>
                      </label>
                    {/if}
                    <label class="host-field">
                      <span class="host-field-label">{t('group')}</span>
                      <select class="field-input" bind:value={hostForm.group_name}>
                        {#each HOST_GROUPS as g}
                          <option value={g}>{g}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="host-field">
                      <span class="host-field-label">{t('enabled')}</span>
                      <label class="host-toggle">
                        <input type="checkbox" bind:checked={hostForm.enabled} />
                        <span class="toggle-label">{hostForm.enabled ? t('yes') : t('no')}</span>
                      </label>
                    </label>
                  </div>
                  <div class="host-form-actions">
                    <button class="action-btn secondary" onclick={cancelHostEdit}>{t('cancel')}</button>
                    <button class="action-btn" onclick={saveHost} disabled={managedHostsLoading || !hostForm.name.trim() || (hostForm.connection_type === 'docker' ? !hostForm.docker_container.trim() : !hostForm.hostname.trim())}>
                      {managedHostsLoading ? t('saving') : (hostEditMode === 'add' ? t('addHost') : t('saveChanges'))}
                    </button>
                  </div>
                </div>
              {/if}

              {#if managedHostsLoading && managedHosts.length === 0}
                <div class="host-loading">{t('loadingHosts')}</div>
              {:else}
                {#each managedHostsByGroup() as [groupName, groupHosts]}
                  <div class="host-group">
                    <div class="host-group-label">{groupName} <span class="host-group-cnt">({groupHosts.length})</span></div>
                    {#each groupHosts as h}
                      <div class="host-row" class:disabled={!h.enabled}>
                        <div class="host-row-main">
                          <span class="host-name">{h.name}</span>
                          <span class="host-addr">{h.user ? h.user + '@' : ''}{h.hostname}{h.port !== 22 ? ':' + h.port : ''}</span>
                          {#if h.is_local}
                            <span class="host-badge local">{t('local')}</span>
                          {/if}
                          {#if h.connection_type === 'docker'}
                            <span class="host-badge docker-badge">docker</span>
                          {/if}
                          {#if !h.enabled}
                            <span class="host-badge disabled-badge">{t('disabled')}</span>
                          {/if}
                          {#if hostTesting[h.id]}
                            <span class="host-badge testing-badge">{t('testing')}</span>
                          {:else if h.last_test_status === 'ok'}
                            <span class="host-badge ok-badge">{t('reachable')}</span>
                          {:else if h.last_test_status === 'error'}
                            <span class="host-badge error-badge">{t('unreachable')}</span>
                          {/if}
                          {#if h.tmux_available === 1}
                            <span class="host-badge tmux-badge">tmux</span>
                          {:else if h.tmux_available === 0}
                            <span class="host-badge no-tmux-badge">{t('noTmux')}</span>
                          {/if}
                        </div>
                        <div class="host-row-actions">
                          <button
                            class="mgr-act test-btn"
                            title={t('test')}
                            onclick={() => testHost(h.id)}
                            disabled={hostTesting[h.id]}
                          >
                            {hostTesting[h.id] ? '...' : t('test')}
                          </button>
                          <button
                            class="mgr-act test-btn"
                            title={t('viewSessionsHost')}
                            onclick={() => { settingsSessionHostFilter = h.name; settingsSection = 'sessions'; settingsSessionTab = 'list'; }}
                          >
                            {t('sessions')}
                          </button>
                          <button class="mgr-act" title="Edit" onclick={() => startEditHost(h)}>
                            <span class="mgr-icon-rename"></span>
                          </button>
                          {#if hostDeleteConfirm === h.id}
                            <button class="mgr-act confirm-del" title={t('confirmDelete')} onclick={() => deleteHost(h.id)}>
                              {t('yes')}
                            </button>
                            <button class="mgr-act" title={t('cancel')} onclick={() => hostDeleteConfirm = null}>
                              {t('no')}
                            </button>
                          {:else}
                            <button class="mgr-act danger" title="Delete" onclick={() => hostDeleteConfirm = h.id}>
                              <span class="mgr-icon-delete"></span>
                            </button>
                          {/if}
                        </div>
                      </div>
                      {#if h._testResult && !h._testResult.tmuxAvailable && h.last_test_status === 'ok'}
                        <div class="host-setup-hint">
                          <span class="host-setup-os">{h._testResult.os || 'Unknown OS'}</span>
                          {#if h._testResult.installCommand}
                            <span class="host-setup-label">{t('installTmux')}</span>
                            <code class="host-setup-cmd">{h._testResult.installCommand}</code>
                            <button
                              class="host-setup-copy"
                              onclick={() => hostInstallConfirm = h}
                              disabled={hostInstalling[h.id]}
                            >
                              {hostInstalling[h.id] ? t('installing') : t('install')}
                            </button>
                            <button class="host-setup-copy" onclick={() => { navigator.clipboard.writeText(h._testResult.installCommand); toast('Copied to clipboard', 'info'); }}>
                              {t('copy')}
                            </button>
                          {/if}
                        </div>
                      {/if}
                      {#if h._testResult && h.last_test_status === 'error'}
                        <div class="host-error-hint">
                          {h._testResult.error || 'Connection failed'} ({h._testResult.durationMs}ms)
                        </div>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <div class="host-empty">
                    <span>{t('noHostsConfigured')}</span>
                    <button class="action-btn" onclick={importSSHConfig}>{t('importFromSshConfig')}</button>
                  </div>
                {/each}
              {/if}
            </div>
          {:else if settingsSection === 'sessions'}
            <div class="host-mgr">
              <div class="host-mgr-toolbar">
                <span class="host-mgr-count">{t('sessionsCount', { count: sessions.length })}</span>
                <span class="spacer"></span>
                <button class="host-toolbar-btn" onclick={loadSessions}>
                  {t('refresh')}
                </button>
                <button class="host-toolbar-btn primary" onclick={() => { settingsSessionTab = 'create'; }}>
                  {t('newSession')}
                </button>
              </div>

              <!-- Host filter tabs -->
              <div class="session-host-tabs">
                <button
                  class="session-host-tab"
                  class:active={!settingsSessionHostFilter}
                  onclick={() => settingsSessionHostFilter = null}
                >{t('allHosts')}</button>
                {#each managedHostsForSessions() as h}
                  <button
                    class="session-host-tab"
                    class:active={settingsSessionHostFilter === h.name}
                    onclick={() => settingsSessionHostFilter = h.name}
                  >{h.name}
                    <span class="session-host-cnt">{sessions.filter(s => (s.host || 'reliant') === h.name).length}</span>
                    {#if sessionHostErrors[h.name]}
                      <span class="session-host-error-dot"></span>
                    {/if}
                  </button>
                {/each}
              </div>

              {#if settingsSessionTab === 'create'}
                <div class="host-form">
                  <div class="host-form-title">{t('newSession')}</div>
                  <div class="host-form-grid">
                    <label class="host-field">
                      <span class="host-field-label">{t('sessionName')}</span>
                      <input class="field-input" type="text" bind:value={newSessionName} placeholder="my-session"
                        onkeydown={(e) => e.key === 'Enter' && handleSettingsCreateSession()} />
                    </label>
                    <label class="host-field">
                      <span class="host-field-label">{t('host')}</span>
                      <select class="field-input" bind:value={newSessionHost}>
                        {#each managedHostsForSessions() as h}
                          <option value={h.name}>{h.name}</option>
                        {/each}
                      </select>
                    </label>
                    <label class="host-field full-width">
                      <span class="host-field-label">{t('startDirectory')} <span class="field-hint">({t('optional')})</span></span>
                      <input class="field-input" type="text" bind:value={newSessionDir} placeholder="/home/user/project"
                        onkeydown={(e) => e.key === 'Enter' && handleSettingsCreateSession()} />
                    </label>
                  </div>
                  <div class="host-form-actions">
                    <button class="action-btn secondary" onclick={() => { settingsSessionTab = 'list'; }}>{t('cancel')}</button>
                    <button class="action-btn" onclick={handleSettingsCreateSession}
                      disabled={!newSessionName.trim() || sessionMgrLoading}>
                      {sessionMgrLoading ? t('creating') : t('createSession')}
                    </button>
                  </div>
                </div>
              {/if}

              <div class="mgr-legend">
                <span class="mgr-legend-item"><span class="dot" style="background:{typeColor('claude')};box-shadow:0 0 6px {typeColor('claude')}"></span> Claude Code</span>
                <span class="mgr-legend-item"><span class="dot" style="background:{typeColor('gsd')};box-shadow:0 0 6px {typeColor('gsd')}"></span> GSD / Auto</span>
                <span class="mgr-legend-item"><span class="dot" style="background:{typeColor('bash')}"></span> {t('terminal')}</span>
              </div>

              {#each filteredSessionGroups() as group}
                <div class="mgr-host-group">
                  <div class="mgr-host-label">{group.hostName}</div>
                  {#if group.error}
                    <div class="session-host-error-row">
                      <div class="session-host-error-main">
                        <span class="session-host-error-title">{t('connectionError')}</span>
                        <span class="session-host-error-message">{group.error}</span>
                      </div>
                      <button class="host-toolbar-btn" onclick={() => retrySessionHost(group.hostName)} disabled={sessionHostLoading[group.hostName]}>
                        {sessionHostLoading[group.hostName] ? t('connecting') : t('reconnect')}
                      </button>
                    </div>
                  {/if}
                  {#each group.hostSessions as s}
                    <div class="mgr-session-row">
                      <span class="dot" style="background:{typeColor(s.type)};box-shadow:0 0 6px {typeColor(s.type)}"></span>
                      <span class="mgr-session-name">{s.name}</span>
                      <span class="mgr-session-meta">
                        {#if s.attached}
                          <span class="prop-badge attached">{t('active')}</span>
                        {:else}
                          <span class="prop-badge detached">{t('detached')}</span>
                        {/if}
                      </span>
                      <div class="mgr-session-actions">
                        <button class="mgr-act text-act" title={t('openSession')} onclick={() => openSessionInCurrentPane(s.name, group.hostName)}>
                          {t('openSession')}
                        </button>
                        <button class="mgr-act" title="Rename" onclick={() => openRenameSessionModal(s.name, group.hostName)}>
                          <span class="mgr-icon-rename"></span>
                        </button>
                        <button class="mgr-act danger" title="Kill session" onclick={() => openDeleteSessionModal(s.name, group.hostName)}>
                          <span class="mgr-icon-delete"></span>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                {#if !hasVisibleSessionHostErrors()}
                  <div class="host-empty">
                    <span>{t('noSessionsFound', { suffix: settingsSessionHostFilter ? ` on ${settingsSessionHostFilter}` : '' })}</span>
                  </div>
                {/if}
              {/each}
            </div>
          {:else if settingsSection === 'appearance'}
            <div class="host-mgr">
              <!-- Accent Color -->
              <div class="appearance-section">
                <div class="appearance-section-title">{t('accentColor')}</div>
                <div class="accent-picker">
                  {#each [
                    { color: '#F97316', label: 'Orange' },
                    { color: '#3d8bfd', label: 'Blue' },
                    { color: '#7fd962', label: 'Green' },
                    { color: '#c792ea', label: 'Purple' },
                    { color: '#56b6c2', label: 'Cyan' },
                    { color: '#e5c07b', label: 'Gold' },
                    { color: '#f07178', label: 'Red' },
                  ] as preset}
                    <button
                      class="accent-swatch"
                      class:active={accentColor === preset.color}
                      style="background:{preset.color}"
                      title={preset.label}
                      onclick={() => saveAccentColor(preset.color)}
                    ></button>
                  {/each}
                  <label class="accent-custom">
                    <input
                      type="color"
                      value={accentColor}
                      onchange={(e) => saveAccentColor(e.target.value)}
                      title={t('customColor')}
                    />
                    <span class="accent-custom-label">{t('custom')}</span>
                  </label>
                </div>
              </div>

              <div class="appearance-section">
                <div class="appearance-section-title">{t('language')}</div>
                <div class="language-options" role="radiogroup" aria-label={t('language')}>
                  {#each languages as lang}
                    <button
                      class="language-option"
                      class:active={language === lang.code}
                      role="radio"
                      aria-checked={language === lang.code}
                      onclick={() => setLanguage(lang.code)}
                    >
                      <span class="language-short">{lang.shortLabel}</span>
                      <span>{lang.code === 'zh-CN' ? t('chinese') : t('english')}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Session Type Colors -->
              <div class="appearance-section">
                <div class="appearance-section-hdr">
                  <span class="appearance-section-title">{t('sessionTypeColors')}</span>
                  <button class="host-toolbar-btn" onclick={scanSessionTypes} disabled={scanningTypes}>
                    {scanningTypes ? t('scanning') : t('scanSessions')}
                  </button>
                </div>
                <p class="appearance-desc">{t('sessionTypeDesc')}</p>
                <div class="type-list">
                  {#each sessionTypes as t}
                    <div class="type-row">
                      {#if editingTypeId === t.id}
                        <input type="color" class="type-color-input" value={editTypeColor}
                          onchange={(e) => editTypeColor = e.target.value} />
                        <input class="type-name-input" type="text" bind:value={editTypeName} 
                          onkeydown={(e) => e.key === 'Enter' && saveTypeEdit()} />
                        <span class="type-process">{t.process_name}</span>
                        <div class="type-row-actions">
                          <button class="mgr-act" onclick={saveTypeEdit}>{t('save')}</button>
                          <button class="mgr-act" onclick={() => editingTypeId = null}>{t('cancel')}</button>
                        </div>
                      {:else}
                        <span class="dot" style="background:{t.color};box-shadow:0 0 6px {t.color}"></span>
                        <span class="type-display-name">{t.display_name}</span>
                        <span class="type-process">{t.process_name}</span>
                        <span class="type-color-value">{t.color}</span>
                        <div class="type-row-actions">
                          <button class="mgr-act" title="Edit" onclick={() => startEditType(t)}>
                            <span class="mgr-icon-rename"></span>
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {:else if settingsSection === 'help'}
            <HelpSection
              {language}
              {authUser}
              {renderTestLoading}
              onRunRenderTest={runRenderTest}
            />
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Workspace context menu -->
  {#if contextMenu}
    <div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px">
      <button class="ctx-item" onclick={() => openRename(contextMenu.id)}>{t('rename')}</button>
      <button class="ctx-item" onclick={() => handleDuplicate(contextMenu.id)}>{t('duplicate')}</button>
      <button class="ctx-item" onclick={() => saveAsTemplate(contextMenu.id)}>{t('saveAsTemplate')}</button>
      <div class="ctx-sep"></div>
      <button class="ctx-item danger" onclick={() => openDeleteConfirm(contextMenu.id)}>{t('delete')}</button>
    </div>
  {/if}

  <!-- Pane context menu -->
  {#if paneMenu}
    <div class="ctx-menu" style="left:{paneMenu.x}px;top:{paneMenu.y}px">
      <button class="ctx-item" onclick={() => { openSessionPicker(paneMenu.path, paneMenu.session); paneMenu = null; }}>{t('changeSession')}</button>
      <button class="ctx-item" onclick={() => { openRenameSessionModal(paneMenu.session, paneMenu.host); paneMenu = null; }}>{t('renameSession')}</button>
      <button class="ctx-item" onclick={() => { openRenamePaneModal(paneMenu.path, paneMenu.session, paneMenu.host); paneMenu = null; }}>{t('renamePane')}</button>
      <div class="ctx-sep"></div>
      <button class="ctx-item" onclick={() => { handleSplitPane(paneMenu.path, 'h'); paneMenu = null; }}>{t('splitLeftRight')}</button>
      <button class="ctx-item" onclick={() => { handleSplitPane(paneMenu.path, 'v'); paneMenu = null; }}>{t('splitTopBottom')}</button>
      <div class="ctx-sep"></div>
      <button class="ctx-item" onclick={() => { handleZoom(nodeIdFromPane(paneMenu), paneMenu.session, paneMenu.host); paneMenu = null; }}>{zoomedPane ? t('restore') : t('zoom')}</button>
      <button class="ctx-item danger" onclick={() => { handleClosePane(paneMenu.path); paneMenu = null; }}>{t('closePane')}</button>
      <div class="ctx-sep"></div>
      <button class="ctx-item" onclick={() => { handleExportScrollback(paneMenu.session, paneMenu.host); paneMenu = null; }}>{t('exportScrollback')}</button>
      <div class="ctx-sep"></div>
      <button class="ctx-item danger" onclick={() => { openDeleteSessionModal(paneMenu.session, paneMenu.host); paneMenu = null; }}>{t('killSession')}</button>
    </div>
  {/if}

  <!-- Session picker overlay -->
  {#if showSessionPicker}
    <SessionPicker
      {language}
      {sessions}
      {typeColor}
      currentSession={showSessionPicker.currentSession}
      onClose={closeSessionPicker}
      onAssign={assignSession}
      onNewSession={openCreateSessionForCurrentPicker}
      onManageSessions={() => { closeSessionPicker(); openSessionManager(); }}
    />
  {/if}


  <!-- Rename session modal -->
  {#if showRenameSession}
    <Modal title={t('renameSession')} closeLabel={t('close')} onClose={() => showRenameSession = null}>
      <div class="modal-body">
        <p class="confirm-text" style="font-size:11px;color:#6b7688">
          {t('renamingSession', { name: showRenameSession.name, host: showRenameSession.host })}
        </p>
        <input
          class="field-input"
          type="text"
          bind:value={renameSessionValue}
          aria-label={t('renameSession')}
          onkeydown={(e) => e.key === 'Enter' && handleRenameSession()}
        />
        <button
          class="action-btn"
          onclick={handleRenameSession}
          disabled={!renameSessionValue.trim() || sessionMgrLoading}
        >{sessionMgrLoading ? t('renaming') : t('rename')}</button>
      </div>
    </Modal>
  {/if}

  <!-- Rename pane modal -->
  {#if showRenamePaneModal}
    <Modal title={t('renamePane')} closeLabel={t('close')} onClose={() => showRenamePaneModal = null}>
      <div class="modal-body">
        <p class="confirm-text" style="font-size:11px;color:var(--text-secondary)">
          {t('customPaneLabel', { session: showRenamePaneModal.session, host: showRenamePaneModal.host })}
        </p>
        <input
          class="field-input"
          type="text"
          bind:value={renamePaneValue}
          placeholder={t('paneNamePlaceholder')}
          aria-label={t('renamePane')}
          onkeydown={(e) => e.key === 'Enter' && handleRenamePane()}
        />
        <div class="btn-row">
          {#if renamePaneValue || showRenamePaneModal}
            <button class="action-btn secondary" onclick={() => { renamePaneValue = ''; handleRenamePane(); }}>{t('clearName')}</button>
          {/if}
          <button class="action-btn" onclick={handleRenamePane}>
            {renamePaneValue.trim() ? t('rename') : t('clear')}
          </button>
        </div>
      </div>
    </Modal>
  {/if}

  <!-- Delete session confirmation -->
  {#if showDeleteSession}
    <Modal title={t('killSession')} width="360px" closeLabel={t('close')} onClose={() => showDeleteSession = null}>
      <div class="modal-body">
        <p class="confirm-text">{t('killSessionConfirm', { name: showDeleteSession.name, host: showDeleteSession.host })}</p>
        <p class="confirm-warn">{t('killSessionWarn')}</p>
        <div class="btn-row">
          <button class="action-btn secondary" onclick={() => showDeleteSession = null}>{t('cancel')}</button>
          <button
            class="action-btn danger"
            onclick={handleDeleteSession}
            disabled={sessionMgrLoading}
          >{sessionMgrLoading ? t('killing') : t('killSession')}</button>
        </div>
      </div>
    </Modal>
  {/if}

  <!-- New workspace modal -->
  {#if showNewWsModal}
    <Modal title={t('newWorkspace')} width="360px" closeLabel={t('close')} onClose={() => showNewWsModal = false}>
      <div class="modal-body">
        <label class="field-label" for="new-workspace-name">{t('name')}</label>
        <input
          id="new-workspace-name"
          class="field-input"
          type="text"
          bind:value={newWsName}
          placeholder="my-workspace"
          onkeydown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
        />
        <button class="action-btn" onclick={handleCreateWorkspace} disabled={!newWsName.trim()}>{t('create')}</button>
      </div>
    </Modal>
  {/if}

  <!-- Rename modal -->
  {#if showRenameModal}
    <Modal title={t('renameWorkspace')} closeLabel={t('close')} onClose={() => showRenameModal = null}>
      <div class="modal-body">
        <input
          class="field-input"
          type="text"
          bind:value={renameValue}
          aria-label={t('renameWorkspace')}
          onkeydown={(e) => e.key === 'Enter' && handleRename()}
        />
        <button class="action-btn" onclick={handleRename} disabled={!renameValue.trim()}>{t('rename')}</button>
      </div>
    </Modal>
  {/if}

  <!-- Delete confirmation -->
  {#if showDeleteConfirm}
    <Modal title={t('deleteWorkspace')} closeLabel={t('close')} onClose={() => showDeleteConfirm = null}>
      <div class="modal-body">
        <p class="confirm-text">{t('deleteWorkspaceConfirm', { name: workspaces.find(w => w.id === showDeleteConfirm)?.name })}</p>
        <div class="btn-row">
          <button class="action-btn secondary" onclick={() => showDeleteConfirm = null}>{t('cancel')}</button>
          <button class="action-btn danger" onclick={handleDelete}>{t('delete')}</button>
        </div>
      </div>
    </Modal>
  {/if}

  <!-- Install tmux confirmation -->
  {#if hostInstallConfirm}
    <Modal title={t('installTmuxTitle')} width="380px" closeLabel={t('close')} onClose={() => hostInstallConfirm = null}>
      <div class="modal-body">
        <p class="confirm-text">{t('installTmuxConfirm', { name: hostInstallConfirm.name })}</p>
        {#if hostInstallConfirm._testResult?.installCommand}
          <code class="host-setup-cmd">{hostInstallConfirm._testResult.installCommand}</code>
        {/if}
        <p class="confirm-warn">{t('installTmuxWarn')}</p>
        <div class="btn-row">
          <button class="action-btn secondary" onclick={() => hostInstallConfirm = null}>{t('cancel')}</button>
          <button
            class="action-btn"
            onclick={() => installTmuxOnHost(hostInstallConfirm)}
            disabled={hostInstalling[hostInstallConfirm.id]}
          >{hostInstalling[hostInstallConfirm.id] ? t('installing') : t('install')}</button>
        </div>
      </div>
    </Modal>
  {/if}

  <!-- Save as Template modal -->
  {#if showSaveTemplateModal}
    <Modal title={t('saveAsTemplate')} closeLabel={t('close')} onClose={() => showSaveTemplateModal = null}>
      <div class="modal-body">
        <label class="field-label" for="template-name">{t('templateName')}</label>
        <input
          id="template-name"
          class="field-input"
          bind:value={saveTemplateName}
          placeholder={t('templatePlaceholder')}
          onkeydown={(e) => e.key === 'Enter' && handleSaveTemplate()}
        />
        <p class="help-text">{t('templateHelp')}</p>
        <div class="btn-row">
          <button class="action-btn secondary" onclick={() => showSaveTemplateModal = null}>{t('cancel')}</button>
          <button class="action-btn" onclick={handleSaveTemplate} disabled={!saveTemplateName.trim()}>{t('saveTemplate')}</button>
        </div>
      </div>
    </Modal>
  {/if}

  <!-- Command palette -->
  {#if showCommandPalette}
    <CommandPalette
      {language}
      query={paletteQuery}
      index={paletteIndex}
      commands={filteredPaletteCommands()}
      onClose={() => showCommandPalette = false}
      onQuery={(value) => paletteQuery = value}
      onIndex={(value) => paletteIndex = value}
      onKeydown={handlePaletteKeydown}
      onExecute={executePaletteCommand}
    />
  {/if}

  <!-- Setup wizard (first-run) -->
  {#if showSetupWizard}
    <div class="setup-overlay">
      <div class="setup-wizard">
        <!-- Step indicator -->
        <div class="setup-steps">
          <span class="setup-step" class:active={setupStep === 1} class:done={setupStep > 1}>1</span>
          <span class="setup-step-line" class:done={setupStep > 1}></span>
          <span class="setup-step" class:active={setupStep === 2} class:done={setupStep > 2}>2</span>
          <span class="setup-step-line" class:done={setupStep > 2}></span>
          <span class="setup-step" class:active={setupStep === 3}>3</span>
        </div>

        {#if setupStep === 1}
          <div class="setup-content">
            <h2 class="setup-title">{t('welcome')}</h2>
            <p class="setup-desc">{t('setupImportDesc')}</p>
            <p class="setup-hint">
              {#if language === 'zh-CN'}
                Session Deck 会读取你的 <code>~/.ssh/config</code> 文件来查找已配置主机。
              {:else}
                Session Deck will read your <code>~/.ssh/config</code> file to find configured hosts.
              {/if}
            </p>
            <div class="setup-actions">
              <button class="action-btn" onclick={setupImportHosts} disabled={setupImporting}>
                {setupImporting ? t('importing') : t('importFromSshConfig')}
              </button>
              <button class="setup-link" onclick={() => { showSetupWizard = false; openSettingsSection('servers'); }}>
                {t('addHostsManually')}
              </button>
            </div>
            <button class="setup-skip" onclick={setupSkip}>{t('skipSetup')}</button>
          </div>

        {:else if setupStep === 2}
          <div class="setup-content">
            <h2 class="setup-title">{t('testYourHosts')}</h2>
            <p class="setup-desc">
              {t('hostsImported', { count: managedHosts.length })}
            </p>

            {#if setupTestResults.length > 0}
              <div class="setup-results">
                {#each setupTestResults as r}
                  <div class="setup-result-row">
                    <span class="setup-result-name">{r.name}</span>
                    {#if r.status === 'ok'}
                      <span class="host-badge ok-badge">{t('reachable')}</span>
                      {#if r.tmuxAvailable}
                        <span class="host-badge tmux-badge">tmux</span>
                      {:else}
                        <span class="host-badge no-tmux-badge">{t('noTmux')}</span>
                      {/if}
                    {:else}
                      <span class="host-badge error-badge">{r.error || 'unreachable'}</span>
                    {/if}
                  </div>
                {/each}
              </div>
              {@const reachable = setupTestResults.filter(r => r.status === 'ok').length}
              {@const withTmux = setupTestResults.filter(r => r.tmuxAvailable).length}
              <p class="setup-summary">
                {t('reachableSummary', { reachable, total: setupTestResults.length, withTmux })}
                {#if withTmux === 0}
                  <span class="setup-warn">{t('noHostsTmux')}</span>
                {/if}
              </p>
            {/if}

            <div class="setup-actions">
              {#if setupTestResults.length === 0}
                <button class="action-btn" onclick={setupTestAllHosts} disabled={setupTesting}>
                  {setupTesting ? t('testing') : t('testAllHosts')}
                </button>
              {:else}
                <button class="action-btn" onclick={() => setupStep = 3}>
                  {t('continue')}
                </button>
                <button class="setup-link" onclick={setupTestAllHosts} disabled={setupTesting}>
                  {setupTesting ? t('retesting') : t('retest')}
                </button>
              {/if}
            </div>
            <button class="setup-skip" onclick={() => setupStep = 3}>{t('skipTesting')}</button>
          </div>

        {:else if setupStep === 3}
          <div class="setup-content">
            <h2 class="setup-title">{t('createFirstWorkspace')}</h2>
            <p class="setup-desc">
              {t('workspaceIntro')}
            </p>
            <label class="host-field">
              <span class="host-field-label">{t('workspaceName')}</span>
              <input class="field-input" type="text" bind:value={setupWsName} placeholder="Default" />
            </label>
            <label class="host-field">
              <span class="host-field-label">{t('layoutPresetTitle')}</span>
              <div class="setup-presets">
                {#each [
                  { id: 'dual', label: 'Dual', desc: '2 panes side by side' },
                  { id: 'claude-focus', label: 'Focus', desc: '1 large + 1 small' },
                  { id: 'quad', label: 'Quad', desc: '4 equal panes' },
                  { id: 'infra', label: 'Infra', desc: '1 large + 3 small' },
                  { id: 'deck', label: 'Deck', desc: '6 panes (3×2)' },
                  { id: 'mixed', label: 'Mixed', desc: '2 large + 3 small' },
                ] as p}
                  <button
                    class="setup-preset"
                    class:active={setupWsPreset === p.id}
                    onclick={() => setupWsPreset = p.id}
                  >
                    <span class="setup-preset-label">{p.label}</span>
                    <span class="setup-preset-desc">{p.desc}</span>
                  </button>
                {/each}
              </div>
            </label>
            <div class="setup-actions">
              <button class="action-btn" onclick={setupCreateWorkspace} disabled={!setupWsName.trim()}>
                {t('createWorkspace')}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Toast notifications -->
  <div class="toast-container">
    {#each toasts as t (t.id)}
      <div class="toast {t.type}">{t.message}</div>
    {/each}
  </div>

  <footer class="statusbar">
    {#if focusedId}
      {@const fi = getFocusedSession()}
      {@const fh = getFocusedHost()}
      {#if fi}
        <span class="sb-focused" title={t('focusedPane')}>
          <span class="sb-dot" style="background:{getTypeInfo(fi.name).color}"></span>
          <span class="sb-session">{fi.name}</span>
          <span class="sb-host">{fh}</span>
        </span>
      {/if}
    {:else}
      <span class="sb-hint">{t('clickPaneFocus')}</span>
    {/if}
    <span class="spacer"></span>
    <button class="shortcut-btn" onclick={openCommandPalette}><kbd>Ctrl+K</kbd></button>
    <button class="shortcut-btn" onclick={openNewWsModal}><kbd>N</kbd></button>
    <button class="shortcut-btn" onclick={() => showPropsPanel = !showPropsPanel}><kbd>I</kbd></button>
    <button class="shortcut-btn" onclick={() => {
      if (zoomedPane) { zoomedPane = null; }
      else if (focusedId) {
        const [h, ...r] = focusedId.split(':');
        const s = r.join(':');
        if (s && !s.startsWith('split-')) handleZoom(focusedId, s, h);
      }
    }}><kbd>Ctrl+Shift+F</kbd></button>
  </footer>
</div>

<style>
  .app {
    display: flex; flex-direction: column; height: 100vh;

    /* Theme variables */
    --accent: #F97316;
    --accent-hover: #fb923c;
    --accent-bg: var(--accent-bg);
    --accent-bg-med: var(--accent-bg-med);
    --accent-bg-strong: var(--accent-bg-strong);
    --accent-border: var(--accent-border);
    --accent-border-strong: var(--accent-border-strong);

    /* Session type colors */
    --claude-color: var(--claude-color);
    --claude-bg: var(--claude-bg);
    --claude-glow: 0 0 6px #3d8bfd;
    --gsd-color: var(--gsd-color);
    --gsd-bg: rgba(199, 146, 234, 0.1);
    --gsd-glow: 0 0 6px #c792ea;
    --terminal-color: var(--text-secondary);
    --terminal-bg: rgba(107, 118, 136, 0.1);

    /* Status colors */
    --success: #7fd962;
    --success-bg: rgba(127, 217, 98, 0.1);
    --success-border: rgba(127, 217, 98, 0.3);
    --danger: #f07178;
    --danger-bg: rgba(240, 113, 120, 0.1);
    --danger-border: rgba(240, 113, 120, 0.3);
    --danger-bg-subtle: rgba(240, 113, 120, 0.08);
    --danger-border-subtle: rgba(240, 113, 120, 0.15);
    --warning: #ffcb6b;
    --warning-bg: rgba(255, 203, 107, 0.1);

    /* Surface colors */
    --bg-base: #0a0e14;
    --bg-surface: #121820;
    --bg-raised: #151b23;
    --bg-elevated: #1c2333;
    --bg-hover: #252d3d;
    --border: #1e2530;
    --border-strong: #2a3345;
    --text-primary: #c5cdd9;
    --text-secondary: #6b7688;
    --text-muted: #3d4450;
  }

  .topnav {
    height: 38px; padding: 0 12px;
    background: var(--bg-raised); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }
  .logo {
    font-size: 13px; font-weight: 500; color: var(--accent);
    font-family: 'JetBrains Mono', monospace; letter-spacing: 0;
    background: none; border: none; cursor: pointer; padding: 4px 8px;
    border-radius: 4px; transition: all 0.12s;
    display: flex; align-items: center; gap: 6px;
  }
  .logo:hover { background: var(--accent-bg-med); }
  .logo-icon { flex-shrink: 0; }
  .logo-text b { font-weight: 800; }
  .logo-wrap { position: relative; }
  .sep { width: 1px; height: 18px; background: var(--border); }
  .spacer { flex: 1; }
  .ws-tabs { display: flex; gap: 2px; }
  .wt {
    padding: 5px 12px; border-radius: 6px; border: 1px solid transparent;
    background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 500;
    cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.12s;
    display: flex; align-items: center; gap: 4px; position: relative;
  }
  .wt:hover { color: var(--text-primary); }
  .wt.active { color: var(--accent); background: var(--accent-bg); border-color: var(--accent-border); }
  .wt.has-activity { color: var(--text-primary); }
  .wt .cnt { font-size: 10px; color: var(--text-muted); }
  .activity-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent, #F97316);
    box-shadow: 0 0 6px var(--accent, #F97316);
    flex-shrink: 0;
    animation: activity-pulse 2s ease-in-out infinite;
  }
  .activity-dot.asking-pulse {
    animation: asking-flash 1s ease-in-out infinite;
  }
  @keyframes activity-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes asking-flash {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.7); }
  }
  .add-btn { font-size: 16px; padding: 3px 10px; color: var(--text-muted); }
  .add-btn:hover { color: var(--accent); }
  .pane-count { font-size: 11px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }

  .topnav-btn {
    padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 10px;
    font-family: 'DM Sans', sans-serif; font-weight: 500;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.12s;
  }
  .topnav-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .topnav-btn.active { border-color: var(--accent); background: var(--accent-bg-med); color: var(--accent); }

  .auth-user { font-size: 10px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace; }
  .auth-logout {
    font-size: 10px; color: var(--text-muted); text-decoration: none;
    padding: 2px 6px; border-radius: 3px; transition: color 0.1s;
  }
  .auth-logout:hover { color: var(--danger); }

  .main-row { flex: 1; display: flex; overflow: hidden; }
  .content { flex: 1; overflow: hidden; padding: 3px; }
  .center-msg { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 14px; color: var(--text-secondary); }
  .zoomed-container { width: 100%; height: 100%; }
  .zoom-indicator { color: var(--success); }

  /* Context menu */
  .ctx-menu {
    position: fixed; z-index: 3000;
    background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5); padding: 4px; min-width: 160px;
  }
  .ctx-item {
    width: 100%; padding: 7px 12px; border: none; background: transparent;
    color: var(--text-primary); font-size: 12px; text-align: left; cursor: pointer;
    border-radius: 4px; display: flex; align-items: center; gap: 8px;
  }
  .ctx-item:hover { background: var(--bg-hover); }
  .ctx-item.danger { color: var(--danger); }
  .ctx-item.danger:hover { background: var(--danger-bg); }
  .ctx-sep { height: 1px; background: var(--border-strong); margin: 4px 8px; }

  /* Modals */
  .picker-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
    z-index: 2000; display: flex; align-items: center; justify-content: center;
  }
  .picker-overlay.modal-top { z-index: 3500; }
  .picker {
    width: 400px; max-height: 500px; background: var(--bg-raised);
    border: 1px solid var(--border); border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5); overflow: hidden;
    display: flex; flex-direction: column;
  }
  .picker-hdr {
    padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--border); font-size: 13px; font-weight: 600; color: var(--text-primary);
  }
  .picker-close {
    width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 12px;
  }
  .picker-close:hover { border-color: var(--danger); color: var(--danger); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  .modal-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .field-label { font-size: 11px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--accent); }

  .preset-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .preset-btn {
    padding: 5px 10px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }
  .preset-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .preset-btn.active { border-color: var(--accent); background: var(--accent-bg-med); color: var(--accent); }
  .template-btn { border-style: dashed; }
  .tpl-cnt { font-size: 9px; opacity: 0.6; margin-left: 2px; }

  .action-btn {
    padding: 8px 16px; border-radius: 6px; border: none;
    background: var(--accent); color: #fff; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.12s;
  }
  .action-btn:hover { background: var(--accent-hover); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .action-btn.secondary { background: var(--border); color: var(--text-primary); }
  .action-btn.secondary:hover { background: var(--bg-hover); }
  .action-btn.danger { background: var(--danger); }
  .action-btn.danger:hover { background: var(--danger); }

  .confirm-text { color: var(--text-primary); font-size: 13px; margin: 0; }
  .help-text { color: var(--text-muted); font-size: 11px; margin: 6px 0 0; line-height: 1.4; }
  .btn-row { display: flex; gap: 8px; justify-content: flex-end; }

  .toast-container {
    position: fixed; bottom: 32px; right: 16px; z-index: 4000;
    display: flex; flex-direction: column; gap: 8px;
  }
  .toast {
    padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: toast-in 0.2s ease-out;
  }
  .toast.success { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
  .toast.error { background: var(--danger-border-subtle); color: var(--danger); border: 1px solid var(--danger-border); }
  .toast.info { background: var(--accent-bg-strong); color: var(--accent); border: 1px solid var(--accent-border-strong); }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .statusbar {
    height: 24px; padding: 0 12px;
    background: var(--bg-raised); border-top: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px;
    font-size: 10px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;
    flex-shrink: 0;
  }
  .sb-focused { display: flex; align-items: center; gap: 5px; }
  .sb-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .sb-session { color: var(--text-primary); font-weight: 500; }
  .sb-host { color: var(--text-muted); }
  .sb-hint { color: var(--text-muted); font-style: italic; }
  .shortcut-btn {
    display: flex; align-items: center; gap: 3px;
    background: none; border: none; color: var(--text-muted); cursor: pointer;
    font-size: 10px; font-family: 'JetBrains Mono', monospace;
    padding: 0 4px; border-radius: 2px; transition: color 0.1s;
  }
  .shortcut-btn:hover { color: var(--text-secondary); }
  .statusbar kbd {
    font-size: 9px; padding: 0 3px; border-radius: 2px;
    background: var(--bg-base); border: 1px solid var(--border); color: var(--text-secondary);
  }

  /* Session manager */
  .session-mgr { width: 500px; max-height: 600px; }
  .mgr-tabs { display: flex; gap: 2px; margin-left: auto; }

  .mgr-legend {
    display: flex; gap: 16px; padding: 6px 12px;
    border-bottom: 1px solid var(--border); font-size: 10px; color: var(--text-secondary);
  }
  .mgr-legend-item { display: flex; align-items: center; gap: 5px; }
  .mgr-tab {
    padding: 3px 10px; border-radius: 4px; border: 1px solid transparent;
    background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; transition: all 0.1s;
  }
  .mgr-tab:hover { color: var(--text-primary); }
  .mgr-tab.active { color: var(--accent); background: var(--accent-bg); border-color: var(--accent-border); }

  .mgr-host-group { margin-bottom: 4px; }
  .mgr-host-label {
    padding: 6px 12px 2px; font-size: 10px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }
  .mgr-session-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px; border-radius: 6px; transition: background 0.1s;
  }
  .mgr-session-row:hover { background: var(--bg-elevated); }
  .mgr-session-row:hover .mgr-session-actions { opacity: 1; }
  .mgr-session-name {
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: var(--text-primary); flex: 1;
  }
  .mgr-session-meta { display: flex; align-items: center; gap: 4px; }
  .mgr-session-actions {
    display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s;
  }
  .mgr-act {
    width: 24px; height: 24px; border-radius: 4px; border: 1px solid transparent;
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.1s;
  }
  .mgr-act.text-act {
    width: auto;
    min-width: 38px;
    padding: 0 8px;
    font-size: 11px;
    font-family: 'DM Sans', sans-serif;
  }
  .mgr-act:hover { background: var(--bg-hover); border-color: #2a3345; color: var(--text-primary); }
  .mgr-act.danger:hover { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger); }

  /* Rename icon — small pencil/edit shape via CSS */
  .mgr-icon-rename {
    display: block; width: 10px; height: 10px; position: relative;
    transform: rotate(-45deg);
  }
  .mgr-icon-rename::before {
    content: ''; position: absolute; bottom: 0; left: 50%;
    width: 5px; height: 8px; border: 1.5px solid currentColor;
    border-bottom: none; border-radius: 1px 1px 0 0;
    transform: translateX(-50%);
  }
  .mgr-icon-rename::after {
    content: ''; position: absolute; bottom: -1px; left: 50%;
    width: 0; height: 0;
    border-left: 2.5px solid transparent;
    border-right: 2.5px solid transparent;
    border-top: 3px solid currentColor;
    transform: translateX(-50%);
  }

  /* Delete icon — small X */
  .mgr-icon-delete {
    display: block; width: 8px; height: 8px; position: relative;
  }
  .mgr-icon-delete::before, .mgr-icon-delete::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 8px; height: 1.5px; background: currentColor;
  }
  .mgr-icon-delete::before { transform: translate(-50%, -50%) rotate(45deg); }
  .mgr-icon-delete::after { transform: translate(-50%, -50%) rotate(-45deg); }

  .field-hint { font-weight: 400; color: var(--text-muted); text-transform: none; letter-spacing: 0; }

  .confirm-warn {
    font-size: 11px; color: var(--danger); margin: 0; padding: 6px 10px;
    background: var(--danger-bg-subtle); border-radius: 4px;
    border: 1px solid var(--danger-border-subtle);
  }

  /* Settings panel (slide-over) */
  .settings-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
    z-index: 2500; display: flex;
  }
  .settings-panel {
    width: 420px; max-width: 90vw; height: 100%;
    background: var(--bg-surface); border-right: 1px solid var(--border);
    box-shadow: 8px 0 24px rgba(0,0,0,0.4);
    display: flex; flex-direction: column;
    animation: slide-in-left 0.15s ease-out;
  }
  @keyframes slide-in-left {
    from { transform: translateX(-100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  .settings-panel-hdr {
    padding: 12px 16px; display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .settings-back {
    width: 28px; height: 28px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.1s;
  }
  .settings-back:hover { border-color: var(--accent); color: var(--text-primary); }
  .back-arrow {
    display: block; width: 8px; height: 8px;
    border-left: 2px solid currentColor; border-bottom: 2px solid currentColor;
    transform: rotate(45deg); margin-left: 2px;
  }
  .settings-panel-title {
    font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1;
  }
  .settings-panel-body {
    flex: 1; overflow-y: auto; padding: 16px;
  }

  /* Placeholder content for sections not yet built */
  .settings-placeholder {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 40px 20px; text-align: center;
  }
  .settings-placeholder-icon {
    display: block; width: 48px; height: 48px; position: relative; color: var(--text-muted);
  }
  .servers-icon-lg::before {
    content: ''; position: absolute; top: 4px; left: 8px;
    width: 32px; height: 14px; border: 2px solid currentColor; border-radius: 4px;
  }
  .servers-icon-lg::after {
    content: ''; position: absolute; bottom: 4px; left: 8px;
    width: 32px; height: 14px; border: 2px solid currentColor; border-radius: 4px;
  }
  .sessions-icon-lg::before {
    content: ''; position: absolute; top: 4px; left: 8px;
    width: 32px; height: 36px; border: 2px solid currentColor; border-radius: 4px;
  }
  .sessions-icon-lg::after {
    content: '>_'; position: absolute; top: 14px; left: 14px;
    font-size: 16px; color: currentColor; font-family: 'JetBrains Mono', monospace;
  }
  .appearance-icon-lg::before {
    content: ''; position: absolute; top: 4px; left: 8px;
    width: 32px; height: 32px; border-radius: 50%; border: 2px solid currentColor;
  }
  .settings-placeholder-title {
    font-size: 14px; font-weight: 600; color: var(--text-secondary);
  }
  .settings-placeholder-desc {
    font-size: 12px; color: var(--text-muted); line-height: 1.5; max-width: 280px;
  }

  /* Appearance section */
  .appearance-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .appearance-section-title {
    font-size: 11px; color: var(--text-secondary); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    font-family: 'JetBrains Mono', monospace;
  }
  .appearance-section-hdr { display: flex; align-items: center; justify-content: space-between; }
  .appearance-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.5; }

  .accent-picker { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .accent-swatch {
    width: 28px; height: 28px; border-radius: 6px; border: 2px solid transparent;
    cursor: pointer; transition: all 0.12s;
  }
  .accent-swatch:hover { transform: scale(1.1); }
  .accent-swatch.active { border-color: var(--text-primary); box-shadow: 0 0 8px rgba(255,255,255,0.15); }
  .accent-custom {
    display: flex; align-items: center; gap: 4px; cursor: pointer;
  }
  .accent-custom input[type="color"] {
    width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
    background: none; cursor: pointer; padding: 0;
  }
  .accent-custom input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
  .accent-custom input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }
  .accent-custom-label { font-size: 10px; color: var(--text-muted); }

  .language-options {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
  .language-option {
    display: flex; align-items: center; gap: 7px;
    padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 12px;
    font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.12s;
  }
  .language-option:hover { border-color: var(--accent); color: var(--text-primary); }
  .language-option.active {
    border-color: var(--accent); background: var(--accent-bg-med); color: var(--accent);
  }
  .language-short {
    width: 20px; height: 20px; border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg-base); border: 1px solid var(--border);
    font-size: 10px; font-family: 'JetBrains Mono', monospace;
  }

  .type-list { display: flex; flex-direction: column; gap: 2px; }
  .type-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: 6px; transition: background 0.1s;
  }
  .type-row:hover { background: var(--bg-elevated); }
  .type-row:hover .type-row-actions { opacity: 1; }
  .type-display-name {
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: var(--text-primary); min-width: 90px;
  }
  .type-process {
    font-size: 10px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .type-color-value {
    font-size: 10px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace; margin-left: auto;
  }
  .type-row-actions {
    display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s;
  }
  .type-color-input {
    width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 4px;
    background: none; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .type-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
  .type-color-input::-webkit-color-swatch { border: none; border-radius: 3px; }
  .type-name-input {
    padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border);
    background: var(--bg-base); color: var(--text-primary);
    font-size: 11px; font-family: 'JetBrains Mono', monospace;
    width: 120px;
  }
  .type-name-input:focus { border-color: var(--accent); outline: none; }

  /* Host management */
  .host-mgr { display: flex; flex-direction: column; gap: 12px; }
  .host-mgr-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .host-mgr-count {
    font-size: 11px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;
  }
  .host-toolbar-btn {
    padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; transition: all 0.1s;
  }
  .host-toolbar-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .host-toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .host-toolbar-btn.primary { border-color: var(--accent); color: var(--accent); }
  .host-toolbar-btn.primary:hover { background: var(--accent-bg-med); }

  .ssh-key-section {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px; border: 1px solid var(--border); border-radius: 8px;
    background: #0b0e14;
  }
  .ssh-key-header {
    display: flex; align-items: center; gap: 8px;
  }
  .ssh-key-form {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-base);
  }
  .key-textarea {
    min-height: 140px; resize: vertical; line-height: 1.35;
  }
  .ssh-key-list {
    display: flex; flex-direction: column; gap: 2px;
  }
  .ssh-key-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 6px; border-radius: 5px;
  }
  .ssh-key-row:hover { background: var(--bg-elevated); }
  .ssh-key-name {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--text-primary); min-width: 96px;
  }
  .ssh-key-path {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1;
  }

  .host-form {
    background: #0b0e14; border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; display: flex; flex-direction: column; gap: 10px;
  }
  .host-form-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .host-form-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .host-field { display: flex; flex-direction: column; gap: 3px; }
  .host-field.full-width { grid-column: 1 / -1; }
  .host-field-label { font-size: 10px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .host-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .host-toggle {
    display: flex; align-items: center; gap: 6px; cursor: pointer;
    font-size: 12px; color: var(--text-primary);
  }
  .host-toggle input { accent-color: var(--accent); }
  .toggle-label { font-size: 11px; color: var(--text-secondary); }

  .host-type-toggle {
    display: inline-flex; gap: 2px; padding: 2px;
    border: 1px solid var(--border); border-radius: 6px; background: var(--bg-base);
    align-self: flex-start;
  }
  .host-type-btn {
    padding: 4px 12px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-secondary); font-size: 11px;
    font-family: 'JetBrains Mono', monospace; cursor: pointer;
  }
  .host-type-btn:hover { color: var(--text-primary); }
  .host-type-btn.active { background: var(--accent-bg-med); color: var(--accent); }

  .docker-container-actions {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }
  .docker-selected {
    font-size: 10px; color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
  }

  .host-group { margin-bottom: 4px; }
  .host-group-label {
    padding: 6px 0 4px; font-size: 10px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    display: flex; align-items: center; gap: 4px;
  }
  .host-group-cnt { font-weight: 400; }

  .host-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px; border-radius: 6px; transition: background 0.1s;
  }
  .host-row:hover { background: var(--bg-elevated); }
  .host-row:hover .host-row-actions { opacity: 1; }
  .host-row.disabled { opacity: 0.45; }
  .host-row-main { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
  .host-name {
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: var(--text-primary); font-weight: 500; white-space: nowrap;
  }
  .host-addr {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .host-badge {
    font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 500;
    white-space: nowrap; flex-shrink: 0;
  }
  .host-badge.local { background: var(--accent-bg-med); color: var(--accent); }
  .host-badge.disabled-badge { background: var(--terminal-bg); color: var(--text-secondary); }
  .host-badge.ok-badge { background: var(--success-bg); color: var(--success); }
  .host-badge.error-badge { background: var(--danger-bg); color: var(--danger); }
  .host-badge.tmux-badge { background: var(--success-bg); color: var(--success); }
  .host-badge.no-tmux-badge { background: var(--warning-bg); color: var(--warning); }
  .host-badge.docker-badge { background: rgba(61,139,253,0.12); color: #61afef; }
  .host-badge.testing-badge { background: var(--accent-bg-med); color: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .host-row-actions {
    display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; flex-shrink: 0;
  }
  .test-btn {
    font-size: 9px; font-weight: 500; width: auto !important; padding: 0 6px;
    color: var(--accent); font-family: 'JetBrains Mono', monospace;
  }
  .test-btn:hover { background: var(--accent-bg-med); border-color: var(--accent); }
  .test-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .confirm-del {
    font-size: 10px; color: var(--danger); font-weight: 600;
    width: auto !important; padding: 0 6px;
  }

  .host-loading, .host-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 32px; color: var(--text-muted); font-size: 12px;
  }
  .host-empty.compact { padding: 10px; }
  .mobile-empty-pane {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #0b0e11;
  }
  .add-session-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 6px;
    border: 1px solid rgba(249,115,22,0.28);
    background: rgba(249,115,22,0.08); color: var(--accent, #F97316);
    font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer;
  }
  .add-session-btn:hover { background: rgba(249,115,22,0.14); border-color: var(--accent, #F97316); }
  .add-session-plus {
    width: 18px; height: 18px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid currentColor; font-size: 14px; line-height: 1;
  }

  /* Field select styling */
  .host-form select.field-input {
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%233d4450'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
  }

  /* Host test result hints */
  .host-setup-hint {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 4px 8px 4px 24px; font-size: 10px; color: var(--warning);
    margin-top: -2px; margin-bottom: 4px;
  }
  .host-setup-os { color: var(--text-secondary); }
  .host-setup-label { color: var(--text-secondary); }
  .host-setup-cmd {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    background: var(--bg-base); padding: 2px 8px; border-radius: 3px;
    border: 1px solid var(--border); color: var(--text-primary);
  }
  .host-setup-copy {
    font-size: 9px; padding: 1px 6px; border-radius: 3px;
    border: 1px solid var(--accent-border-strong); background: transparent;
    color: var(--accent); cursor: pointer; transition: all 0.1s;
    font-family: 'JetBrains Mono', monospace;
  }
  .host-setup-copy:hover { background: var(--accent-bg-med); }
  .host-error-hint {
    padding: 4px 8px 4px 24px; font-size: 10px; color: var(--danger);
    margin-top: -2px; margin-bottom: 4px;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Session host filter tabs */
  .session-host-tabs {
    display: flex; flex-wrap: wrap; gap: 3px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .session-host-tab {
    padding: 3px 8px; border-radius: 4px; border: 1px solid transparent;
    background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; transition: all 0.1s;
    display: flex; align-items: center; gap: 4px;
  }
  .session-host-tab:hover { color: var(--text-primary); }
  .session-host-tab.active { color: var(--accent); background: var(--accent-bg); border-color: var(--accent-border); }
  .session-host-cnt { font-size: 9px; color: var(--text-muted); }
  .session-host-error-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--danger); box-shadow: 0 0 6px rgba(240,113,120,0.45);
  }
  .session-host-error-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border: 1px solid var(--danger-border);
    border-radius: 6px; background: var(--danger-bg-subtle);
  }
  .session-host-error-main {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  }
  .session-host-error-title {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--danger); font-weight: 600;
  }
  .session-host-error-message {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: var(--text-secondary); white-space: normal; overflow-wrap: anywhere; line-height: 1.45;
  }

  /* Setup wizard */
  .setup-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(10,14,20,0.95); backdrop-filter: blur(8px);
    z-index: 5000; display: flex; align-items: center; justify-content: center;
  }
  .setup-wizard {
    width: 480px; max-width: 90vw; max-height: 90vh;
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    padding: 32px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 24px;
  }
  .setup-steps {
    display: flex; align-items: center; justify-content: center; gap: 0;
  }
  .setup-step {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2px solid var(--border-strong); background: transparent;
    color: var(--text-muted); font-size: 12px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.2s;
  }
  .setup-step.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg-med); }
  .setup-step.done { border-color: var(--success); color: var(--success); background: var(--success-bg); }
  .setup-step-line { width: 40px; height: 2px; background: var(--border-strong); }
  .setup-step-line.done { background: var(--success); }

  .setup-content { display: flex; flex-direction: column; gap: 16px; }
  .setup-title {
    font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0;
    font-family: 'DM Sans', sans-serif;
  }
  .setup-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
  .setup-hint {
    font-size: 11px; color: var(--text-muted); margin: 0;
    padding: 8px 12px; background: var(--accent-bg);
    border: 1px solid var(--accent-bg-med); border-radius: 6px;
  }
  .setup-hint code {
    font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);
    background: var(--bg-base); padding: 1px 4px; border-radius: 2px; font-size: 11px;
  }
  .setup-actions {
    display: flex; align-items: center; gap: 12px;
  }
  .setup-link {
    background: none; border: none; color: var(--accent); font-size: 12px;
    cursor: pointer; font-family: 'DM Sans', sans-serif;
    padding: 4px 8px; border-radius: 4px; transition: background 0.1s;
  }
  .setup-link:hover { background: var(--accent-bg-med); }
  .setup-link:disabled { opacity: 0.5; cursor: not-allowed; }
  .setup-skip {
    background: none; border: none; color: var(--text-muted); font-size: 11px;
    cursor: pointer; align-self: center; padding: 4px;
  }
  .setup-skip:hover { color: var(--text-secondary); }

  .setup-results {
    display: flex; flex-direction: column; gap: 4px;
    max-height: 200px; overflow-y: auto;
    padding: 8px; background: #0b0e14; border-radius: 6px;
    border: 1px solid var(--border);
  }
  .setup-result-row {
    display: flex; align-items: center; gap: 8px;
    padding: 3px 4px; font-size: 12px;
  }
  .setup-result-name {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--text-primary); min-width: 100px;
  }
  .setup-summary { font-size: 12px; color: var(--text-secondary); margin: 0; }
  .setup-warn { color: var(--warning); }

  .setup-presets {
    display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  }
  .setup-preset {
    padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; cursor: pointer; text-align: left;
    display: flex; flex-direction: column; gap: 2px;
    transition: all 0.12s;
  }
  .setup-preset:hover { border-color: var(--accent); }
  .setup-preset.active { border-color: var(--accent); background: var(--accent-bg); }
  .setup-preset-label {
    font-size: 12px; font-weight: 600; color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
  }
  .setup-preset-desc { font-size: 10px; color: var(--text-muted); }

  /* ---- Mobile minimap ---- */
  .minimap-container {
    flex: 1; display: flex; flex-direction: column;
    padding: 4px 6px; gap: 2px; overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  .minimap-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 10px 10px 12px; border-radius: 6px;
    border: none; border-left: 3px solid var(--border);
    background: var(--bg-raised); cursor: pointer;
    transition: all 0.12s; -webkit-tap-highlight-color: transparent;
    font-family: 'JetBrains Mono', monospace;
  }
  .minimap-row:active {
    filter: brightness(1.2); transform: scale(0.98);
  }
  .minimap-row.asking {
    animation: minimap-pulse 2s ease-in-out infinite;
  }
  @keyframes minimap-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  .minimap-row-left {
    display: flex; align-items: center; gap: 8px;
    overflow: hidden; min-width: 0;
  }
  .minimap-row-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .minimap-row-session {
    font-size: 13px; font-weight: 600; color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .minimap-row-host {
    font-size: 10px; color: var(--text-muted); flex-shrink: 0;
  }
  .minimap-row-right {
    display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  }
  .minimap-row-status {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    padding: 2px 6px; border-radius: 3px;
  }
  .minimap-row-type {
    font-size: 9px; font-weight: 600; text-transform: uppercase;
  }

  /* ---- Mobile terminal view ---- */
  .mobile-terminal {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
  }
  .mobile-terminal-header {
    display: flex; align-items: center; gap: 8px;
    padding: 4px 8px; background: var(--bg-raised);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .mobile-back-btn {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);
    background: var(--bg-base); color: var(--text-secondary); font-size: 11px;
    font-family: 'DM Sans', sans-serif; cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mobile-back-btn:active { background: var(--bg-elevated); }
  .mobile-back-arrow { font-size: 14px; }
  .mobile-terminal-info {
    flex: 1; display: flex; align-items: center; gap: 6px;
    overflow: hidden;
  }
  .mobile-terminal-name {
    font-size: 12px; font-weight: 600; color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .mobile-terminal-status {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }
  .mobile-pane-switcher {
    display: flex; gap: 4px; align-items: center; flex-shrink: 0;
  }
  .mobile-pane-pip {
    width: 8px; height: 8px; border-radius: 50%; border: none;
    cursor: pointer; opacity: 0.5; transition: all 0.12s;
    -webkit-tap-highlight-color: transparent;
  }
  .mobile-pane-pip.active { opacity: 1; transform: scale(1.3); }
  .mobile-pane {
    flex: 1; overflow: hidden; display: flex; flex-direction: column;
  }

  /* ---- Responsive breakpoints ---- */
  @media (max-width: 767px) {
    /* Mobile: compact topnav */
    .topnav { height: 34px; padding: 0 8px; gap: 4px; }
    .logo { font-size: 11px; padding: 2px 6px; gap: 4px; }
    .logo-icon { width: 14px; height: 14px; }
    .ws-tabs { gap: 1px; overflow-x: auto; flex-shrink: 1; min-width: 0; }
    .wt { padding: 3px 8px; font-size: 11px; }
    .wt .cnt { display: none; }
    .add-btn { padding: 2px 6px; font-size: 14px; }
    .topnav-btn { display: none; }
    /* Keep the view toggle reachable on small/touch screens */
    .topnav-btn.view-toggle { display: inline-flex; }
    .pane-count { display: none; }
    .auth-user { display: none; }
    .auth-logout { display: none; }
    .spacer { flex: 0; }

    /* Compact status bar */
    .statusbar { height: 20px; padding: 0 8px; font-size: 9px; }

    /* Content padding */
    .content { padding: 1px; }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    /* Tablet: slightly compact */
    .topnav { padding: 0 8px; }
    .wt { padding: 4px 10px; font-size: 11px; }
  }
</style>
