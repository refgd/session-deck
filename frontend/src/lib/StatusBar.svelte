<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    focusedSession = null,
    focusedHost = null,
    getTypeInfo = () => ({ color: '#6b7688' }),
    onCommand = () => {},
    onNewWorkspace = () => {},
    onPropertiesToggle = () => {},
    onZoomToggle = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<footer class="statusbar">
  {#if focusedSession}
    <span class="sb-focused" title={t('focusedPane')}>
      <span class="sb-dot" style="background:{getTypeInfo(focusedSession.name, focusedSession.host || focusedHost).color}"></span>
      <span class="sb-session">{focusedSession.name}</span>
      <span class="sb-host">{focusedHost}</span>
    </span>
  {:else}
    <span class="sb-hint">{t('clickPaneFocus')}</span>
  {/if}
  <span class="spacer"></span>
  <button class="status-action" onclick={onCommand}>{t('commandPalette')}</button>
  <button class="status-action" onclick={onNewWorkspace}>{t('newWorkspace')}</button>
  <button class="status-action" onclick={onPropertiesToggle}>{t('properties')}</button>
  <button class="status-action" onclick={onZoomToggle}>{t('zoom')}</button>
</footer>

<style>
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
  .spacer { flex: 1; }
  .status-action {
    display: flex; align-items: center; gap: 3px;
    background: none; border: none; color: var(--text-muted); cursor: pointer;
    font-size: 10px; font-family: 'DM Sans', sans-serif;
    padding: 0 4px; border-radius: 2px; transition: color 0.1s;
  }
  .status-action:hover { color: var(--text-secondary); }

  @media (max-width: 767px) {
    .statusbar { height: 20px; padding: 0 8px; font-size: 9px; }
  }
</style>
