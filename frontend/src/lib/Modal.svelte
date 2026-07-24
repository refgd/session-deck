<script>
  let {
    title = '',
    width = '320px',
    closeLabel = 'Close',
    onClose = () => {},
    children,
  } = $props();

  function handleKeydown(event) {
    if (event.key === 'Escape') onClose();
  }
</script>

<div
  class="picker-overlay modal-top"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  onclick={onClose}
  onkeydown={handleKeydown}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="picker" style:width role="document" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <div class="picker-hdr">
      <span>{title}</span>
      <button class="picker-close" type="button" aria-label={closeLabel} title={closeLabel} onclick={onClose}>&times;</button>
    </div>
    {@render children?.()}
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
    max-width: 92vw; max-height: 80vh;
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
</style>
