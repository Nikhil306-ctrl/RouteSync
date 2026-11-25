import { unwrap } from '../../lib/orderLifecycle.js';

// A shift records break duration but no interval. Do not fabricate one: reserve
// the entire duration at the end of the usable shift, and require availability
// at dispatch. Actual future break placement remains unknown until recorded.
export function usableShift(shift, now) {
  if (!shift || !Number.isInteger(Number(shift.break_minutes)) || Number(shift.break_minutes) < 0) return null;
  const end = Date.parse(shift.ends_at) - Number(shift.break_minutes) * 60_000;
  if (!Number.isFinite(end) || end <= now || Date.parse(shift.starts_at) > now) return null;
  return { ...shift, ends_at: new Date(end).toISOString(), original_ends_at: shift.ends_at };
}

export async function loadResources(client, now, riderId) {
  let query = client.from('riders').select('id, is_available, verification_status, max_concurrent_orders, current_latitude, current_longitude');
  if (riderId) query = query.eq('id', riderId);
  const riders = (await unwrap(query.limit(riderId ? 1 : 150))) ?? [];
  if (!riders.length) return [];
  const ids = riders.map((rider) => rider.id);
  const [profiles, shifts, assignments] = await Promise.all([
    unwrap(client.from('profiles').select('id, is_active, role').in('id', ids)),
    unwrap(client.from('rider_shifts').select('id, rider_id, starts_at, ends_at, break_minutes, status').in('rider_id', ids).in('status', ['active', 'scheduled']).lte('starts_at', new Date(now).toISOString()).gt('ends_at', new Date(now).toISOString())),
    unwrap(client.from('assignments').select('rider_id, order:orders!inner(status)').in('rider_id', ids).eq('is_current', true).in('status', ['proposed', 'accepted', 'active'])),
  ]);
  const byProfile = new Map(profiles.map((p) => [p.id, p]));
  const load = new Map();
  for (const assignment of assignments) if (!['cancelled', 'rejected', 'delivered'].includes(assignment.order.status)) load.set(assignment.rider_id, (load.get(assignment.rider_id) ?? 0) + 1);
  return riders.map((rider) => ({
    id: rider.id, latitude: Number(rider.current_latitude), longitude: Number(rider.current_longitude),
    active: byProfile.get(rider.id)?.is_active && byProfile.get(rider.id)?.role === 'rider',
    verified: rider.verification_status === 'verified', available: rider.is_available && rider.current_latitude != null && rider.current_longitude != null,
    max_concurrent_orders: rider.max_concurrent_orders, load: load.get(rider.id) ?? 0,
    shift: shifts.filter((s) => s.rider_id === rider.id).map((s) => usableShift(s, now))
      .filter(Boolean).sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at))[0] ?? null,
  }));
}
