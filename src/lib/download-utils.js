export function attachmentHeader(parts, extension = 'txt') {
  const base = parts
    .map(part => safeFilenamePart(part))
    .filter(Boolean)
    .join('-') || 'download';
  const safeExtension = safeFilenamePart(extension) || 'txt';
  return `attachment; filename="${base}.${safeExtension}"`;
}

export function safeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120);
}
