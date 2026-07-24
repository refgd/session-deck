import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnosticChecks,
  diagnosticDetailRows,
  diagnosticIssueRows,
  diagnosticStatusLabel,
} from '../frontend/src/lib/diagnostics-utils.js';

function t(key) {
  return {
    diagnosticOk: 'OK',
    diagnosticWarning: 'Warning',
    diagnosticError: 'Error',
    unknown: 'Unknown',
    path: 'Path',
    version: 'Version',
    hosts: 'Hosts',
    enabledHosts: 'Enabled hosts',
    sshKeys: 'SSH keys',
    referencedKeys: 'Referenced keys',
    total: 'Total',
    enabled: 'Enabled',
    dockerHosts: 'Docker hosts',
    dockerDirectHosts: 'Direct Docker hosts',
    dockerGatewayHosts: 'Docker hosts via gateway',
    auditEvents: 'Audit events',
    recentAuditEvent: 'Recent audit event',
    corsOrigins: 'CORS origins',
    httpsMode: 'HTTPS mode',
    secureCookies: 'Secure cookies',
    trustProxy: 'Trust proxy',
    yes: 'Yes',
    no: 'No',
    missingKeys: 'Missing key',
    gatewayMissing: 'Missing gateway',
    gatewayCycles: 'Gateway cycle',
    enabledWithoutIdentity: 'No key selected',
    insecureCookies: 'Insecure cookies',
    dockerSocket: 'Docker socket access',
    dockerTcpEndpoint: 'Docker TCP endpoint',
  }[key] || key;
}

test('diagnosticStatusLabel maps known statuses and falls back cleanly', () => {
  assert.equal(diagnosticStatusLabel(t, 'ok'), 'OK');
  assert.equal(diagnosticStatusLabel(t, 'warning'), 'Warning');
  assert.equal(diagnosticStatusLabel(t, 'error'), 'Error');
  assert.equal(diagnosticStatusLabel(t, 'custom'), 'custom');
  assert.equal(diagnosticStatusLabel(t, ''), 'Unknown');
});

test('diagnosticChecks tolerates missing reports', () => {
  assert.deepEqual(diagnosticChecks(null), []);
  assert.deepEqual(diagnosticChecks({ checks: [{ name: 'database' }] }), [{ name: 'database' }]);
});

test('diagnosticDetailRows includes finite zero values', () => {
  assert.deepEqual(diagnosticDetailRows(t, {
    path: '~/.../config',
    version: 'tmux 3.4',
    hostCount: 0,
    enabledHostCount: 0,
    keyCount: 2,
    referencedKeyCount: 0,
    total: 3,
    enabled: 1,
    dockerHosts: 0,
    dockerDirectHosts: 0,
    dockerGatewayHosts: 0,
    eventCount: 7,
    corsOriginCount: 1,
    httpsMode: 'auto',
    secureCookies: false,
    trustProxy: true,
  }), [
    ['Path', '~/.../config'],
    ['Version', 'tmux 3.4'],
    ['Hosts', 0],
    ['Enabled hosts', 0],
    ['SSH keys', 2],
    ['Referenced keys', 0],
    ['Total', 3],
    ['Enabled', 1],
    ['Docker hosts', 0],
    ['Direct Docker hosts', 0],
    ['Docker hosts via gateway', 0],
    ['Audit events', 7],
    ['CORS origins', 1],
    ['HTTPS mode', 'auto'],
    ['Secure cookies', 'No'],
    ['Trust proxy', 'Yes'],
  ]);
});

test('diagnosticIssueRows formats key, gateway, and identity issues', () => {
  assert.deepEqual(diagnosticIssueRows(t, {
    recentEvents: [
      { action: 'session.create', targetName: 'main', actor: 'admin', status: 'ok' },
      { action: 'managed_host.test', targetName: 'box', actor: null, status: 'error', error: 'timeout' },
    ],
    missingKeys: [{ name: 'app', identity_file: '~/.../app' }],
    gatewayMissing: [{ name: 'worker', gatewayHostId: 9 }],
    gatewayCycles: [{ names: ['app', 'jump'], ids: [1, 2] }],
    enabledWithoutIdentity: [{ id: 3, name: 'jump' }],
    securityWarnings: [
      { id: 'insecureCookies', message: 'Set SESSION_DECK_HTTPS=true' },
      { id: 'dockerSocket', path: '/.../docker.sock', message: 'Docker socket access at /.../docker.sock gives authenticated users control' },
      { id: 'dockerTcpEndpoint', endpoint: 'docker.example:2375', message: 'Docker TCP endpoint docker.example:2375 is configured without TLS verification' },
    ],
  }), [
    'Recent audit event: session.create main (admin, ok)',
    'Recent audit event: managed_host.test box (Unknown, error): timeout',
    'Missing key: app (~/.../app)',
    'Missing gateway: worker (9)',
    'Gateway cycle: app -> jump -> app',
    'No key selected: jump',
    'Insecure cookies: Set SESSION_DECK_HTTPS=true',
    'Docker socket access: Docker socket access at /.../docker.sock gives authenticated users control',
    'Docker TCP endpoint: Docker TCP endpoint docker.example:2375 is configured without TLS verification',
  ]);
});
