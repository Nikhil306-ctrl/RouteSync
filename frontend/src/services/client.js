import { getSupabaseClient } from '../lib/supabase.js';

export function requireSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Add the publishable key to frontend/.env.local.');
  }
  return client;
}

export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export function uniqueById(rows = []) {
  return [...new Map(rows.filter(Boolean).map((row) => [row.id, row])).values()];
}
