import { isUuid, unwrap } from '../../lib/orderLifecycle.js';

const coordinate = (lat, lon) => lat != null && lon != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lon)) <= 180;

export function validateOrder(order, now, override = false) {
  const reasons = [];
  if (!['confirmed', 'preparing', 'ready', ...(override ? ['assigned'] : [])].includes(order.status)) reasons.push('invalid_order_state');
  if (!coordinate(order.delivery_latitude, order.delivery_longitude) || !coordinate(order.restaurant?.latitude, order.restaurant?.longitude)) reasons.push('missing_coordinates');
  if (!order.delivery_address_line?.trim() || !order.restaurant?.address_line?.trim()) reasons.push('missing_address');
  const ready = Date.parse(order.estimated_ready_at), start = Date.parse(order.delivery_window_start), end = Date.parse(order.delivery_window_end);
  if (![ready, start, end].every(Number.isFinite) || end <= start) reasons.push('invalid_timestamps');
  else if (end <= now || ready >= end) reasons.push('deadline_expired');
  return reasons;
}

export function normalizeOrder(order) {
  return { ...order, pickup: { latitude: Number(order.restaurant.latitude), longitude: Number(order.restaurant.longitude), address_line: order.restaurant.address_line }, dropoff: { latitude: Number(order.delivery_latitude), longitude: Number(order.delivery_longitude) } };
}

// Only PostgreSQL diagnostics from our fixed scheduling contract are logged;
// arbitrary database details can include customer addresses or coordinates.
const CONTRACT_ERRORS = new Set([
  'Invalid scheduling request.', 'Invalid route structure.', 'Invalid route order ID.',
  'Invalid route stop.', 'Duplicate order in route.',
  'Route must include exactly two stops per order.', 'Route stop does not belong to route.',
  'Only one route per rider may be persisted per run.',
]);

export function safeSchedulingDiagnostic(error) {
  return {
    code: error?.code ?? 'UNKNOWN',
    message: error?.code === '55P03' ? 'Scheduling resource lock timed out.'
      : error?.code === '57014' || error?.name === 'TimeoutError' || /timeout/i.test(error?.message ?? '')
        ? 'Scheduling request timed out; check current assignment before retrying.'
        : CONTRACT_ERRORS.has(error?.message) ? error.message : 'Unrecognized database diagnostic (redacted)',
    details: error?.details == null ? null : '[redacted]',
    hint: error?.hint == null ? null : '[redacted]',
  };
}

export function schedulePayload(orders, result, actorId, source, override) {
  return {
    p_actor_id: actorId, p_source: source,
    p_order_ids: orders.map((order) => order.id),
    p_plan: result.placements.map(({ rider, bundle, route, score, breakdown }) => ({
      rider_id: rider.id, order_ids: bundle.map((order) => order.id), score, breakdown,
      distance_meters: Math.round(route.distanceKm * 1000), stops: route.stops,
    })),
    p_metrics: result.metrics, p_rejections: result.rejections,
    ...(override ? { p_expected_assignment_id: override.assignmentId, p_reason: override.reason } : {}),
  };
}

const ISO_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$/;
export function payloadContractErrors(payload) {
  const fields = [];
  if (!isUuid(payload.p_actor_id) || !['automatic', 'admin', 'manual'].includes(payload.p_source) ||
    !Array.isArray(payload.p_order_ids) || !payload.p_order_ids.length ||
    payload.p_order_ids.some((id) => !isUuid(id)) || !Array.isArray(payload.p_plan)) fields.push('request');
  for (const [index, route] of (payload.p_plan ?? []).entries()) {
    if (!isUuid(route.rider_id) || !Array.isArray(route.order_ids) || route.order_ids.some((id) => !isUuid(id)) ||
      !Number.isInteger(route.distance_meters) || !Number.isFinite(route.score) || !route.breakdown ||
      !Array.isArray(route.stops) || route.stops.length !== route.order_ids.length * 2) fields.push(`route[${index}]`);
    for (const [stopIndex, stop] of (route.stops ?? []).entries()) {
      if (!isUuid(stop.order_id) || !['pickup', 'dropoff'].includes(stop.stop_type) ||
        !ISO_TIME.test(stop.planned_arrival) || !ISO_TIME.test(stop.planned_departure) ||
        typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number' ||
        !coordinate(stop.latitude, stop.longitude) || !stop.address_line?.trim()) fields.push(`route[${index}].stop[${stopIndex}]`);
    }
  }
  return fields;
}

export async function recordRun(client, { actorId, orders, result, source, override }) {
  const payload = schedulePayload(orders, result, actorId, source, override);
  const invalidFields = payloadContractErrors(payload);
  if (invalidFields.length) {
    console.error('[routesync:scheduling] payload contract failure', invalidFields);
    const error = new Error('Scheduling plan is missing required route fields.'); error.code = '22023'; throw error;
  }
  const { data, error } = await client.rpc(override ? 'override_schedule' : 'persist_schedule', payload);
  if (error) {
    console.error('[routesync:scheduling] rpc diagnostic', safeSchedulingDiagnostic(error), {
      orders: payload.p_order_ids.length, routes: payload.p_plan.length,
      stops: payload.p_plan.map((route) => route.stops.length),
      stop_types: payload.p_plan.map((route) => route.stops.map((stop) => stop.stop_type)),
      coordinate_types: payload.p_plan.map((route) => route.stops.map((stop) => [typeof stop.latitude, typeof stop.longitude])),
      address_present: payload.p_plan.map((route) => route.stops.map((stop) => Boolean(stop.address_line?.trim()))),
      score_types: payload.p_plan.map((route) => typeof route.score),
      source,
    });
    throw error;
  }
  return data;
}

export async function recordInvalidOrders(client, orders, actorId, source, now) {
  if (!orders.length) return null;
  const { data: existing, error: lookupError } = await client.from('constraint_violations')
    .select('order_id').eq('constraint_type', 'invalid_scheduling_data')
    .in('order_id', orders.map((order) => order.id));
  if (lookupError) throw lookupError;
  const recorded = new Set((existing ?? []).map((entry) => entry.order_id));
  orders = orders.filter((order) => !recorded.has(order.id));
  if (!orders.length) return null;
  const { data: run, error } = await client.from('scheduling_runs').insert({
    requested_by: actorId, status: 'infeasible', algorithm: 'input-validation',
    input_snapshot: { order_ids: orders.map((order) => order.id), source, permanent: true },
    metrics: { orders_considered: orders.length, feasible_assignments: 0, unscheduled_orders: orders.length, termination: 'invalid_input' },
    started_at: new Date(now).toISOString(), completed_at: new Date().toISOString(),
  }).select('id').single();
  if (error) throw error;
  const { error: violationError } = await client.from('constraint_violations').insert(orders.map((order) => ({
    scheduling_run_id: run.id, order_id: order.id, constraint_type: 'invalid_scheduling_data',
    message: 'Order cannot be scheduled with its recorded delivery data.',
    details: { reasons: validateOrder(order, now) },
  })));
  if (violationError) throw violationError;
  return run.id;
}

export async function loadOrders(client, ids, override = false) {
  let query = client.from('orders').select('id, status, restaurant_id, delivery_address_line, delivery_latitude, delivery_longitude, estimated_ready_at, delivery_window_start, delivery_window_end, restaurant:restaurants(id, latitude, longitude, address_line)');
  if (ids?.length) query = query.in('id', ids);
  else query = query.in('status', ['confirmed', 'preparing', 'ready']);
  return unwrap(await query.order('delivery_window_end').limit(ids?.length ? 30 : 200)) ?? [];
}
