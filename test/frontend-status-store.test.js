import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPaneStatus,
  getWorstStatus,
  requestNotificationPermission,
  setViewingPanes,
  startStatusConnection,
  stopStatusConnection,
  subscribeStatus,
} from '../frontend/src/lib/stores/status.js';

test('stopStatusConnection clears pending reconnect timers after socket close', () => {
  const env = installStatusStoreEnv();

  try {
    startStatusConnection();
    const firstSocket = env.sockets[0];
    firstSocket.onclose();

    assert.equal(env.timers.length, 1);

    stopStatusConnection();

    assert.deepEqual(env.clearedTimers, [env.timers[0]]);
    assert.equal(firstSocket.closeCount, 0);

    env.runTimer(env.timers[0]);
    assert.equal(env.sockets.length, 1);
  } finally {
    stopStatusConnection();
    env.restore();
  }
});

test('status reconnect timer creates one replacement socket and is then inactive', () => {
  const env = installStatusStoreEnv();

  try {
    startStatusConnection();
    const firstSocket = env.sockets[0];
    firstSocket.onclose();
    env.runTimer(env.timers[0]);

    assert.equal(env.sockets.length, 2);
    assert.equal(env.timers.length, 1);

    const secondSocket = env.sockets[1];
    secondSocket.onopen();

    env.runTimer(env.timers[0]);
    assert.equal(env.sockets.length, 2);
  } finally {
    stopStatusConnection();
    env.restore();
  }
});

test('status store normalizes pane keys with the default host', () => {
  const env = installStatusStoreEnv();
  const snapshots = [];
  const unsubscribe = subscribeStatus(snapshot => snapshots.push(snapshot));

  try {
    startStatusConnection();
    const socket = env.sockets[0];

    socket.onmessage({
      data: JSON.stringify({
        type: 'snapshot',
        panes: [
          { session: 'main', status: 'idle', prevStatus: null, confidence: 1, lastTransition: 100 },
          { host: 'vps', session: 'main', status: 'asking', prevStatus: 'working', confidence: 0.9, lastTransition: 200 },
          { host: 'vps', session: '', status: 'error', prevStatus: null, confidence: 1, lastTransition: 300 },
        ],
      }),
    });

    assert.equal(getPaneStatus(undefined, 'main')?.status, 'idle');
    assert.equal(getPaneStatus('vps', 'main')?.status, 'asking');
    assert.equal(getPaneStatus('vps', ''), null);
    assert.equal(getWorstStatus([{ session: 'main' }, { host: 'vps', session: 'main' }]), 'asking');
    assert.equal(Object.hasOwn(snapshots.at(-1), 'reliant:main'), true);
    assert.equal(Object.hasOwn(snapshots.at(-1), 'vps:'), false);
  } finally {
    unsubscribe();
    stopStatusConnection();
    env.restore();
  }
});

test('status notifications treat panes without a host as the default host', () => {
  const env = installStatusStoreEnv();
  const notifications = [];

  global.Notification = class FakeNotification {
    static permission = 'granted';

    constructor(title, options) {
      notifications.push({ title, options });
    }

    close() {}
  };

  try {
    requestNotificationPermission();
    setViewingPanes([{ session: 'notify-default' }]);
    startStatusConnection();
    const socket = env.sockets[0];

    socket.onmessage({
      data: JSON.stringify({
        type: 'status',
        session: 'notify-default',
        status: 'asking',
        prevStatus: 'working',
        confidence: 1,
        timestamp: 100,
      }),
    });

    socket.onmessage({
      data: JSON.stringify({
        type: 'status',
        host: 'vps',
        session: 'notify-remote',
        status: 'asking',
        prevStatus: 'working',
        confidence: 1,
        timestamp: 200,
      }),
    });

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].options.body, 'notify-remote@vps needs attention');
  } finally {
    setViewingPanes([]);
    delete global.Notification;
    stopStatusConnection();
    env.restore();
  }
});

function installStatusStoreEnv() {
  const previousWindow = global.window;
  const previousWebSocket = global.WebSocket;
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const previousNotification = global.Notification;
  const sockets = [];
  const timers = [];
  const clearedTimers = [];

  global.window = {
    location: {
      protocol: 'http:',
      host: 'localhost:7890',
    },
  };
  global.WebSocket = class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      this.closeCount = 0;
      sockets.push(this);
    }

    close() {
      this.closeCount += 1;
      this.readyState = 3;
    }
  };
  global.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = (timer) => {
    if (timer) timer.cancelled = true;
    clearedTimers.push(timer);
  };

  return {
    sockets,
    timers,
    clearedTimers,
    runTimer(timer) {
      if (!timer.cancelled) timer.fn();
    },
    restore() {
      global.window = previousWindow;
      global.WebSocket = previousWebSocket;
      global.setTimeout = previousSetTimeout;
      global.clearTimeout = previousClearTimeout;
      global.Notification = previousNotification;
    },
  };
}
