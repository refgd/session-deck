<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    step = 1,
    importing = false,
    testing = false,
    testResults = [],
    managedHosts = [],
    workspaceName = 'Default',
    onImportHosts = () => {},
    onOpenHosts = () => {},
    onSkip = () => {},
    onTestHosts = () => {},
    onStep = () => {},
    onWorkspaceName = () => {},
    onCreateWorkspace = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<div class="setup-overlay">
  <div class="setup-wizard">
    <div class="setup-steps">
      <span class="setup-step" class:active={step === 1} class:done={step > 1}>1</span>
      <span class="setup-step-line" class:done={step > 1}></span>
      <span class="setup-step" class:active={step === 2} class:done={step > 2}>2</span>
      <span class="setup-step-line" class:done={step > 2}></span>
      <span class="setup-step" class:active={step === 3}>3</span>
    </div>

    {#if step === 1}
      <div class="setup-content">
        <h2 class="setup-title">{t('welcome')}</h2>
        <p class="setup-desc">{t('setupImportDesc')}</p>
        <p class="setup-hint">{t('setupImportHint')}</p>
        <div class="setup-actions">
          <button class="action-btn" onclick={onImportHosts} disabled={importing}>
            {importing ? t('importing') : t('importFromSshConfig')}
          </button>
          <button class="setup-link" onclick={onOpenHosts}>
            {t('addHostsManually')}
          </button>
        </div>
        <button class="setup-skip" onclick={onSkip}>{t('skipSetup')}</button>
      </div>
    {:else if step === 2}
      <div class="setup-content">
        <h2 class="setup-title">{t('testYourHosts')}</h2>
        <p class="setup-desc">
          {t('hostsImported', { count: managedHosts.length })}
        </p>

        {#if testResults.length > 0}
          <div class="setup-results">
            {#each testResults as result}
              <div class="setup-result-row">
                <span class="setup-result-name">{result.name}</span>
                {#if result.status === 'ok'}
                  <span class="host-badge ok-badge">{t('reachable')}</span>
                  {#if result.tmuxAvailable}
                    <span class="host-badge tmux-badge">tmux</span>
                  {:else}
                    <span class="host-badge no-tmux-badge">{t('noTmux')}</span>
                  {/if}
                {:else}
                  <span class="host-badge error-badge">{result.error || 'unreachable'}</span>
                {/if}
              </div>
            {/each}
          </div>
          {@const reachable = testResults.filter(result => result.status === 'ok').length}
          {@const withTmux = testResults.filter(result => result.tmuxAvailable).length}
          <p class="setup-summary">
            {t('reachableSummary', { reachable, total: testResults.length, withTmux })}
            {#if withTmux === 0}
              <span class="setup-warn">{t('noHostsTmux')}</span>
            {/if}
          </p>
        {/if}

        <div class="setup-actions">
          {#if testResults.length === 0}
            <button class="action-btn" onclick={onTestHosts} disabled={testing}>
              {testing ? t('testing') : t('testAllHosts')}
            </button>
          {:else}
            <button class="action-btn" onclick={() => onStep(3)}>
              {t('continue')}
            </button>
            <button class="setup-link" onclick={onTestHosts} disabled={testing}>
              {testing ? t('retesting') : t('retest')}
            </button>
          {/if}
        </div>
        <button class="setup-skip" onclick={() => onStep(3)}>{t('skipTesting')}</button>
      </div>
    {:else if step === 3}
      <div class="setup-content">
        <h2 class="setup-title">{t('createFirstWorkspace')}</h2>
        <p class="setup-desc">{t('workspaceIntro')}</p>
        <label class="host-field">
          <span class="host-field-label">{t('workspaceName')}</span>
          <input
            class="field-input"
            type="text"
            value={workspaceName}
            placeholder="Default"
            oninput={(event) => onWorkspaceName(event.target.value)}
          />
        </label>
        <div class="setup-actions">
          <button class="action-btn" onclick={onCreateWorkspace} disabled={!workspaceName.trim()}>
            {t('createWorkspace')}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .setup-overlay {
    position: fixed; inset: 0;
    background: rgba(10,14,20,0.95); backdrop-filter: blur(8px);
    z-index: 5000; display: flex; align-items: center; justify-content: center;
  }
  .setup-wizard {
    width: 480px; max-width: 90vw; max-height: 90vh;
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    padding: 32px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 24px;
  }
  .setup-steps {
    display: flex; align-items: center; justify-content: center; gap: 0;
  }
  .setup-step {
    width: 28px; height: 28px; border-radius: 50%;
    border: 2px solid var(--border-strong); background: transparent;
    color: var(--text-muted); font-size: 12px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.2s;
  }
  .setup-step.active { border-color: var(--accent); color: var(--accent); background: var(--accent-bg-med); }
  .setup-step.done { border-color: var(--success); color: var(--success); background: var(--success-bg); }
  .setup-step-line { width: 40px; height: 2px; background: var(--border-strong); }
  .setup-step-line.done { background: var(--success); }
  .setup-content { display: flex; flex-direction: column; gap: 16px; }
  .setup-title {
    font-size: 20px; font-weight: 700; color: var(--text-primary); margin: 0;
    font-family: 'DM Sans', sans-serif;
  }
  .setup-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
  .setup-hint {
    font-size: 11px; color: var(--text-muted); margin: 0;
    padding: 8px 12px; background: var(--accent-bg);
    border: 1px solid var(--accent-bg-med); border-radius: 6px;
  }
  .setup-actions {
    display: flex; align-items: center; gap: 12px;
  }
  .setup-link {
    background: none; border: none; color: var(--accent); font-size: 12px;
    cursor: pointer; font-family: 'DM Sans', sans-serif;
    padding: 4px 8px; border-radius: 4px; transition: background 0.1s;
  }
  .setup-link:hover { background: var(--accent-bg-med); }
  .setup-link:disabled { opacity: 0.5; cursor: not-allowed; }
  .setup-skip {
    background: none; border: none; color: var(--text-muted); font-size: 11px;
    cursor: pointer; align-self: center; padding: 4px;
  }
  .setup-skip:hover { color: var(--text-secondary); }
  .setup-results {
    display: flex; flex-direction: column; gap: 4px;
    max-height: 200px; overflow-y: auto;
    padding: 8px; background: #0b0e14; border-radius: 6px;
    border: 1px solid var(--border);
  }
  .setup-result-row {
    display: flex; align-items: center; gap: 8px;
    padding: 3px 4px; font-size: 12px;
  }
  .setup-result-name {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--text-primary); min-width: 100px;
  }
  .setup-summary { font-size: 12px; color: var(--text-secondary); margin: 0; }
  .setup-warn { color: var(--warning); }
  .host-field { display: flex; flex-direction: column; gap: 3px; }
  .host-field-label { font-size: 10px; color: var(--text-secondary); font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .field-input {
    width: 100%; padding: 8px 12px; border-radius: 6px;
    border: 1px solid var(--border); background: #0b0e11; color: var(--text-primary);
    font-size: 13px; font-family: 'JetBrains Mono', monospace;
    outline: none; box-sizing: border-box;
  }
  .field-input:focus { border-color: var(--accent); }
  .action-btn {
    padding: 8px 16px; border-radius: 6px; border: none;
    background: var(--accent); color: #fff; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.12s;
  }
  .action-btn:hover { background: var(--accent-hover); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .host-badge {
    font-size: 8px; padding: 1px 5px; border-radius: 3px; font-weight: 500;
    white-space: nowrap; flex-shrink: 0;
  }
  .host-badge.ok-badge { background: var(--success-bg); color: var(--success); }
  .host-badge.error-badge { background: var(--danger-bg); color: var(--danger); }
  .host-badge.tmux-badge { background: var(--success-bg); color: var(--success); }
  .host-badge.no-tmux-badge { background: var(--warning-bg); color: var(--warning); }
</style>
