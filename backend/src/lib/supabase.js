import { createClient } from '@supabase/supabase-js';

const configured = (value) => typeof value === 'string' && value.trim().length > 0;

const serverOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/**
 * Default backend client: publishable key + the caller's bearer token, so
 * Supabase RLS applies. Use this for all ordinary user-scoped operations.
 */
export function createUserScopedSupabase(env, accessToken) {
  if (!configured(env?.SUPABASE_URL) || !configured(env?.SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Supabase publishable credentials are not configured.');
  }

  const global = accessToken
    ? { headers: { Authorization: `Bearer ${accessToken}` } }
    : undefined;

  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    ...serverOptions,
    ...(global ? { global } : {}),
  });
}

/**
 * Privileged client: server-side only and secret key only.
 *
 * `isAuthorized` MUST come from a verified server-side role check in a later
 * phase. Never derive it from a request body, query string or client-supplied
 * role claim. Supabase RLS must remain enabled.
 */
export function createPrivilegedSupabase(env, { isAuthorized, signal, timeoutMs } = {}) {
  if (isAuthorized !== true) {
    throw new Error('Privileged Supabase access requires explicit authorization.');
  }
  if (!configured(env?.SUPABASE_URL) || !configured(env?.SUPABASE_SECRET_KEY)) {
    throw new Error('Supabase secret credentials are not configured.');
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    ...serverOptions,
    ...((signal || timeoutMs) ? {
      global: {
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: signal ?? AbortSignal.timeout(timeoutMs),
        }),
      },
    } : {}),
  });
}
