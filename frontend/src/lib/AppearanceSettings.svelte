<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    languages = [],
    accentColor = '#F97316',
    mobileReadOnlyDefault = false,
    sessionTypes = [],
    scanningTypes = false,
    editingTypeId = null,
    editTypeName = '',
    editTypeColor = '#6b7688',
    onAccentColor = () => {},
    onLanguage = () => {},
    onMobileReadOnlyDefault = () => {},
    onScanTypes = () => {},
    onStartEditType = () => {},
    onSaveType = () => {},
    onCancelEditType = () => {},
    onEditTypeName = () => {},
    onEditTypeColor = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  const accentPresets = [
    { color: '#F97316', label: 'Orange' },
    { color: '#3d8bfd', label: 'Blue' },
    { color: '#7fd962', label: 'Green' },
    { color: '#c792ea', label: 'Purple' },
    { color: '#56b6c2', label: 'Cyan' },
    { color: '#e5c07b', label: 'Gold' },
    { color: '#f07178', label: 'Red' },
  ];
</script>

<div class="host-mgr">
  <div class="appearance-section">
    <div class="appearance-section-title">{t('accentColor')}</div>
    <div class="accent-picker">
      {#each accentPresets as preset}
        <button
          class="accent-swatch"
          class:active={accentColor === preset.color}
          style="background:{preset.color}"
          title={preset.label}
          onclick={() => onAccentColor(preset.color)}
        ></button>
      {/each}
      <label class="accent-custom">
        <input
          type="color"
          value={accentColor}
          onchange={(e) => onAccentColor(e.target.value)}
          title={t('customColor')}
        />
        <span class="accent-custom-label">{t('custom')}</span>
      </label>
    </div>
  </div>

  <div class="appearance-section">
    <div class="appearance-section-title">{t('language')}</div>
    <div class="language-options" role="radiogroup" aria-label={t('language')}>
      {#each languages as lang}
        <button
          class="language-option"
          class:active={language === lang.code}
          role="radio"
          aria-checked={language === lang.code}
          onclick={() => onLanguage(lang.code)}
        >
          <span class="language-short">{lang.shortLabel}</span>
          <span>{lang.code === 'zh-CN' ? t('chinese') : t('english')}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="appearance-section">
    <div class="appearance-section-title">{t('mobileTerminal')}</div>
    <label class="toggle-row">
      <span>
        <span class="toggle-title">{t('mobileReadOnlyDefault')}</span>
        <span class="toggle-desc">{t('mobileReadOnlyDefaultDesc')}</span>
      </span>
      <input
        type="checkbox"
        checked={mobileReadOnlyDefault}
        onchange={(e) => onMobileReadOnlyDefault(e.currentTarget.checked)}
      />
    </label>
  </div>

  <div class="appearance-section">
    <div class="appearance-section-hdr">
      <span class="appearance-section-title">{t('sessionTypeColors')}</span>
      <button class="host-toolbar-btn" onclick={onScanTypes} disabled={scanningTypes}>
        {scanningTypes ? t('scanning') : t('scanSessions')}
      </button>
    </div>
    <p class="appearance-desc">{t('sessionTypeDesc')}</p>
    <div class="type-list">
      {#each sessionTypes as type}
        <div class="type-row">
          {#if editingTypeId === type.id}
            <input type="color" class="type-color-input" value={editTypeColor}
              onchange={(e) => onEditTypeColor(e.target.value)} />
            <input class="type-name-input" type="text" value={editTypeName}
              oninput={(e) => onEditTypeName(e.target.value)}
              onkeydown={(e) => e.key === 'Enter' && onSaveType()} />
            <span class="type-process">{type.process_name}</span>
            <div class="type-row-actions editing">
              <button class="mgr-act" onclick={onSaveType}>{t('save')}</button>
              <button class="mgr-act" onclick={onCancelEditType}>{t('cancel')}</button>
            </div>
          {:else}
            <span class="dot" style="background:{type.color};box-shadow:0 0 6px {type.color}"></span>
            <span class="type-display-name">{type.display_name}</span>
            <span class="type-process">{type.process_name}</span>
            <span class="type-color-value">{type.color}</span>
            <div class="type-row-actions">
              <button class="mgr-act" title="Edit" onclick={() => onStartEditType(type)}>
                <span class="mgr-icon-rename"></span>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .host-mgr { display: flex; flex-direction: column; gap: 12px; }
  .host-toolbar-btn {
    padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
    font-family: 'DM Sans', sans-serif; transition: all 0.1s;
  }
  .host-toolbar-btn:hover { border-color: var(--accent); color: var(--text-primary); }
  .host-toolbar-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .appearance-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
  .appearance-section-title {
    font-size: 11px; color: var(--text-secondary); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    font-family: 'JetBrains Mono', monospace;
  }
  .appearance-section-hdr { display: flex; align-items: center; justify-content: space-between; }
  .appearance-desc { font-size: 11px; color: var(--text-muted); margin: 0; line-height: 1.5; }
  .accent-picker { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .accent-swatch {
    width: 28px; height: 28px; border-radius: 6px; border: 2px solid transparent;
    cursor: pointer; transition: all 0.12s;
  }
  .accent-swatch:hover { transform: scale(1.1); }
  .accent-swatch.active { border-color: var(--text-primary); box-shadow: 0 0 8px rgba(255,255,255,0.15); }
  .accent-custom { display: flex; align-items: center; gap: 4px; cursor: pointer; }
  .accent-custom input[type="color"] {
    width: 28px; height: 28px; border: 1px solid var(--border); border-radius: 6px;
    background: none; cursor: pointer; padding: 0;
  }
  .accent-custom input[type="color"]::-webkit-color-swatch-wrapper { padding: 2px; }
  .accent-custom input[type="color"]::-webkit-color-swatch { border: none; border-radius: 4px; }
  .accent-custom-label { font-size: 10px; color: var(--text-muted); }
  .language-options { display: flex; gap: 6px; flex-wrap: wrap; }
  .language-option {
    display: flex; align-items: center; gap: 7px;
    padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); font-size: 12px;
    font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all 0.12s;
  }
  .language-option:hover { border-color: var(--accent); color: var(--text-primary); }
  .language-option.active {
    border-color: var(--accent); background: var(--accent-bg-med); color: var(--accent);
  }
  .language-short {
    width: 20px; height: 20px; border-radius: 4px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--bg-base); border: 1px solid var(--border);
    font-size: 10px; font-family: 'JetBrains Mono', monospace;
  }
  .toggle-row {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-base); color: var(--text-secondary);
  }
  .toggle-title {
    display: block; color: var(--text-primary); font-size: 12px; font-weight: 600;
    font-family: 'DM Sans', sans-serif;
  }
  .toggle-desc {
    display: block; margin-top: 2px; color: var(--text-muted); font-size: 11px; line-height: 1.4;
    font-family: 'DM Sans', sans-serif;
  }
  .toggle-row input {
    flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--accent);
  }
  .type-list { display: flex; flex-direction: column; gap: 2px; }
  .type-row {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 8px; border-radius: 6px; transition: background 0.1s;
  }
  .type-row:hover { background: var(--bg-elevated); }
  .type-row:hover .type-row-actions { opacity: 1; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .type-display-name {
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: var(--text-primary); min-width: 90px;
  }
  .type-process {
    font-size: 10px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace;
  }
  .type-color-value {
    font-size: 10px; color: var(--text-muted);
    font-family: 'JetBrains Mono', monospace; margin-left: auto;
  }
  .type-row-actions {
    display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s;
  }
  .type-row-actions.editing { opacity: 1; margin-left: auto; }
  .type-color-input {
    width: 24px; height: 24px; border: 1px solid var(--border); border-radius: 4px;
    background: none; cursor: pointer; padding: 0; flex-shrink: 0;
  }
  .type-color-input::-webkit-color-swatch-wrapper { padding: 1px; }
  .type-color-input::-webkit-color-swatch { border: none; border-radius: 3px; }
  .type-name-input {
    padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border);
    background: var(--bg-base); color: var(--text-primary);
    font-size: 11px; font-family: 'JetBrains Mono', monospace;
    width: 120px;
  }
  .type-name-input:focus { border-color: var(--accent); outline: none; }
</style>
