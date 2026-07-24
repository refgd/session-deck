<script>
  import { translate } from './i18n.js';
  import {
    diagnosticChecks,
    diagnosticDetailRows,
    diagnosticIssueRows,
    diagnosticStatusLabel,
  } from './diagnostics-utils.js';

  let {
    language = 'en',
    report = null,
    loading = false,
    onRefresh = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function statusLabel(status) {
    return diagnosticStatusLabel(t, status);
  }

  function detailRows(check) {
    return diagnosticDetailRows(t, check);
  }

  function issueRows(check) {
    return diagnosticIssueRows(t, check);
  }
</script>

<div class="diagnostics-settings">
  <section class="settings-card">
    <div class="section-head">
      <div>
        <h4>{t('diagnostics')}</h4>
        <p>{t('diagnosticsHint')}</p>
      </div>
      <button class="btn-secondary" disabled={loading} onclick={onRefresh}>
        {loading ? t('loading') : t('refresh')}
      </button>
    </div>

    {#if loading && !report}
      <p class="empty">{t('loading')}</p>
    {:else if !report}
      <p class="empty">{t('diagnosticsEmpty')}</p>
    {:else}
      <div class="summary-row">
        <span class="status-pill {report.status}">{statusLabel(report.status)}</span>
        <span class="generated">{t('generatedAt')}: {new Date(report.generatedAt).toLocaleString()}</span>
      </div>

      <div class="checks-list">
        {#each diagnosticChecks(report) as check}
          <article class="check-row">
            <div class="check-main">
              <span class="status-dot {check.status}"></span>
              <div>
                <h5>{t(check.name)}</h5>
                <p>{check.message}</p>
              </div>
              <span class="status-text {check.status}">{statusLabel(check.status)}</span>
            </div>

            {#if detailRows(check).length || issueRows(check).length}
              <div class="check-details">
                {#each detailRows(check) as row}
                  <span><strong>{row[0]}</strong>{row[1]}</span>
                {/each}
                {#each issueRows(check) as issue}
                  <span class="issue">{issue}</span>
                {/each}
              </div>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .diagnostics-settings { display: flex; flex-direction: column; gap: 14px; }
  .settings-card {
    border: 1px solid var(--border); border-radius: 8px; padding: 14px;
    background: var(--bg-surface-2);
  }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h4 { margin: 0 0 4px; font-size: 13px; color: var(--text-primary); }
  h5 { margin: 0 0 3px; font-size: 12px; color: var(--text-primary); }
  p { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.45; }
  .btn-secondary {
    border-radius: 6px; padding: 8px 12px; font-size: 12px;
    font-family: 'DM Sans', sans-serif; cursor: pointer;
    background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border);
    white-space: nowrap;
  }
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .empty { padding: 10px 0; }
  .summary-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
  .status-pill {
    border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700;
    background: var(--bg-surface); color: var(--text-secondary);
  }
  .status-pill.ok { background: var(--success-bg); color: var(--success); }
  .status-pill.warning { background: var(--warning-bg); color: var(--warning); }
  .status-pill.error { background: var(--danger-bg); color: var(--danger); }
  .generated { color: var(--text-muted); font-size: 11px; }
  .checks-list { display: flex; flex-direction: column; gap: 8px; }
  .check-row {
    border: 1px solid var(--border); border-radius: 8px; padding: 10px;
    background: var(--bg-surface);
  }
  .check-main {
    display: grid; grid-template-columns: 10px 1fr auto; align-items: start;
    gap: 9px;
  }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; background: var(--text-muted); }
  .status-dot.ok { background: var(--success); }
  .status-dot.warning { background: var(--warning); }
  .status-dot.error { background: var(--danger); }
  .status-text { font-size: 11px; font-weight: 700; }
  .status-text.ok { color: var(--success); }
  .status-text.warning { color: var(--warning); }
  .status-text.error { color: var(--danger); }
  .check-details {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-left: 19px;
    color: var(--text-secondary); font-size: 11px;
  }
  .check-details span {
    display: inline-flex; gap: 5px; align-items: center;
    border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px;
    max-width: 100%; overflow-wrap: anywhere;
  }
  .check-details strong { color: var(--text-muted); font-weight: 600; }
  .check-details .issue { border-color: var(--warning); color: var(--warning); }
</style>
