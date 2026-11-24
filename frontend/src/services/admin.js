import { requireSupabase, unwrap } from './client.js';

export async function listSchedulingRuns(limit = 100) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('scheduling_runs')
        .select(
          'id, requested_by, restaurant_id, status, algorithm, input_snapshot, metrics, started_at, completed_at, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function listConstraintViolations(limit = 200) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('constraint_violations')
        .select(
          'id, scheduling_run_id, order_id, rider_id, assignment_id, constraint_type, severity, message, details, is_resolved, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function resolveConstraintViolation(id, resolved = true) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('constraint_violations')
      .update({ is_resolved: resolved })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function listAuditLogs(limit = 250) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('audit_logs')
        .select(
          'id, actor_id, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function listAdminRoutes(limit = 200) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('delivery_routes')
        .select(
          'id, rider_id, shift_id, scheduling_run_id, status, planned_start, planned_end, total_distance_meters, total_duration_seconds, created_at, updated_at, stops:route_stops(id, order_id, assignment_id, stop_sequence, stop_type, status, planned_arrival, planned_departure, actual_arrival, actual_departure, address_line, latitude, longitude)',
        )
        .order('created_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}

export async function listAdminRiderLocations(limit = 100) {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('rider_locations')
        .select('id, rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source, created_at')
        .order('recorded_at', { ascending: false })
        .limit(limit),
    ) ?? []
  );
}
