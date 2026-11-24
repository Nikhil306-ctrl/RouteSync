import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

let client = null;

/**
 * Browser client: publishable key only, so every query is governed by RLS.
 * Never import SUPABASE_SECRET_KEY into frontend code.
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured) return null;

  if (!client) {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
}
