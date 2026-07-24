<script>
  import SettingsDropdown from './SettingsDropdown.svelte';
  import { translate } from './i18n.js';
  import { appPath } from './base-path.js';

  let {
    language = 'en',
    workspaces = [],
    activeId = null,
    activeLayout = null,
    activitySet = new Set(),
    statusColors = {},
    zoomedPane = null,
    authUser = null,
    showSettingsMenu = false,
    showViewToggle = false,
    useSinglePane = false,
    showPropsPanel = false,
    countPanes = () => 0,
    getWorkspaceStatus = () => null,
    onSettingsToggle = () => {},
    onSettingsOpen = () => {},
    onWorkspace = () => {},
    onWorkspaceMenu = () => {},
    onNewWorkspace = () => {},
    onViewToggle = () => {},
    onPropertiesToggle = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function toggleSettings(event) {
    event.stopPropagation();
    onSettingsToggle();
  }
</script>

<nav class="topnav">
  <div class="logo-wrap">
    <button class="logo" onclick={toggleSettings} title={t('settings')}>
      <img class="logo-icon" src={appPath('/icon.svg')} alt="" width="18" height="18" />
      <span class="logo-text">Session<b>Deck</b></span>
    </button>
    {#if showSettingsMenu}
      <SettingsDropdown {language} onOpen={onSettingsOpen} />
    {/if}
  </div>
  <span class="sep"></span>
  <div class="ws-tabs">
    {#each workspaces as ws, i}
      {@const wsStatus = getWorkspaceStatus(ws)}
      {@const statusColor = wsStatus && statusColors[wsStatus]}
      <button
        class="wt"
        class:active={ws.id === activeId}
        class:has-activity={activitySet.has(ws.id) || (wsStatus && wsStatus !== 'idle')}
        onclick={() => onWorkspace(ws.id)}
        oncontextmenu={(event) => onWorkspaceMenu(event, ws.id)}
        title="{ws.description || ws.name}{wsStatus ? ' [' + wsStatus + ']' : ''}"
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
    <button class="wt add-btn" onclick={onNewWorkspace} title={t('newWorkspace')}>+</button>
  </div>
  <span class="spacer"></span>
  {#if zoomedPane}
    <span class="pane-count zoom-indicator">ZOOM: {zoomedPane.session}</span>
  {:else if activeLayout}
    <span class="pane-count">{countPanes(activeLayout)} panes</span>
  {/if}
  {#if authUser}
    <span class="auth-user">{authUser.name}</span>
    <form class="auth-logout-form" method="POST" action={appPath('/auth/logout')}>
      <button class="auth-logout" type="submit" title={t('signOut')}>{t('signOut')}</button>
    </form>
  {/if}
  {#if showViewToggle}
    <button
      class="topnav-btn view-toggle"
      onclick={onViewToggle}
      title={useSinglePane ? t('switchSplitView') : t('switchSingleView')}
    >{useSinglePane ? `▦ ${t('split')}` : `▯ ${t('single')}`}</button>
  {/if}
  <button
    class="topnav-btn"
    class:active={showPropsPanel}
    onclick={onPropertiesToggle}
    title={t('properties')}
  >I</button>
</nav>

<style>
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
  .auth-logout-form { margin: 0; }
  .auth-logout {
    font-size: 10px; color: var(--text-muted); text-decoration: none;
    padding: 2px 6px; border-radius: 3px; transition: color 0.1s;
    border: 0; background: transparent; font-family: inherit; cursor: pointer;
  }
  .auth-logout:hover { color: var(--danger); }
  .zoom-indicator { color: var(--success); }

  @media (max-width: 767px) {
    .topnav { height: 34px; padding: 0 8px; gap: 4px; }
    .logo { font-size: 11px; padding: 2px 6px; gap: 4px; }
    .logo-icon { width: 14px; height: 14px; }
    .ws-tabs { gap: 1px; overflow-x: auto; flex-shrink: 1; min-width: 0; }
    .wt { padding: 3px 8px; font-size: 11px; }
    .wt .cnt { display: none; }
    .add-btn { padding: 2px 6px; font-size: 14px; }
    .topnav-btn { display: none; }
    .topnav-btn.view-toggle { display: inline-flex; }
    .pane-count { display: none; }
    .auth-user { display: none; }
    .auth-logout-form { display: none; }
    .spacer { flex: 0; }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .topnav { padding: 0 8px; }
    .wt { padding: 4px 10px; font-size: 11px; }
  }
</style>
