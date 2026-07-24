<script>
  import Terminal from './Terminal.svelte';
  import MobileKeyBar from './MobileKeyBar.svelte';
  import { DEFAULT_HOST } from './constants.js';
  import { translate } from './i18n.js';
  import { getSessionPanesWithPaths } from './stores/layout.js';

  let {
    language = 'en',
    activeId = null,
    layout = null,
    activePane = 0,
    minimap = true,
    readOnly = false,
    statusColors = {},
    getPaneStatus = () => null,
    getTypeInfo = () => ({ color: '#6b7688', label: 'TERM', context: null }),
    onPane = () => {},
    onBack = () => {},
    onActivePane = () => {},
    onSessionPick = () => {},
    onPaneContextMenu = () => {},
    onHistory = () => {},
    onReadOnlyToggle = () => {},
    onSplit = () => {},
    onClose = () => {},
  } = $props();

  let termRef = $state(null);
  let keyBarRef = $state(null);

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  const panes = $derived(layout ? getSessionPanesWithPaths(layout) : []);
  const idleStatus = $derived(statusColors.idle || { border: '#6b7688', dot: '#6b7688', bg: 'transparent', label: 'IDLE' });

  function splitCurrentPane(pane) {
    if (!pane) return;
    onSplit(pane.path, 'h');
  }

  function closeCurrentPane(pane) {
    if (!pane) return;
    onClose(pane.path);
  }
</script>

{#if panes.length === 0}
  <div class="center-msg">{t('noPanes')}</div>
{:else if minimap}
  <div class="minimap-container">
    {#each panes as pane, index}
      {@const status = pane.session ? getPaneStatus(pane.host, pane.session) : null}
      {@const statusColor = statusColors[status] || idleStatus}
      {@const info = pane.session ? getTypeInfo(pane.session, pane.host || DEFAULT_HOST) : { color: '#6b7688', label: 'EMPTY' }}
      <button
        class="minimap-row"
        class:asking={status === 'asking'}
        style="border-left-color:{statusColor.border}"
        onclick={() => onPane(index)}
      >
        <span class="minimap-row-left">
          <span class="minimap-row-dot" style="background:{statusColor.border}"></span>
          <span class="minimap-row-session">{pane.session || t('addSession')}</span>
          <span class="minimap-row-host">{pane.host || DEFAULT_HOST}</span>
        </span>
        <span class="minimap-row-right">
          {#if status && status !== 'idle' && status !== 'unknown'}
            <span class="minimap-row-status" style="background:{statusColor.bg};color:{statusColor.border}">{statusColor.label}</span>
          {/if}
          <span class="minimap-row-type" style="color:{info.color}">{info.label}</span>
        </span>
      </button>
    {/each}
  </div>
{:else}
  {#key `${activeId}-${activePane}`}
    {@const pane = panes[activePane % panes.length]}
    {@const status = pane.session ? getPaneStatus(pane.host, pane.session) : null}
    {@const statusColor = statusColors[status] || idleStatus}
    <div class="mobile-terminal">
      <div class="mobile-terminal-header">
        <button class="mobile-back-btn" onclick={onBack} title={t('backToMinimap')}>
          <span class="mobile-back-arrow">&#8592;</span> {t('minimap')}
        </button>
        <span class="mobile-terminal-info">
          <span class="mobile-terminal-name">{pane.session || t('addSession')}</span>
          {#if status && status !== 'idle' && status !== 'unknown'}
            <span class="mobile-terminal-status" style="color:{statusColor.border}">{statusColor.label}</span>
          {/if}
        </span>
        <button
          class="mobile-mode-toggle"
          class:active={readOnly}
          title={readOnly ? t('switchInputMode') : t('switchReadOnlyMode')}
          onclick={() => onReadOnlyToggle(!readOnly)}
        >{readOnly ? t('readOnly') : t('inputEnabled')}</button>
        {#if pane.session}
          <button
            class="mobile-pane-action history"
            title={t('viewHistory')}
            aria-label={t('viewHistory')}
            onclick={() => onHistory(pane.session, pane.host || DEFAULT_HOST)}
          >
            <span class="mobile-history-icon"></span>
          </button>
        {/if}
        <button
          class="mobile-pane-action"
          title={t('addPane')}
          aria-label={t('addPane')}
          onclick={() => splitCurrentPane(pane)}
        >+</button>
        <button
          class="mobile-pane-action danger"
          title={t('closePane')}
          aria-label={t('closePane')}
          onclick={() => closeCurrentPane(pane)}
        >
          <span class="mobile-close-icon"></span>
        </button>
        <div class="mobile-pane-switcher">
          {#each panes as item, index}
            {@const itemStatus = item.session ? getPaneStatus(item.host, item.session) : null}
            {@const itemColor = statusColors[itemStatus] || idleStatus}
            <button
              class="mobile-pane-pip"
              class:active={activePane === index}
              style="background:{activePane === index ? itemColor.border : itemColor.dot}"
              title={item.session || t('addSession')}
              onclick={() => onActivePane(index)}
            ></button>
          {/each}
        </div>
      </div>
      <div class="mobile-pane">
        {#if pane.session}
          <Terminal
            bind:this={termRef}
            session={pane.session}
            host={pane.host}
            focused={true}
            isMobile={true}
            {readOnly}
            sessionTypeColor={getTypeInfo(pane.session, pane.host || DEFAULT_HOST).color}
            sessionTypeLabel={getTypeInfo(pane.session, pane.host || DEFAULT_HOST).label}
            sessionContext={getTypeInfo(pane.session, pane.host || DEFAULT_HOST).context}
            {language}
            onSessionClick={() => onSessionPick(pane.path, pane.session)}
            onHistory={() => onHistory(pane.session, pane.host || DEFAULT_HOST)}
            onContextMenu={(event) => onPaneContextMenu(event, pane.path, pane.session, pane.host)}
            onCtrlConsumed={() => keyBarRef?.clearCtrl()}
          />
        {:else}
          <div class="mobile-empty-pane">
            <button class="add-session-btn" onclick={() => onSessionPick(pane.path, null)}>
              <span class="add-session-plus">+</span>
              <span>{t('addSession')}</span>
            </button>
          </div>
        {/if}
      </div>
      {#if pane.session}
        <MobileKeyBar
          bind:this={keyBarRef}
          onKey={(seq) => termRef?.sendInput(seq)}
          onShowKeyboard={() => termRef?.focusTerminal()}
          onCtrlToggle={(active) => termRef?.setCtrlPending(active)}
          {readOnly}
          {language}
        />
      {/if}
    </div>
  {/key}
{/if}

<style>
  .center-msg { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 14px; color: var(--text-secondary); }
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
  .mobile-mode-toggle {
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-base);
    color: var(--text-secondary);
    font-size: 10px;
    padding: 3px 6px;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    flex-shrink: 0;
  }
  .mobile-mode-toggle.active {
    color: var(--accent);
    border-color: var(--accent-border-strong);
    background: var(--accent-bg);
  }
  .mobile-pane-action {
    width: 24px; height: 24px; border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-base); color: var(--text-secondary);
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 16px; line-height: 1; cursor: pointer; flex-shrink: 0;
    -webkit-tap-highlight-color: transparent;
  }
  .mobile-pane-action:active {
    color: var(--accent);
    border-color: var(--accent-border-strong);
    background: var(--accent-bg);
  }
  .mobile-pane-action.danger:active {
    color: #f07178;
    border-color: rgba(240,113,120,0.35);
    background: rgba(240,113,120,0.12);
  }
  .mobile-close-icon {
    display: block; width: 10px; height: 10px; position: relative;
  }
  .mobile-close-icon::before, .mobile-close-icon::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 10px; height: 1.5px; background: currentColor;
  }
  .mobile-close-icon::before { transform: translate(-50%, -50%) rotate(45deg); }
  .mobile-close-icon::after { transform: translate(-50%, -50%) rotate(-45deg); }
  .mobile-history-icon {
    display: block; width: 12px; height: 12px; position: relative;
    border: 1px solid currentColor; border-radius: 2px;
  }
  .mobile-history-icon::before,
  .mobile-history-icon::after {
    content: ''; position: absolute; left: 2px; right: 2px; height: 1px; background: currentColor;
  }
  .mobile-history-icon::before { top: 3px; }
  .mobile-history-icon::after { top: 7px; }
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
</style>
