import { requireSupabase, unwrap } from './client.js';
import { listProfilesByIds } from './profiles.js';

const RIDER_FIELDS = `
  id, vehicle_type, vehicle_number, max_concurrent_orders, is_available,
  verification_status, current_latitude, current_longitude, last_location_at,
  rating, created_at, updated_at
`;

export async function getRider(id) {
  const supabase = requireSupabase();
  return unwrap(await supabase.from('riders').select(RIDER_FIELDS).eq('id', id).maybeSingle());
}

export async function listRidersWithProfiles() {
  const supabase = requireSupabase();
  const riders =
    unwrap(
      await supabase
        .from('riders')
        .select(RIDER_FIELDS)
        .order('created_at', { ascending: true }),
    ) ?? [];
  const profiles = await listProfilesByIds(riders.map((rider) => rider.id));
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  return riders.map((rider) => ({ ...rider, profile: profileMap.get(rider.id) ?? null }));
}

export async function updateRiderAvailability(id, isAvailable) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('riders')
      .update({ is_available: Boolean(isAvailable) })
      .eq('id', id)
      .select(RIDER_FIELDS)
      .single(),
  );
}

export async function updateRiderVehicle(id, values) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('riders')
      .update({
        vehicle_type: values.vehicle_type?.trim(),
        vehicle_number: values.vehicle_number?.trim() || null,
      })
      .eq('id', id)
      .select(RIDER_FIELDS)
      .single(),
  );
}

export async function listRiderShifts(riderId) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('rider_shifts')
        .select('id, rider_id, starts_at, ends_at, break_minutes, status, notes, created_at, updated_at')
        .eq('rider_id', riderId)
        .order('starts_at', { ascending: true }),
    ) ?? []
  );
}

const ASSIGNMENT_FIELDS = `
  id, order_id, rider_id, route_id, scheduling_run_id, status, is_current,
  assigned_by, assigned_at, accepted_at, completed_at,
  planned_pickup_at, planned_delivery_at, replaced_by_assignment_id, reason,
  created_at, updated_at,
  order:orders(
    id, status, priority, total_minor, currency, delivery_window_start,
    delivery_window_end, delivery_address_line, delivery_latitude, delivery_longitude,
    special_instructions, delivery_contact_phone, prep_time_minutes, customer_id,
    restaurant:restaurants(id, name, address_line, landmark, city, phone, latitude, longitude),
    items:order_items(id, item_name, quantity, unit_price_minor, line_total_minor, notes)
  )
`;

export async function listRiderAssignments(riderId) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('assignments')
        .select(ASSIGNMENT_FIELDS)
        .eq('rider_id', riderId)
        .order('created_at', { ascending: false }),
    ) ?? []
  );
}

export async function getRiderAssignment(id) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase.from('assignments').select(ASSIGNMENT_FIELDS).eq('id', id).maybeSingle(),
  );
}

export async function getOrderAssignment(orderId) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('assignments')
      .select(
        'id, order_id, status, planned_pickup_at, planned_delivery_at, accepted_at, completed_at, created_at, updated_at',
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
}

export async function listRiderRoutes(riderId) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('delivery_routes')
        .select(
          'id, rider_id, shift_id, scheduling_run_id, status, planned_start, planned_end, total_distance_meters, total_duration_seconds, created_at, updated_at, stops:route_stops(id, order_id, assignment_id, stop_sequence, stop_type, status, planned_arrival, planned_departure, actual_arrival, actual_departure, address_line, latitude, longitude)',
        )
        .eq('rider_id', riderId)
        .order('created_at', { ascending: false }),
    ) ?? []
  );
}

export async function listAdminAssignments(limit = 200) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('assignments')
        .select(ASSIGNMENT_FIELDS)
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}
