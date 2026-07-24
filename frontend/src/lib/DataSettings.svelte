<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    exporting = false,
    importing = false,
    includeSensitivePaths = false,
    onExport = () => {},
    onImport = () => {},
    onIncludeSensitivePaths = () => {},
  } = $props();

  let fileInput;

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  async function importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    await onImport(file);
    event.currentTarget.value = '';
  }
</script>

<div class="data-settings">
  <section class="settings-card">
    <div class="section-head">
      <div>
        <h4>{t('backupRestore')}</h4>
        <p>{t('backupRestoreHint')}</p>
      </div>
    </div>

    <div class="data-actions">
      <button class="btn-primary" disabled={exporting} onclick={() => onExport({ includeSensitivePaths })}>
        {exporting ? t('exporting') : t('exportConfig')}
      </button>
      <button class="btn-secondary" disabled={importing} onclick={() => fileInput?.click()}>
        {importing ? t('importing') : t('importConfig')}
      </button>
      <input
        bind:this={fileInput}
        class="file-input"
        type="file"
        accept="application/json,.json"
        onchange={importFile}
      />
    </div>

    <label class="data-toggle">
      <input
        type="checkbox"
        checked={includeSensitivePaths}
        onchange={(event) => onIncludeSensitivePaths(event.currentTarget.checked)}
      />
      <span>{t('includeSensitivePaths')}</span>
    </label>
    <p class="note">{t('privateKeysExcluded')}</p>
  </section>
</div>

<style>
  .data-settings { display: flex; flex-direction: column; gap: 14px; }
  .settings-card {
    border: 1px solid var(--border); border-radius: 8px; padding: 14px;
    background: var(--bg-surface-2);
  }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h4 { margin: 0 0 4px; font-size: 13px; color: var(--text-primary); }
  p { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.45; }
  .data-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn-primary, .btn-secondary {
    border: none; border-radius: 6px; padding: 8px 12px; font-size: 12px;
    font-family: 'DM Sans', sans-serif; cursor: pointer;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-secondary { background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border); }
  .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .file-input { display: none; }
  .data-toggle {
    display: inline-flex; align-items: center; gap: 7px;
    margin-top: 10px; color: var(--text-secondary); font-size: 11px;
  }
  .data-toggle input { margin: 0; }
  .note { margin-top: 10px; }
</style>
