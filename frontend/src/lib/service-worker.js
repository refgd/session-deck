export function registerServiceWorker({
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  reload = () => globalThis.location?.reload?.(),
  updateIntervalMs = 60000,
  setIntervalRef = globalThis.setInterval,
} = {}) {
  if (!navigatorRef || !('serviceWorker' in navigatorRef)) return;

  const basePath = String(locationRef?.pathname || '/').replace(/\/(?:index\.html)?$/, '');
  const swPath = `${basePath}/sw.js`.replace(/^\/\//, '/');

  navigatorRef.serviceWorker.register(swPath).then((registration) => {
    setIntervalRef(() => registration.update(), updateIntervalMs);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') reload();
      });
    });
  }).catch(() => {});

  navigatorRef.serviceWorker.addEventListener('controllerchange', () => {
    reload();
  });
}
