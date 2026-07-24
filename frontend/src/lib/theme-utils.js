export function isValidHexColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || ''));
}

export function lightenHex(hex, amount) {
  if (!isValidHexColor(hex)) return null;
  const channel = (start) => Math.min(255, parseInt(hex.slice(start, start + 2), 16) + amount);
  const r = channel(1);
  const g = channel(3);
  const b = channel(5);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function accentVariables(color) {
  if (!isValidHexColor(color)) return null;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return {
    '--accent': color,
    '--accent-hover': lightenHex(color, 25),
    '--accent-bg': `rgba(${r},${g},${b},0.08)`,
    '--accent-bg-med': `rgba(${r},${g},${b},0.1)`,
    '--accent-bg-strong': `rgba(${r},${g},${b},0.15)`,
    '--accent-border': `rgba(${r},${g},${b},0.2)`,
    '--accent-border-strong': `rgba(${r},${g},${b},0.3)`,
  };
}

export function applyAccentVariables(element, color) {
  const vars = accentVariables(color);
  if (!element || !vars) return false;
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }
  return true;
}
