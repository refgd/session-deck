<script>
  import Modal from './Modal.svelte';
  import { translate } from './i18n.js';

  let {
    language = 'en',
    showRenameSession = null,
    renameSessionValue = '',
    showRenamePaneModal = null,
    renamePaneValue = '',
    showDeleteSession = null,
    sessionMgrLoading = false,
    showNewWorkspace = false,
    newWorkspaceName = '',
    showRenameWorkspace = null,
    renameWorkspaceValue = '',
    showDeleteWorkspace = null,
    deleteWorkspaceName = '',
    hostInstallConfirm = null,
    hostInstalling = {},
    showSaveTemplate = null,
    saveTemplateName = '',
    onCloseRenameSession = () => {},
    onRenameSessionValue = () => {},
    onRenameSession = () => {},
    onCloseRenamePane = () => {},
    onRenamePaneValue = () => {},
    onClearPaneName = () => {},
    onRenamePane = () => {},
    onCloseDeleteSession = () => {},
    onDeleteSession = () => {},
    onCloseNewWorkspace = () => {},
    onNewWorkspaceName = () => {},
    onCreateWorkspace = () => {},
    onCloseRenameWorkspace = () => {},
    onRenameWorkspaceValue = () => {},
    onRenameWorkspace = () => {},
    onCloseDeleteWorkspace = () => {},
    onDeleteWorkspace = () => {},
    onCloseInstallTmux = () => {},
    onInstallTmux = () => {},
    onCloseSaveTemplate = () => {},
    onSaveTemplateName = () => {},
    onSaveTemplate = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

{#if showRenameSession}
  <Modal title={t('renameSession')} closeLabel={t('close')} onClose={onCloseRenameSession}>
    <div class="modal-body">
      <p class="confirm-text small-muted">
        {t('renamingSession', { name: showRenameSession.name, host: showRenameSession.host })}
      </p>
      <input
        class="field-input"
        type="text"
        value={renameSessionValue}
        aria-label={t('renameSession')}
        oninput={(event) => onRenameSessionValue(event.target.value)}
        onkeydown={(event) => event.key === 'Enter' && onRenameSession()}
      />
      <button
        class="action-btn"
        onclick={onRenameSession}
        disabled={!renameSessionValue.trim() || sessionMgrLoading}
      >{sessionMgrLoading ? t('renaming') : t('rename')}</button>
    </div>
  </Modal>
{/if}

{#if showRenamePaneModal}
  <Modal title={t('renamePane')} closeLabel={t('close')} onClose={onCloseRenamePane}>
    <div class="modal-body">
      <p class="confirm-text small-secondary">
        {t('customPaneLabel', { session: showRenamePaneModal.session, host: showRenamePaneModal.host })}
      </p>
      <input
        class="field-input"
        type="text"
        value={renamePaneValue}
        placeholder={t('paneNamePlaceholder')}
        aria-label={t('renamePane')}
        oninput={(event) => onRenamePaneValue(event.target.value)}
        onkeydown={(event) => event.key === 'Enter' && onRenamePane()}
      />
      <div class="btn-row">
        <button class="action-btn secondary" onclick={onClearPaneName}>{t('clearName')}</button>
        <button class="action-btn" onclick={onRenamePane}>
          {renamePaneValue.trim() ? t('rename') : t('clear')}
        </button>
      </div>
    </div>
  </Modal>
{/if}

{#if showDeleteSession}
  <Modal title={t('killSession')} width="360px" closeLabel={t('close')} onClose={onCloseDeleteSession}>
    <div class="modal-body">
      <p class="confirm-text">{t('killSessionConfirm', { name: showDeleteSession.name, host: showDeleteSession.host })}</p>
      <p class="confirm-warn">{t('killSessionWarn')}</p>
      <div class="btn-row">
        <button class="action-btn secondary" onclick={onCloseDeleteSession}>{t('cancel')}</button>
        <button
          class="action-btn danger"
          onclick={onDeleteSession}
          disabled={sessionMgrLoading}
        >{sessionMgrLoading ? t('killing') : t('killSession')}</button>
      </div>
    </div>
  </Modal>
{/if}

{#if showNewWorkspace}
  <Modal title={t('newWorkspace')} width="360px" closeLabel={t('close')} onClose={onCloseNewWorkspace}>
    <div class="modal-body">
      <label class="field-label" for="new-workspace-name">{t('name')}</label>
      <input
        id="new-workspace-name"
        class="field-input"
        type="text"
        value={newWorkspaceName}
        placeholder="my-workspace"
        oninput={(event) => onNewWorkspaceName(event.target.value)}
        onkeydown={(event) => event.key === 'Enter' && onCreateWorkspace()}
      />
      <button class="action-btn" onclick={onCreateWorkspace} disabled={!newWorkspaceName.trim()}>{t('create')}</button>
    </div>
  </Modal>
{/if}

{#if showRenameWorkspace}
  <Modal title={t('renameWorkspace')} closeLabel={t('close')} onClose={onCloseRenameWorkspace}>
    <div class="modal-body">
      <input
        class="field-input"
        type="text"
        value={renameWorkspaceValue}
        aria-label={t('renameWorkspace')}
        oninput={(event) => onRenameWorkspaceValue(event.target.value)}
        onkeydown={(event) => event.key === 'Enter' && onRenameWorkspace()}
      />
      <button class="action-btn" onclick={onRenameWorkspace} disabled={!renameWorkspaceValue.trim()}>{t('rename')}</button>
    </div>
  </Modal>
{/if}

{#if showDeleteWorkspace}
  <Modal title={t('deleteWorkspace')} closeLabel={t('close')} onClose={onCloseDeleteWorkspace}>
    <div class="modal-body">
      <p class="confirm-text">{t('deleteWorkspaceConfirm', { name: deleteWorkspaceName })}</p>
      <div class="btn-row">
        <button class="action-btn secondary" onclick={onCloseDeleteWorkspace}>{t('cancel')}</button>
        <button class="action-btn danger" onclick={onDeleteWorkspace}>{t('delete')}</button>
      </div>
    </div>
  </Modal>
{/if}

{#if hostInstallConfirm}
  <Modal title={t('installTmuxTitle')} width="380px" closeLabel={t('close')} onClose={onCloseInstallTmux}>
    <div class="modal-body">
      <p class="confirm-text">{t('installTmuxConfirm', { name: hostInstallConfirm.name })}</p>
      {#if hostInstallConfirm._testResult?.installCommand}
        <code class="host-setup-cmd">{hostInstallConfirm._testResult.installCommand}</code>
      {/if}
      <p class="confirm-warn">{t('installTmuxWarn')}</p>
      <div class="btn-row">
        <button class="action-btn secondary" onclick={onCloseInstallTmux}>{t('cancel')}</button>
        <button
          class="action-btn"
          onclick={() => onInstallTmux(hostInstallConfirm)}
          disabled={hostInstalling[hostInstallConfirm.id]}
        >{hostInstalling[hostInstallConfirm.id] ? t('installing') : t('install')}</button>
      </div>
    </div>
  </Modal>
{/if}

{#if showSaveTemplate}
  <Modal title={t('saveAsTemplate')} closeLabel={t('close')} onClose={onCloseSaveTemplate}>
    <div class="modal-body">
      <label class="field-label" for="template-name">{t('templateName')}</label>
      <input
        id="template-name"
        class="field-input"
        value={saveTemplateName}
        placeholder={t('templatePlaceholder')}
        oninput={(event) => onSaveTemplateName(event.target.value)}
        onkeydown={(event) => event.key === 'Enter' && onSaveTemplate()}
      />
      <p class="help-text">{t('templateHelp')}</p>
      <div class="btn-row">
        <button class="action-btn secondary" onclick={onCloseSaveTemplate}>{t('cancel')}</button>
        <button class="action-btn" onclick={onSaveTemplate} disabled={!saveTemplateName.trim()}>{t('saveTemplate')}</button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .modal-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .field-label { font-size: 11px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--accent); }
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
  .small-muted { font-size: 11px; color: #6b7688; }
  .small-secondary { font-size: 11px; color: var(--text-secondary); }
  .confirm-warn {
    font-size: 11px; color: var(--danger); margin: 0; padding: 6px 10px;
    background: var(--danger-bg-subtle); border-radius: 4px;
    border: 1px solid var(--danger-border-subtle);
  }
  .help-text { color: var(--text-muted); font-size: 11px; margin: 6px 0 0; line-height: 1.4; }
  .btn-row { display: flex; gap: 8px; justify-content: flex-end; }
  .host-setup-cmd {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    background: var(--bg-base); padding: 2px 8px; border-radius: 3px;
    border: 1px solid var(--border); color: var(--text-primary);
  }
</style>
