import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import config from '../lib/config.js';

const PRIVATE_KEY_RE = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----\s*$/;

function keyDir() {
  return join(dirname(config.dbPath), 'ssh-keys');
}

function safeName(name) {
  return String(name || '').trim().replace(/[^a-zA-Z0-9_.-]/g, '-').replace(/^-+|-+$/g, '');
}

function isPrivateKeyName(name) {
  return !name.endsWith('.pub') && !['config', 'known_hosts', 'authorized_keys'].includes(name);
}

function statKey(path, source, name) {
  try {
    const content = readFileSync(path, 'utf8');
    if (!PRIVATE_KEY_RE.test(content.trim())) return null;
    return { name, path, source, managed: source === 'managed' };
  } catch {
    return null;
  }
}

export function listSshKeys() {
  const keys = [];
  const seen = new Set();
  const addDir = (dir, source) => {
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (!isPrivateKeyName(file)) continue;
      const path = join(dir, file);
      const key = statKey(path, source, file);
      if (key && !seen.has(key.path)) {
        seen.add(key.path);
        keys.push(key);
      }
    }
  };

  addDir(keyDir(), 'managed');
  addDir(join(homedir(), '.ssh'), 'ssh');
  return keys.sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name));
}

export function saveSshKey({ name, privateKey, publicKey }) {
  const cleanedName = safeName(name);
  if (!cleanedName) {
    throw Object.assign(new Error('Key name is required'), { statusCode: 400 });
  }
  const key = String(privateKey || '').trim() + '\n';
  if (!PRIVATE_KEY_RE.test(key.trim())) {
    throw Object.assign(new Error('Invalid private key format'), { statusCode: 400 });
  }

  const dir = keyDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, cleanedName);
  if (existsSync(path)) {
    throw Object.assign(new Error(`SSH key "${cleanedName}" already exists`), { statusCode: 409 });
  }
  writeFileSync(path, key, { mode: 0o600 });
  chmodSync(path, 0o600);

  if (publicKey?.trim()) {
    const pubPath = `${path}.pub`;
    writeFileSync(pubPath, publicKey.trim() + '\n', { mode: 0o644 });
    chmodSync(pubPath, 0o644);
  }

  return { name: cleanedName, path, source: 'managed', managed: true };
}

export function deleteSshKey(name) {
  const cleanedName = safeName(name);
  if (!cleanedName) {
    throw Object.assign(new Error('Key name is required'), { statusCode: 400 });
  }
  const path = join(keyDir(), cleanedName);
  if (!existsSync(path)) {
    throw Object.assign(new Error('Managed SSH key not found'), { statusCode: 404 });
  }
  unlinkSync(path);
  if (existsSync(`${path}.pub`)) unlinkSync(`${path}.pub`);
  return { deleted: true, name: cleanedName, path };
}
