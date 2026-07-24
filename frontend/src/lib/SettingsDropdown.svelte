<script>
  import { translate } from './i18n.js';

  let { language = 'en', onOpen = () => {} } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  const items = [
    ['servers', 'servers-icon', 'servers', 'manageHosts'],
    ['keys', 'keys-icon', 'sshKeys', 'manageSshKeys'],
    ['sessions', 'sessions-icon', 'sessions', 'tmuxSessions'],
    ['appearance', 'appearance-icon', 'appearance', 'colorsTheme'],
    ['help', 'help-icon', 'help', 'shortcutsDocs'],
  ];
</script>

<div class="settings-dropdown" role="presentation" onclick={(e) => e.stopPropagation()}>
  {#each items as item, index}
    {#if index === 2}
      <div class="settings-sep"></div>
    {/if}
    <button class="settings-item" onclick={() => onOpen(item[0])}>
      <span class="settings-icon {item[1]}"></span>
      {t(item[2])}
      <span class="settings-hint">{t(item[3])}</span>
    </button>
  {/each}
</div>

<style>
  .settings-dropdown {
    position: absolute; top: 100%; left: 0; margin-top: 6px;
    width: 220px; padding: 6px; background: var(--bg-surface);
    border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.45); z-index: 2000;
  }
  .settings-item {
    width: 100%; display: grid; grid-template-columns: 18px 1fr;
    column-gap: 8px; row-gap: 1px; align-items: center;
    padding: 8px; border: none; border-radius: 6px; background: transparent;
    color: var(--text-primary); cursor: pointer; text-align: left;
    font-family: 'DM Sans', sans-serif; font-size: 12px;
  }
  .settings-item:hover { background: var(--bg-hover); }
  .settings-hint {
    grid-column: 2; color: var(--text-muted); font-size: 10px;
  }
  .settings-sep { height: 1px; background: var(--border-strong); margin: 4px 8px; }
  .settings-icon {
    width: 14px; height: 14px; position: relative; color: var(--text-secondary);
    grid-row: span 2;
  }
  .servers-icon::before,
  .keys-icon::before,
  .sessions-icon::before,
  .appearance-icon::before,
  .help-icon::before {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
  }
  .servers-icon::before { content: '#'; }
  .keys-icon::before { content: '~'; }
  .sessions-icon::before { content: '$'; }
  .appearance-icon::before { content: '*'; }
  .help-icon::before { content: '?'; }
</style>
