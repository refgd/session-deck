import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import {
  apiError,
} from '../src/lib/api-error.js';
import {
  applyHttpsSecurityHeaders,
  corsOptionsFromConfig,
  helmetOptions,
  sameOriginWriteGuard,
  shouldUseHttpsSecurity,
  validateRequestOrigin,
  validateWriteOrigin,
} from '../src/lib/http-security.js';

test('corsOptionsFromConfig disables CORS when no origins are configured', () => {
  assert.deepEqual(corsOptionsFromConfig({ corsOrigins: [] }), { origin: false });
  assert.deepEqual(corsOptionsFromConfig({}), { origin: false });
});

test('corsOptionsFromConfig allows only configured origins', () => {
  assert.deepEqual(corsOptionsFromConfig({
    corsOrigins: ['http://localhost:5173', 'https://deck.example.com'],
  }), {
    origin: ['http://localhost:5173', 'https://deck.example.com'],
  });
});

test('helmetOptions enables a constrained CSP compatible with terminal websockets', () => {
  const options = helmetOptions();
  const directives = options.contentSecurityPolicy.directives;

  assert.deepEqual(directives.defaultSrc, ["'self'"]);
  assert.deepEqual(directives.scriptSrc, ["'self'"]);
  assert.deepEqual(directives.objectSrc, ["'none'"]);
  assert.deepEqual(directives.frameAncestors, ["'none'"]);
  assert.deepEqual(directives.connectSrc, ["'self'", 'ws:', 'wss:']);
  assert.equal(directives.upgradeInsecureRequests, null);
  assert.equal(options.crossOriginEmbedderPolicy, false);
  assert.equal(options.strictTransportSecurity, false);
});

test('helmetOptions does not upgrade HTTP deployments by default', async () => {
  const app = Fastify({ logger: false });
  await app.register(helmet, helmetOptions());
  app.get('/probe', async () => ({ ok: true }));

  try {
    const response = await app.inject('/probe');
    const csp = response.headers['content-security-policy'];

    assert.equal(response.statusCode, 200);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self' ws: wss:/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/);
    assert.equal(response.headers['strict-transport-security'], undefined);
  } finally {
    await app.close();
  }
});

test('helmetOptions sends HTTPS upgrade headers only when HTTPS mode is explicit', async () => {
  const app = Fastify({ logger: false });
  await app.register(helmet, helmetOptions({ https: true }));
  app.get('/probe', async () => ({ ok: true }));

  try {
    const response = await app.inject('/probe');

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-security-policy'], /upgrade-insecure-requests/);
    assert.match(response.headers['strict-transport-security'], /max-age=15552000/);
  } finally {
    await app.close();
  }
});

test('shouldUseHttpsSecurity supports explicit and automatic modes', () => {
  assert.equal(shouldUseHttpsSecurity({ protocol: 'http' }, { https: true }), true);
  assert.equal(shouldUseHttpsSecurity({ protocol: 'https' }, { https: false }), false);
  assert.equal(shouldUseHttpsSecurity({ protocol: 'http' }, { https: 'auto' }), false);
  assert.equal(shouldUseHttpsSecurity({ protocol: 'https' }, { https: 'auto' }), true);
});

test('applyHttpsSecurityHeaders upgrades only HTTPS responses in auto mode', async () => {
  async function build(protocol) {
    const app = Fastify({ logger: false });
    await app.register(helmet, helmetOptions({ https: 'auto' }));
    app.addHook('onRequest', async (request) => {
      Object.defineProperty(request, 'protocol', { value: protocol });
    });
    app.addHook('onSend', (request, reply, payload, done) => {
      applyHttpsSecurityHeaders(request, reply, { https: 'auto' });
      done();
    });
    app.get('/probe', async () => ({ ok: true }));
    return app;
  }

  const httpApp = await build('http');
  const httpsApp = await build('https');
  try {
    const httpResponse = await httpApp.inject('/probe');
    const httpsResponse = await httpsApp.inject('/probe');

    assert.equal(httpResponse.headers['strict-transport-security'], undefined);
    assert.doesNotMatch(httpResponse.headers['content-security-policy'], /upgrade-insecure-requests/);
    assert.match(httpsResponse.headers['strict-transport-security'], /max-age=15552000/);
    assert.match(httpsResponse.headers['content-security-policy'], /upgrade-insecure-requests/);
  } finally {
    await httpApp.close();
    await httpsApp.close();
  }
});

test('validateWriteOrigin allows safe methods and same-origin writes', () => {
  assert.equal(validateWriteOrigin({
    method: 'GET',
    headers: { origin: 'https://evil.example.com', host: 'deck.example.com' },
    protocol: 'https',
  }).ok, true);
  assert.equal(validateWriteOrigin({
    method: 'POST',
    headers: { host: 'deck.example.com' },
    protocol: 'https',
  }).ok, true);
  assert.equal(validateWriteOrigin({
    method: 'POST',
    headers: { origin: 'https://deck.example.com', host: 'deck.example.com' },
    protocol: 'https',
  }).ok, true);
});

test('validateWriteOrigin rejects cross-origin writes', () => {
  assert.deepEqual(validateWriteOrigin({
    method: 'DELETE',
    headers: { origin: 'https://evil.example.com', host: 'deck.example.com' },
    protocol: 'https',
  }), {
    ok: false,
    origin: 'https://evil.example.com',
    expectedOrigin: 'https://deck.example.com',
  });
});

test('validateRequestOrigin checks WebSocket-capable request origins', () => {
  assert.equal(validateRequestOrigin({
    headers: { host: 'deck.example.com' },
    protocol: 'https',
  }).ok, true);
  assert.equal(validateRequestOrigin({
    headers: { origin: 'https://deck.example.com', host: 'deck.example.com' },
    protocol: 'https',
  }).ok, true);
  assert.deepEqual(validateRequestOrigin({
    headers: { origin: 'https://evil.example.com', host: 'deck.example.com' },
    protocol: 'https',
  }), {
    ok: false,
    origin: 'https://evil.example.com',
    expectedOrigin: 'https://deck.example.com',
  });
});

test('validateRequestOrigin allows null origin only with same-origin referer', () => {
  assert.deepEqual(validateRequestOrigin({
    headers: {
      origin: 'null',
      referer: 'http://10.0.0.14:7890/auth/login',
      host: '10.0.0.14:7890',
    },
    protocol: 'http',
  }), {
    ok: true,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: 'http://10.0.0.14:7890',
    secFetchSite: null,
    path: '/',
  });

  assert.deepEqual(validateRequestOrigin({
    headers: {
      origin: 'null',
      'sec-fetch-site': 'same-origin',
      host: '10.0.0.14:7890',
    },
    protocol: 'http',
  }), {
    ok: true,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: null,
    secFetchSite: 'same-origin',
    path: '/',
  });

  assert.deepEqual(validateRequestOrigin({
    method: 'POST',
    url: '/auth/login',
    headers: {
      origin: 'null',
      host: '10.0.0.14:7890',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: 'sessionId=abc.def',
    },
    protocol: 'http',
  }), {
    ok: true,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: null,
    secFetchSite: null,
    path: '/auth/login',
  });

  assert.deepEqual(validateRequestOrigin({
    headers: {
      origin: 'null',
      referer: 'http://evil.example/auth/login',
      host: '10.0.0.14:7890',
    },
    protocol: 'http',
  }), {
    ok: false,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: 'http://evil.example',
    secFetchSite: null,
    path: '/',
  });

  assert.deepEqual(validateRequestOrigin({
    headers: {
      origin: 'null',
      'sec-fetch-site': 'cross-site',
      host: '10.0.0.14:7890',
    },
    protocol: 'http',
  }), {
    ok: false,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: null,
    secFetchSite: 'cross-site',
    path: '/',
  });

  assert.deepEqual(validateRequestOrigin({
    headers: {
      origin: 'null',
      host: '10.0.0.14:7890',
    },
    protocol: 'http',
  }), {
    ok: false,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: null,
    secFetchSite: null,
    path: '/',
  });

  assert.deepEqual(validateRequestOrigin({
    method: 'POST',
    url: '/api/settings',
    headers: {
      origin: 'null',
      host: '10.0.0.14:7890',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: 'sessionId=abc.def',
    },
    protocol: 'http',
  }), {
    ok: false,
    origin: 'null',
    expectedOrigin: 'http://10.0.0.14:7890',
    refererOrigin: null,
    secFetchSite: null,
    path: '/api/settings',
  });
});

test('CORS response headers are omitted by default', async () => {
  const app = await buildCorsServer({ corsOrigins: [] });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://evil.example.com' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  } finally {
    await app.close();
  }
});

test('CORS response headers allow only configured origins', async () => {
  const app = await buildCorsServer({ corsOrigins: ['https://deck.example.com'] });
  try {
    const allowed = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://deck.example.com' },
    });
    const blocked = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { origin: 'https://evil.example.com' },
    });

    assert.equal(allowed.headers['access-control-allow-origin'], 'https://deck.example.com');
    assert.equal(blocked.headers['access-control-allow-origin'], undefined);
  } finally {
    await app.close();
  }
});

test('sameOriginWriteGuard blocks cross-origin mutating requests', async () => {
  const app = Fastify({ logger: false });
  app.addHook('onRequest', sameOriginWriteGuard());
  app.post('/probe', async () => ({ ok: true }));

  try {
    const blocked = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: {
        host: 'deck.example.com',
        origin: 'https://evil.example.com',
      },
    });
    const allowed = await app.inject({
      method: 'POST',
      url: '/probe',
      headers: {
        host: 'deck.example.com',
        origin: 'http://deck.example.com',
      },
    });

    assert.equal(blocked.statusCode, 403);
    assert.deepEqual(blocked.json(), {
      error: 'Cross-origin write request blocked',
      message: 'Cross-origin write request blocked',
      statusCode: 403,
    });
    assert.equal(allowed.statusCode, 200);
  } finally {
    await app.close();
  }
});

test('Fastify framework errors can be normalized through apiError', async () => {
  const app = Fastify({ logger: false, bodyLimit: 16 });
  app.setErrorHandler((err, request, reply) => apiError(reply, err, err.statusCode || 500));
  app.post('/json', async (request) => ({ body: request.body }));

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/json',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 'x'.repeat(64) }),
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.json(), {
      error: 'Request body is too large',
      message: 'Request body is too large',
      statusCode: 413,
      code: 'FST_ERR_CTP_BODY_TOO_LARGE',
    });
  } finally {
    await app.close();
  }
});

async function buildCorsServer(config) {
  const app = Fastify({ logger: false });
  await app.register(cors, corsOptionsFromConfig(config));
  app.get('/probe', async () => ({ ok: true }));
  return app;
}
