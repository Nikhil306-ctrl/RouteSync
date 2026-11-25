// Read-only by default. --persist-once performs ONE real scheduling RPC and
// must only be used with explicit authorization. Never prints private values.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createPrivilegedSupabase } from '../backend/src/lib/supabase.js';
import { loadOrders, normalizeOrder, schedulePayload, payloadContractErrors, safeSchedulingDiagnostic, validateOrder } from '../backend/src/engines/e2-data-validation/index.js';
import { loadResources } from '../backend/src/engines/e3-resource-management/index.js';
import { solve } from '../backend/src/engines/e1-scheduling-optimization/index.js';

const env = {};
const configNames = [];
for (const line of fs.readFileSync(new URL('../backend/.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
  const key = line.match(/^\s*([A-Z][A-Z0-9_]+)\s*=/);
  if (key) configNames.push(key[1]);
  const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_SECRET_KEY)\s*=\s*(.*?)\s*$/);
  if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}
if (process.argv.includes('--env-keys')) { console.log(JSON.stringify(configNames)); process.exit(0); }
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('Local read-only diagnostic credentials unavailable.');
const client = createPrivilegedSupabase(env, { isAuthorized: true, signal: AbortSignal.timeout(10000) });
if (process.argv.includes('--create-demo')) {
  const { data: customers, error: customerError } = await client.from('profiles').select('id')
    .in('email', ['customer1.demo@example.com', 'customer2.demo@example.com']).eq('role', 'customer').eq('is_active', true);
  if (customerError) throw customerError;
  const { data: owners, error: ownerError } = await client.from('profiles').select('id')
    .in('email', ['owner1.demo@example.com', 'owner2.demo@example.com']).eq('role', 'restaurant').eq('is_active', true);
  if (ownerError) throw ownerError;
  const { data: restaurants, error: restaurantError } = await client.from('restaurants').select('id,owner_id')
    .in('owner_id', owners.map((owner) => owner.id)).eq('is_active', true);
  if (restaurantError) throw restaurantError;
  for (const customer of customers) {
    const { data: addresses, error: addressError } = await client.from('customer_addresses').select('id,latitude,longitude')
      .eq('customer_id', customer.id).not('latitude', 'is', null).not('longitude', 'is', null);
    if (addressError) throw addressError;
    for (const restaurant of restaurants) {
      const { data: items, error: itemError } = await client.from('menu_items').select('id').eq('restaurant_id', restaurant.id)
        .eq('is_available', true).limit(1);
      if (itemError) throw itemError;
      for (const address of addresses ?? []) {
        if (!items?.length) continue;
        const target = { p_customer_id: customer.id, p_restaurant_id: restaurant.id,
          p_address_id: address.id, p_items: [{ menu_item_id: items[0].id, quantity: 1 }] };
        const { error: quoteError } = await client.rpc('quote_order', target);
        if (quoteError) continue;
        const { data: created, error: createError } = await client.rpc('create_order', {
          ...target, p_special_instructions: null, p_idempotency_key: randomUUID(), p_payment_method: 'cash_on_delivery',
        });
        if (createError) throw createError;
        const { error: confirmError } = await client.rpc('transition_order_status', {
          p_order_id: created.order_id, p_actor_id: restaurant.owner_id, p_actor_role: 'restaurant',
          p_next: 'confirmed', p_expected_status: 'pending', p_reason: null, p_prep_time_minutes: 15,
        });
        if (confirmError) throw confirmError;
        console.log(JSON.stringify({ created_demo_order_id: created.order_id, confirmed: true }));
        process.exit(0);
      }
    }
  }
  throw new Error('No open demo kitchen, available menu item and valid demo customer address combination was found.');
}
if (process.argv.includes('--find-demo')) {
  const { data: profiles, error: profileError } = await client.from('profiles').select('id').in('email', ['customer1.demo@example.com', 'customer2.demo@example.com']);
  if (profileError) throw profileError;
  const demoIds = profiles.map((profile) => profile.id);
  if (!demoIds.length) throw new Error('Demo customer profiles unavailable.');
  const candidates = await loadOrders(client);
  const { data: demoOrders, error: demoError } = await client.from('orders').select('id, customer_id').in('id', candidates.map((order) => order.id)).in('customer_id', demoIds);
  if (demoError) throw demoError;
  const demoOrderIds = new Set(demoOrders.map((order) => order.id));
  const { data: assigned, error: assignmentError } = await client.from('assignments').select('order_id').in('order_id', [...demoOrderIds]).eq('is_current', true);
  if (assignmentError) throw assignmentError;
  const assignedIds = new Set(assigned.map((assignment) => assignment.order_id));
  const candidateRiders = await loadResources(client, Date.now());
  console.log(JSON.stringify(candidates.filter((order) => demoOrderIds.has(order.id) && !assignedIds.has(order.id)).slice(0, 15).map((order) => ({
    id: order.id, status: order.status,
    reasons: validateOrder(order, Date.now()),
    feasible_routes: validateOrder(order, Date.now()).length ? 0 : solve([normalizeOrder(order)], candidateRiders, { now: Date.now() + 180000 }).placements.length,
  }))));
  process.exit(0);
}
const id = process.argv[2];
if (!id) throw new Error('Pass an order ID.');
const orders = await loadOrders(client, [id]);
if (!orders.length) throw new Error('Order not found.');
const order = orders[0];
const now = Date.now();
const reasons = validateOrder(order, now);
const riders = await loadResources(client, now);
const result = solve(reasons.length ? [] : [normalizeOrder(order)], riders, { now: now + 180000 });
const payload = schedulePayload(reasons.length ? [] : [order], result, null, 'automatic');
if (process.argv.includes('--lock-targets')) {
  console.log(JSON.stringify({ demo_order_id: id, selected_rider_id: result.placements[0]?.rider.id ?? null,
    feasible_riders: riders.filter((rider) => solve([normalizeOrder(order)], [rider], { now: Date.now() + 180000 }).placements.length).length }));
  process.exit(0);
}
if (process.argv.includes('--inspect')) {
  const { data: assignments, error: assignmentError } = await client.from('assignments')
    .select('id, route_id, scheduling_run_id, status, is_current').eq('order_id', id);
  if (assignmentError) throw assignmentError;
  const runIds = [...new Set(assignments.map((row) => row.scheduling_run_id).filter(Boolean))];
  const routeIds = [...new Set(assignments.map((row) => row.route_id).filter(Boolean))];
  const [runs, routes, stops, notifications] = await Promise.all([
    client.from('scheduling_runs').select('id,status,metrics,created_at').contains('input_snapshot', { order_ids: [id] }).order('created_at', { ascending: false }).limit(20),
    routeIds.length ? client.from('delivery_routes').select('id,status,total_distance_meters').in('id', routeIds) : { data: [], error: null },
    routeIds.length ? client.from('route_stops').select('route_id,order_id,stop_type,stop_sequence').in('route_id', routeIds) : { data: [], error: null },
    client.from('notifications').select('id').eq('order_id', id).eq('type', 'assignment'),
  ]);
  for (const result of [runs, routes, stops, notifications]) if (result.error) throw result.error;
  console.log(JSON.stringify({ assignments: assignments.map(({ status, is_current }) => ({ status, is_current })),
    runs: runs.data?.map(({ status }) => status), routes: routes.data?.map(({ status, total_distance_meters }) => ({ status, total_distance_meters })),
    stops: stops.data?.map(({ stop_type, stop_sequence }) => ({ stop_type, stop_sequence })),
    assignment_notifications: notifications.data?.length ?? 0 }));
  process.exit(0);
}
console.log(JSON.stringify({
  order_status: order.status, invalid_reasons: reasons,
  restaurant_location_present: order.restaurant?.latitude != null && order.restaurant?.longitude != null,
  delivery_location_present: order.delivery_latitude != null && order.delivery_longitude != null,
  riders_considered: riders.length, selected_routes: payload.p_plan.length,
  stops_per_route: payload.p_plan.map((route) => route.stops.length),
  stop_types: payload.p_plan.map((route) => route.stops.map((stop) => stop.stop_type)),
  stop_coordinates_are_numbers: payload.p_plan.map((route) => route.stops.map((stop) => [typeof stop.latitude, typeof stop.longitude])),
  stop_addresses_present: payload.p_plan.map((route) => route.stops.map((stop) => Boolean(stop.address_line?.trim()))),
  candidate_contract_errors: payloadContractErrors({ ...payload, p_actor_id: '00000000-0000-4000-8000-000000000001' }),
  metrics: result.metrics,
}));

if (process.argv.includes('--persist-once') || process.argv.includes('--admin-once')) {
  if (reasons.length || result.placements.length !== 1) throw new Error('Order no longer has a feasible single-route plan.');
  const { data: current, error: currentError } = await client.from('assignments').select('id').eq('order_id', id).eq('is_current', true);
  if (currentError) throw currentError;
  if (current.length) throw new Error('Order already has a current assignment; RPC not called.');
  const admin = process.argv.includes('--admin-once');
  const { data: actor, error: actorError } = admin
    ? await client.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single()
    : await client.from('restaurants').select('owner_id').eq('id', order.restaurant_id).single();
  if (actorError) throw actorError;
  const authorizedPayload = { ...payload, p_actor_id: admin ? actor.id : actor.owner_id, p_source: admin ? 'admin' : 'automatic' };
  if (payloadContractErrors(authorizedPayload).length) throw new Error('Payload failed local contract; RPC not called.');
  const { data, error } = await client.rpc('persist_schedule', authorizedPayload);
  console.log(JSON.stringify(error ? { rpc_error: safeSchedulingDiagnostic(error), error_name: error.name ?? null,
    safe_message: /^[a-zA-Z :,.'()\-]+$/.test(error.message ?? '') ? error.message : '[redacted]' } : {
    rpc_succeeded: true, assigned_count: data?.assigned?.length ?? 0, unscheduled_count: data?.unscheduled?.length ?? 0,
  }));
}
