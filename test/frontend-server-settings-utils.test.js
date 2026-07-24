import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canSaveHostForm,
  defaultHostForm,
  diagnosticStepLabel,
  diagnosticStepStatusLabel,
  dockerContainersFailedState,
  dockerContainersLoadedState,
  dockerListContextLabel,
  dockerListErrorMessage,
  dockerPrivilegeWarning,
  gatewayName,
  hostAddress,
  hostFormForConnectionType,
  hostFormForDockerContainer,
  hostFormForGateway,
  hostFormFromHost,
  hostFormSaveError,
  hostWithTestResult,
  storedHostTestResult,
} from '../frontend/src/lib/server-settings-utils.js';

function t(key) {
  const messages = {
    diagnosticOk: 'OK',
    diagnosticError: 'Error',
    unknown: 'Unknown',
    hostStep_ssh: 'SSH connection',
    dockerListLocal: 'Listing local Docker containers',
    dockerListViaGateway: 'Listing Docker containers through gateway',
    dockerSocketWarningLocal: 'Local Docker warning',
    dockerSocketWarningGateway: 'Gateway Docker warning for {name}',
  };
  let message = messages[key] || key;
  for (const [name, value] of Object.entries(arguments[1] || {})) {
    message = message.replace(`{${name}}`, value);
  }
  return message;
}

test('hostAddress formats SSH hosts and omits the default port', () => {
  assert.equal(hostAddress({ user: 'root', hostname: 'app.internal', port: 22 }), 'root@app.internal');
  assert.equal(hostAddress({ hostname: 'app.internal', port: 2200 }), 'app.internal:2200');
  assert.equal(hostAddress({ hostname: 'container' }), 'container');
});

test('canSaveHostForm validates SSH and Docker host requirements', () => {
  assert.equal(canSaveHostForm({ name: 'app', connection_type: 'ssh', hostname: '10.0.0.2' }), true);
  assert.equal(canSaveHostForm({ name: 'app', connection_type: 'ssh', hostname: '   ' }), false);
  assert.equal(canSaveHostForm({ name: 'app', connection_type: 'docker', docker_container: 'sessiondeck' }), true);
  assert.equal(canSaveHostForm({ name: 'app', connection_type: 'docker', docker_container: '' }), false);
  assert.equal(canSaveHostForm({ name: '   ', connection_type: 'docker', docker_container: 'sessiondeck' }), false);
});

test('defaultHostForm returns the add-host defaults', () => {
  assert.deepEqual(defaultHostForm(), {
    name: '',
    hostname: '',
    user: '',
    port: 22,
    identity_file: '',
    auth_method: 'key',
    group_name: 'Other',
    enabled: true,
    connection_type: 'ssh',
    docker_container: '',
    gateway_host_id: '',
  });
});

test('hostFormFromHost normalizes persisted host rows for editing', () => {
  assert.deepEqual(hostFormFromHost({
    id: 7,
    name: 'container',
    hostname: 'sessiondeck',
    user: null,
    port: 0,
    identity_file: null,
    auth_method: 'docker',
    group_name: null,
    enabled: 1,
    docker_container: 'sessiondeck',
    gateway_host_id: 4,
  }), {
    name: 'container',
    hostname: 'sessiondeck',
    user: '',
    port: 22,
    identity_file: '',
    auth_method: 'docker',
    group_name: 'Other',
    enabled: true,
    connection_type: 'docker',
    docker_container: 'sessiondeck',
    gateway_host_id: '4',
  });

  assert.equal(hostFormFromHost({ auth_method: 'key', enabled: 0 }).connection_type, 'ssh');
});

test('hostFormForConnectionType applies SSH and Docker field defaults', () => {
  const docker = hostFormForConnectionType({
    ...defaultHostForm(),
    name: 'box',
    hostname: '10.0.0.2',
    user: 'root',
    identity_file: '/tmp/key',
    group_name: 'Other',
  }, 'docker');

  assert.equal(docker.connection_type, 'docker');
  assert.equal(docker.group_name, 'Docker');
  assert.equal(docker.user, '');
  assert.equal(docker.port, 0);
  assert.equal(docker.identity_file, '');

  const ssh = hostFormForConnectionType({ ...docker, group_name: 'Docker', port: 0 }, 'ssh');
  assert.equal(ssh.connection_type, 'ssh');
  assert.equal(ssh.group_name, 'Other');
  assert.equal(ssh.port, 22);
});

test('hostFormForGateway resets Docker container selection and flags refresh only for Docker', () => {
  const docker = hostFormForGateway({
    ...defaultHostForm(),
    connection_type: 'docker',
    hostname: 'old',
    docker_container: 'old',
  }, '9');

  assert.equal(docker.shouldRefreshContainers, true);
  assert.equal(docker.form.gateway_host_id, '9');
  assert.equal(docker.form.hostname, '');
  assert.equal(docker.form.docker_container, '');

  const ssh = hostFormForGateway({
    ...defaultHostForm(),
    hostname: '10.0.0.2',
  }, '9');

  assert.equal(ssh.shouldRefreshContainers, false);
  assert.equal(ssh.form.hostname, '10.0.0.2');
});

test('hostFormForDockerContainer fills target fields and only auto-names blank forms', () => {
  assert.deepEqual(hostFormForDockerContainer({
    ...defaultHostForm(),
    name: '',
  }, 'sessiondeck'), {
    ...defaultHostForm(),
    name: 'sessiondeck',
    hostname: 'sessiondeck',
    docker_container: 'sessiondeck',
  });

  assert.equal(hostFormForDockerContainer({
    ...defaultHostForm(),
    name: 'custom',
  }, 'sessiondeck').name, 'custom');
});

test('hostFormSaveError returns user-facing validation messages', () => {
  assert.equal(hostFormSaveError({ name: 'app', connection_type: 'ssh', hostname: '10.0.0.2' }), null);
  assert.equal(hostFormSaveError({ name: '', connection_type: 'ssh', hostname: '10.0.0.2' }), 'Name and hostname are required');
  assert.equal(hostFormSaveError({ name: 'app', connection_type: 'docker', docker_container: '' }), 'Name and container are required');
});

test('gatewayName resolves known gateways and falls back to the id', () => {
  assert.equal(gatewayName([{ id: 1, name: 'jump' }], 1), 'jump');
  assert.equal(gatewayName([{ id: 1, name: 'jump' }], 9), 9);
});

test('diagnostic step labels prefer translations and fall back to backend labels', () => {
  assert.equal(diagnosticStepLabel(t, { name: 'ssh', label: 'Backend SSH' }), 'SSH connection');
  assert.equal(diagnosticStepLabel(t, { name: 'custom', label: 'Custom step' }), 'Custom step');
  assert.equal(diagnosticStepLabel(t, { name: 'custom' }), 'custom');
});

test('diagnostic step status labels translate known statuses', () => {
  assert.equal(diagnosticStepStatusLabel(t, 'ok'), 'OK');
  assert.equal(diagnosticStepStatusLabel(t, 'error'), 'Error');
  assert.equal(diagnosticStepStatusLabel(t, 'skipped'), 'skipped');
  assert.equal(diagnosticStepStatusLabel(t, ''), 'Unknown');
});

test('docker list labels describe local and gateway discovery contexts', () => {
  assert.equal(dockerListContextLabel(t, null), '');
  assert.equal(
    dockerListContextLabel(t, { scope: 'local', operation: 'docker ps' }),
    'Listing local Docker containers'
  );
  assert.equal(
    dockerListContextLabel(t, { scope: 'gateway', gatewayType: 'ssh', gatewayName: 'jump' }),
    'Listing Docker containers through gateway: SSH jump'
  );
  assert.equal(
    dockerListContextLabel(t, { scope: 'gateway', gatewayType: 'docker', gatewayContainer: 'gw' }),
    'Listing Docker containers through gateway: DOCKER gw'
  );
});

test('docker privilege warning appears only for Docker hosts and includes gateway names', () => {
  assert.equal(
    dockerPrivilegeWarning(t, { connection_type: 'ssh' }, []),
    ''
  );
  assert.equal(
    dockerPrivilegeWarning(t, { connection_type: 'docker', gateway_host_id: '' }, []),
    'Local Docker warning'
  );
  assert.equal(
    dockerPrivilegeWarning(t, { connection_type: 'docker', gateway_host_id: '7' }, [{ id: 7, name: 'jump' }]),
    'Gateway Docker warning for jump'
  );
  assert.equal(
    dockerPrivilegeWarning(t, { connection_type: 'docker', gateway_host_id: '9' }, []),
    'Gateway Docker warning for 9'
  );
});

test('docker list errors include discovery context without requiring component state', () => {
  assert.equal(
    dockerListErrorMessage(new Error('docker unavailable')),
    'docker unavailable'
  );

  const localError = new Error('Cannot connect to Docker');
  localError.payload = { context: { scope: 'local' } };
  assert.equal(dockerListErrorMessage(localError), 'Cannot connect to Docker (local Docker)');

  const gatewayError = new Error('Permission denied');
  gatewayError.payload = {
    context: { scope: 'gateway', gatewayType: 'ssh', gatewayName: 'jump' },
  };
  assert.equal(dockerListErrorMessage(gatewayError), 'Permission denied (ssh gateway: jump)');
});

test('docker container load state helpers normalize success and failure shapes', () => {
  assert.deepEqual(dockerContainersLoadedState({
    containers: [{ name: 'app' }],
    context: { scope: 'local' },
  }), {
    containers: [{ name: 'app' }],
    context: { scope: 'local' },
    error: null,
  });
  assert.deepEqual(dockerContainersLoadedState({ containers: null }), {
    containers: [],
    context: null,
    error: null,
  });

  const error = new Error('Docker denied');
  error.payload = { context: { scope: 'gateway', gatewayType: 'ssh', gatewayName: 'jump' } };
  assert.deepEqual(dockerContainersFailedState(error), {
    containers: [],
    context: { scope: 'gateway', gatewayType: 'ssh', gatewayName: 'jump' },
    error: 'Docker denied (ssh gateway: jump)',
  });
});

test('storedHostTestResult reconstructs persisted host diagnostics', () => {
  const result = storedHostTestResult({
    last_test_status: 'error',
    tmux_available: 0,
    last_test_error: 'Permission denied',
    last_test_os: 'Debian',
    last_test_os_id: 'debian',
    last_test_install_command: 'sudo apt-get install -y tmux',
    last_test_duration_ms: 123,
    last_test_steps_json: JSON.stringify([{ name: 'ssh', status: 'error' }]),
  });

  assert.deepEqual(result, {
    status: 'error',
    tmuxAvailable: false,
    os: 'Debian',
    osId: 'debian',
    tmuxVersion: null,
    installCommand: 'sudo apt-get install -y tmux',
    error: 'Permission denied',
    durationMs: 123,
    steps: [{ name: 'ssh', status: 'error' }],
  });
  assert.equal(storedHostTestResult({}), null);
  assert.deepEqual(storedHostTestResult({ last_test_status: 'ok', last_test_steps_json: '{bad' }).steps, []);
});

test('hostWithTestResult mirrors transient diagnostics onto persisted fields', () => {
  const host = hostWithTestResult({ id: 1, name: 'box' }, {
    status: 'ok',
    tmuxAvailable: true,
    tmuxVersion: 'tmux 3.4',
    durationMs: 12,
    steps: [{ name: 'tmux', status: 'ok' }],
  });

  assert.equal(host.tmux_available, 1);
  assert.equal(host.last_test_tmux_version, 'tmux 3.4');
  assert.equal(host.last_test_duration_ms, 12);
  assert.deepEqual(JSON.parse(host.last_test_steps_json), [{ name: 'tmux', status: 'ok' }]);
  assert.equal(host._testResult.status, 'ok');
});
