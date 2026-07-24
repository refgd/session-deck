// src/services/ssh-config.js — Parse ~/.ssh/config into structured host entries

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { DEFAULT_HOST } from '../lib/constants.js';

/**
 * Default host group assignments. Comment headers in ssh config are used as hints,
 * but this mapping provides explicit control.
 */
const DEFAULT_GROUPS = {
  wayfarer: 'VPS',
  sirius: 'VPS',
  volcano: 'VPS',
  agamemnon: 'NAS',
  manticore: 'Proxmox',
  minotaur: 'Proxmox',
  hexapuma: 'HomeLab VM',
  'prince-adrian': 'HomeLab VM',
  'trevors-star': 'HomeLab LXC',
  cardones: 'HomeLab LXC',
  linnet: 'HomeLab LXC',
  unifi: 'Network',
  desktop: 'Client',
  laptop: 'Client',
};

/**
 * Parse an SSH config file into structured host entries.
 * @param {string} [configPath] — path to SSH config (default: ~/.ssh/config)
 * @returns {Array<object>} parsed host entries
 */
export function parseSSHConfig(configPath) {
  const filePath = configPath || join(homedir(), '.ssh', 'config');
  const content = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const lines = content.split('\n');

  const hosts = [];
  let currentHost = null;
  let currentGroupHint = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track comment section headers as group hints
    // e.g., "# --- VPS Hosts ---" → "VPS Hosts"
    const groupMatch = trimmed.match(/^#\s*---\s*(.+?)\s*---/);
    if (groupMatch) {
      currentGroupHint = groupMatch[1].trim();
      continue;
    }

    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;

    // Host line starts a new entry
    if (/^host\s+/i.test(trimmed)) {
      // Save previous host if exists
      if (currentHost) {
        hosts.push(finalizeHost(currentHost, currentGroupHint));
      }

      const aliases = trimmed.replace(/^host\s+/i, '').trim().split(/\s+/);

      // Skip wildcard entries
      if (aliases.includes('*')) {
        currentHost = null;
        continue;
      }

      // First non-IP alias is the primary name
      const primaryName = aliases.find(a => !isIP(a)) || aliases[0];
      currentHost = {
        name: primaryName,
        aliases: aliases.filter(a => a !== primaryName),
        hostname: null,
        user: null,
        identityFile: null,
        _groupHint: currentGroupHint,
      };
      continue;
    }

    // Indented config lines belong to current host
    if (currentHost && trimmed.includes(' ')) {
      const spaceIdx = trimmed.indexOf(' ');
      const key = trimmed.slice(0, spaceIdx).trim().toLowerCase();
      const value = trimmed.slice(spaceIdx + 1).trim();

      switch (key) {
        case 'hostname':
          currentHost.hostname = value;
          break;
        case 'user':
          currentHost.user = value;
          break;
        case 'identityfile':
          currentHost.identityFile = value;
          break;
      }
    }
  }

  // Don't forget the last host
  if (currentHost) {
    hosts.push(finalizeHost(currentHost, currentGroupHint));
  }

  // Add the default local host as an implicit host
  const hasLocalhost = hosts.some(h => h.isLocal);
  if (!hasLocalhost) {
    hosts.unshift({
      name: DEFAULT_HOST,
      aliases: ['localhost'],
      hostname: '127.0.0.1',
      user: 'claude',
      identityFile: null,
      group: 'Local',
      isLocal: true,
    });
  }

  return hosts;
}

function finalizeHost(host, _fallbackGroupHint) {
  const group = DEFAULT_GROUPS[host.name] || inferGroup(host._groupHint) || 'Other';
  const hostname = host.hostname || host.name;
  const { _groupHint, ...rest } = host;
  return {
    ...rest,
    hostname,
    group,
    isLocal: isLocalHost(host.name, hostname),
  };
}

function inferGroup(hint) {
  if (!hint) return null;
  // Strip trailing "s" for plurals: "VPS Hosts" → "VPS"
  return hint.replace(/\s*Hosts?\s*$/i, '').trim() || null;
}

function isIP(str) {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str);
}

function isLocalHost(name, hostname) {
  return [DEFAULT_HOST, 'localhost'].includes(name) ||
    ['127.0.0.1', 'localhost', '::1', '192.168.150.120'].includes(hostname);
}
