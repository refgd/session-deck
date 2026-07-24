import { DEFAULT_HOST } from './constants.js';

export function paneSessionKey(host, session, defaultHost = DEFAULT_HOST) {
  if (!session) return null;
  return `${host || defaultHost}:${session}`;
}
