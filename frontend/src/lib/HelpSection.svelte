<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    authUser = null,
    renderTestLoading = false,
    onRunRenderTest = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<div class="help-section">
  <div class="help-group">
    <span class="help-group-title">{t('workspaceNavigation')}</span>
    <div class="help-row"><kbd>Alt+1</kbd>-<kbd>9</kbd><span>{t('switchWorkspace')}</span></div>
    <div class="help-row"><kbd>N</kbd><span>{t('newWorkspace')}</span></div>
    <div class="help-row"><kbd>I</kbd><span>{t('toggleProperties')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('paneControl')}</span>
    <div class="help-row"><kbd>Alt+Shift+1</kbd>-<kbd>9</kbd><span>{t('focusPaneIndex')}</span></div>
    <div class="help-row"><kbd>Ctrl+Shift+F</kbd><span>{t('zoomUnzoomPane')}</span></div>
    <div class="help-row"><kbd>Esc</kbd><span>{t('unzoomCloseMenu')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('paneActions')}</span>
    <div class="help-row"><span class="help-label">{t('changeSession')}</span><span>{t('assignDifferentSession')}</span></div>
    <div class="help-row"><span class="help-label">{t('splitHV')}</span><span>{t('splitPaneHelp')}</span></div>
    <div class="help-row"><span class="help-label">{t('closePane')}</span><span>{t('removePaneLayout')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('dragDrop')}</span>
    <div class="help-row"><span class="help-label">{t('centerDrop')}</span><span>{t('swapTwoPanes')}</span></div>
    <div class="help-row"><span class="help-label">{t('edgeDrop')}</span><span>{t('splitTargetDirection')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('copyPaste')}</span>
    <div class="help-row"><span class="help-label">{t('select')}</span><span>{t('clickDragTerminal')}</span></div>
    <div class="help-row"><kbd>Ctrl+C</kbd><span>{t('copySelection')}</span></div>
    <div class="help-row"><kbd>Ctrl+V</kbd><span>{t('pasteClipboard')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('activityNotifications')}</span>
    <div class="help-row"><span class="help-label">{t('orangeDot')}</span><span>{t('unseenOutput')}</span></div>
    <div class="help-row"><span class="help-label">{t('pulsing')}</span><span>{t('pulsesGently')}</span></div>
    <div class="help-row"><span class="help-label">{t('autoClear')}</span><span>{t('badgeDisappears')}</span></div>
    <div class="help-row"><span class="help-label">{t('polling')}</span><span>{t('checksActivity')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('installAsApp')}</span>
    <div class="help-row"><span class="help-label">Edge/Chrome</span><span>{t('pinTaskbar')}</span></div>
    <div class="help-row"><span class="help-label">{t('standalone')}</span><span>{t('standaloneDesc')}</span></div>
  </div>
  <div class="help-group">
    <span class="help-group-title">{t('terminalRendering')}</span>
    <div class="help-row"><span class="help-label">{t('fontStack')}</span><span>JetBrains Mono -> Cascadia Code -> Fira Code -> system</span></div>
    <div class="help-row"><span class="help-label">{t('wideChars')}</span><span>{t('wideCharsDesc')}</span></div>
    <div class="help-row">
      <button
        class="help-test-btn"
        onclick={onRunRenderTest}
        disabled={renderTestLoading}
      >{renderTestLoading ? t('sending') : t('runGlyphTest')}</button>
      <span>{t('sendsTestOutput')}</span>
    </div>
  </div>
  <div class="help-about">
    <img class="help-about-icon" src="/icon.svg" alt="Session Deck" width="48" height="48" />
    <span class="help-about-title">Session Deck</span>
    <span class="help-about-desc">{t('webTmuxManager')}</span>
    <span class="help-about-version">v0.1.0</span>
    <a class="help-about-link" href="https://github.com/JesseProjects-LLC/session-deck" target="_blank" rel="noopener">GitHub</a>
    <span class="help-about-author">by <a class="help-about-link" href="https://github.com/JesseProjects-LLC" target="_blank" rel="noopener">Jesse Jones</a></span>
    {#if authUser}
      <span class="help-about-auth">{t('signedInAs', { name: authUser.name, method: authUser.method })}</span>
    {:else}
      <span class="help-about-auth">{t('noAuthentication')}</span>
    {/if}
  </div>
</div>

<style>
  .help-section {
    display: flex; flex-direction: column; gap: 20px;
  }
  .help-group {
    display: flex; flex-direction: column; gap: 6px;
  }
  .help-group-title {
    font-size: 10px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600; margin-bottom: 2px;
    font-family: 'JetBrains Mono', monospace;
  }
  .help-row {
    display: flex; align-items: center; gap: 10px; font-size: 12px;
    padding: 3px 0;
  }
  .help-row kbd {
    font-size: 10px; padding: 2px 6px; border-radius: 3px; min-width: 24px;
    text-align: center;
    background: var(--bg-base); border: 1px solid var(--border); color: var(--text-secondary);
    font-family: 'JetBrains Mono', monospace;
  }
  .help-row span { color: var(--text-primary); }
  .help-label {
    font-size: 11px; color: var(--text-secondary); min-width: 100px;
    font-family: 'JetBrains Mono', monospace;
  }
  .help-test-btn {
    font-size: 11px; padding: 4px 12px; border-radius: 4px;
    border: 1px solid var(--accent-border, rgba(249,115,22,0.3));
    background: var(--accent-bg, rgba(249,115,22,0.08));
    color: var(--accent, #F97316); cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-weight: 500;
    transition: all 0.12s; min-width: 100px;
  }
  .help-test-btn:hover { background: var(--accent-bg-strong, rgba(249,115,22,0.15)); }
  .help-test-btn:disabled { opacity: 0.5; cursor: default; }
  .help-about {
    margin-top: 12px; padding-top: 16px; border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 4px; text-align: center;
  }
  .help-about-title { font-size: 14px; font-weight: 700; color: var(--accent); font-family: 'JetBrains Mono', monospace; }
  .help-about-icon { border-radius: 8px; margin-bottom: 4px; }
  .help-about-desc { font-size: 11px; color: var(--text-secondary); }
  .help-about-link {
    font-size: 10px; color: var(--accent); font-family: 'JetBrains Mono', monospace;
    text-decoration: none; transition: color 0.1s;
  }
  .help-about-link:hover { color: var(--accent-hover); text-decoration: underline; }
  .help-about-author { font-size: 10px; color: var(--text-muted); }
  .help-about-auth { font-size: 9px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; }
  .help-about-version { font-size: 9px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 4px; }
</style>
