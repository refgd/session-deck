<script>
  import { onMount, onDestroy } from 'svelte';
  import WorkspaceContent from './lib/WorkspaceContent.svelte';
  import TopNav from './lib/TopNav.svelte';
  import StatusBar from './lib/StatusBar.svelte';
  import ToastContainer from './lib/ToastContainer.svelte';
  import CommandPalette from './lib/CommandPalette.svelte';
  import SessionPicker from './lib/SessionPicker.svelte';
  import PropertiesPanel from './lib/PropertiesPanel.svelte';
  import SettingsPanel from './lib/SettingsPanel.svelte';
  import ContextMenus from './lib/ContextMenus.svelte';
  import SetupWizard from './lib/SetupWizard.svelte';
  import AppModals from './lib/AppModals.svelte';
  import { apiJson, apiOk } from './lib/api-client.js';
  import { logError } from './lib/logger.js';
  import {
    formatSessionTimestamp,
    focusedSessionForId,
    hostForFocusedPane,
    nextWorkspaceHash,
    paneSessionKey,
    parseFocusedPaneId,
    sessionTypeColor,
    sessionTypeInfo,
    sessionTypeLabel,
    STATUS_COLORS,
    workspaceStateFromHash,
    workspacesContainingSession,
  } from './lib/app-utils.js';
  import { triggerBrowserDownload } from './lib/browser-download-utils.js';
  import {
    loadAppSettings as fetchAppSettings,
    loadSessionTypes as fetchSessionTypes,
    saveAccentColorSetting,
    saveMobileReadOnlyDefaultSetting,
    scanSessionTypes as requestScanSessionTypes,
    updateSessionType,
  } from './lib/appearance-api.js';
  import { loadCurrentUser } from './lib/auth-api.js';
  import { DEFAULT_HOST } from './lib/constants.js';
  import { translate } from './lib/i18n.js';
  import {
    applyDocumentLanguage,
    readPreferredLanguage,
    savePreferredLanguage,
  } from './lib/language-preference.js';
  import { buildPaletteCommands, filterCommands, nextPaletteIndex } from './lib/palette-utils.js';
  import {
    clearHostError,
    createdSessionMessage,
    deletedSessionMessage,
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
  } from './lib/session-utils.js';
  import {
    createTmuxSession,
    deleteTmuxSession,
    loadHostSessions,
    loadSessionHosts,
    renameTmuxSession,
    runSessionRenderTest,
    sessionCaptureDownloadPath,
  } from './lib/session-api.js';
  import {
    createWorkspaceTemplate,
    deleteWorkspaceTemplate,
    loadWorkspaceTemplates,
  } from './lib/template-api.js';
  import {
    exportSettingsSnapshot,
    importSettingsSnapshot,
    loadAuditEvents as fetchAuditEvents,
    loadDiagnosticsReport,
  } from './lib/settings-api.js';
  import {
    createManagedHost,
    deleteManagedHost,
    deleteSshKey as requestDeleteSshKey,
    importSshConfigHosts,
    installTmuxOnManagedHost,
    loadDockerContainersResult as fetchDockerContainers,
    loadManagedHosts as fetchManagedHosts,
    loadSshKeys as fetchSshKeys,
    managedHostCount,
    saveSshKey as requestSaveSshKey,
    testAllManagedHosts,
    testManagedHost,
    updateManagedHost,
  } from './lib/host-settings-api.js';
  import {
    defaultHostForm,
    dockerContainersFailedState,
    dockerContainersLoadedState,
    hostFormForConnectionType,
    hostFormForDockerContainer,
    hostFormForGateway,
    hostFormFromHost,
    hostFormSaveError,
    hostWithTestResult,
  } from './lib/server-settings-utils.js';
  import { emptySshKeyForm, validateSshKeyForm } from './lib/ssh-key-utils.js';
  import { setupErrorMessage, setupImportResult } from './lib/setup-utils.js';
  import { applyAccentVariables } from './lib/theme-utils.js';
  import {
    closePaneLayout,
    movePaneLayout,
    scheduleLayoutCommit,
    selectSessionTargetPane,
    splitPaneLayout,
    workspaceCreateDraft,
    workspaceNameById,
  } from './lib/workspace-action-utils.js';
  import { countPanes, getSessionPanes, getSessionPanesWithPaths, getLeafAtPath } from './lib/stores/layout.js';
  import {
    loadWorkspaces, getWorkspaces, getActiveId, getActiveWorkspace,
    setActive, updateLayout, subscribe, updatePaneSession,
    createWorkspace, deleteWorkspace, renameWorkspace, duplicateWorkspace,
    renameSessionInWorkspaces, updatePaneTitle,
  } from './lib/stores/workspaces.js';
  import { subscribeActivity, startActivityPolling, stopActivityPolling, markWorkspaceSeen } from './lib/stores/activity.js';
  import { subscribeStatus, startStatusConnection, stopStatusConnection, setViewingPanes, getWorstStatus, requestNotificationPermission } from './lib/stores/status.js';
  import { clearToasts, showToast, subscribeToasts } from './lib/stores/toasts.js';

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
  let mobileMinimap = $state(true); // true = minimap grid, false = single terminal
  let readOnlyMode = $state(false);
  let readOnlyModeTouched = $state(false);
  let mobileReadOnlyDefault = $state(false);

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
  let newSessionHost = $state(DEFAULT_HOST);
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
  let settingsSection = $state(null); // 'servers' | 'keys' | 'sessions' | 'diagnostics' | 'audit' | 'appearance' | 'data' | 'help' | null
  let settingsExporting = $state(false);
  let settingsImporting = $state(false);
  let settingsIncludeSensitivePaths = $state(false);
  let diagnosticsReport = $state(null);
  let diagnosticsLoading = $state(false);
  let auditEvents = $state([]);
  let auditEventsLoading = $state(false);

  // Workspace templates
  let templates = $state([]);
  let showSaveTemplateModal = $state(null); // workspace id to save as template
  let saveTemplateName = $state('');

  // Host management state
  let managedHosts = $state([]);
  let managedHostsLoading = $state(false);
  let hostEditMode = $state(null); // null | 'add' | host.id (editing)
  let hostForm = $state(defaultHostForm());
  let hostDeleteConfirm = $state(null); // host id
  let dockerContainers = $state([]);
  let dockerContainersLoading = $state(false);
  let dockerContainersError = $state(null);
  let dockerContainersContext = $state(null);
  let sshKeys = $state([]);
  let sshKeysLoading = $state(false);
  let showAddKeyForm = $state(false);
  let sshKeyForm = $state({ ...emptySshKeyForm });
  let sshKeyValidationError = $derived(validateSshKeyForm(sshKeyForm, t));

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

  // Toast notifications
  let toasts = $state([]);

  function toast(message, type = 'info') {
    showToast(message, type);
  }

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function setLanguage(nextLanguage) {
    language = savePreferredLanguage(nextLanguage);
    applyDocumentLanguage(language);
  }

  subscribe(({ workspaces: ws, activeId: id }) => {
    workspaces = ws;
    activeId = id;
    const active = ws.find(w => w.id === id);
    activeLayout = active?.layout || null;
  });

  // Derive focused session info from focusedId
  function getFocusedSession() {
    return focusedSessionForId(focusedId, sessions, DEFAULT_HOST);
  }

  function getFocusedHost() {
    return hostForFocusedPane(focusedId, DEFAULT_HOST);
  }

  function formatTimestamp(ts) {
    return formatSessionTimestamp(ts, { language, translate: t });
  }

  function typeLabel(type) {
    return sessionTypeLabel(type, sessionTypeMap);
  }

  function typeColor(type) {
    return sessionTypeColor(type, sessionTypeMap);
  }

  // Alias for backward compat in workspace tab rendering
  const WS_STATUS_COLORS = STATUS_COLORS;

  function getWorkspaceStatus(ws) {
    if (!ws) return null;
    const panes = getSessionPanes(ws.layout);
    // Pass statusMap so Svelte tracks the reactive dependency
    return getWorstStatus(panes, statusMap);
  }

  function getPaneStatusFromMap(host, session) {
    const key = paneSessionKey(host, session, DEFAULT_HOST);
    return statusMap[key]?.status || null;
  }

  function openMinimapPane(paneIndex) {
    mobileActivePane = paneIndex;
    mobileMinimap = false;
  }

  function backToMinimap() {
    mobileMinimap = true;
  }

  function getTypeInfo(sessionName, host) {
    return sessionTypeInfo(sessionName, host, sessions, sessionTypeMap, DEFAULT_HOST);
  }

  let refreshTimer;

  async function loadSessionTypes() {
    try {
      const data = await fetchSessionTypes();
      sessionTypes = data.types;
      sessionTypeMap = data.map;
    } catch { /* ignore */ }
  }

  async function loadAppSettings() {
    try {
      const data = await fetchAppSettings();
      if (data.accent_color) {
        accentColor = data.accent_color;
        applyAccentColor(data.accent_color);
      }
      mobileReadOnlyDefault = data.mobile_read_only_default === 'true';
      if (!readOnlyModeTouched) readOnlyMode = mobileReadOnlyDefault;
    } catch { /* ignore */ }
  }

  function applyAccentColor(color) {
    applyAccentVariables(document.querySelector('.app'), color);
  }

  async function saveAccentColor(color) {
    accentColor = color;
    applyAccentColor(color);
    await saveAccentColorSetting(color);
    toast('Accent color updated', 'success');
  }

  async function saveMobileReadOnlyDefault(enabled) {
    mobileReadOnlyDefault = enabled;
    readOnlyModeTouched = true;
    readOnlyMode = enabled;
    await saveMobileReadOnlyDefaultSetting(enabled);
    toast(enabled ? t('mobileReadOnlyEnabled') : t('mobileReadOnlyDisabled'), 'success');
  }

  function setReadOnlyMode(value) {
    readOnlyModeTouched = true;
    readOnlyMode = value;
  }

  async function scanSessionTypes() {
    scanningTypes = true;
    try {
      const data = await requestScanSessionTypes();
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
      await updateSessionType(editingTypeId, { displayName: editTypeName, color: editTypeColor });
      editingTypeId = null;
      await loadSessionTypes();
      toast('Session type updated', 'success');
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  async function loadTemplates() {
    try {
      templates = await loadWorkspaceTemplates();
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
      await createWorkspaceTemplate({ name: saveTemplateName.trim(), layout: ws.layout });
      showSaveTemplateModal = null;
      await loadTemplates();
      toast(`Saved template "${saveTemplateName.trim()}"`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to save template', 'error');
    }
  }

  async function deleteTemplate(id, name) {
    try {
      await deleteWorkspaceTemplate(id);
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
        sessions = await loadHostSessions(DEFAULT_HOST);
      } catch (e) {
        sessionHostErrors = setHostError(sessionHostErrors, DEFAULT_HOST, e);
        sessions = [];
      }

      // Load hosts list (for session manager host picker)
      hosts = await loadSessionHosts();
      const remoteHosts = hosts.filter(h => !h.isLocal);

      if (remoteHosts.length > 0) {
        Promise.allSettled(
          remoteHosts.map(async (h) => {
            try {
              return await loadHostSessions(h.name);
            } catch (e) {
              sessionHostErrors = setHostError(sessionHostErrors, h.name, e);
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
      logError('Failed to load sessions:', e);
    }
  }

  async function retrySessionHost(hostName) {
    sessionHostLoading = hostLoadingState(sessionHostLoading, hostName, true);
    try {
      const hostSessions = await loadHostSessions(hostName);
      sessions = replaceHostSessions(sessions, hostName, hostSessions, DEFAULT_HOST);
      sessionHostErrors = clearHostError(sessionHostErrors, hostName);
    } catch (e) {
      sessions = removeHostSessions(sessions, hostName, DEFAULT_HOST);
      sessionHostErrors = setHostError(sessionHostErrors, hostName, e);
    } finally {
      sessionHostLoading = hostLoadingState(sessionHostLoading, hostName, false);
    }
  }

  async function diagnoseSessionHost(hostName) {
    settingsSection = 'servers';
    showSettingsMenu = false;
    try {
      await autoImportIfEmpty();
      const host = findManagedHostForSessionHost(hostName, managedHosts, DEFAULT_HOST);
      if (!host) {
        toast(t('hostNotFound'), 'error');
        return;
      }
      await testHost(host.id);
    } catch (e) {
      toast(e.message || t('diagnosticsFailed'), 'error');
    }
  }

  function hasVisibleSessionHostErrors() {
    return hasVisibleHostErrors(sessionHostErrors, settingsSessionHostFilter);
  }

  async function init() {
    await loadSessionTypes();
    await loadAppSettings();
    await loadSessions();
    await loadWorkspaces();
    await loadTemplates();

    authUser = await loadCurrentUser();

    loading = false;

    // Restore workspace/pane from URL hash
    restoreFromHash();

    // Detect first-run: no workspaces = show setup wizard
    if (workspaces.length === 0) {
      if (await managedHostCount() === 0) {
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
    const hash = nextWorkspaceHash(workspaces, wsId, paneId, window.location.hash);
    if (hash) {
      history.replaceState(null, '', hash);
    }
  }

  function restoreFromHash() {
    const restored = workspaceStateFromHash(window.location.hash, workspaces, activeId);
    if (restored.activeId) setActive(restored.activeId);
    if (restored.focusedId) focusedId = restored.focusedId;
  }

  function handleZoom(id, session, host, path = []) {
    if (zoomedPane && zoomedPane.id === id) {
      zoomedPane = null; // Unzoom
    } else {
      zoomedPane = { id, session, host, path };
      focusedId = id;
    }
  }

  function toggleFocusedZoom() {
    if (zoomedPane) {
      zoomedPane = null;
      return;
    }
    if (!focusedId) return;
    const focused = parseFocusedPaneId(focusedId, DEFAULT_HOST);
    if (focused) {
      handleZoom(focusedId, focused.session, focused.host);
    }
  }

  function handleLayoutChange() {
    if (activeId && activeLayout) updateLayout(activeId, activeLayout);
  }

  function handleSplitPane(path, direction) {
    if (!activeLayout || !activeId) return;
    const targetIndex = paneIndexForPath(activeLayout, path);
    const newLayout = splitPaneLayout(activeLayout, path, direction, DEFAULT_HOST);
    if (!newLayout) {
      toast(t('paneAddFailed'), 'error');
      return;
    }
    activeLayout = newLayout;
    if (targetIndex >= 0) {
      mobileActivePane = Math.min(targetIndex + 1, countPanes(newLayout) - 1);
    }
    commitLayoutWithRerender(newLayout);
    toast(t('paneAdded'), 'info');
  }

  function handleClosePane(path) {
    if (!activeLayout || !activeId) return;
    const result = closePaneLayout(activeLayout, path);
    if (result.error === 'last-pane') {
      toast(t('cantCloseLastPane'), 'error');
      return;
    }
    const newLayout = result.layout;
    if (newLayout) {
      activeLayout = newLayout;
      focusedId = null;
      zoomedPane = null;
      mobileActivePane = Math.min(mobileActivePane, countPanes(newLayout) - 1);
      commitLayoutWithRerender(newLayout);
      toast(t('paneClosed'), 'info');
    }
  }

  function paneIndexForPath(layout, path) {
    const key = pathKey(path);
    return getSessionPanesWithPaths(layout).findIndex(pane => pathKey(pane.path) === key);
  }

  function pathKey(path = []) {
    return Array.isArray(path) ? path.join('.') : '';
  }

  function handlePaneDrop(sourcePane, targetPane, position) {
    if (!activeLayout || !activeId) return;
    const newLayout = movePaneLayout(activeLayout, sourcePane, targetPane, position);
    if (newLayout) {
      activeLayout = newLayout;
      focusedId = null;
      zoomedPane = null;
      commitLayoutWithRerender(newLayout);
      toast(`Moved ${sourcePane} ${position} of ${targetPane}`, 'info');
    }
  }

  function commitLayoutWithRerender(layout) {
    scheduleLayoutCommit({
      workspaceId: activeId,
      layout,
      clearActive: () => { activeId = null; },
      restoreActive: (id) => { activeId = id; },
      updateLayout,
    });
  }
  function openSessionPicker(path, currentSession) {
    showSessionPicker = { path, currentSession };
  }

  function assignSession(session) {
    if (showSessionPicker && activeId) {
      updatePaneSession(activeId, showSessionPicker.path, session.name, session.host || DEFAULT_HOST);
      focusedId = paneSessionKey(session.host, session.name, DEFAULT_HOST);
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

  function openSessionInCurrentPane(sessionName, hostName = DEFAULT_HOST) {
    if (!activeId || !activeLayout || !sessionName) {
      toast('No active workspace', 'error');
      return false;
    }

    const { target, paneIndex, error } = selectSessionTargetPane(activeLayout, {
      pendingPath: pendingSessionPath,
      focusedId,
      defaultHost: DEFAULT_HOST,
    });
    if (error === 'no-panes') {
      toast('No pane available', 'error');
      return false;
    }

    updatePaneSession(activeId, target.path, sessionName, hostName);
    focusedId = paneSessionKey(hostName, sessionName, DEFAULT_HOST);
    pendingSessionPath = null;

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
    const draft = workspaceCreateDraft(newWsName, DEFAULT_HOST);
    if (!draft) return;
    try {
      await createWorkspace(draft.name, draft.layout);
      showNewWsModal = false;
      toast(`Created workspace "${draft.name}"`, 'success');
    } catch (e) {
      toast(e.message || 'Failed to create workspace', 'error');
    }
  }

  function openRename(id) {
    renameValue = workspaceNameById(workspaces, id, '');
    showRenameModal = id;
    contextMenu = null;
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!name || !showRenameModal) return;
    try {
      await renameWorkspace(showRenameModal, name);
      toast(`Renamed to "${name}"`, 'success');
      showRenameModal = null;
    } catch (e) {
      toast(e.message || 'Failed to rename', 'error');
    }
  }

  async function handleDuplicate(id) {
    contextMenu = null;
    try {
      await duplicateWorkspace(id);
      toast(`Duplicated "${workspaceNameById(workspaces, id)}"`, 'success');
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
    const name = workspaceNameById(workspaces, showDeleteConfirm);
    try {
      await deleteWorkspace(showDeleteConfirm);
      toast(`Deleted "${name}"`, 'success');
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
    if (section === 'keys') {
      loadSshKeys();
    }
    if (section === 'diagnostics') {
      loadDiagnostics();
    }
    if (section === 'audit') {
      loadAuditEvents();
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
      await runSessionRenderTest(host, session);
      toast(`Render test sent to ${session} on ${host}`, 'success');
      closeSettingsPanel();
    } catch (e) {
      toast('Render test failed: ' + e.message, 'error');
    } finally {
      renderTestLoading = false;
    }
  }

  async function exportSettings(options = {}) {
    settingsExporting = true;
    try {
      await exportSettingsSnapshot({ includeSensitivePaths: options.includeSensitivePaths === true });
      toast(t('configExported'), 'success');
    } catch (e) {
      toast(`${t('exportFailed')}: ${e.message}`, 'error');
    } finally {
      settingsExporting = false;
    }
  }

  async function importSettingsFile(file) {
    settingsImporting = true;
    try {
      await importSettingsSnapshot(file);
      await Promise.all([
        loadManagedHosts(),
        loadSshKeys(),
        loadSessionTypes(),
        loadAppSettings(),
        loadTemplates(),
      ]);
      await loadSessions();
      toast(t('configImported'), 'success');
    } catch (e) {
      toast(`${t('importFailed')}: ${e.message}`, 'error');
    } finally {
      settingsImporting = false;
    }
  }

  async function loadDiagnostics() {
    diagnosticsLoading = true;
    try {
      diagnosticsReport = await loadDiagnosticsReport();
    } catch (e) {
      toast(`${t('diagnosticsFailed')}: ${e.message}`, 'error');
    } finally {
      diagnosticsLoading = false;
    }
  }

  async function loadAuditEvents() {
    auditEventsLoading = true;
    try {
      auditEvents = await fetchAuditEvents({ limit: 50 });
    } catch (e) {
      toast(`${t('auditLogFailed')}: ${e.message}`, 'error');
    } finally {
      auditEventsLoading = false;
    }
  }

  // --- Host management ---

  async function loadManagedHosts() {
    managedHostsLoading = true;
    try {
      managedHosts = await fetchManagedHosts();
    } catch (e) {
      toast('Failed to load hosts', 'error');
    } finally {
      managedHostsLoading = false;
    }
  }

  async function loadSshKeys() {
    sshKeysLoading = true;
    try {
      sshKeys = await fetchSshKeys();
    } catch (e) {
      sshKeys = [];
      toast(e.message || 'Failed to load SSH keys', 'error');
    } finally {
      sshKeysLoading = false;
    }
  }

  async function saveSshKey() {
    const validationError = validateSshKeyForm(sshKeyForm, t);
    if (validationError) {
      toast(validationError, 'error');
      return;
    }
    sshKeysLoading = true;
    try {
      const data = await requestSaveSshKey(sshKeyForm);
      sshKeyForm = { ...emptySshKeyForm };
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
      const data = await requestDeleteSshKey(name);
      if (hostForm.identity_file === data.path) hostForm.identity_file = '';
      await loadSshKeys();
      toast(`SSH key "${name}" deleted`, 'success');
    } catch (e) {
      const usedBy = (e.payload?.usedByHosts || []).map(h => h.name).join(', ');
      toast(usedBy ? `${e.message}: ${usedBy}` : e.message, 'error');
    } finally {
      sshKeysLoading = false;
    }
  }

  async function autoImportIfEmpty() {
    if (await managedHostCount() === 0) {
      await importSSHConfig();
    }
    await loadManagedHosts();
    await loadSshKeys();
  }

  async function importSSHConfig() {
    managedHostsLoading = true;
    try {
      const data = await importSshConfigHosts();
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
    hostForm = defaultHostForm();
    loadSshKeys();
  }

  function startEditHost(host) {
    hostEditMode = host.id;
    hostForm = hostFormFromHost(host);
    if (hostForm.connection_type === 'docker') loadDockerContainers();
    else loadSshKeys();
  }

  function cancelHostEdit() {
    hostEditMode = null;
  }

  async function saveHost() {
    const validationError = hostFormSaveError(hostForm);
    if (validationError) {
      toast(validationError, 'error');
      return;
    }
    managedHostsLoading = true;
    try {
      if (hostEditMode === 'add') {
        await createManagedHost(hostForm);
        toast(`Added host "${hostForm.name}"`, 'success');
      } else {
        await updateManagedHost(hostEditMode, hostForm);
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
      const data = await deleteManagedHost(id);
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
    return groupManagedHosts(managedHosts);
  }

  const HOST_GROUPS = ['Local', 'Docker', 'HomeLab LXC', 'HomeLab VM', 'Proxmox', 'NAS', 'VPS', 'Network', 'Client', 'Other'];

  async function loadDockerContainers(gatewayHostId = hostForm.gateway_host_id) {
    dockerContainersLoading = true;
    dockerContainersError = null;
    try {
      const result = await fetchDockerContainers(gatewayHostId);
      const next = dockerContainersLoadedState(result);
      dockerContainers = next.containers;
      dockerContainersContext = next.context;
      dockerContainersError = next.error;
    } catch (e) {
      const next = dockerContainersFailedState(e);
      dockerContainers = next.containers;
      dockerContainersContext = next.context;
      dockerContainersError = next.error;
      toast(e.message || 'Failed to list Docker containers', 'error');
    } finally {
      dockerContainersLoading = false;
    }
  }

  function setHostConnectionType(type) {
    hostForm = hostFormForConnectionType(hostForm, type);
    if (type === 'docker') {
      loadDockerContainers();
    }
  }

  function selectDockerContainer(name) {
    hostForm = hostFormForDockerContainer(hostForm, name);
  }

  function setHostGateway(value) {
    const next = hostFormForGateway(hostForm, value);
    hostForm = next.form;
    if (next.shouldRefreshContainers) {
      loadDockerContainers(value);
    }
  }

  // Host test state
  let hostTesting = $state({}); // { [hostId]: true } while testing
  let hostInstalling = $state({}); // { [hostId]: true } while installing tmux
  let hostInstallConfirm = $state(null); // host object for tmux install confirmation

  async function testHost(id) {
    hostTesting = { ...hostTesting, [id]: true };
    try {
      const data = await testManagedHost(id);
      // Update the host in our local list with test results
      managedHosts = managedHosts.map(h => h.id === id ? hostWithTestResult(h, data) : h);
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
      const data = await installTmuxOnManagedHost(host.id);
      managedHosts = managedHosts.map(h => h.id === host.id && data.test ? hostWithTestResult(h, data.test) : h);
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
    return sessionCapableHosts(managedHosts);
  }

  function filteredSessionGroups() {
    return groupSessionsByHost({
      sessions,
      errors: sessionHostErrors,
      hostFilter: settingsSessionHostFilter,
      defaultHost: DEFAULT_HOST,
    });
  }

  async function handleSettingsCreateSession() {
    const draft = sessionCreateDraft({
      name: newSessionName,
      host: newSessionHost,
      startDir: newSessionDir,
    });
    if (!draft) return;
    sessionMgrLoading = true;
    try {
      await createTmuxSession(draft.host, { name: draft.name, startDir: draft.startDir });
      newSessionName = '';
      newSessionDir = '';
      settingsSessionTab = 'list';
      await loadSessions();
      const opened = openSessionInCurrentPane(draft.name, draft.host);
      if (opened) closeSettingsPanel();
      toast(createdSessionMessage(draft, opened), 'success');
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
      const data = await importSshConfigHosts();
      await loadManagedHosts();
      await loadSessions();
      const result = setupImportResult(data);
      toast(result.message, result.toastType);
      if (result.nextStep) setupStep = result.nextStep;
    } catch (e) {
      toast(setupErrorMessage('Failed to import', e), 'error');
    } finally {
      setupImporting = false;
    }
  }

  async function setupTestAllHosts() {
    setupTesting = true;
    setupTestResults = [];
    try {
      const data = await testAllManagedHosts();
      setupTestResults = data.results || [];
      await loadManagedHosts();
      await loadSessions();
    } catch (e) {
      toast(setupErrorMessage('Test failed', e), 'error');
    } finally {
      setupTesting = false;
    }
  }

  async function setupCreateWorkspace() {
    const draft = workspaceCreateDraft(setupWsName);
    if (!draft) return;
    try {
      await createWorkspace(draft.name, draft.layout);
      toast(`Created workspace "${draft.name}"`, 'success');
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
    return buildPaletteCommands({
      workspaces,
      sessions,
      activeId,
      focusedId,
      zoomedPane,
      t,
      onWorkspace: switchWorkspace,
      onNewWorkspace: openNewWsModal,
      onZoomFocused: () => {
        if (zoomedPane) { zoomedPane = null; }
        else if (focusedId) {
          const focused = parseFocusedPaneId(focusedId, DEFAULT_HOST);
          if (focused) handleZoom(focusedId, focused.session, focused.host);
        }
      },
      onToggleProperties: () => showPropsPanel = !showPropsPanel,
      onFocusSession: (session) => { focusedId = paneSessionKey(session.host, session.name, DEFAULT_HOST); },
      onSessionManager: openSessionManager,
      onSettings: openSettingsSection,
      onSaveTemplate: saveAsTemplate,
    });
  }

  function filteredPaletteCommands() {
    return filterCommands(getPaletteCommands(), paletteQuery);
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
      paletteIndex = nextPaletteIndex(paletteIndex, cmds.length, 'down');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteIndex = nextPaletteIndex(paletteIndex, cmds.length, 'up');
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
      const data = await testAllManagedHosts();
      // Update all hosts with results
      for (const r of data.results) {
        managedHosts = managedHosts.map(h => h.id === r.id ? hostWithTestResult(h, r) : h);
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
    const node = getLeafAtPath(activeLayout, path);
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
    const draft = sessionRenameDraft(showRenameSession, renameSessionValue);
    if (!draft) return;
    sessionMgrLoading = true;
    try {
      await renameTmuxSession(draft.host, draft.oldName, draft.newName);
      toast(renamedSessionMessage(draft), 'success');
      // Update all workspace panes that reference the old session name
      renameSessionInWorkspaces(draft.oldName, draft.newName, draft.host);
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
      await deleteTmuxSession(showDeleteSession.host, showDeleteSession.name);
      toast(deletedSessionMessage(showDeleteSession), 'success');
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

  function getWorkspacesContaining(sessionName, host) {
    return workspacesContainingSession(workspaces, sessionName, host, DEFAULT_HOST);
  }

  function nodeIdFromPane(pm) {
    return paneSessionKey(pm.host, pm.session, DEFAULT_HOST);
  }

  function changePaneSessionFromMenu(menu) {
    openSessionPicker(menu.path, menu.session);
    paneMenu = null;
  }

  function renameSessionFromMenu(menu) {
    openRenameSessionModal(menu.session, menu.host);
    paneMenu = null;
  }

  function renamePaneFromMenu(menu) {
    openRenamePaneModal(menu.path, menu.session, menu.host);
    paneMenu = null;
  }

  function splitPaneFromMenu(menu, direction) {
    handleSplitPane(menu.path, direction);
    paneMenu = null;
  }

  function zoomPaneFromMenu(menu) {
    handleZoom(nodeIdFromPane(menu), menu.session, menu.host);
    paneMenu = null;
  }

  function closePaneFromMenu(menu) {
    handleClosePane(menu.path);
    paneMenu = null;
  }

  function exportScrollbackFromMenu(menu) {
    handleExportScrollback(menu.session, menu.host);
    paneMenu = null;
  }

  function deleteSessionFromMenu(menu) {
    openDeleteSessionModal(menu.session, menu.host);
    paneMenu = null;
  }

  async function handleExportScrollback(session, host) {
    try {
      toast('Capturing scrollback...', 'info');
      const url = sessionCaptureDownloadPath(host, session);
      triggerBrowserDownload(url);
    } catch (e) {
      toast(`Export failed: ${e.message}`, 'error');
    }
  }

  onMount(() => {
    setLanguage(readPreferredLanguage());

    // Start activity polling for workspace badges
    const unsubActivity = subscribeActivity(set => { activitySet = set; });
    startActivityPolling();

    // Connect to status WebSocket for real-time pane status
    startStatusConnection();
    const unsubStatus = subscribeStatus(map => { statusMap = map; });
    const unsubToasts = subscribeToasts(nextToasts => { toasts = nextToasts; });
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
      unsubToasts();
      stopActivityPolling();
      stopStatusConnection();
      window.removeEventListener('resize', checkViewport);
      window.removeEventListener('click', requestNotifOnce);
    };
  });

  onDestroy(() => {
    clearInterval(refreshTimer);
    stopActivityPolling();
    clearToasts();
  });

  $effect(() => { init(); });
</script>

<div class="app" role="presentation" onclick={handleWindowClick}>
  <TopNav
    {language}
    {workspaces}
    {activeId}
    {activeLayout}
    {activitySet}
    statusColors={WS_STATUS_COLORS}
    {zoomedPane}
    {authUser}
    {showSettingsMenu}
    {showViewToggle}
    {useSinglePane}
    {showPropsPanel}
    {countPanes}
    {getWorkspaceStatus}
    onSettingsToggle={toggleSettingsMenu}
    onSettingsOpen={openSettingsSection}
    onWorkspace={switchWorkspace}
    onWorkspaceMenu={openContextMenu}
    onNewWorkspace={openNewWsModal}
    onViewToggle={() => viewMode = useSinglePane ? 'split' : 'single'}
    onPropertiesToggle={() => showPropsPanel = !showPropsPanel}
  />

  <div class="main-row">
    <WorkspaceContent
      {language}
      {loading}
      {zoomedPane}
      {activeId}
      {activeLayout}
      {useSinglePane}
      {mobileActivePane}
      {mobileMinimap}
      {readOnlyMode}
      statusColors={STATUS_COLORS}
      {focusedId}
      {getTypeInfo}
      getPaneStatus={getPaneStatusFromMap}
      onUnzoom={() => zoomedPane = null}
      onSessionPick={openSessionPicker}
      onPaneContextMenu={handlePaneContextMenu}
      onReadOnlyMode={setReadOnlyMode}
      onMobilePane={openMinimapPane}
      onMobileBack={backToMinimap}
      onMobileActivePane={(index) => mobileActivePane = index}
      onFocus={handleFocus}
      onLayoutChange={handleLayoutChange}
      onZoom={handleZoom}
      onSplit={handleSplitPane}
      onClose={handleClosePane}
      onDrop={handlePaneDrop}
    />

    <!-- Properties panel -->
    {#if showPropsPanel}
      <PropertiesPanel
        {language}
        {activeId}
        session={focusedId ? getFocusedSession() : null}
        host={getFocusedHost()}
        activeWorkspaceName={activeName()}
        paneCount={activeLayout ? countPanes(activeLayout) : 0}
        workspaces={focusedId && getFocusedSession() ? getWorkspacesContaining(getFocusedSession().name, getFocusedSession().host || getFocusedHost()) : []}
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
  <SettingsPanel
    section={settingsSection}
    {language}
    {managedHosts}
    groupedHosts={managedHostsByGroup()}
    {managedHostsLoading}
    {hostEditMode}
    {hostForm}
    {hostDeleteConfirm}
    {hostTesting}
    {hostInstalling}
    {sshKeys}
    {sshKeysLoading}
    {showAddKeyForm}
    {sshKeyForm}
    {sshKeyValidationError}
    {dockerContainers}
    {dockerContainersLoading}
    {dockerContainersError}
    {dockerContainersContext}
    hostGroups={HOST_GROUPS}
    {sessions}
    sessionHosts={managedHostsForSessions()}
    sessionGroups={filteredSessionGroups()}
    sessionHostFilter={settingsSessionHostFilter}
    {sessionHostErrors}
    {sessionHostLoading}
    sessionTab={settingsSessionTab}
    {newSessionName}
    {newSessionHost}
    {newSessionDir}
    {sessionMgrLoading}
    showEmptySessions={!hasVisibleSessionHostErrors()}
    {typeColor}
    {accentColor}
    {mobileReadOnlyDefault}
    {sessionTypes}
    {scanningTypes}
    {editingTypeId}
    {editTypeName}
    {editTypeColor}
    {settingsExporting}
    {settingsImporting}
    {settingsIncludeSensitivePaths}
    {diagnosticsReport}
    {diagnosticsLoading}
    {auditEvents}
    {auditEventsLoading}
    {authUser}
    {renderTestLoading}
    onClose={closeSettingsPanel}
    onTestAll={testAllHosts}
    onImportSshConfig={importSSHConfig}
    onAddHost={startAddHost}
    onHostFormField={(key, value) => hostForm[key] = value}
    onConnectionType={setHostConnectionType}
    onGateway={setHostGateway}
    onSelectDockerContainer={selectDockerContainer}
    onRefreshContainers={() => loadDockerContainers()}
    onCancelEdit={cancelHostEdit}
    onSaveHost={saveHost}
    onTestHost={testHost}
    onViewSessions={(hostName) => { settingsSessionHostFilter = hostName; settingsSection = 'sessions'; settingsSessionTab = 'list'; }}
    onEditHost={startEditHost}
    onConfirmDelete={(id) => hostDeleteConfirm = id}
    onCancelDelete={() => hostDeleteConfirm = null}
    onDeleteHost={deleteHost}
    onInstallTmux={(host) => hostInstallConfirm = host}
    onCopyInstallCommand={(command) => { navigator.clipboard.writeText(command); toast('Copied to clipboard', 'info'); }}
    onRefreshKeys={loadSshKeys}
    onToggleKeyForm={() => showAddKeyForm = !showAddKeyForm}
    onKeyFormName={(value) => sshKeyForm.name = value}
    onKeyFormPrivateKey={(value) => sshKeyForm.privateKey = value}
    onKeyFormPublicKey={(value) => sshKeyForm.publicKey = value}
    onSaveKey={saveSshKey}
    onDeleteKey={deleteSshKey}
    onRefreshSessions={loadSessions}
    onNewSession={() => settingsSessionTab = 'create'}
    onFilterHost={(hostName) => settingsSessionHostFilter = hostName}
    onCreateName={(value) => newSessionName = value}
    onCreateHost={(value) => newSessionHost = value}
    onCreateDir={(value) => newSessionDir = value}
    onCreateSession={handleSettingsCreateSession}
    onCancelCreate={() => settingsSessionTab = 'list'}
    onRetryHost={retrySessionHost}
    onDiagnoseHost={diagnoseSessionHost}
    onOpenSession={openSessionInCurrentPane}
    onRenameSession={openRenameSessionModal}
    onDeleteSession={openDeleteSessionModal}
    onAccentColor={saveAccentColor}
    onLanguage={setLanguage}
    onMobileReadOnlyDefault={saveMobileReadOnlyDefault}
    onScanTypes={scanSessionTypes}
    onStartEditType={startEditType}
    onSaveType={saveTypeEdit}
    onCancelEditType={() => editingTypeId = null}
    onEditTypeName={(value) => editTypeName = value}
    onEditTypeColor={(value) => editTypeColor = value}
    onExport={exportSettings}
    onImport={importSettingsFile}
    onIncludeSensitivePaths={(value) => settingsIncludeSensitivePaths = value}
    onRefreshDiagnostics={loadDiagnostics}
    onRefreshAuditEvents={loadAuditEvents}
    onRunRenderTest={runRenderTest}
  />

  <ContextMenus
    {language}
    workspaceMenu={contextMenu}
    {paneMenu}
    zoomed={!!zoomedPane}
    onRenameWorkspace={openRename}
    onDuplicateWorkspace={handleDuplicate}
    onSaveTemplate={saveAsTemplate}
    onDeleteWorkspace={openDeleteConfirm}
    onChangeSession={changePaneSessionFromMenu}
    onRenameSession={renameSessionFromMenu}
    onRenamePane={renamePaneFromMenu}
    onSplitPane={splitPaneFromMenu}
    onZoomPane={zoomPaneFromMenu}
    onClosePane={closePaneFromMenu}
    onExportScrollback={exportScrollbackFromMenu}
    onDeleteSession={deleteSessionFromMenu}
  />

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


  <AppModals
    {language}
    {showRenameSession}
    {renameSessionValue}
    {showRenamePaneModal}
    {renamePaneValue}
    {showDeleteSession}
    {sessionMgrLoading}
    showNewWorkspace={showNewWsModal}
    newWorkspaceName={newWsName}
    showRenameWorkspace={showRenameModal}
    renameWorkspaceValue={renameValue}
    showDeleteWorkspace={showDeleteConfirm}
    deleteWorkspaceName={workspaces.find(w => w.id === showDeleteConfirm)?.name || ''}
    {hostInstallConfirm}
    {hostInstalling}
    showSaveTemplate={showSaveTemplateModal}
    {saveTemplateName}
    onCloseRenameSession={() => showRenameSession = null}
    onRenameSessionValue={(value) => renameSessionValue = value}
    onRenameSession={handleRenameSession}
    onCloseRenamePane={() => showRenamePaneModal = null}
    onRenamePaneValue={(value) => renamePaneValue = value}
    onClearPaneName={() => { renamePaneValue = ''; handleRenamePane(); }}
    onRenamePane={handleRenamePane}
    onCloseDeleteSession={() => showDeleteSession = null}
    onDeleteSession={handleDeleteSession}
    onCloseNewWorkspace={() => showNewWsModal = false}
    onNewWorkspaceName={(value) => newWsName = value}
    onCreateWorkspace={handleCreateWorkspace}
    onCloseRenameWorkspace={() => showRenameModal = null}
    onRenameWorkspaceValue={(value) => renameValue = value}
    onRenameWorkspace={handleRename}
    onCloseDeleteWorkspace={() => showDeleteConfirm = null}
    onDeleteWorkspace={handleDelete}
    onCloseInstallTmux={() => hostInstallConfirm = null}
    onInstallTmux={installTmuxOnHost}
    onCloseSaveTemplate={() => showSaveTemplateModal = null}
    onSaveTemplateName={(value) => saveTemplateName = value}
    onSaveTemplate={handleSaveTemplate}
  />

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
    <SetupWizard
      {language}
      step={setupStep}
      importing={setupImporting}
      testing={setupTesting}
      testResults={setupTestResults}
      {managedHosts}
      workspaceName={setupWsName}
      onImportHosts={setupImportHosts}
      onOpenHosts={() => { showSetupWizard = false; openSettingsSection('servers'); }}
      onSkip={setupSkip}
      onTestHosts={setupTestAllHosts}
      onStep={(step) => setupStep = step}
      onWorkspaceName={(value) => setupWsName = value}
      onCreateWorkspace={setupCreateWorkspace}
    />
  {/if}

  <ToastContainer {toasts} />

  <StatusBar
    {language}
    focusedSession={getFocusedSession()}
    focusedHost={getFocusedHost()}
    {getTypeInfo}
    onCommand={openCommandPalette}
    onNewWorkspace={openNewWsModal}
    onPropertiesToggle={() => showPropsPanel = !showPropsPanel}
    onZoomToggle={toggleFocusedZoom}
  />
</div>

<style>
  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  .app {
    display: flex; flex-direction: column; height: 100vh; height: 100dvh;
    overflow: hidden;

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

  .main-row { flex: 1; display: flex; overflow: hidden; }

</style>
