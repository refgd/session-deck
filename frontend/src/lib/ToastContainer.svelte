<script>
  let { toasts = [] } = $props();
</script>

<div class="toast-container">
  {#each toasts as toast (toast.id)}
    <div class="toast {toast.type}">{toast.message}</div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed; bottom: 32px; right: 16px; z-index: 4000;
    display: flex; flex-direction: column; gap: 8px;
  }
  .toast {
    padding: 8px 16px; border-radius: 6px; font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: toast-in 0.2s ease-out;
  }
  .toast.success { background: var(--success-bg); color: var(--success); border: 1px solid var(--success-border); }
  .toast.error { background: var(--danger-border-subtle); color: var(--danger); border: 1px solid var(--danger-border); }
  .toast.info { background: var(--accent-bg-strong); color: var(--accent); border: 1px solid var(--accent-border-strong); }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
