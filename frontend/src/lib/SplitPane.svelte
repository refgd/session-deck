<script>
  import Terminal from './Terminal.svelte';
  import { DEFAULT_HOST } from './constants.js';
  import SplitPane from './SplitPane.svelte';
  import { translate } from './i18n.js';
  import { paneSessionKey } from './pane-key-utils.js';

  let {
    node,
    path = [],
    focusedId = null,
    zoomedId = null,
    onFocus = () => {},
    onLayoutChange = () => {},
    onSessionPick = () => {},
    onZoom = () => {},
    onSplit = () => {},
    onClose = () => {},
    onDrop = () => {},
    onPaneContextMenu = () => {},
    onHistory = () => {},
    getTypeInfo = () => ({ color: '#6b7688', label: 'TERM', context: null }),
    parentSplit = null,
    siblingCount = 0,
    language = 'en',
  } = $props();

  let resizing = $state(false);
  let containerEl = $state(null);
  let dropZone = $state(null); // 'left' | 'right' | 'top' | 'bottom' | null

  function t(key, params = {}) {
    return translate(language, key, params);
  }

  function startResize(index, event) {
    event.preventDefault();
    resizing = true;

    const isHorizontal = node.split === 'h';
    const startPos = isHorizontal ? event.clientX : event.clientY;
    const containerRect = containerEl.getBoundingClientRect();
    const totalSize = isHorizontal ? containerRect.width : containerRect.height;
    const totalRatio = node.children.reduce((sum, c) => sum + (c.size || 1), 0);
    const childSizes = node.children.map(c => ((c.size || 1) / totalRatio) * totalSize);

    function onMouseMove(e) {
      const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
      const newSize1 = Math.max(40, childSizes[index] + delta);
      const newSize2 = Math.max(40, childSizes[index + 1] - delta);
      const pixelPerRatio = totalSize / totalRatio;
      node.children[index].size = newSize1 / pixelPerRatio;
      node.children[index + 1].size = newSize2 / pixelPerRatio;
      node = node;
    }

    function onMouseUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onLayoutChange();
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }

  function nodeId(child) {
    if (child.session) return paneSessionKey(child.host, child.session, DEFAULT_HOST);
    return `empty:${path.join('.') || 'root'}`;
  }

  function handleSessionClick(session) {
    onSessionPick(path, session);
  }

  function getDropZone(e, el) {
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    // Determine quadrant — edges win over center
    if (x < 0.25) return 'left';
    if (x > 0.75) return 'right';
    if (y < 0.35) return 'top';
    if (y > 0.65) return 'bottom';
    // Center area — use closest edge
    const dists = { left: x, right: 1 - x, top: y, bottom: 1 - y };
    return Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const hasSourcePane = e.dataTransfer.types.includes('text/plain');
    if (hasSourcePane) {
      const zone = getDropZone(e, e.currentTarget);
      // Detect swap: if parent is splitting in the same direction as the drop zone,
      // and there are exactly 2 siblings, show swap indicator
      const dropDir = (zone === 'left' || zone === 'right') ? 'h' : 'v';
      if (parentSplit === dropDir && siblingCount === 2) {
        dropZone = 'swap';
      } else {
        dropZone = zone;
      }
    }
  }

  function handleDragLeave(e) {
    // Only clear if actually leaving the pane (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      dropZone = null;
    }
  }

  function handleDropOnPane(e) {
    e.preventDefault();
    const sourcePane = e.dataTransfer.getData('text/plain');
    const zone = dropZone;
    dropZone = null;
    const targetPane = nodeId(node);
    if (sourcePane && targetPane && zone && sourcePane !== targetPane) {
      onDrop(sourcePane, targetPane, zone);
    }
  }
</script>

{#if !node.children}
  <div
    class="pane-leaf"
    class:empty={!node.session}
    role="button"
    tabindex="0"
    style="flex: {node.size || 1}"
    onclick={() => onFocus(nodeId(node))}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onFocus(nodeId(node))}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDropOnPane}
  >
    {#if dropZone}
      <div class="drop-indicator {dropZone}"></div>
    {/if}
    <button class="pane-plus" title={t('addPane')} onclick={(e) => { e.stopPropagation(); onSplit(path, 'h'); }}>+</button>
    {#if node.session}
      <Terminal
        session={node.session}
        host={node.host || DEFAULT_HOST}
        focused={focusedId === nodeId(node)}
        zoomed={zoomedId === nodeId(node)}
        sessionType={node.session}
        sessionTypeColor={getTypeInfo(node.session, node.host || DEFAULT_HOST).color}
        sessionTypeLabel={getTypeInfo(node.session, node.host || DEFAULT_HOST).label}
        sessionContext={getTypeInfo(node.session, node.host || DEFAULT_HOST).context}
        paneTitle={node.paneTitle || null}
        {language}
        onSessionClick={() => handleSessionClick(node.session)}
        onZoom={() => onZoom(nodeId(node), node.session, node.host || DEFAULT_HOST, path)}
        onSplit={(dir) => onSplit(path, dir)}
        onClose={() => onClose(path)}
        onHistory={onHistory}
        onDragStart={() => {}}
        onContextMenu={(e) => onPaneContextMenu(e, path, node.session, node.host || DEFAULT_HOST)}
      />
    {:else}
      <div class="empty-pane">
        <button class="empty-close" title={t('closePane')} onclick={(e) => { e.stopPropagation(); onClose(path); }}>
          <span class="empty-close-icon"></span>
        </button>
        <button class="add-session-btn" onclick={(e) => { e.stopPropagation(); handleSessionClick(null); }}>
          <span class="add-session-plus">+</span>
          <span>{t('addSession')}</span>
        </button>
      </div>
    {/if}
  </div>
{:else if node.split && node.children}
  <div
    class="split-container {node.split === 'h' ? 'split-h' : 'split-v'}"
    class:resizing
    style="flex: {node.size || 1}"
    bind:this={containerEl}
  >
    {#each node.children as child, i}
      <SplitPane
        node={child}
        path={[...path, i]}
        {focusedId}
        {zoomedId}
        {onFocus}
        {onLayoutChange}
        {onSessionPick}
        {onZoom}
        {onSplit}
        {onClose}
        {onDrop}
        {onPaneContextMenu}
        {onHistory}
        {getTypeInfo}
        {language}
        parentSplit={node.split}
        siblingCount={node.children.length}
      />
      {#if i < node.children.length - 1}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="resize-handle {node.split === 'h' ? 'resize-h' : 'resize-v'}"
          onmousedown={(e) => startResize(i, e)}
          role="separator"
          aria-orientation={node.split === 'h' ? 'vertical' : 'horizontal'}
        ></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .pane-leaf { min-width: 0; min-height: 0; overflow: hidden; position: relative; }
  .pane-plus {
    position: absolute; top: 8px; right: 8px; z-index: 30;
    width: 24px; height: 24px; border-radius: 50%;
    border: 1px solid rgba(197,205,217,0.16);
    background: rgba(21,27,35,0.9); color: #c5cdd9;
    font-size: 16px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .pane-leaf:not(.empty) .pane-plus {
    top: 34px;
    opacity: 0;
    transition: opacity 0.12s, border-color 0.12s, color 0.12s;
  }
  .pane-leaf:not(.empty):hover .pane-plus { opacity: 1; }
  .pane-plus:hover { border-color: var(--accent, #F97316); color: var(--accent, #F97316); }
  .empty-pane {
    position: relative;
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #0b0e11; border: 1px solid #161b22; border-radius: 6px;
  }
  .empty-close {
    position: absolute; top: 8px; left: 8px;
    width: 24px; height: 24px; border-radius: 4px;
    border: 1px solid transparent;
    background: transparent; color: #3d4450; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .empty-close:hover {
    background: rgba(240,113,120,0.15);
    border-color: rgba(240,113,120,0.25);
    color: #f07178;
  }
  .empty-close-icon {
    display: block; width: 10px; height: 10px; position: relative;
  }
  .empty-close-icon::before, .empty-close-icon::after {
    content: ''; position: absolute; top: 50%; left: 50%;
    width: 10px; height: 1.5px; background: currentColor;
  }
  .empty-close-icon::before { transform: translate(-50%, -50%) rotate(45deg); }
  .empty-close-icon::after { transform: translate(-50%, -50%) rotate(-45deg); }
  .add-session-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-radius: 6px;
    border: 1px solid rgba(249,115,22,0.28);
    background: rgba(249,115,22,0.08); color: var(--accent, #F97316);
    font-size: 13px; font-family: 'DM Sans', sans-serif; cursor: pointer;
  }
  .add-session-btn:hover { background: rgba(249,115,22,0.14); border-color: var(--accent, #F97316); }
  .add-session-plus {
    width: 18px; height: 18px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid currentColor; font-size: 14px; line-height: 1;
  }
  .split-container {
    display: flex; min-width: 0; min-height: 0;
    overflow: hidden; width: 100%; height: 100%;
  }
  .split-h { flex-direction: row; }
  .split-v { flex-direction: column; }
  .split-container.resizing :global(.term-pane) { pointer-events: none; }
  .resize-handle {
    flex-shrink: 0; z-index: 10; background: transparent; transition: background 0.1s;
  }
  .resize-handle:hover, .resize-handle:active {
    background: rgba(61, 139, 253, 0.4);
  }
  .resize-h { width: 5px; cursor: col-resize; margin: 0 -1px; }
  .resize-v { height: 5px; cursor: row-resize; margin: -1px 0; }

  /* Drop zone indicators */
  .drop-indicator {
    position: absolute; z-index: 100; pointer-events: none;
    border-radius: 4px;
    transition: all 0.1s ease;
  }
  .drop-indicator.left { top: 4px; left: 4px; bottom: 4px; width: 45%; background: rgba(61, 139, 253, 0.15); border: 2px solid rgba(61, 139, 253, 0.6); }
  .drop-indicator.right { top: 4px; right: 4px; bottom: 4px; width: 45%; background: rgba(61, 139, 253, 0.15); border: 2px solid rgba(61, 139, 253, 0.6); }
  .drop-indicator.top { top: 4px; left: 4px; right: 4px; height: 45%; background: rgba(61, 139, 253, 0.15); border: 2px solid rgba(61, 139, 253, 0.6); }
  .drop-indicator.bottom { bottom: 4px; left: 4px; right: 4px; height: 45%; background: rgba(61, 139, 253, 0.15); border: 2px solid rgba(61, 139, 253, 0.6); }
  .drop-indicator.swap { top: 4px; left: 4px; right: 4px; bottom: 4px; background: rgba(127, 217, 98, 0.12); border: 2px solid rgba(127, 217, 98, 0.5); }
</style>
