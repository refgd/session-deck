import { redactPath, redactPathsInText } from './path-redaction.js';

export function errorPayload(errOrMessage, statusCode = 500, extra = {}) {
  const err = typeof errOrMessage === 'string' ? new Error(errOrMessage) : errOrMessage;
  const message = redactPathsInText(err?.message || 'Request failed');
  const payload = {
    error: message,
    message,
    statusCode,
    ...redactDiagnosticValue(extra),
  };

  for (const key of ['code', 'syscall', 'errno', 'signal', 'killed']) {
    if (err?.[key] !== undefined) payload[key] = err[key];
  }

  if (err?.path !== undefined) payload.path = redactPath(err.path);
  if (err?.exitCode !== undefined) payload.exitCode = err.exitCode;
  if (err?.cmd !== undefined) payload.command = truncateDiagnostic(redactPathsInText(err.cmd));
  if (err?.command !== undefined) payload.command = truncateDiagnostic(redactPathsInText(err.command));
  if (err?.stderr !== undefined) payload.stderr = truncateDiagnostic(redactPathsInText(err.stderr));
  if (err?.stdout !== undefined) payload.stdout = truncateDiagnostic(redactPathsInText(err.stdout));
  if (err?.details !== undefined) payload.details = redactDiagnosticValue(err.details);
  return payload;
}

export function truncateDiagnostic(value, maxLength = 4000) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [truncated]`;
}

export function apiError(reply, errOrMessage, statusCode, extra = {}) {
  const errStatus = typeof errOrMessage === 'object' && errOrMessage?.statusCode
    ? errOrMessage.statusCode
    : undefined;
  const nextStatus = statusCode || errStatus || 500;
  return reply.code(nextStatus).send(errorPayload(errOrMessage, nextStatus, extra));
}

function redactDiagnosticValue(value) {
  if (typeof value === 'string') return redactPathsInText(value);
  if (Array.isArray(value)) return value.map(redactDiagnosticValue);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, detail] of Object.entries(value)) {
    if ((key === 'path' || key === 'identity_file' || key === 'identityFile') && typeof detail === 'string') {
      out[key] = redactPath(detail);
    } else {
      out[key] = redactDiagnosticValue(detail);
    }
  }
  return out;
}
