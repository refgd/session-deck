import { redactPath, redactPathsInText } from './path-redaction.js';

export const MAX_AUDIT_DETAILS_BYTES = 4096;
export const DEFAULT_MAX_AUDIT_EVENTS = 1000;

const SENSITIVE_KEYS = new Set([
  'password',
  'confirmPassword',
  'privateKey',
  'publicKey',
  'private_key',
  'public_key',
  'password_hash',
]);

const PATH_KEYS = new Set([
  'path',
  'identity_file',
  'identityFile',
]);

export function auditActor(request = {}) {
  return request.session?.user?.name || null;
}

export function recordAuditEvent(db, {
  request = null,
  action,
  targetType = null,
  targetId = null,
  targetName = null,
  status = 'ok',
  details = null,
  error = null,
  maxEvents = DEFAULT_MAX_AUDIT_EVENTS,
} = {}) {
  if (!db || !action) return null;
  try {
    const result = db.prepare(`
      INSERT INTO audit_events (
        actor, action, target_type, target_id, target_name, status,
        details_json, error, ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      request ? auditActor(request) : null,
      action,
      targetType,
      targetId == null ? null : String(targetId),
      targetName,
      status || 'ok',
      serializeAuditDetails(details),
      sanitizeAuditError(error),
      request ? request.ip || request.socket?.remoteAddress || null : null,
    );
    pruneAuditEvents(db, maxEvents);
    return result.lastInsertRowid;
  } catch {
    return null;
  }
}

export function sanitizeAuditError(error) {
  if (!error) return null;
  return redactPathsInText(String(error)).slice(0, 500);
}

export function listRecentAuditEvents(db, limit = 20) {
  const size = Math.max(1, Math.min(100, Number(limit) || 20));
  return db.prepare(`
    SELECT id, actor, action, target_type, target_id, target_name, status,
           details_json, error, ip, created_at
    FROM audit_events
    ORDER BY id DESC
    LIMIT ?
  `).all(size).map(row => ({
    ...row,
    details: parseAuditDetails(row.details_json),
    details_json: undefined,
  }));
}

export function countAuditEvents(db) {
  return db.prepare('SELECT COUNT(*) as count FROM audit_events').get().count;
}

export function pruneAuditEvents(db, maxEvents = DEFAULT_MAX_AUDIT_EVENTS) {
  const keep = Math.max(1, Number(maxEvents) || DEFAULT_MAX_AUDIT_EVENTS);
  db.prepare(`
    DELETE FROM audit_events
    WHERE id NOT IN (
      SELECT id FROM audit_events
      ORDER BY id DESC
      LIMIT ?
    )
  `).run(keep);
}

export function sanitizeAuditDetails(value) {
  if (value == null || typeof value !== 'object') return value ?? null;
  if (Array.isArray(value)) return value.map(item => sanitizeAuditDetails(item));
  const out = {};
  for (const [key, detail] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) {
      out[key] = '[redacted]';
    } else if (PATH_KEYS.has(key) && typeof detail === 'string') {
      out[key] = redactPath(detail);
    } else {
      out[key] = sanitizeAuditDetails(detail);
    }
  }
  return out;
}

function serializeAuditDetails(details) {
  if (details == null) return null;
  const json = JSON.stringify(sanitizeAuditDetails(details));
  if (Buffer.byteLength(json, 'utf8') <= MAX_AUDIT_DETAILS_BYTES) return json;
  return JSON.stringify({ truncated: true });
}

function parseAuditDetails(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
