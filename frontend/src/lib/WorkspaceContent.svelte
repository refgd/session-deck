<script>
  import Terminal from './Terminal.svelte';
  import SplitPane from './SplitPane.svelte';
  import MobileWorkspaceView from './MobileWorkspaceView.svelte';
  import { translate } from './i18n.js';

  let {
    language = 'en',
    loading = false,
    zoomedPane = null,
    activeId = null,
    activeLayout = null,
    useSinglePane = false,
    mobileActivePane = 0,
    mobileMinimap = true,
    readOnlyMode = false,
    statusColors = {},
    focusedId = null,
    getTypeInfo = () => ({ color: '#6b7688', label: 'TERM', context: null }),
    getPaneStatus = () => null,
    onUnzoom = () => {},
    onSessionPick = () => {},
    onPaneContextMenu = () => {},
    onHistory = () => {},
    onReadOnlyMode = () => {},
    onMobilePane = () => {},
    onMobileBack = () => {},
    onMobileActivePane = () => {},
    onFocus = () => {},
    onLayoutChange = () => {},
    onZoom = () => {},
    onSplit = () => {},
    onClose = () => {},
    onDrop = () => {},
  } = $props();

  function t(key, params = {}) {
    return translate(language, key, params);
  }
</script>

<main class="content">
  {#if loading}
    <div class="center-msg">{t('loadingWorkspaces')}</div>
  {:else if zoomedPane && activeId}
    <div class="zoomed-container">
      <Terminal
        session={zoomedPane.session}
        host={zoomedPane.host}
        focused={true}
        zoomed={true}
        sessionTypeColor={getTypeInfo(zoomedPane.session, zoomedPane.host).color}
        sessionTypeLabel={getTypeInfo(zoomedPane.session, zoomedPane.host).label}
        sessionContext={getTypeInfo(zoomedPane.session, zoomedPane.host).context}
        {language}
        onZoom={onUnzoom}
        onHistory={onHistory}
        onSessionClick={() => onSessionPick(zoomedPane.path || [], zoomedPane.session)}
        onContextMenu={(event) => onPaneContextMenu(event, zoomedPane.path || [], zoomedPane.session, zoomedPane.host)}
      />
    </div>
  {:else if useSinglePane && activeLayout && activeId}
    <MobileWorkspaceView
      {language}
      {activeId}
      layout={activeLayout}
      activePane={mobileActivePane}
      minimap={mobileMinimap}
      readOnly={readOnlyMode}
      {statusColors}
      {getTypeInfo}
      getPaneStatus={getPaneStatus}
      onPane={onMobilePane}
      onBack={onMobileBack}
      onActivePane={onMobileActivePane}
      onSessionPick={onSessionPick}
      onPaneContextMenu={onPaneContextMenu}
      onHistory={onHistory}
      onReadOnlyToggle={onReadOnlyMode}
      onSplit={onSplit}
      onClose={onClose}
    />
  {:else if activeLayout && activeId}
    {#key activeId}
      <SplitPane
        node={activeLayout}
        {focusedId}
        zoomedId={null}
        onFocus={onFocus}
        onLayoutChange={onLayoutChange}
        onSessionPick={onSessionPick}
        onZoom={onZoom}
        onSplit={onSplit}
        onClose={onClose}
        onDrop={onDrop}
        onPaneContextMenu={onPaneContextMenu}
        onHistory={onHistory}
        {getTypeInfo}
        {language}
      />
    {/key}
  {:else}
    <div class="center-msg">{t('noWorkspaces')}</div>
  {/if}
</main>

<style>
  .content { flex: 1; overflow: hidden; padding: 3px; }
  .center-msg {
    display: flex; align-items: center; justify-content: center;
    height: 100%; font-size: 14px; color: var(--text-secondary);
  }
  .zoomed-container { width: 100%; height: 100%; }

  @media (max-width: 767px) {
    .content { padding: 1px; }
  }
</style>
