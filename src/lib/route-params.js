export function parsePositiveRouteId(value, field = 'id') {
  const text = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw Object.assign(new Error(`${field} must be a positive integer`), {
      statusCode: 400,
      [field]: value,
    });
  }
  return Number(text);
}
