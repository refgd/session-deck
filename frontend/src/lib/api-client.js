export async function apiJson(path, options = {}) {
  const { body, headers, ...rest } = options;
  const init = { ...rest, headers: new Headers(headers || {}) };

  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers.has('Content-Type')) init.headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, init).catch((err) => {
    const message = err?.message || 'Network request failed';
    const next = new Error(`Network request failed: ${message}`);
    next.status = 0;
    next.payload = { error: next.message, message: next.message, statusCode: 0 };
    throw next;
  });
  const data = await readJson(res);
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export async function apiOk(path, options = {}) {
  await apiJson(path, options);
}

async function readJson(res) {
  if (res.status === 204 || res.status === 205 || res.headers?.get?.('content-length') === '0') {
    return {};
  }
  try {
    return await res.json();
  } catch {
    return {};
  }
}
