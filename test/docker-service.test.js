import test from 'node:test';
import assert from 'node:assert/strict';
import { dockerListContext, MAX_DOCKER_CONTAINERS, parseDockerPsOutput } from '../src/services/docker.js';

test('parseDockerPsOutput parses docker ps tabular output', () => {
  assert.deepEqual(parseDockerPsOutput([
    'abc123\tapp\tapp:latest\tUp 2 minutes',
    'def456\tworker\tworker:v1\tUp 1 hour',
  ].join('\n')), [
    { id: 'abc123', name: 'app', image: 'app:latest', status: 'Up 2 minutes' },
    { id: 'def456', name: 'worker', image: 'worker:v1', status: 'Up 1 hour' },
  ]);
});

test('parseDockerPsOutput skips empty and malformed rows', () => {
  assert.deepEqual(parseDockerPsOutput('\nmissing-name-only\nabc123\tapp\n'), [
    { id: 'abc123', name: 'app', image: '', status: '' },
  ]);
});

test('parseDockerPsOutput caps returned containers', () => {
  const output = Array.from({ length: MAX_DOCKER_CONTAINERS + 5 }, (_, index) => (
    `id-${index}\tcontainer-${index}\timage-${index}\tUp`
  )).join('\n');

  const containers = parseDockerPsOutput(output);

  assert.equal(containers.length, MAX_DOCKER_CONTAINERS);
  assert.equal(containers.at(-1).name, `container-${MAX_DOCKER_CONTAINERS - 1}`);
  assert.equal(parseDockerPsOutput(output, 3).length, 3);
});

test('dockerListContext describes local and gateway Docker discovery without sensitive args', () => {
  assert.deepEqual(dockerListContext(), {
    scope: 'local',
    operation: 'docker ps',
  });

  assert.deepEqual(dockerListContext({
    name: 'jump',
    connectionType: 'ssh',
    hostname: 'jump.internal',
    user: 'ops',
    identityFile: '/keys/private',
  }), {
    scope: 'gateway',
    gatewayType: 'ssh',
    gatewayName: 'jump',
    gatewayTarget: 'ops@jump.internal',
    operation: 'docker ps',
  });

  assert.deepEqual(dockerListContext({
    name: 'docker-jump',
    connectionType: 'docker',
    hostname: 'gateway-container',
    dockerContainer: 'gateway-container',
  }), {
    scope: 'gateway',
    gatewayType: 'docker',
    gatewayName: 'docker-jump',
    gatewayContainer: 'gateway-container',
    operation: 'docker ps',
  });
});
