<script>
  import { translate } from './i18n.js';

  let {
    language = 'en',
    workspaceMenu = null,
    paneMenu = null,
    zoomed = false,
    onRenameWorkspace = () => {},
    onDuplicateWorkspace = () => {},
    onSaveTemplate = () => {},
    onDeleteWorkspace = () => {},
    onChangeSession = () => {},
    onRenameSession = () => {},
    onRenamePane = () => {},
    onSplitPane = () => {},
    onZoomPane = () => {},
    onClosePane = () => {},
    onExportScrollback = () => {},
    onDeleteSession = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

{#if workspaceMenu}
  <div class="ctx-menu" style="left:{workspaceMenu.x}px;top:{workspaceMenu.y}px">
    <button class="ctx-item" onclick={() => onRenameWorkspace(workspaceMenu.id)}>{t('rename')}</button>
    <button class="ctx-item" onclick={() => onDuplicateWorkspace(workspaceMenu.id)}>{t('duplicate')}</button>
    <button class="ctx-item" onclick={() => onSaveTemplate(workspaceMenu.id)}>{t('saveAsTemplate')}</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item danger" onclick={() => onDeleteWorkspace(workspaceMenu.id)}>{t('delete')}</button>
  </div>
{/if}

{#if paneMenu}
  <div class="ctx-menu" style="left:{paneMenu.x}px;top:{paneMenu.y}px">
    <button class="ctx-item" onclick={() => onChangeSession(paneMenu)}>{t('changeSession')}</button>
    <button class="ctx-item" onclick={() => onRenameSession(paneMenu)}>{t('renameSession')}</button>
    <button class="ctx-item" onclick={() => onRenamePane(paneMenu)}>{t('renamePane')}</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item" onclick={() => onSplitPane(paneMenu, 'h')}>{t('splitLeftRight')}</button>
    <button class="ctx-item" onclick={() => onSplitPane(paneMenu, 'v')}>{t('splitTopBottom')}</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item" onclick={() => onZoomPane(paneMenu)}>{zoomed ? t('restore') : t('zoom')}</button>
    <button class="ctx-item danger" onclick={() => onClosePane(paneMenu)}>{t('closePane')}</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item" onclick={() => onExportScrollback(paneMenu)}>{t('exportScrollback')}</button>
    <div class="ctx-sep"></div>
    <button class="ctx-item danger" onclick={() => onDeleteSession(paneMenu)}>{t('killSession')}</button>
  </div>
{/if}

<style>
  .ctx-menu {
    position: fixed; z-index: 3000; min-width: 150px;
    background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); padding: 4px;
  }
  .ctx-item {
    display: block; width: 100%; padding: 7px 10px; border: none; background: transparent;
    color: var(--text-primary); text-align: left; font-size: 12px; border-radius: 4px; cursor: pointer;
  }
  .ctx-item:hover { background: var(--bg-hover); }
  .ctx-item.danger { color: var(--danger); }
  .ctx-item.danger:hover { background: var(--danger-bg); }
  .ctx-sep { height: 1px; background: var(--border-strong); margin: 4px 8px; }
</style>
