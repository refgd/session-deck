export function sshTarget(host) {
  return host.user ? `${host.user}@${host.hostname}` : host.hostname;
}

export function sshBaseArgs(host, { timeoutMs = 5000, tty = false, sendEnv = false } = {}) {
  const args = [
    '-o', `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];

  if (sendEnv) args.push('-o', 'SendEnv=LANG LC_ALL');
  if (host.identityFile || host.identity_file) {
    args.push('-i', String(host.identityFile || host.identity_file).replace('~', process.env.HOME));
  }
  if (host.port && host.port !== 22) args.push('-p', String(host.port));

  const gateway = host.gatewayHost;
  if (gateway?.connectionType === 'ssh') {
    args.push('-o', `ProxyCommand=${sshProxyCommand(gateway)}`);
  }

  if (tty) args.push('-tt');
  return args;
}

export function sshCommand(host, command, options = {}) {
  const gateway = host.gatewayHost;
  const directArgs = [...sshBaseArgs(host, options), sshTarget(host), command];

  if (gateway?.connectionType === 'docker') {
    return {
      command: 'docker',
      args: [
        'exec',
        '-i',
        gateway.dockerContainer || gateway.hostname,
        'ssh',
        ...directArgs,
      ],
    };
  }

  return { command: 'ssh', args: directArgs };
}

export function terminalAttachCommand(host, sessionName) {
  const remoteCommand = `LANG=C.UTF-8 LC_ALL=C.UTF-8 tmux -u attach-session -t ${shellQuote(sessionName)}`;
  const gateway = host.gatewayHost;

  if (gateway?.connectionType === 'docker') {
    return {
      command: 'docker',
      args: [
        'exec',
        '-it',
        '-e', 'TERM=xterm-256color',
        '-e', 'LANG=C.UTF-8',
        '-e', 'LC_ALL=C.UTF-8',
        gateway.dockerContainer || gateway.hostname,
        'ssh',
        ...sshBaseArgs(host, { timeoutMs: 5000, tty: true, sendEnv: true }),
        sshTarget(host),
        remoteCommand,
      ],
    };
  }

  return {
    command: 'ssh',
    args: [
      ...sshBaseArgs(host, { timeoutMs: 5000, tty: true, sendEnv: true }),
      sshTarget(host),
      remoteCommand,
    ],
  };
}

export function dockerExecCommand(host, args, { interactive = false, execOptions = [] } = {}) {
  const container = host.dockerContainer || host.hostname;
  const gateway = host.gatewayHost;
  const dockerArgs = ['exec', ...(interactive ? ['-it'] : []), ...execOptions, container, ...args];

  if (gateway?.connectionType === 'ssh') {
    return {
      command: 'ssh',
      args: [...sshBaseArgs(gateway, { timeoutMs: 5000, tty: interactive }), sshTarget(gateway), shellJoin(['docker', ...dockerArgs])],
    };
  }

  if (gateway?.connectionType === 'docker') {
    return {
      command: 'docker',
      args: ['exec', ...(interactive ? ['-it'] : []), gateway.dockerContainer || gateway.hostname, 'docker', ...dockerArgs],
    };
  }

  return { command: 'docker', args: dockerArgs };
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

export function shellJoin(args) {
  return args.map(shellQuote).join(' ');
}

function sshProxyCommand(gateway) {
  const args = [
    'ssh',
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=accept-new',
  ];
  if (gateway.identityFile) args.push('-i', String(gateway.identityFile).replace('~', process.env.HOME));
  if (gateway.port && gateway.port !== 22) args.push('-p', String(gateway.port));
  args.push(sshTarget(gateway), '-W', '%h:%p');
  return shellJoin(args);
}
