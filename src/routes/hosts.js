// src/routes/hosts.js — hosts API (reads from managed_hosts table)

import { getManagedHosts } from '../services/hosts.js';

export default async function hostsRoutes(fastify) {
  const db = fastify.db;

  fastify.get('/api/hosts', async () => {
    const mapped = getManagedHosts(db);

    const groups = {};
    for (const host of mapped) {
      const g = host.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(host);
    }

    // If no managed hosts yet, fall back to SSH config import
    if (mapped.length === 0) {
      const { parseSSHConfig } = await import('../services/ssh-config.js');
      const sshHosts = parseSSHConfig();
      const sshGroups = {};
      for (const host of sshHosts) {
        const g = host.group || 'Other';
        if (!sshGroups[g]) sshGroups[g] = [];
        sshGroups[g].push(host);
      }
      return { hosts: sshHosts, groups: sshGroups, count: sshHosts.length, source: 'ssh-config' };
    }

    return { hosts: mapped, groups, count: mapped.length, source: 'managed' };
  });
}
