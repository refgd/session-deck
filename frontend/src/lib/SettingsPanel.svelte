<script>
  import { languages as availableLanguages, translate } from './i18n.js';
  import AppearanceSettings from './AppearanceSettings.svelte';
  import AuditSettings from './AuditSettings.svelte';
  import DataSettings from './DataSettings.svelte';
  import DiagnosticsSettings from './DiagnosticsSettings.svelte';
  import HelpSection from './HelpSection.svelte';
  import ServersSettings from './ServersSettings.svelte';
  import SessionsSettings from './SessionsSettings.svelte';
  import SshKeysSettings from './SshKeysSettings.svelte';

  let {
    section = null,
    language = 'en',
    managedHosts = [],
    groupedHosts = [],
    managedHostsLoading = false,
    hostEditMode = null,
    hostForm = {},
    hostDeleteConfirm = null,
    hostTesting = {},
    hostInstalling = {},
    sshKeys = [],
    sshKeysLoading = false,
    showAddKeyForm = false,
    sshKeyForm = {},
    sshKeyValidationError = null,
    dockerContainers = [],
    dockerContainersLoading = false,
    dockerContainersError = null,
    dockerContainersContext = null,
    hostGroups = [],
    sessions = [],
    sessionHosts = [],
    sessionGroups = [],
    sessionHostFilter = null,
    sessionHostErrors = {},
    sessionHostLoading = {},
    sessionTab = 'list',
    newSessionName = '',
    newSessionHost = '',
    newSessionDir = '',
    sessionMgrLoading = false,
    showEmptySessions = true,
    typeColor = () => '#6b7688',
    accentColor = '#F97316',
    mobileReadOnlyDefault = false,
    sessionTypes = [],
    scanningTypes = false,
    editingTypeId = null,
    editTypeName = '',
    editTypeColor = '#6b7688',
    settingsExporting = false,
    settingsImporting = false,
    settingsIncludeSensitivePaths = false,
    diagnosticsReport = null,
    diagnosticsLoading = false,
    auditEvents = [],
    auditEventsLoading = false,
    authUser = null,
    renderTestLoading = false,
    onClose = () => {},
    onSwitchSection = () => {},
    onTestAll = () => {},
    onImportSshConfig = () => {},
    onAddHost = () => {},
    onHostFormField = () => {},
    onConnectionType = () => {},
    onGateway = () => {},
    onSelectDockerContainer = () => {},
    onRefreshContainers = () => {},
    onCancelEdit = () => {},
    onSaveHost = () => {},
    onTestHost = () => {},
    onViewSessions = () => {},
    onEditHost = () => {},
    onConfirmDelete = () => {},
    onCancelDelete = () => {},
    onDeleteHost = () => {},
    onInstallTmux = () => {},
    onCopyInstallCommand = () => {},
    onRefreshKeys = () => {},
    onToggleKeyForm = () => {},
    onKeyFormName = () => {},
    onKeyFormPrivateKey = () => {},
    onKeyFormPublicKey = () => {},
    onSaveKey = () => {},
    onDeleteKey = () => {},
    onRefreshSessions = () => {},
    onNewSession = () => {},
    onFilterHost = () => {},
    onCreateName = () => {},
    onCreateHost = () => {},
    onCreateDir = () => {},
    onCreateSession = () => {},
    onCancelCreate = () => {},
    onRetryHost = () => {},
    onDiagnoseHost = () => {},
    onOpenSession = () => {},
    onRenameSession = () => {},
    onDeleteSession = () => {},
    onAccentColor = () => {},
    onLanguage = () => {},
    onMobileReadOnlyDefault = () => {},
    onScanTypes = () => {},
    onStartEditType = () => {},
    onSaveType = () => {},
    onCancelEditType = () => {},
    onEditTypeName = () => {},
    onEditTypeColor = () => {},
    onExport = () => {},
    onImport = () => {},
    onIncludeSensitivePaths = () => {},
    onRefreshDiagnostics = () => {},
    onRefreshAuditEvents = () => {},
    onRunRenderTest = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function title(sectionName) {
    const titles = {
      servers: t('servers'),
      keys: t('sshKeys'),
      sessions: t('sessions'),
      appearance: t('appearance'),
      data: t('data'),
      diagnostics: t('diagnostics'),
      audit: t('auditLog'),
      help: t('help'),
    };
    return titles[sectionName] || '';
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') onClose();
  }
</script>

{#if section}
  <div
    class="settings-overlay"
    role="dialog"
    aria-modal="true"
    aria-label={title(section)}
    tabindex="-1"
    onclick={onClose}
    onkeydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="settings-panel" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
      <div class="settings-panel-hdr">
        <button class="settings-back" aria-label={t('close')} title={t('close')} onclick={onClose}>
          <span class="back-arrow"></span>
        </button>
        <span class="settings-panel-title">{title(section)}</span>
        <button class="picker-close" aria-label={t('close')} title={t('close')} onclick={onClose}>&times;</button>
      </div>
      <div class="settings-panel-body">
        {#if section === 'servers'}
          <ServersSettings
            {language}
            {managedHosts}
            {groupedHosts}
            {managedHostsLoading}
            {hostEditMode}
            {hostForm}
            {hostDeleteConfirm}
            {hostTesting}
            {hostInstalling}
            {sshKeys}
            {dockerContainers}
            {dockerContainersLoading}
            {dockerContainersError}
            {dockerContainersContext}
            {hostGroups}
            {onTestAll}
            {onImportSshConfig}
            {onAddHost}
            {onHostFormField}
            {onConnectionType}
            {onGateway}
            {onSelectDockerContainer}
            {onRefreshContainers}
            {onCancelEdit}
            {onSaveHost}
            {onTestHost}
            {onViewSessions}
            {onEditHost}
            {onConfirmDelete}
            {onCancelDelete}
            {onDeleteHost}
            {onInstallTmux}
            {onCopyInstallCommand}
          />
        {:else if section === 'keys'}
          <SshKeysSettings
            {language}
            {sshKeys}
            {sshKeysLoading}
            {showAddKeyForm}
            {sshKeyForm}
            {sshKeyValidationError}
            onRefresh={onRefreshKeys}
            onToggleForm={onToggleKeyForm}
            onFormName={onKeyFormName}
            onFormPrivateKey={onKeyFormPrivateKey}
            onFormPublicKey={onKeyFormPublicKey}
            onSave={onSaveKey}
            onDelete={onDeleteKey}
          />
        {:else if section === 'sessions'}
          <SessionsSettings
            {language}
            {sessions}
            hosts={sessionHosts}
            groups={sessionGroups}
            hostFilter={sessionHostFilter}
            {sessionHostErrors}
            {sessionHostLoading}
            tab={sessionTab}
            {newSessionName}
            {newSessionHost}
            {newSessionDir}
            {sessionMgrLoading}
            showEmpty={showEmptySessions}
            {typeColor}
            onRefresh={onRefreshSessions}
            onNewSession={onNewSession}
            onFilterHost={onFilterHost}
            onCreateName={onCreateName}
            onCreateHost={onCreateHost}
            onCreateDir={onCreateDir}
            onCreateSession={onCreateSession}
            onCancelCreate={onCancelCreate}
            onRetryHost={onRetryHost}
            onDiagnoseHost={onDiagnoseHost}
            onOpenSession={onOpenSession}
            onRenameSession={onRenameSession}
            onDeleteSession={onDeleteSession}
          />
        {:else if section === 'appearance'}
          <AppearanceSettings
            {language}
            languages={availableLanguages}
            {accentColor}
            {mobileReadOnlyDefault}
            {sessionTypes}
            {scanningTypes}
            {editingTypeId}
            {editTypeName}
            {editTypeColor}
            {onAccentColor}
            {onLanguage}
            {onMobileReadOnlyDefault}
            {onScanTypes}
            {onStartEditType}
            onSaveType={onSaveType}
            onCancelEditType={onCancelEditType}
            onEditTypeName={onEditTypeName}
            onEditTypeColor={onEditTypeColor}
          />
        {:else if section === 'data'}
          <DataSettings
            {language}
            exporting={settingsExporting}
            importing={settingsImporting}
            includeSensitivePaths={settingsIncludeSensitivePaths}
            onExport={onExport}
            onImport={onImport}
            onIncludeSensitivePaths={onIncludeSensitivePaths}
          />
        {:else if section === 'diagnostics'}
          <DiagnosticsSettings
            {language}
            report={diagnosticsReport}
            loading={diagnosticsLoading}
            onRefresh={onRefreshDiagnostics}
          />
        {:else if section === 'audit'}
          <AuditSettings
            {language}
            events={auditEvents}
            loading={auditEventsLoading}
            onRefresh={onRefreshAuditEvents}
          />
        {:else if section === 'help'}
          <HelpSection
            {language}
            {authUser}
            {renderTestLoading}
            onRunRenderTest={onRunRenderTest}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-overlay {
    position: fixed; inset: 0;
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
  .picker-close {
    width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 12px;
  }
  .picker-close:hover { border-color: var(--danger); color: var(--danger); }
</style>
