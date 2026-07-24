import { mapManagedHost } from '../services/hosts.js';
import { getManagedHostRow } from './managed-host-store.js';

export function parseOptionalGatewayId(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw Object.assign(new Error('Invalid gateway host'), { statusCode: 400 });
  }
  return number;
}

export function resolveDockerListGateway(db, query = {}) {
  const gatewayId = parseOptionalGatewayId(query.gateway_host_id);
  if (!gatewayId) return null;

  const gateway = getManagedHostRow(db, gatewayId);
  if (!gateway) {
    throw Object.assign(new Error('Gateway host not found'), { statusCode: 404 });
  }
  return mapManagedHost(gateway);
}
