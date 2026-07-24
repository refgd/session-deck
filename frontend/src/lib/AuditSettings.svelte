<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    events = [],
    loading = false,
    onRefresh = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function formatTime(value) {
    if (!value) return t('unknown');
    return new Date(value).toLocaleString();
  }

  function targetLabel(event) {
    return event.target_name || event.target_id || event.target_type || t('unknown');
  }

  function detailsText(details) {
    if (!details || typeof details !== 'object') return '';
    try {
      return JSON.stringify(details);
    } catch {
      return '';
    }
  }
</script>

<div class="audit-settings">
  <section class="settings-card">
    <div class="section-head">
      <div>
        <h4>{t('auditLog')}</h4>
        <p>{t('auditLogHint')}</p>
      </div>
      <button class="btn-secondary" disabled={loading} onclick={onRefresh}>
        {loading ? t('loading') : t('refresh')}
      </button>
    </div>

    {#if loading && !events.length}
      <p class="empty">{t('loading')}</p>
    {:else if !events.length}
      <p class="empty">{t('auditLogEmpty')}</p>
    {:else}
      <div class="events-list" aria-label={t('auditEvents')}>
        {#each events as event}
          <article class="event-row">
            <div class="event-main">
              <span class="status-dot {event.status || 'ok'}"></span>
              <div class="event-title">
                <h5>{event.action}</h5>
                <p>{targetLabel(event)}</p>
              </div>
              <span class="status-text {event.status || 'ok'}">{event.status || 'ok'}</span>
            </div>

            <div class="event-meta">
              <span><strong>{t('created')}</strong>{formatTime(event.created_at)}</span>
              <span><strong>{t('user')}</strong>{event.actor || t('unknown')}</span>
              {#if event.ip}
                <span><strong>IP</strong>{event.ip}</span>
              {/if}
              {#if event.target_type}
                <span><strong>{t('type')}</strong>{event.target_type}</span>
              {/if}
            </div>

            {#if event.error}
              <p class="event-error">{event.error}</p>
            {/if}

            {#if detailsText(event.details)}
              <code class="event-details">{detailsText(event.details)}</code>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .audit-settings { display: flex; flex-direction: column; gap: 14px; }
  .settings-card {
    border: 1px solid var(--border); border-radius: 8px; padding: 14px;
    background: var(--bg-surface-2);
  }
  .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h4 { margin: 0 0 4px; font-size: 13px; color: var(--text-primary); }
  h5 { margin: 0 0 3px; font-size: 12px; color: var(--text-primary); overflow-wrap: anywhere; }
  p { margin: 0; color: var(--text-muted); font-size: 11px; line-height: 1.45; }
  .btn-secondary {
    border-radius: 6px; padding: 8px 12px; font-size: 12px;
    font-family: 'DM Sans', sans-serif; cursor: pointer;
    background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border);
    white-space: nowrap;
  }
  .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
  .empty { padding: 10px 0; }
  .events-list { display: flex; flex-direction: column; gap: 8px; }
  .event-row {
    border: 1px solid var(--border); border-radius: 8px; padding: 10px;
    background: var(--bg-surface);
  }
  .event-main {
    display: grid; grid-template-columns: 10px 1fr auto; align-items: start;
    gap: 9px;
  }
  .event-title { min-width: 0; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; background: var(--success); }
  .status-dot.error { background: var(--danger); }
  .status-text { font-size: 11px; font-weight: 700; color: var(--success); }
  .status-text.error { color: var(--danger); }
  .event-meta {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-left: 19px;
    color: var(--text-secondary); font-size: 11px;
  }
  .event-meta span {
    display: inline-flex; gap: 5px; align-items: center;
    border: 1px solid var(--border); border-radius: 6px; padding: 3px 6px;
    max-width: 100%; overflow-wrap: anywhere;
  }
  .event-meta strong { color: var(--text-muted); font-weight: 600; }
  .event-error {
    margin: 8px 0 0 19px; color: var(--danger); overflow-wrap: anywhere;
  }
  .event-details {
    display: block; margin: 8px 0 0 19px; padding: 6px;
    border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg-surface-2); color: var(--text-secondary);
    font-size: 10px; white-space: pre-wrap; overflow-wrap: anywhere;
  }
</style>
