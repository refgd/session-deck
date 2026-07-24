import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSSHConfig } from '../src/services/ssh-config.js';

function withConfig(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'session-deck-ssh-'));
  const path = join(dir, 'config');
  writeFileSync(path, content);
  try {
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('parseSSHConfig returns implicit local host when config file is missing', () => {
  const hosts = parseSSHConfig('/tmp/session-deck-missing-ssh-config');
  assert.equal(hosts[0].name, 'reliant');
  assert.equal(hosts[0].hostname, '127.0.0.1');
  assert.equal(hosts[0].isLocal, true);
});

test('parseSSHConfig handles case-insensitive OpenSSH keywords', () => {
  withConfig(`
# --- VPS Hosts ---
hOsT web web-alias
  hostname 10.0.0.10
  USER root
  identityfile ~/.ssh/id_web
`, (path) => {
    const web = parseSSHConfig(path).find(host => host.name === 'web');
    assert.equal(web.hostname, '10.0.0.10');
    assert.equal(web.user, 'root');
    assert.equal(web.identityFile, '~/.ssh/id_web');
    assert.deepEqual(web.aliases, ['web-alias']);
    assert.equal(web.group, 'VPS');
  });
});

test('parseSSHConfig defaults hostname to primary Host alias when HostName is omitted', () => {
  withConfig(`
Host app
  User deploy
`, (path) => {
    const app = parseSSHConfig(path).find(host => host.name === 'app');
    assert.equal(app.hostname, 'app');
    assert.equal(app.user, 'deploy');
  });
});

test('parseSSHConfig skips wildcard hosts and does not duplicate local entries', () => {
  withConfig(`
Host *
  User ignored

Host localhost
  HostName localhost
`, (path) => {
    const hosts = parseSSHConfig(path);
    assert.equal(hosts.filter(host => host.isLocal).length, 1);
    assert.equal(hosts.some(host => host.name === '*'), false);
    assert.equal(hosts.some(host => host.name === 'reliant'), false);
  });
});
