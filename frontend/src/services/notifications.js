import { requireSupabase, unwrap } from './client.js';

export async function listNotifications(userId, limit = 60) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('notifications')
        .select('id, user_id, order_id, type, channel, title, body, read_at, metadata, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function markNotificationRead(id) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function markAllNotificationsRead(userId) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id'),
  );
}

export async function unreadNotificationCount(userId) {
  const supabase = requireSupabase();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}
