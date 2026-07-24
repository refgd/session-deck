import { normalizeLanguage } from './i18n.js';

export const LANGUAGE_STORAGE_KEY = 'session-deck-language';

export function readPreferredLanguage({
  storage = globalThis?.localStorage,
  navigatorLanguage = globalThis?.navigator?.language,
} = {}) {
  try {
    return normalizeLanguage(storage?.getItem?.(LANGUAGE_STORAGE_KEY) || navigatorLanguage);
  } catch {
    return normalizeLanguage(navigatorLanguage);
  }
}

export function savePreferredLanguage(language, {
  storage = globalThis?.localStorage,
} = {}) {
  const normalized = normalizeLanguage(language);
  try {
    storage?.setItem?.(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Some browsers disable storage in private or constrained contexts.
  }
  return normalized;
}

export function applyDocumentLanguage(language, {
  documentElement = globalThis?.document?.documentElement,
} = {}) {
  const normalized = normalizeLanguage(language);
  if (documentElement) documentElement.lang = normalized;
  return normalized;
}
