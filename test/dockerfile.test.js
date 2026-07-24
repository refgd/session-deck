import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');

test('Dockerfile rebuilds and verifies native backend modules in the image', () => {
  assert.match(dockerfile, /npm_config_build_from_source=true npm_config_nodedir=\/usr\/local npm rebuild node-pty better-sqlite3/);
  assert.match(dockerfile, /require\('node-pty'\); require\('better-sqlite3'\);/);
});

test('Dockerfile keeps runtime tools needed by local, SSH, and Docker sessions', () => {
  assert.match(dockerfile, /apt-get install -y --no-install-recommends tmux openssh-client docker\.io curl/);
  assert.match(dockerfile, /mkdir -p \/root\/\.ssh && chmod 700 \/root\/\.ssh/);
});

test('Dockerfile exposes an HTTP health check for container orchestration', () => {
  assert.match(dockerfile, /HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3/);
  assert.match(dockerfile, /curl -fsS http:\/\/127\.0\.0\.1:\$\{SESSION_DECK_PORT:-7890\}\/api\/health/);
});
