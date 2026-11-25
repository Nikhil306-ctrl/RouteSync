import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPrivilegedSupabase } from '../backend/src/lib/supabase.js';
import { schedule, DISPATCH_LEAD_MS } from '../backend/src/lib/scheduling.js';
import { loadOrders, normalizeOrder, schedulePayload } from '../backend/src/engines/e2-data-validation/index.js';
import { loadResources } from '../backend/src/engines/e3-resource-management/index.js';
import { solve } from '../backend/src/engines/e1-scheduling-optimization/index.js';

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(new URL('../backend/.dev.vars', import.meta.url), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(SUPABASE_URL|SUPABASE_SECRET_KEY)\s*=\s*(.*?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('Remote verification configuration is unavailable.');
  return env;
}

const env = loadEnv();
const client = () => createPrivilegedSupabase(env, { isAuthorized: true, signal: AbortSignal.timeout(20_000) });
const db = client();
const diagnosticDb = createPrivilegedSupabase(env, { isAuthorized: true });

async function rows(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data ?? [];
}

async function rpc(name, args, expectedFailure = false) {
  const { data, error } = await db.rpc(name, args);
  if (expectedFailure) {
    assert.ok(error, `${name} unexpectedly succeeded`);
    return error;
  }
  if (error) throw error;
  return data;
}

async function context() {
  const emails = [
    'admin.demo@example.com', 'owner1.demo@example.com', 'customer1.demo@example.com',
    'rider1.demo@example.com', 'rider2.demo@example.com', 'rider3.demo@example.com',
  ];
  const profiles = await rows(db.from('profiles').select('id,email,role,is_active').in('email', emails));
  const byEmail = new Map(profiles.map((profile) => [profile.email, profile]));
  for (const required of emails.slice(0, 4)) assert.ok(byEmail.get(required), `Missing demo profile: ${required}`);
  const riderProfiles = profiles.filter((profile) => profile.role === 'rider' && profile.email.endsWith('.demo@example.com'));
  const riders = await rows(db.from('riders').select('id,is_available,verification_status,max_concurrent_orders,current_latitude,current_longitude').in('id', riderProfiles.map((profile) => profile.id)));
  const shifts = await rows(db.from('rider_shifts').select('id,rider_id,starts_at,ends_at,break_minutes,status').in('rider_id', riders.map((rider) => rider.id)).order('starts_at', { ascending: false }));
  return { byEmail, riders, shifts };
}

async function inspect() {
  const state = await context();
  const now = Date.now();
  const current = await rows(db.from('assignments').select('rider_id,status,order:orders!inner(status)').in('rider_id', state.riders.map((rider) => rider.id)).eq('is_current', true));
  const loads = new Map();
  for (const assignment of current) {
    if (['proposed', 'accepted', 'active'].includes(assignment.status) && !['cancelled', 'rejected', 'delivered'].includes(assignment.order.status)) {
      loads.set(assignment.rider_id, (loads.get(assignment.rider_id) ?? 0) + 1);
    }
  }
  console.log(JSON.stringify({
    riders: state.riders.map((rider) => ({
      demo: true,
      available: rider.is_available,
      verification: rider.verification_status,
      capacity: rider.max_concurrent_orders,
      load: loads.get(rider.id) ?? 0,
      location_present: rider.current_latitude != null && rider.current_longitude != null,
      covering_shifts: state.shifts.filter((shift) => shift.rider_id === rider.id && ['scheduled', 'active'].includes(shift.status)
        && Date.parse(shift.starts_at) <= now && Date.parse(shift.ends_at) > now).length,
    })),
  }));
}

async function establishShifts(state) {
  const start = new Date(Date.now() - 60 * 60_000).toISOString();
  const end = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
  let adjusted = 0;
  for (const rider of state.riders.filter((item) => item.is_available && item.verification_status === 'verified')) {
    const riderShifts = state.shifts.filter((shift) => shift.rider_id === rider.id);
    if (!riderShifts.length) continue;
    const selected = riderShifts[0];
    const otherOpen = riderShifts.filter((shift) => shift.id !== selected.id && ['scheduled', 'active'].includes(shift.status));
    if (otherOpen.length) {
      await rows(db.from('rider_shifts').update({ status: 'cancelled' }).in('id', otherOpen.map((shift) => shift.id)).select('id'));
    }
    await rows(db.from('rider_shifts').update({ starts_at: start, ends_at: end, break_minutes: 0, status: 'active' }).eq('id', selected.id).select('id'));
    adjusted += 1;
  }
  return adjusted;
}

async function orderFixture(state) {
  const owner = state.byEmail.get('owner1.demo@example.com');
  const customer = state.byEmail.get('customer1.demo@example.com');
  const restaurants = await rows(db.from('restaurants').select('id,owner_id').eq('owner_id', owner.id).eq('is_active', true));
  const addresses = await rows(db.from('customer_addresses').select('id').eq('customer_id', customer.id).not('latitude', 'is', null).not('longitude', 'is', null));
  assert.ok(addresses.length, 'Demo customer has no schedulable address.');
  for (const restaurant of restaurants) {
    const items = await rows(db.from('menu_items').select('id').eq('restaurant_id', restaurant.id).eq('is_available', true).limit(1));
    if (!items.length) continue;
    const target = { p_customer_id: customer.id, p_restaurant_id: restaurant.id, p_address_id: addresses[0].id, p_items: [{ menu_item_id: items[0].id, quantity: 1 }] };
    const quote = await db.rpc('quote_order', target);
    if (!quote.error) return { owner, customer, restaurant, target };
  }
  throw new Error('No open owner1 demo restaurant fixture is available.');
}

async function createConfirmedOrder(fixture) {
  const created = await rpc('create_order', {
    ...fixture.target,
    p_special_instructions: `Phase 8 verification ${randomUUID()}`,
    p_idempotency_key: randomUUID(),
    p_payment_method: 'cash_on_delivery',
  });
  await rpc('transition_order_status', {
    p_order_id: created.order_id, p_actor_id: fixture.owner.id, p_actor_role: 'restaurant',
    p_next: 'confirmed', p_expected_status: 'pending', p_reason: null, p_prep_time_minutes: 15,
  });
  return created.order_id;
}

async function transition(orderId, actorId, role, next, expected) {
  return rpc('transition_order_status', {
    p_order_id: orderId, p_actor_id: actorId, p_actor_role: role,
    p_next: next, p_expected_status: expected, p_reason: null, p_prep_time_minutes: null,
  });
}

async function currentAssignment(orderId) {
  const result = await rows(db.from('assignments').select('id,rider_id,route_id,status,is_current').eq('order_id', orderId).eq('is_current', true));
  assert.equal(result.length, 1, 'Expected exactly one current assignment.');
  return result[0];
}

async function feasibleRiders(orderId) {
  const [order] = await loadOrders(db, [orderId], true);
  const resources = await loadResources(db, Date.now());
  return resources.filter((rider) => rider.active && rider.verified && rider.available && rider.shift && rider.load < rider.max_concurrent_orders
    && solve([normalizeOrder(order)], [rider], { now: Date.now() + DISPATCH_LEAD_MS }).placements.length === 1);
}

async function verify() {
  const state = await context();
  const shiftsAdjusted = await establishShifts(state);
  const fixture = await orderFixture(state);
  const admin = state.byEmail.get('admin.demo@example.com');
  const rider1Profile = state.byEmail.get('rider1.demo@example.com');

  const orderA = await createConfirmedOrder(fixture);
  const candidates = await feasibleRiders(orderA);
  assert.ok(candidates.length >= 2, 'At least two feasible demo riders are required.');
  const primary = candidates.find((rider) => rider.id === rider1Profile.id) ?? candidates[0];
  const secondary = candidates.find((rider) => rider.id !== primary.id);

  const manual = await schedule(client(), { ids: [orderA], actorId: admin.id, source: 'manual', riderId: primary.id });
  assert.deepEqual(manual.assigned, [orderA]);
  const original = await currentAssignment(orderA);

  const [overrideOrder] = await loadOrders(db, [orderA], true);
  const [secondaryResource] = await loadResources(db, Date.now(), secondary.id);
  const overrideResult = solve([normalizeOrder(overrideOrder)], [secondaryResource], { now: Date.now() + DISPATCH_LEAD_MS });
  assert.equal(overrideResult.placements.length, 1, 'Replacement rider is no longer feasible.');
  const badPayload = schedulePayload([overrideOrder], overrideResult, admin.id, 'manual', { assignmentId: original.id, reason: 'Phase 8 rollback probe' });
  badPayload.p_plan[0].stops[0].address_line = '';
  await rpc('override_schedule', badPayload, true);
  const afterRollback = await currentAssignment(orderA);
  assert.equal(afterRollback.id, original.id, 'Failed override did not roll back the released assignment.');
  assert.equal(afterRollback.status, original.status);

  const reassigned = await schedule(client(), {
    ids: [orderA], actorId: admin.id, source: 'manual', riderId: secondary.id,
    override: { assignmentId: original.id, reason: 'Phase 8 controlled reassignment' },
  });
  assert.deepEqual(reassigned.assigned, [orderA]);
  const replacement = await currentAssignment(orderA);
  assert.equal(replacement.rider_id, secondary.id);
  const oldAssignment = (await rows(db.from('assignments').select('status,is_current,replaced_by_assignment_id').eq('id', original.id)))[0];
  assert.equal(oldAssignment.status, 'reassigned');
  assert.equal(oldAssignment.is_current, false);
  assert.equal(oldAssignment.replaced_by_assignment_id, replacement.id);

  const delay = await rpc('report_prep_delay', {
    p_order_id: orderA, p_actor_id: fixture.owner.id, p_actor_role: 'restaurant',
    p_delay_minutes: 1, p_reason: 'Phase 8 controlled delay',
  });
  assert.equal(delay.released, true);
  assert.equal((await rows(db.from('assignments').select('is_current,status').eq('id', replacement.id)))[0].status, 'reassigned');

  const orderB = await createConfirmedOrder(fixture);
  const concurrent = await Promise.allSettled([
    schedule(client(), { ids: [orderB], actorId: admin.id, source: 'manual', riderId: primary.id }),
    schedule(client(), { ids: [orderB], actorId: admin.id, source: 'manual', riderId: primary.id }),
  ]);
  assert.ok(concurrent.some((result) => result.status === 'fulfilled'));
  const duplicateRows = await rows(db.from('assignments').select('id').eq('order_id', orderB).eq('is_current', true));
  assert.equal(duplicateRows.length, 1, 'Concurrent requests created duplicate current assignments.');
  const assignmentB = await currentAssignment(orderB);
  await rpc('respond_assignment', { p_assignment_id: assignmentB.id, p_rider_id: primary.id, p_accept: true, p_reason: null });
  await transition(orderB, fixture.owner.id, 'restaurant', 'preparing', 'confirmed');
  await transition(orderB, fixture.owner.id, 'restaurant', 'ready', 'preparing');
  const availability = await rpc('set_rider_availability', { p_rider_id: primary.id, p_is_available: false });
  assert.ok(availability.released_assignment_ids.includes(assignmentB.id));
  const releasedB = (await rows(db.from('assignments').select('status,is_current').eq('id', assignmentB.id)))[0];
  assert.deepEqual(releasedB, { status: 'reassigned', is_current: false });
  assert.equal((await rows(db.from('orders').select('status').eq('id', orderB)))[0].status, 'ready');
  const releaseEvents = await rows(db.from('assignment_events').select('id').eq('assignment_id', assignmentB.id).eq('to_status', 'reassigned'));
  const releaseNotices = await rows(db.from('notifications').select('id').eq('order_id', orderB).contains('metadata', { source: 'rider_availability' }));
  assert.ok(releaseEvents.length >= 1 && releaseNotices.length >= 1, 'Availability release history is incomplete.');
  await rpc('set_rider_availability', { p_rider_id: primary.id, p_is_available: true });

  const orderC = await createConfirmedOrder(fixture);
  const scheduledC = await schedule(client(), { ids: [orderC], actorId: admin.id, source: 'manual', riderId: primary.id });
  assert.deepEqual(scheduledC.assigned, [orderC]);
  const assignmentC = await currentAssignment(orderC);
  await rpc('respond_assignment', { p_assignment_id: assignmentC.id, p_rider_id: primary.id, p_accept: true, p_reason: null });
  await transition(orderC, fixture.owner.id, 'restaurant', 'preparing', 'confirmed');
  await transition(orderC, fixture.owner.id, 'restaurant', 'ready', 'preparing');
  await transition(orderC, primary.id, 'rider', 'picked_up', 'assigned');
  const primaryRow = state.riders.find((rider) => rider.id === primary.id);
  await rpc('record_rider_location', {
    p_rider_id: primary.id, p_assignment_id: assignmentC.id,
    p_latitude: primaryRow.current_latitude, p_longitude: primaryRow.current_longitude,
    p_accuracy_meters: 10, p_source: 'simulated',
  });
  await rpc('record_rider_location', {
    p_rider_id: secondary.id, p_assignment_id: assignmentC.id,
    p_latitude: primaryRow.current_latitude, p_longitude: primaryRow.current_longitude,
    p_accuracy_meters: 10, p_source: 'simulated',
  }, true);
  await rpc('record_rider_location', {
    p_rider_id: primary.id, p_assignment_id: assignmentC.id,
    p_latitude: primaryRow.current_latitude, p_longitude: primaryRow.current_longitude,
    p_accuracy_meters: 10, p_source: null,
  }, true);
  await transition(orderC, primary.id, 'rider', 'out_for_delivery', 'picked_up');
  await transition(orderC, primary.id, 'rider', 'delivered', 'out_for_delivery');
  const stops = await rows(db.from('route_stops').select('stop_type,status,assignment_id').eq('route_id', assignmentC.route_id).eq('assignment_id', assignmentC.id));
  assert.equal(stops.find((stop) => stop.stop_type === 'pickup')?.status, 'completed');
  assert.equal(stops.find((stop) => stop.stop_type === 'dropoff')?.status, 'completed');
  assert.equal((await rows(db.from('delivery_routes').select('status').eq('id', assignmentC.route_id)))[0].status, 'completed');

  const cronOrderId = await createConfirmedOrder(fixture);
  assert.ok((await feasibleRiders(cronOrderId)).length >= 1, 'Cron fixture has no feasible rider.');
  console.log(JSON.stringify({
    verified: true, shifts_adjusted: shiftsAdjusted, manual_scheduling: true,
    duplicate_prevention: true, atomic_rollback: true, reassignment: true,
    prep_delay_release: true, availability_release: true, route_lifecycle: true,
    location_authorization: true, cron_order_id: cronOrderId,
  }));
}

async function verifyCron(orderId) {
  const assignments = await rows(db.from('assignments').select('id,route_id,scheduling_run_id,is_current,status').eq('order_id', orderId));
  const current = assignments.filter((assignment) => assignment.is_current);
  assert.equal(current.length, 1, 'Scheduled event did not create exactly one current assignment.');
  const [run] = await rows(db.from('scheduling_runs').select('status,input_snapshot').eq('id', current[0].scheduling_run_id));
  const [route] = await rows(db.from('delivery_routes').select('status').eq('id', current[0].route_id));
  const stops = await rows(db.from('route_stops').select('id').eq('route_id', current[0].route_id));
  assert.equal(run.status, 'completed');
  assert.equal(run.input_snapshot.source, 'automatic');
  assert.equal(route.status, 'planned');
  assert.equal(stops.length, 2);
  console.log(JSON.stringify({ automatic_cron: true, assignment: true, run: true, route: true, stops: stops.length }));
}

async function verifyManualOrder(orderId) {
  const state = await context();
  const admin = state.byEmail.get('admin.demo@example.com');
  const candidates = await feasibleRiders(orderId);
  assert.ok(candidates.length, 'The controlled order has no feasible rider.');
  const result = await schedule(diagnosticDb, { ids: [orderId], actorId: admin.id, source: 'manual', riderId: candidates[0].id });
  assert.ok(result.assigned.includes(orderId) || result.duplicate, 'Manual scheduling did not persist the order.');
  const assignment = await currentAssignment(orderId);
  console.log(JSON.stringify({ manual_scheduling: true, assignment_status: assignment.status }));
}

async function createBrowserStates(directory) {
  const hostname = new URL(env.SUPABASE_URL).hostname;
  const projectRef = hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const accounts = {
    admin: 'admin.demo@example.com',
    restaurant: 'owner1.demo@example.com',
    rider: 'rider1.demo@example.com',
    customer: 'customer1.demo@example.com',
  };
  for (const [role, email] of Object.entries(accounts)) {
    const auth = createPrivilegedSupabase(env, { isAuthorized: true });
    const generated = await auth.auth.admin.generateLink({ type: 'magiclink', email });
    if (generated.error) throw generated.error;
    const verified = await auth.auth.verifyOtp({
      token_hash: generated.data.properties.hashed_token,
      type: 'magiclink',
    });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error(`No ${role} session returned.`);
    const state = {
      cookies: [],
      origins: [{
        origin: 'http://127.0.0.1:5173',
        localStorage: [{ name: storageKey, value: JSON.stringify(verified.data.session) }],
      }],
    };
    fs.writeFileSync(`${directory}\\routesync-${role}-state.json`, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
  }
  console.log(JSON.stringify({ browser_states: 4 }));
}

const [mode, argument] = process.argv.slice(2);
if (mode === '--inspect') await inspect();
else if (mode === '--verify') await verify();
else if (mode === '--verify-cron' && argument) await verifyCron(argument);
else if (mode === '--manual-order' && argument) await verifyManualOrder(argument);
else if (mode === '--browser-auth' && argument) await createBrowserStates(argument);
else throw new Error('Use --inspect, --verify, --manual-order <order-id>, --browser-auth <directory>, or --verify-cron <order-id>.');
