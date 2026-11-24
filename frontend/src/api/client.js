const BASE_URL = '/api';

/** Small fetch wrapper so every API call shares error handling. */
export async function apiGet(path, { signal } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed with HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}
