import { requireSupabase, unwrap } from './client.js';

export const PROFILE_FIELDS = 'id, role, email, full_name, phone, avatar_url, is_active, created_at, updated_at';

export async function getProfile(id) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle(),
  );
}

export async function updateOwnProfile(id, values) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('profiles')
      .update({
        full_name: values.full_name?.trim(),
        phone: values.phone?.trim() || null,
        avatar_url: values.avatar_url?.trim() || null,
      })
      .eq('id', id)
      .select(PROFILE_FIELDS)
      .single(),
  );
}

export async function listProfilesByIds(ids = []) {
  if (!ids.length) return [];
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('profiles')
        .select('id, role, email, full_name, phone, is_active')
        .in('id', ids),
    ) ?? []
  );
}
