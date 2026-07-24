import { homedir } from 'node:os';
import { basename, normalize } from 'node:path';

export function redactPath(path, homeDir = homedir()) {
  const value = String(path || '').trim();
  if (!value) return '';
  const normalized = normalize(value);
  const normalizedHome = normalize(homeDir || '');
  const fileName = basename(normalized);

  if (normalizedHome && (normalized === normalizedHome || normalized.startsWith(`${normalizedHome}/`))) {
    return fileName ? `~/.../${fileName}` : '~';
  }

  if (normalized.startsWith('/')) {
    return fileName ? `/.../${fileName}` : '/...';
  }

  return fileName ? `.../${fileName}` : '...';
}

export function redactPathsInText(value, homeDir = homedir()) {
  return String(value || '').replace(/(^|[\s([{"'=])((?:~\/|\/)[^\s'"`<>|,;]+)/g, (match, prefix, path) => {
    return `${prefix}${redactPath(path, homeDir)}`;
  });
}
