export function defaultHostForm() {
  return {
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
  };
}

export function hostFormFromHost(host = {}) {
  return {
    name: host.name || '',
    hostname: host.hostname || '',
    user: host.user || '',
    port: host.port || 22,
    identity_file: host.identity_file || '',
    auth_method: host.auth_method || 'key',
    group_name: host.group_name || 'Other',
    enabled: !!host.enabled,
    connection_type: host.connection_type || (host.auth_method === 'docker' ? 'docker' : 'ssh'),
    docker_container: host.docker_container || '',
    gateway_host_id: host.gateway_host_id ? String(host.gateway_host_id) : '',
  };
}

export function hostFormForConnectionType(hostForm = {}, type = 'ssh') {
  const next = {
    ...defaultHostForm(),
    ...hostForm,
    connection_type: type,
  };

  if (type === 'docker') {
    return {
      ...next,
      group_name: 'Docker',
      user: '',
      port: 0,
      identity_file: '',
    };
  }

  return {
    ...next,
    port: next.port || 22,
    group_name: next.group_name === 'Docker' ? 'Other' : next.group_name,
  };
}

export function hostFormForDockerContainer(hostForm = {}, name = '') {
  const next = {
    ...defaultHostForm(),
    ...hostForm,
    docker_container: name,
    hostname: name,
  };

  if (!next.name.trim()) {
    next.name = name;
  }

  return next;
}

export function hostFormForGateway(hostForm = {}, value = '') {
  const next = {
    ...defaultHostForm(),
    ...hostForm,
    gateway_host_id: value,
  };

  if (next.connection_type !== 'docker') {
    return { form: next, shouldRefreshContainers: false };
  }

  return {
    form: {
      ...next,
      docker_container: '',
      hostname: '',
    },
    shouldRefreshContainers: true,
  };
}

export function hostAddress(host = {}) {
  const user = host.user ? `${host.user}@` : '';
  const hostname = host.hostname || '';
  const port = host.port && host.port !== 22 ? `:${host.port}` : '';
  return `${user}${hostname}${port}`;
}

export function canSaveHostForm(hostForm = {}) {
  if (!hostForm.name?.trim()) return false;
  if (hostForm.connection_type === 'docker') return !!hostForm.docker_container?.trim();
  return !!hostForm.hostname?.trim();
}

export function hostFormSaveError(hostForm = {}) {
  if (canSaveHostForm(hostForm)) return null;
  return hostForm.connection_type === 'docker'
    ? 'Name and container are required'
    : 'Name and hostname are required';
}

export function gatewayName(hosts = [], id) {
  return hosts.find(host => host.id === id)?.name || id;
}

export function diagnosticStepLabel(t, step = {}) {
  const key = `hostStep_${step.name}`;
  const translated = t(key);
  return translated === key ? (step.label || step.name || '') : translated;
}

export function diagnosticStepStatusLabel(t, status) {
  if (status === 'ok') return t('diagnosticOk');
  if (status === 'error') return t('diagnosticError');
  return status || t('unknown');
}

export function dockerListContextLabel(t, context = null) {
  if (!context) return '';
  if (context.scope === 'gateway') {
    const name = context.gatewayName || context.gatewayTarget || context.gatewayContainer || t('unknown');
    const type = String(context.gatewayType || '').toUpperCase();
    return `${t('dockerListViaGateway')}: ${type} ${name}`;
  }
  return t('dockerListLocal');
}

export function dockerPrivilegeWarning(t, hostForm = {}, hosts = []) {
  if (hostForm.connection_type !== 'docker') return '';
  if (!hostForm.gateway_host_id) return t('dockerSocketWarningLocal');

  const gateway = hosts.find(host => String(host.id) === String(hostForm.gateway_host_id));
  return t('dockerSocketWarningGateway', {
    name: gateway?.name || hostForm.gateway_host_id,
  });
}

export function dockerListErrorMessage(error = {}) {
  const context = error.payload?.context;
  const message = error.message || 'Failed to list Docker containers';
  if (!context) return message;
  if (context.scope === 'gateway') {
    return `${message} (${context.gatewayType || 'gateway'} gateway: ${context.gatewayName || context.gatewayTarget || context.gatewayContainer || 'unknown'})`;
  }
  return `${message} (local Docker)`;
}

export function dockerContainersLoadedState(result = {}) {
  return {
    containers: Array.isArray(result.containers) ? result.containers : [],
    context: result.context || null,
    error: null,
  };
}

export function dockerContainersFailedState(error = {}) {
  return {
    containers: [],
    context: error.payload?.context || null,
    error: dockerListErrorMessage(error),
  };
}

export function storedHostTestResult(host = {}) {
  if (host._testResult) return host._testResult;
  if (!host.last_test_status && host.tmux_available == null && !host.last_test_error) return null;

  return {
    status: host.last_test_status || 'unknown',
    tmuxAvailable: host.tmux_available === 1,
    os: host.last_test_os || null,
    osId: host.last_test_os_id || null,
    tmuxVersion: host.last_test_tmux_version || null,
    installCommand: host.last_test_install_command || null,
    error: host.last_test_error || null,
    durationMs: Number.isFinite(host.last_test_duration_ms) ? host.last_test_duration_ms : null,
    steps: parseStoredSteps(host.last_test_steps_json),
  };
}

export function hostWithTestResult(host = {}, result = {}) {
  return {
    ...host,
    last_test_status: result.status,
    last_test_at: new Date().toISOString(),
    tmux_available: result.tmuxAvailable ? 1 : 0,
    last_test_error: result.error || null,
    last_test_os: result.os || null,
    last_test_os_id: result.osId || null,
    last_test_tmux_version: result.tmuxVersion || null,
    last_test_install_command: result.installCommand || null,
    last_test_duration_ms: Number.isFinite(result.durationMs) ? result.durationMs : null,
    last_test_steps_json: Array.isArray(result.steps) ? JSON.stringify(result.steps) : null,
    _testResult: result,
  };
}

function parseStoredSteps(value) {
  if (!value) return [];
  try {
    const steps = JSON.parse(value);
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}
