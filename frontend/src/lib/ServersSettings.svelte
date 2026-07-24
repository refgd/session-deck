<script>
  import { translate } from './i18n.js';
  import {
    canSaveHostForm,
    diagnosticStepLabel,
    diagnosticStepStatusLabel,
    dockerPrivilegeWarning,
    dockerListContextLabel,
    gatewayName as findGatewayName,
    hostAddress,
    storedHostTestResult,
  } from './server-settings-utils.js';

  let {
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
    dockerContainers = [],
    dockerContainersLoading = false,
    dockerContainersError = null,
    dockerContainersContext = null,
    hostGroups = [],
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
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function gatewayName(id) {
    return findGatewayName(managedHosts, id);
  }

  function canSaveHost() {
    return canSaveHostForm(hostForm);
  }

  function stepLabel(step) {
    return diagnosticStepLabel(t, step);
  }

  function stepStatusLabel(status) {
    return diagnosticStepStatusLabel(t, status);
  }

  function dockerWarning() {
    return dockerPrivilegeWarning(t, hostForm, managedHosts);
  }
</script>

<div class="host-mgr">
  <div class="host-mgr-toolbar">
    <span class="host-mgr-count">{t('hostsCount', { count: managedHosts.length })}</span>
    <span class="spacer"></span>
    <button class="host-toolbar-btn" onclick={onTestAll} disabled={managedHostsLoading || Object.values(hostTesting).some(Boolean)} title="Test connectivity on all enabled hosts">
      {Object.values(hostTesting).some(Boolean) ? t('testing') : t('testAll')}
    </button>
    <button class="host-toolbar-btn" onclick={onImportSshConfig} disabled={managedHostsLoading} title="Re-import from ~/.ssh/config">
      {t('importSshConfig')}
    </button>
    <button class="host-toolbar-btn primary" onclick={onAddHost} disabled={managedHostsLoading}>
      {t('addHost')}
    </button>
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
              onclick={() => onConnectionType('ssh')}
            >SSH</button>
            <button
              type="button"
              class="host-type-btn"
              class:active={hostForm.connection_type === 'docker'}
              onclick={() => onConnectionType('docker')}
            >Docker</button>
          </div>
        </label>
        <label class="host-field">
          <span class="host-field-label">{t('name')} *</span>
          <input class="field-input" type="text" value={hostForm.name} oninput={(e) => onHostFormField('name', e.target.value)} placeholder="my-server" />
        </label>
        <label class="host-field">
          <span class="host-field-label">{t('accessGateway')}</span>
          <select class="field-input" value={hostForm.gateway_host_id} onchange={(e) => onGateway(e.target.value)}>
            <option value="">{t('directConnection')}</option>
            {#each managedHosts.filter(host => host.id !== hostEditMode) as host}
              <option value={String(host.id)}>{host.name} ({host.connection_type === 'docker' ? 'Docker' : 'SSH'})</option>
            {/each}
          </select>
        </label>
        {#if hostForm.connection_type === 'docker'}
          <div class="host-warning full-width" role="note">
            {dockerWarning()}
          </div>
          <label class="host-field">
            <span class="host-field-label">{t('dockerContainer')} *</span>
            <select class="field-input" value={hostForm.docker_container} onchange={(e) => onSelectDockerContainer(e.target.value)}>
              <option value="">{dockerContainersLoading ? t('loadingContainers') : t('selectContainer')}</option>
              {#each dockerContainers as container}
                <option value={container.name}>{container.name} ({container.image})</option>
              {/each}
            </select>
          </label>
          <label class="host-field full-width">
            <span class="host-field-label">{t('runningContainers')}</span>
            <div class="docker-container-actions">
              <button type="button" class="host-toolbar-btn" onclick={onRefreshContainers} disabled={dockerContainersLoading}>
                {dockerContainersLoading ? t('loadingContainers') : t('refreshContainers')}
              </button>
              {#if hostForm.docker_container}
                <span class="docker-selected">{hostForm.docker_container}</span>
              {/if}
            </div>
            {#if dockerContainersContext}
              <span class="docker-context">{dockerListContextLabel(t, dockerContainersContext)}</span>
            {/if}
            {#if dockerContainersError}
              <span class="host-error-msg">{dockerContainersError}</span>
            {/if}
          </label>
        {:else}
          <label class="host-field">
            <span class="host-field-label">{t('hostnameIp')}</span>
            <input class="field-input" type="text" value={hostForm.hostname} oninput={(e) => onHostFormField('hostname', e.target.value)} placeholder="192.168.1.100" />
          </label>
          <label class="host-field">
            <span class="host-field-label">{t('user')}</span>
            <input class="field-input" type="text" value={hostForm.user} oninput={(e) => onHostFormField('user', e.target.value)} placeholder="claude" />
          </label>
          <label class="host-field">
            <span class="host-field-label">{t('port')}</span>
            <input class="field-input" type="number" value={hostForm.port} oninput={(e) => onHostFormField('port', Number(e.target.value))} />
          </label>
          <label class="host-field full-width">
            <span class="host-field-label">{t('identityFile')}</span>
            <select class="field-input" value={hostForm.identity_file} onchange={(e) => onHostFormField('identity_file', e.target.value)}>
              <option value="">{t('defaultSshKey')}</option>
              {#each sshKeys as key}
                <option value={key.path}>{key.name} - {key.displayPath || key.path}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label class="host-field">
          <span class="host-field-label">{t('group')}</span>
          <select class="field-input" value={hostForm.group_name} onchange={(e) => onHostFormField('group_name', e.target.value)}>
            {#each hostGroups as group}
              <option value={group}>{group}</option>
            {/each}
          </select>
        </label>
        <label class="host-field">
          <span class="host-field-label">{t('enabled')}</span>
          <label class="host-toggle">
            <input type="checkbox" checked={hostForm.enabled} onchange={(e) => onHostFormField('enabled', e.target.checked)} />
            <span class="toggle-label">{hostForm.enabled ? t('yes') : t('no')}</span>
          </label>
        </label>
      </div>
      <div class="host-form-actions">
        <button class="action-btn secondary" onclick={onCancelEdit}>{t('cancel')}</button>
        <button class="action-btn" onclick={onSaveHost} disabled={managedHostsLoading || !canSaveHost()}>
          {managedHostsLoading ? t('saving') : (hostEditMode === 'add' ? t('addHost') : t('saveChanges'))}
        </button>
      </div>
    </div>
  {/if}

  {#if managedHostsLoading && managedHosts.length === 0}
    <div class="host-loading">{t('loadingHosts')}</div>
  {:else}
    {#each groupedHosts as [groupName, groupHosts]}
      <div class="host-group">
        <div class="host-group-label">{groupName} <span class="host-group-cnt">({groupHosts.length})</span></div>
        {#each groupHosts as host}
          {@const testResult = storedHostTestResult(host)}
          <div class="host-row" class:disabled={!host.enabled}>
            <div class="host-row-main">
              <span class="host-name">{host.name}</span>
              <span class="host-addr">{hostAddress(host)}</span>
              {#if host.is_local}
                <span class="host-badge local">{t('local')}</span>
              {/if}
              {#if host.connection_type === 'docker'}
                <span class="host-badge docker-badge">docker</span>
              {/if}
              {#if host.gateway_host_id}
                <span class="host-badge gateway-badge">{t('viaGateway', { name: gatewayName(host.gateway_host_id) })}</span>
              {/if}
              {#if !host.enabled}
                <span class="host-badge disabled-badge">{t('disabled')}</span>
              {/if}
              {#if hostTesting[host.id]}
                <span class="host-badge testing-badge">{t('testing')}</span>
              {:else if host.last_test_status === 'ok'}
                <span class="host-badge ok-badge">{t('reachable')}</span>
              {:else if host.last_test_status === 'error'}
                <span class="host-badge error-badge">{t('unreachable')}</span>
              {/if}
              {#if host.tmux_available === 1}
                <span class="host-badge tmux-badge">tmux</span>
              {:else if host.tmux_available === 0}
                <span class="host-badge no-tmux-badge">{t('noTmux')}</span>
              {/if}
            </div>
            <div class="host-row-actions">
              <button class="mgr-act test-btn" title={t('test')} onclick={() => onTestHost(host.id)} disabled={hostTesting[host.id]}>
                {hostTesting[host.id] ? '...' : t('test')}
              </button>
              <button class="mgr-act test-btn" title={t('viewSessionsHost')} onclick={() => onViewSessions(host.name)}>
                {t('sessions')}
              </button>
              <button class="mgr-act" title={t('editHost')} onclick={() => onEditHost(host)}>
                <span class="mgr-icon-rename"></span>
              </button>
              {#if hostDeleteConfirm === host.id}
                <button class="mgr-act confirm-del" title={t('confirmDelete')} onclick={() => onDeleteHost(host.id)}>{t('yes')}</button>
                <button class="mgr-act" title={t('cancel')} onclick={onCancelDelete}>{t('no')}</button>
              {:else}
                <button class="mgr-act danger" title={t('delete')} onclick={() => onConfirmDelete(host.id)}>
                  <span class="mgr-icon-delete"></span>
                </button>
              {/if}
            </div>
          </div>
          {#if testResult && !testResult.tmuxAvailable && host.last_test_status === 'ok'}
            <div class="host-setup-hint">
              {#if testResult.gateway}
                <span class="host-setup-os">{t('gatewayOk', { name: testResult.gateway.name })}</span>
              {/if}
              <span class="host-setup-os">{testResult.os || 'Unknown OS'}</span>
              {#if testResult.installCommand}
                <span class="host-setup-label">{t('installTmux')}</span>
                <code class="host-setup-cmd">{testResult.installCommand}</code>
                <button class="host-setup-copy" onclick={() => onInstallTmux(host)} disabled={hostInstalling[host.id]}>
                  {hostInstalling[host.id] ? t('installing') : t('install')}
                </button>
                <button class="host-setup-copy" onclick={() => onCopyInstallCommand(testResult.installCommand)}>
                  {t('copy')}
                </button>
              {/if}
            </div>
          {/if}
          {#if testResult?.steps?.length}
            <div class="host-diagnostic-steps" aria-label={t('connectionSteps')}>
              {#each testResult.steps as step}
                <div class="host-diagnostic-step">
                  <span class:step-ok={step.status === 'ok'} class:step-error={step.status === 'error'}>
                    {stepStatusLabel(step.status)}
                  </span>
                  <strong>{stepLabel(step)}</strong>
                  {#if step.detail}
                    <span>{step.detail}</span>
                  {/if}
                  {#if step.error}
                    <span class="step-error-text">{step.error}</span>
                  {/if}
                  {#if Number.isFinite(step.durationMs)}
                    <span class="step-duration">{step.durationMs}ms</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
          {#if testResult && host.last_test_status === 'error'}
            <div class="host-error-hint">
              {#if testResult.gateway}
                <span class={testResult.gateway.status === 'ok' ? 'gateway-ok' : 'gateway-error'}>
                  {testResult.gateway.status === 'ok'
                    ? t('gatewayOk', { name: testResult.gateway.name })
                    : t('gatewayFailed', { name: testResult.gateway.name, error: testResult.gateway.error })}
                </span>
              {/if}
              {testResult.error || 'Connection failed'}{#if Number.isFinite(testResult.durationMs)} ({testResult.durationMs}ms){/if}
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="host-empty">
        <span>{t('noHostsConfigured')}</span>
        <button class="action-btn" onclick={onImportSshConfig}>{t('importFromSshConfig')}</button>
      </div>
    {/each}
  {/if}
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
  .host-form {
    background: #0b0e14; border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; display: flex; flex-direction: column; gap: 10px;
  }
  .host-form-title { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .host-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .host-field { display: flex; flex-direction: column; gap: 3px; }
  .host-field.full-width { grid-column: 1 / -1; }
  .host-field-label { font-size: 10px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .host-form select.field-input {
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%233d4450'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
  }
  .host-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
  .action-btn {
    padding: 7px 14px; border-radius: 5px; border: 1px solid var(--accent);
    background: var(--accent-bg-med); color: var(--accent); font-size: 12px; cursor: pointer;
    font-family: 'DM Sans', sans-serif;
  }
  .action-btn.secondary { border-color: var(--border); color: var(--text-secondary); background: transparent; }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
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
  .docker-container-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .docker-selected {
    font-size: 10px; color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
  }
  .docker-context {
    font-size: 10px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .host-error-msg {
    font-size: 11px; color: var(--error, #f07178);
    font-family: 'DM Sans', sans-serif; line-height: 1.35;
  }
  .host-warning {
    padding: 8px 10px;
    border: 1px solid var(--warning-border, rgba(224, 175, 104, 0.35));
    border-radius: 6px;
    background: var(--warning-bg, rgba(224, 175, 104, 0.12));
    color: var(--warning);
    font-size: 11px;
    line-height: 1.4;
  }
  .host-warning.full-width { grid-column: 1 / -1; }
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
  .host-badge.gateway-badge { background: rgba(199,146,234,0.12); color: #c792ea; }
  .host-badge.testing-badge { background: var(--accent-bg-med); color: var(--accent); animation: pulse 1s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .host-row-actions {
    display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; flex-shrink: 0;
  }
  .mgr-act {
    width: 24px; height: 24px; border-radius: 4px; border: 1px solid transparent;
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.1s;
  }
  .mgr-act:hover { background: var(--bg-hover); border-color: #2a3345; color: var(--text-primary); }
  .mgr-act.danger:hover { background: var(--danger-bg); border-color: var(--danger-border); color: var(--danger); }
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
  .host-loading, .host-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 12px; padding: 32px; color: var(--text-muted); font-size: 12px;
  }
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
  .host-diagnostic-steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 4px 8px 6px 24px;
    padding: 8px 10px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    border-radius: 6px;
    font-size: 11px;
  }
  .host-diagnostic-step {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--text-secondary);
  }
  .host-diagnostic-step strong {
    color: var(--text-primary);
    font-weight: 600;
  }
  .step-ok { color: var(--success); }
  .step-error { color: var(--danger); }
  .step-error-text {
    color: var(--danger);
    overflow-wrap: anywhere;
  }
  .step-duration {
    margin-left: auto;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .host-error-hint {
    padding: 4px 8px 4px 24px; font-size: 10px; color: var(--danger);
    margin-top: -2px; margin-bottom: 4px;
    font-family: 'JetBrains Mono', monospace;
  }
  .gateway-ok, .gateway-error {
    display: block;
    margin-bottom: 3px;
  }
  .gateway-ok { color: var(--success); }
  .gateway-error { color: var(--danger); }
</style>
