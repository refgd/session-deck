const ACCENT_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function validateAccentColor(value) {
  if (typeof value !== 'string' || !ACCENT_COLOR_RE.test(value)) {
    throw Object.assign(new Error('accent_color must be a #RRGGBB color'), { statusCode: 400 });
  }
  return value;
}

export function validateBooleanSetting(key, value) {
  if (value === true || value === 'true') return 'true';
  if (value === false || value === 'false') return 'false';
  throw Object.assign(new Error(`${key} must be true or false`), { statusCode: 400 });
}

export const appSettingValidators = {
  accent_color: validateAccentColor,
  mobile_read_only_default: (value) => validateBooleanSetting('mobile_read_only_default', value),
};

export function validateAppSetting(key, value) {
  const validate = appSettingValidators[key];
  if (!validate) return { error: 'Unknown setting' };
  try {
    return { value: validate(value) };
  } catch (err) {
    return { error: err.message, statusCode: err.statusCode || 400 };
  }
}
