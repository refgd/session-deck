export function diagnosticStatusLabel(t, status) {
  const labels = {
    ok: t('diagnosticOk'),
    warning: t('diagnosticWarning'),
    error: t('diagnosticError'),
  };
  return labels[status] || status || t('unknown');
}

export function diagnosticChecks(report) {
  return report?.checks || [];
}

export function diagnosticDetailRows(t, check = {}) {
  const rows = [];
  if (check.path) rows.push([t('path'), check.path]);
  if (check.version) rows.push([t('version'), check.version]);
  if (Number.isFinite(check.hostCount)) rows.push([t('hosts'), check.hostCount]);
  if (Number.isFinite(check.enabledHostCount)) rows.push([t('enabledHosts'), check.enabledHostCount]);
  if (Number.isFinite(check.keyCount)) rows.push([t('sshKeys'), check.keyCount]);
  if (Number.isFinite(check.referencedKeyCount)) rows.push([t('referencedKeys'), check.referencedKeyCount]);
  if (Number.isFinite(check.total)) rows.push([t('total'), check.total]);
  if (Number.isFinite(check.enabled)) rows.push([t('enabled'), check.enabled]);
  if (Number.isFinite(check.dockerHosts)) rows.push([t('dockerHosts'), check.dockerHosts]);
  if (Number.isFinite(check.dockerDirectHosts)) rows.push([t('dockerDirectHosts'), check.dockerDirectHosts]);
  if (Number.isFinite(check.dockerGatewayHosts)) rows.push([t('dockerGatewayHosts'), check.dockerGatewayHosts]);
  if (Number.isFinite(check.eventCount)) rows.push([t('auditEvents'), check.eventCount]);
  if (Number.isFinite(check.corsOriginCount)) rows.push([t('corsOrigins'), check.corsOriginCount]);
  if (check.httpsMode !== undefined) rows.push([t('httpsMode'), String(check.httpsMode)]);
  if (typeof check.secureCookies === 'boolean') rows.push([t('secureCookies'), check.secureCookies ? t('yes') : t('no')]);
  if (typeof check.trustProxy === 'boolean') rows.push([t('trustProxy'), check.trustProxy ? t('yes') : t('no')]);
  return rows;
}

export function diagnosticIssueRows(t, check = {}) {
  const issues = [];
  for (const event of check.recentEvents || []) {
    const target = event.targetName || event.targetId || event.targetType || t('unknown');
    const actor = event.actor || t('unknown');
    const status = event.status || t('unknown');
    const error = event.error ? `: ${event.error}` : '';
    issues.push(`${t('recentAuditEvent')}: ${event.action || t('unknown')} ${target} (${actor}, ${status})${error}`);
  }
  for (const key of ['missingKeys', 'gatewayMissing', 'gatewayCycles', 'enabledWithoutIdentity', 'securityWarnings']) {
    for (const issue of check[key] || []) {
      if (key === 'securityWarnings') {
        issues.push(`${t(issue.id || key)}: ${issue.message || t('unknown')}`);
        continue;
      }
      if (key === 'gatewayCycles') {
        const names = issue.names || [];
        const cycle = names.length ? `${names.join(' -> ')} -> ${names[0]}` : issue.ids?.join(' -> ');
        issues.push(`${t(key)}: ${cycle || t('unknown')}`);
        continue;
      }
      const label = issue.identity_file || issue.gatewayHostId || issue.name || issue.id;
      issues.push(`${t(key)}: ${issue.name || issue.id}${label && label !== issue.name ? ` (${label})` : ''}`);
    }
  }
  return issues;
}
