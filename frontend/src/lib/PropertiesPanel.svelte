<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    session = null,
    host = 'reliant',
    activeId = null,
    activeWorkspaceName = '',
    paneCount = 0,
    workspaces = [],
    typeColor = () => '#6b7688',
    typeLabel = value => value,
    formatTimestamp = value => value,
    onClose = () => {},
    onRename = () => {},
    onDelete = () => {},
    onSwitchWorkspace = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<aside class="props-panel" aria-label={t('properties')}>
  <div class="props-hdr">
    <span class="props-title">{t('properties')}</span>
    <button class="picker-close" type="button" aria-label={t('close')} title={t('close')} onclick={onClose}>&times;</button>
  </div>

  {#if session}
    <div class="props-body">
      <div class="prop-section">
        <div class="prop-session-name">
          <span class="dot" style="background:{typeColor(session.type)};box-shadow:0 0 6px {typeColor(session.type)}"></span>
          {session.name}
        </div>
        <span class="prop-type-badge" style="background:{typeColor(session.type)}20;color:{typeColor(session.type)}">{typeLabel(session.type)}</span>
      </div>

      <div class="prop-divider"></div>

      <div class="prop-section">
        <div class="prop-row">
          <span class="prop-label">{t('host')}</span>
          <span class="prop-value">{host}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">{t('status')}</span>
          <span class="prop-value">
            {#if session.attached}
              <span class="prop-badge attached">{t('active')}</span>
            {:else}
              <span class="prop-badge detached">{t('detached')}</span>
            {/if}
          </span>
        </div>
        <div class="prop-row">
          <span class="prop-label">{t('created')}</span>
          <span class="prop-value">{formatTimestamp(session.created)}</span>
        </div>
        <div class="prop-actions">
          <button class="prop-act-btn" type="button" onclick={() => onRename(session.name, host)}>{t('rename')}</button>
          <button class="prop-act-btn danger" type="button" onclick={() => onDelete(session.name, host)}>{t('kill')}</button>
        </div>
      </div>

      <div class="prop-divider"></div>

      <div class="prop-section">
        <span class="prop-section-title">{t('usedInWorkspaces')}</span>
        {#each workspaces as ws}
          <button
            class="prop-ws-link"
            class:current={ws.id === activeId}
            type="button"
            onclick={() => onSwitchWorkspace(ws.id)}
            title={t('switchTo', { name: ws.name })}
          >
            {ws.name}
            {#if ws.id === activeId}<span class="prop-current-tag">{t('current')}</span>{/if}
          </button>
        {:else}
          <span class="prop-value dim">{t('notInAnyWorkspace')}</span>
        {/each}
      </div>

      <div class="prop-divider"></div>

      <div class="prop-section">
        <span class="prop-section-title">{t('currentWorkspace')}</span>
        <div class="prop-row">
          <span class="prop-label">{t('name')}</span>
          <span class="prop-value">{activeWorkspaceName}</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">{t('panes')}</span>
          <span class="prop-value">{paneCount}</span>
        </div>
      </div>
    </div>
  {:else}
    <div class="props-empty">
      <span class="props-empty-icon"></span>
      <span>{t('clickPaneDetails')}</span>
    </div>
  {/if}
</aside>

<style>
  .props-panel {
    width: 240px; flex-shrink: 0;
    background: var(--bg-surface); border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    overflow-y: auto;
  }
  .props-hdr {
    padding: 10px 12px; display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .props-title { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
  .picker-close {
    width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer;
    display: flex; align-items: center; justify-content: center; font-size: 12px;
  }
  .picker-close:hover { border-color: var(--danger); color: var(--danger); }
  .props-body { padding: 12px; }
  .props-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 8px;
    color: var(--text-muted); font-size: 12px; padding: 24px;
  }
  .props-empty-icon {
    width: 32px; height: 32px; border: 2px solid #3d4450; border-radius: 50%;
    opacity: 0.4; position: relative;
  }
  .props-empty-icon::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 8px; height: 8px; background: #3d4450; border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .prop-section { display: flex; flex-direction: column; gap: 8px; }
  .prop-session-name {
    display: flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 14px;
    color: var(--text-primary); font-weight: 600;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .prop-type-badge {
    font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 500;
    align-self: flex-start;
  }
  .prop-divider { height: 1px; background: var(--border); margin: 4px 0; }
  .prop-row { display: flex; justify-content: space-between; align-items: center; }
  .prop-label { font-size: 11px; color: var(--text-secondary); }
  .prop-value { font-size: 11px; color: var(--text-primary); font-family: 'JetBrains Mono', monospace; }
  .prop-section-title {
    font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600;
  }
  .prop-badge {
    font-size: 9px; padding: 1px 6px; border-radius: 3px; font-weight: 500;
  }
  .prop-badge.attached { background: var(--success-bg); color: var(--success); }
  .prop-badge.detached { background: rgba(107,118,136,0.12); color: var(--text-muted); }
  .prop-actions { display: flex; gap: 4px; margin-top: 4px; }
  .prop-act-btn {
    padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; transition: all 0.1s;
  }
  .prop-act-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .prop-act-btn.danger { border-color: rgba(240,113,120,0.2); color: var(--text-secondary); }
  .prop-act-btn.danger:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-bg-subtle); }
  .prop-ws-link {
    width: 100%; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-primary); font-size: 11px; text-align: left;
    cursor: pointer; font-family: 'JetBrains Mono', monospace;
    display: flex; align-items: center; gap: 6px; transition: all 0.1s;
  }
  .prop-ws-link:hover { border-color: var(--accent); color: var(--accent); }
  .prop-ws-link.current { border-color: var(--accent-border-strong); background: var(--accent-bg); }
  .prop-current-tag { font-size: 8px; padding: 0 4px; border-radius: 2px; background: var(--accent-bg-strong); color: var(--accent); }
  .prop-value.dim { color: var(--text-muted); font-style: italic; font-size: 10px; }

  @media (max-width: 767px) {
    .props-panel { display: none; }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .props-panel { width: 220px; }
  }
</style>
