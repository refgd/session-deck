<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    sessions = [],
    currentSession = null,
    typeColor = () => '#6b7688',
    onClose = () => {},
    onAssign = () => {},
    onNewSession = () => {},
    onManageSessions = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<div
  class="picker-overlay modal-top"
  role="dialog"
  aria-modal="true"
  aria-label={t('assignSessionPane')}
  tabindex="-1"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="picker" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="picker-hdr">
      <span>{t('assignSessionPane')}</span>
      <button class="picker-close" aria-label={t('close')} title={t('close')} onclick={onClose}>&times;</button>
    </div>
    <div class="picker-body">
      {#if sessions.length === 0}
        <div class="picker-empty">{t('noSessionsYet')}</div>
      {:else}
        {#each sessions as s}
          <button
            class="picker-item"
            class:current={s.name === currentSession}
            onclick={() => onAssign(s)}
          >
            <span class="dot" style="background:{typeColor(s.type)};box-shadow:0 0 6px {typeColor(s.type)}"></span>
            <span class="picker-name">{s.name}</span>
            <span class="picker-host">{s.host || 'reliant'}</span>
            {#if s.name === currentSession}
              <span class="picker-current">{t('current')}</span>
            {/if}
          </button>
        {/each}
      {/if}
    </div>
    <div class="picker-footer">
      <button class="footer-link" onclick={onNewSession}>{t('newSession')}</button>
      <button class="footer-link" onclick={onManageSessions}>{t('manageSessions')}</button>
    </div>
  </div>
</div>

<style>
  .picker-overlay {
    position: fixed; inset: 0; z-index: 3000;
    background: rgba(0,0,0,0.55); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
  }
  .picker-overlay.modal-top { z-index: 3500; }
  .picker {
    width: 320px; max-width: 92vw; max-height: 80vh;
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 8px; box-shadow: 0 16px 48px rgba(0,0,0,0.45);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .picker-hdr {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-bottom: 1px solid var(--border);
    color: var(--text-primary); font-size: 13px; font-weight: 600;
  }
  .picker-close {
    width: 24px; height: 24px; border-radius: 4px;
    border: 1px solid transparent; background: transparent;
    color: var(--text-muted); cursor: pointer; font-size: 18px; line-height: 1;
  }
  .picker-close:hover { border-color: var(--danger); color: var(--danger); }
  .picker-body { flex: 1; overflow-y: auto; padding: 4px; }
  .picker-item {
    width: 100%; padding: 8px 10px; border: none; border-radius: 6px;
    background: transparent; display: flex; align-items: center; gap: 8px;
    color: var(--text-primary); cursor: pointer; text-align: left;
  }
  .picker-item:hover { background: var(--bg-elevated); }
  .picker-item.current { background: var(--accent-bg); }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .picker-name { font-family: 'JetBrains Mono', monospace; font-size: 12px; flex: 1; }
  .picker-host { font-size: 10px; color: var(--text-muted); }
  .picker-current { font-size: 9px; padding: 1px 6px; border-radius: 3px; background: var(--accent-bg-strong); color: var(--accent); }
  .picker-empty {
    padding: 18px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
  .picker-footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 8px 10px; border-top: 1px solid var(--border);
  }
  .footer-link {
    border: none; background: transparent; color: var(--accent);
    font-size: 11px; cursor: pointer; font-family: 'DM Sans', sans-serif;
  }
  .footer-link:hover { text-decoration: underline; }
</style>
