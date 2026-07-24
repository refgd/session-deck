<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    query = '',
    index = 0,
    commands = [],
    onClose = () => {},
    onQuery = () => {},
    onIndex = () => {},
    onKeydown = () => {},
    onExecute = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<div
  class="palette-overlay"
  role="dialog"
  aria-modal="true"
  aria-label={t('commandPalette')}
  tabindex="-1"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="palette" role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="palette-input-row">
      <span class="palette-icon">⌘</span>
      <input
        class="palette-input"
        type="text"
        placeholder={t('typeCommand')}
        value={query}
        aria-label={t('typeCommand')}
        onkeydown={onKeydown}
        oninput={(e) => { onQuery(e.target.value); onIndex(0); }}
      />
    </div>
    <div class="palette-results">
      {#each commands as cmd, i}
        <button
          class="palette-item"
          class:active={i === index}
          onclick={() => onExecute(cmd)}
          onmouseenter={() => onIndex(i)}
        >
          <span class="palette-category">{cmd.category}</span>
          <span class="palette-label">{cmd.label}</span>
          {#if cmd.hint}
            <kbd class="palette-hint">{cmd.hint}</kbd>
          {/if}
        </button>
      {:else}
        <div class="palette-empty">{t('noMatchingCommands')}</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .palette-overlay {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(10,14,20,0.6); backdrop-filter: blur(4px);
    z-index: 5500; display: flex; align-items: flex-start; justify-content: center;
    padding-top: 15vh;
  }
  .palette {
    width: 520px; max-width: 90vw; max-height: 60vh;
    background: var(--bg-raised); border: 1px solid var(--border-strong);
    border-radius: 12px; box-shadow: 0 24px 64px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .palette-input-row {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px; border-bottom: 1px solid var(--border);
  }
  .palette-icon { font-size: 14px; color: var(--text-muted); }
  .palette-input {
    flex: 1; background: none; border: none; color: var(--text-primary);
    font-size: 15px; font-family: 'DM Sans', sans-serif; outline: none;
  }
  .palette-input::placeholder { color: var(--text-muted); }
  .palette-results {
    flex: 1; overflow-y: auto; padding: 4px;
  }
  .palette-item {
    width: 100%; padding: 8px 12px; border: none; background: transparent;
    display: flex; align-items: center; gap: 10px; cursor: pointer;
    border-radius: 6px; font-size: 13px; text-align: left;
    color: var(--text-primary); transition: background 0.08s;
  }
  .palette-item:hover, .palette-item.active { background: var(--bg-elevated); }
  .palette-category {
    font-size: 9px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.5px; font-weight: 600; min-width: 60px;
    font-family: 'JetBrains Mono', monospace;
  }
  .palette-label { flex: 1; }
  .palette-hint {
    font-size: 10px; padding: 2px 6px; border-radius: 3px;
    background: var(--bg-base); border: 1px solid var(--border);
    color: var(--text-secondary); font-family: 'JetBrains Mono', monospace;
  }
  .palette-empty {
    padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;
  }
</style>
