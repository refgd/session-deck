import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import config from '../lib/config.js';
import {
  MAX_PRIVATE_KEY_BYTES,
  RESERVED_KEY_NAMES,
  isPrivateKey,
  normalizePrivateKey,
  normalizePublicKey,
  validateSshKeyName,
} from '../lib/ssh-key-validation.js';

function keyDir() {
  return join(dirname(config.dbPath), 'ssh-keys');
}

function ensureManagedKeyDir() {
  const dir = keyDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw Object.assign(new Error('Managed SSH key directory is not a regular directory'), { statusCode: 500 });
  }
  chmodSync(dir, 0o700);
  return dir;
}

function isPrivateKeyName(name, source) {
  if (name.endsWith('.pub') || RESERVED_KEY_NAMES.has(name)) return false;
  if (source === 'managed') {
    try {
      validateSshKeyName(name);
    } catch {
      return false;
    }
  }
  return true;
}

function statKey(path, source, name) {
  try {
    const stat = source === 'managed' ? lstatSync(path) : statSync(path);
    if (!stat.isFile() || stat.size > MAX_PRIVATE_KEY_BYTES) return null;
    const content = readFileSync(path, 'utf8');
    if (!isPrivateKey(content)) return null;
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
      if (!isPrivateKeyName(file, source)) continue;
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
  const cleanedName = validateSshKeyName(name);
  const key = normalizePrivateKey(privateKey);
  const pub = normalizePublicKey(publicKey);

  const dir = ensureManagedKeyDir();
  const path = join(dir, cleanedName);
  const pubPath = `${path}.pub`;
  if (existsSync(path)) {
    throw Object.assign(new Error(`SSH key "${cleanedName}" already exists`), { statusCode: 409 });
  }
  if (pub && existsSync(pubPath)) {
    throw Object.assign(new Error(`SSH public key "${cleanedName}.pub" already exists`), { statusCode: 409 });
  }

  let privateCreated = false;
  let publicCreated = false;
  try {
    writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
    privateCreated = true;
    chmodSync(path, 0o600);

    if (pub) {
      writeFileSync(pubPath, pub + '\n', { mode: 0o644, flag: 'wx' });
      publicCreated = true;
      chmodSync(pubPath, 0o644);
    }
  } catch (err) {
    if (privateCreated && existsSync(path)) unlinkSync(path);
    if (publicCreated && existsSync(pubPath)) unlinkSync(pubPath);
    if (err?.code === 'EEXIST') {
      throw Object.assign(new Error(`SSH key "${cleanedName}" already exists`), { statusCode: 409 });
    }
    throw err;
  }

  return { name: cleanedName, path, source: 'managed', managed: true };
}

export function deleteSshKey(name) {
  const cleanedName = validateSshKeyName(name);
  const path = join(keyDir(), cleanedName);
  if (!existsSync(path)) {
    throw Object.assign(new Error('Managed SSH key not found'), { statusCode: 404 });
  }
  unlinkSync(path);
  if (existsSync(`${path}.pub`)) unlinkSync(`${path}.pub`);
  return { deleted: true, name: cleanedName, path };
}
