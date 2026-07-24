const PRIVATE_KEY_RE = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----\s*$/;
const PUBLIC_KEY_RE = /^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/=]+(?:\s+\S.*)?$/;
const KEY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;
const RESERVED_KEY_NAMES = new Set(['config', 'known_hosts', 'authorized_keys']);
const MAX_PRIVATE_KEY_BYTES = 128 * 1024;
const MAX_PUBLIC_KEY_BYTES = 16 * 1024;

export const emptySshKeyForm = {
  name: '',
  privateKey: '',
  publicKey: '',
};

export function validateSshKeyForm(form, t = key => key) {
  const name = String(form?.name || '').trim();
  const privateKey = String(form?.privateKey || '').trim();
  const publicKey = String(form?.publicKey || '').trim();

  if (!name) return t('sshKeyNameRequired');
  if (!KEY_NAME_RE.test(name) || name.includes('..') || name.endsWith('.pub') || RESERVED_KEY_NAMES.has(name)) {
    return t('sshKeyNameInvalid');
  }
  if (!privateKey) return t('privateKeyRequired');
  if (byteLength(`${privateKey}\n`) > MAX_PRIVATE_KEY_BYTES) return t('privateKeyTooLarge');
  if (!PRIVATE_KEY_RE.test(privateKey)) return t('invalidPrivateKey');
  if (byteLength(publicKey) > MAX_PUBLIC_KEY_BYTES) return t('publicKeyTooLarge');
  if (publicKey && !PUBLIC_KEY_RE.test(publicKey)) return t('invalidPublicKey');
  return null;
}

function byteLength(value) {
  return new TextEncoder().encode(String(value || '')).length;
}
