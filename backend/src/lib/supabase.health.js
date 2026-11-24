const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Lightweight Supabase connectivity probe.
 * Uses the publishable key only; /auth/v1/health accepts it. No credentials,
 * URLs or upstream error text are returned to callers.
 */
export async function probeSupabase(env) {
  const url = clean(env?.SUPABASE_URL);
  const publishableKey = clean(env?.SUPABASE_PUBLISHABLE_KEY);

  if (!url || !publishableKey) {
    return { connected: false, reason: 'credentials_missing' };
  }

  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
      headers: {
        apikey: publishableKey,
        Accept: 'application/json',
      },
    });

    return response.ok
      ? { connected: true, reason: null }
      : { connected: false, reason: 'unreachable' };
  } catch {
    return { connected: false, reason: 'unreachable' };
  }
}
