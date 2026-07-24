const PRIVATE_KEY_RE = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----\s*$/;
const PUBLIC_KEY_RE = /^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/=]+(?:\s+\S.*)?$/;
const KEY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

export const MAX_PRIVATE_KEY_BYTES = 128 * 1024;
export const MAX_PUBLIC_KEY_BYTES = 16 * 1024;
export const RESERVED_KEY_NAMES = new Set(['config', 'known_hosts', 'authorized_keys']);

export function validateSshKeyName(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) throw validationError('Key name is required');
  if (!KEY_NAME_RE.test(cleaned) || cleaned.includes('..') || cleaned.endsWith('.pub') || RESERVED_KEY_NAMES.has(cleaned)) {
    throw validationError('Key name must be 1-80 characters and use only letters, numbers, _, ., or -');
  }
  return cleaned;
}

export function normalizePrivateKey(privateKey) {
  const key = String(privateKey || '').trim() + '\n';
  if (Buffer.byteLength(key, 'utf8') > MAX_PRIVATE_KEY_BYTES) {
    throw validationError('Private key is too large');
  }
  if (!isPrivateKey(key)) {
    throw validationError('Invalid private key format');
  }
  return key;
}

export function normalizePublicKey(publicKey) {
  const key = String(publicKey || '').trim();
  if (Buffer.byteLength(key, 'utf8') > MAX_PUBLIC_KEY_BYTES) {
    throw validationError('Public key is too large');
  }
  if (key && !PUBLIC_KEY_RE.test(key)) {
    throw validationError('Invalid public key format');
  }
  return key;
}

export function isPrivateKey(content) {
  return PRIVATE_KEY_RE.test(String(content || '').trim());
}

function validationError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}
