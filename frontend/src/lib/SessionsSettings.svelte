<script>
  import { translate } from './i18n.js';
  import { DEFAULT_HOST } from './constants.js';

  let {
    language = 'en',
    sessions = [],
    hosts = [],
    groups = [],
    hostFilter = null,
    sessionHostErrors = {},
    sessionHostLoading = {},
    tab = 'list',
    newSessionName = '',
    newSessionHost = DEFAULT_HOST,
    newSessionDir = '',
    sessionMgrLoading = false,
    showEmpty = true,
    typeColor = () => '#6b7688',
    onRefresh = () => {},
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
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function hostSessionCount(hostName) {
    return sessions.filter(s => (s.host || DEFAULT_HOST) === hostName).length;
  }
</script>

<div class="host-mgr">
  <div class="host-mgr-toolbar">
    <span class="host-mgr-count">{t('sessionsCount', { count: sessions.length })}</span>
    <span class="spacer"></span>
    <button class="host-toolbar-btn" onclick={onRefresh}>{t('refresh')}</button>
    <button class="host-toolbar-btn primary" onclick={onNewSession}>{t('newSession')}</button>
  </div>

  <div class="session-host-tabs">
    <button
      class="session-host-tab"
      class:active={!hostFilter}
      onclick={() => onFilterHost(null)}
    >{t('allHosts')}</button>
    {#each hosts as host}
      <button
        class="session-host-tab"
        class:active={hostFilter === host.name}
        onclick={() => onFilterHost(host.name)}
      >{host.name}
        <span class="session-host-cnt">{hostSessionCount(host.name)}</span>
        {#if sessionHostErrors[host.name]}
          <span class="session-host-error-dot"></span>
        {/if}
      </button>
    {/each}
  </div>

  {#if tab === 'create'}
    <div class="host-form">
      <div class="host-form-title">{t('newSession')}</div>
      <div class="host-form-grid">
        <label class="host-field">
          <span class="host-field-label">{t('sessionName')}</span>
          <input class="field-input" type="text" value={newSessionName} placeholder="my-session"
            oninput={(e) => onCreateName(e.target.value)}
            onkeydown={(e) => e.key === 'Enter' && onCreateSession()} />
        </label>
        <label class="host-field">
          <span class="host-field-label">{t('host')}</span>
          <select class="field-input" value={newSessionHost} onchange={(e) => onCreateHost(e.target.value)}>
            {#each hosts as host}
              <option value={host.name}>{host.name}</option>
            {/each}
          </select>
        </label>
        <label class="host-field full-width">
          <span class="host-field-label">{t('startDirectory')} <span class="field-hint">({t('optional')})</span></span>
          <input class="field-input" type="text" value={newSessionDir} placeholder="/home/user/project"
            oninput={(e) => onCreateDir(e.target.value)}
            onkeydown={(e) => e.key === 'Enter' && onCreateSession()} />
        </label>
      </div>
      <div class="host-form-actions">
        <button class="action-btn secondary" onclick={onCancelCreate}>{t('cancel')}</button>
        <button class="action-btn" onclick={onCreateSession} disabled={!newSessionName.trim() || sessionMgrLoading}>
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

  {#each groups as group}
    <div class="mgr-host-group">
      <div class="mgr-host-label">{group.hostName}</div>
      {#if group.error}
        <div class="session-host-error-row">
          <div class="session-host-error-main">
            <span class="session-host-error-title">{t('connectionError')}</span>
            <span class="session-host-error-message">{group.error}</span>
          </div>
          <div class="session-host-error-actions">
            <button class="host-toolbar-btn" onclick={() => onDiagnoseHost(group.hostName)}>
              {t('diagnoseHost')}
            </button>
            <button class="host-toolbar-btn" onclick={() => onRetryHost(group.hostName)} disabled={sessionHostLoading[group.hostName]}>
              {sessionHostLoading[group.hostName] ? t('connecting') : t('reconnect')}
            </button>
          </div>
        </div>
      {/if}
      {#each group.hostSessions as session}
        <div class="mgr-session-row">
          <span class="dot" style="background:{typeColor(session.type)};box-shadow:0 0 6px {typeColor(session.type)}"></span>
          <span class="mgr-session-name">{session.name}</span>
          <span class="mgr-session-meta">
            {#if session.attached}
              <span class="prop-badge attached">{t('active')}</span>
            {:else}
              <span class="prop-badge detached">{t('detached')}</span>
            {/if}
          </span>
          <div class="mgr-session-actions">
            <button class="mgr-act text-act" title={t('openSession')} onclick={() => onOpenSession(session.name, group.hostName)}>
              {t('openSession')}
            </button>
            <button class="mgr-act" title={t('rename')} onclick={() => onRenameSession(session.name, group.hostName)}>
              <span class="mgr-icon-rename"></span>
            </button>
            <button class="mgr-act danger" title={t('killSession')} onclick={() => onDeleteSession(session.name, group.hostName)}>
              <span class="mgr-icon-delete"></span>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    {#if showEmpty}
      <div class="host-empty">
        <span>{t('noSessionsFound', { suffix: hostFilter ? ` on ${hostFilter}` : '' })}</span>
      </div>
    {/if}
  {/each}
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
  .host-form {
    background: #0b0e14; border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; margin-bottom: 8px;
  }
  .host-form-title {
    font-size: 12px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px;
  }
  .host-form-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .host-field { display: flex; flex-direction: column; gap: 4px; }
  .host-field.full-width { grid-column: 1 / -1; }
  .host-field-label {
    font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .field-hint { font-weight: 400; color: var(--text-muted); text-transform: none; letter-spacing: 0; }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .host-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .action-btn {
    padding: 7px 14px; border-radius: 5px; border: 1px solid var(--accent);
    background: var(--accent-bg-med); color: var(--accent); font-size: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif;
  }
  .action-btn.secondary { border-color: var(--border); color: var(--text-secondary); background: transparent; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .mgr-legend {
    display: flex; gap: 16px; padding: 6px 12px;
    border-bottom: 1px solid var(--border); font-size: 10px; color: var(--text-secondary);
  }
  .mgr-legend-item { display: flex; align-items: center; gap: 5px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .mgr-host-group { margin-bottom: 4px; }
  .mgr-host-label {
    padding: 6px 12px 2px; font-size: 10px; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
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
  .session-host-error-actions {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 6px; flex-wrap: wrap;
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
  .prop-badge {
    font-size: 9px; padding: 1px 6px; border-radius: 3px; font-weight: 500;
  }
  .prop-badge.attached { background: var(--success-bg); color: var(--success); }
  .prop-badge.detached { background: rgba(107,118,136,0.12); color: var(--text-muted); }
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
  .mgr-icon-delete {
    display: block; width: 8px; height: 8px; position: relative;
  }
  .mgr-icon-delete::before, .mgr-icon-delete::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 8px; height: 1.5px; background: currentColor;
  }
  .mgr-icon-delete::before { transform: translate(-50%, -50%) rotate(45deg); }
  .mgr-icon-delete::after { transform: translate(-50%, -50%) rotate(-45deg); }
  .host-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 32px; color: var(--text-muted); font-size: 12px;
  }
</style>
