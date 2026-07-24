let _toasts = [];
let _listeners = [];
let _nextId = 0;
const _timers = new Map();

function notify() {
  const snapshot = _toasts.map(toast => ({ ...toast }));
  _listeners.forEach(fn => fn(snapshot));
}

export function subscribeToasts(fn) {
  _listeners.push(fn);
  fn(_toasts.map(toast => ({ ...toast })));
  return () => {
    _listeners = _listeners.filter(listener => listener !== fn);
  };
}

export function showToast(message, type = 'info') {
  const id = ++_nextId;
  const toast = { id, message, type };
  _toasts = [..._toasts, toast];
  notify();

  const duration = type === 'error' ? 8000 : 3000;
  const timer = setTimeout(() => dismissToast(id), duration);
  _timers.set(id, timer);
  return id;
}

export function dismissToast(id) {
  const timer = _timers.get(id);
  if (timer) {
    clearTimeout(timer);
    _timers.delete(id);
  }
  const next = _toasts.filter(toast => toast.id !== id);
  if (next.length === _toasts.length) return;
  _toasts = next;
  notify();
}

export function clearToasts() {
  for (const timer of _timers.values()) clearTimeout(timer);
  _timers.clear();
  if (_toasts.length === 0) return;
  _toasts = [];
  notify();
}

export function resetToastStoreForTest() {
  clearToasts();
  _listeners = [];
  _nextId = 0;
}
