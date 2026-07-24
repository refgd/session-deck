<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    sshKeys = [],
    sshKeysLoading = false,
    showAddKeyForm = false,
    sshKeyForm = { name: '', privateKey: '', publicKey: '' },
    sshKeyValidationError = null,
    onRefresh = () => {},
    onToggleForm = () => {},
    onFormName = () => {},
    onFormPrivateKey = () => {},
    onFormPublicKey = () => {},
    onSave = () => {},
    onDelete = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<div class="host-mgr">
  <div class="host-mgr-toolbar">
    <span class="host-mgr-count">{t('sshKeys')}</span>
    <span class="spacer"></span>
    <button class="host-toolbar-btn" onclick={onRefresh} disabled={sshKeysLoading}>
      {sshKeysLoading ? t('loading') : t('refresh')}
    </button>
    <button class="host-toolbar-btn primary" onclick={onToggleForm}>
      {showAddKeyForm ? t('cancel') : t('addSshKey')}
    </button>
  </div>

  <div class="ssh-key-section">
    {#if showAddKeyForm}
      <div class="ssh-key-form">
        <label class="host-field">
          <span class="host-field-label">{t('keyName')}</span>
          <input class="field-input" value={sshKeyForm.name} oninput={(e) => onFormName(e.target.value)} placeholder="id_ed25519_prod" />
        </label>
        <label class="host-field full-width">
          <span class="host-field-label">{t('privateKey')}</span>
          <textarea class="field-input key-textarea" value={sshKeyForm.privateKey} oninput={(e) => onFormPrivateKey(e.target.value)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea>
        </label>
        <label class="host-field full-width">
          <span class="host-field-label">{t('publicKeyOptional')}</span>
          <input class="field-input" value={sshKeyForm.publicKey} oninput={(e) => onFormPublicKey(e.target.value)} placeholder="ssh-ed25519 ..." />
        </label>
        {#if sshKeyValidationError}
          <div class="form-error" role="alert">{sshKeyValidationError}</div>
        {/if}
        <div class="host-form-actions">
          <button class="action-btn" onclick={onSave} disabled={Boolean(sshKeyValidationError) || sshKeysLoading}>
            {sshKeysLoading ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    {/if}
    <div class="ssh-key-list">
      {#each sshKeys as key}
        <div class="ssh-key-row">
          <span class="ssh-key-name">{key.name}</span>
          <span class="ssh-key-path">
            {key.displayPath || key.path}
            {#if key.usedByHosts?.length}
              <span class="ssh-key-usage">{t('usedByHosts', { names: key.usedByHosts.map(h => h.name).join(', ') })}</span>
            {/if}
          </span>
          <span class="host-badge disabled-badge">{key.managed ? t('managed') : t('discovered')}</span>
          {#if key.managed}
            <button class="mgr-act danger" title={t('delete')} onclick={() => onDelete(key.name)}>
              <span class="mgr-icon-delete"></span>
            </button>
          {/if}
        </div>
      {:else}
        <div class="host-empty compact">{t('noSshKeys')}</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .host-mgr { display: flex; flex-direction: column; gap: 12px; }
  .host-mgr-toolbar {
    display: flex; align-items: center; gap: 8px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border);
  }
  .host-mgr-count {
    font-size: 11px; color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;
  }
  .spacer { flex: 1; }
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
  .ssh-key-form {
    display: flex; flex-direction: column; gap: 8px;
    padding: 10px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-base);
  }
  .host-field { display: flex; flex-direction: column; gap: 4px; }
  .host-field.full-width { grid-column: 1 / -1; }
  .host-field-label {
    font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .key-textarea { min-height: 140px; resize: vertical; line-height: 1.35; }
  .form-error {
    padding: 8px 10px; border: 1px solid rgba(240,113,120,0.35); border-radius: 6px;
    background: rgba(240,113,120,0.1); color: #f07178; font-size: 12px;
  }
  .host-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .action-btn {
    padding: 7px 14px; border-radius: 5px; border: 1px solid var(--accent);
    background: var(--accent-bg-med); color: var(--accent); font-size: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif;
  }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .ssh-key-list { display: flex; flex-direction: column; gap: 2px; }
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
  .ssh-key-usage {
    display: block;
    margin-top: 2px;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .host-badge {
    font-size: 9px; padding: 1px 5px; border-radius: 3px; font-family: 'JetBrains Mono', monospace;
  }
  .host-badge.disabled-badge { background: var(--terminal-bg); color: var(--text-secondary); }
  .host-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 32px; color: var(--text-muted); font-size: 12px;
  }
  .host-empty.compact { padding: 10px; }
  .mgr-act {
    width: 24px; height: 24px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .mgr-act:hover { background: var(--bg-elevated); color: var(--text-primary); }
  .mgr-act.danger:hover { background: var(--danger-bg); color: var(--danger); }
  .mgr-icon-delete {
    display: block; width: 12px; height: 12px; position: relative;
    border: 1px solid currentColor; border-top: 3px solid currentColor;
    border-radius: 1px;
  }
  .mgr-icon-delete::before {
    content: ''; position: absolute; top: -5px; left: 2px; right: 2px;
    height: 1px; background: currentColor;
  }
</style>
