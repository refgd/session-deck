export const MAX_RESOURCE_NAME_LENGTH = 80;
export const MAX_RESOURCE_DESCRIPTION_LENGTH = 512;

export function normalizeResourceName(value, options = {}) {
  if (value === undefined || value === null) {
    return options.required ? { error: 'Name is required' } : { value: undefined };
  }
  const name = String(value).trim();
  if (!name) return options.required ? { error: 'Name is required' } : { value: undefined };
  if (name.length > MAX_RESOURCE_NAME_LENGTH) return { error: 'Name is too long' };
  return { value: name };
}

export function normalizeResourceDescription(value, options = {}) {
  if (value === undefined || value === null) {
    return { value: options.defaultValue ?? undefined };
  }
  const description = String(value).trim();
  if (description.length > MAX_RESOURCE_DESCRIPTION_LENGTH) {
    return { error: 'Description is too long' };
  }
  return { value: description };
}
