import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shortestPath, solve } from '../backend/src/engines/e1-scheduling-optimization/index.js';
import { validateOrder } from '../backend/src/engines/e2-data-validation/index.js';
import { payloadContractErrors, safeSchedulingDiagnostic, schedulePayload } from '../backend/src/engines/e2-data-validation/index.js';
import { usableShift } from '../backend/src/engines/e3-resource-management/index.js';
import { assertRequestedIds, assertRequestedOrders, DISPATCH_LEAD_MS, partitionSchedulingOrders } from '../backend/src/lib/scheduling.js';
import { hasDeliveryCoordinates, parseDeliveryCoordinates } from '../frontend/src/lib/addressCoordinates.js';
import { validCoordinates } from '../backend/src/routes/customer.routes.js';
import { runPendingScheduling, runPendingSchedulingOnce } from '../backend/src/lib/scheduling-cron.js';

const now = Date.parse('2026-11-25T10:00:00Z');
const iso = (minutes) => new Date(now + minutes * 60_000).toISOString();
const point = (latitude, longitude) => ({ latitude, longitude });
const order = (id, lat = 15.85, deadline = 90) => ({ id, status: 'confirmed', estimated_ready_at: iso(10), delivery_window_start: iso(20), delivery_window_end: iso(deadline), pickup: { ...point(15.85, 74.50), address_line: 'Kitchen' }, dropoff: point(lat, 74.52), restaurant: { ...point(15.85, 74.50), address_line: 'Kitchen' }, delivery_address_line: 'Customer', delivery_latitude: lat, delivery_longitude: 74.52 });
const rider = (id, extra = {}) => ({ id, ...point(15.85, 74.50), active: true, verified: true, available: true, shift: { starts_at: iso(-20), ends_at: iso(120), break_minutes: 0 }, load: 0, max_concurrent_orders: 2, ...extra });

test('Dijkstra finds the minimum weighted path, not the direct edge', () => {
  assert.deepEqual(shortestPath({ A: { B: 1, C: 10 }, B: { C: 2 }, C: {} }, 'A', 'C'), { path: ['A', 'B', 'C'], distanceKm: 3 });
});
test('candidate scoring is deterministic and favors available lower workload', () => {
  const a = solve([order('a')], [rider('b'), rider('a')], { now });
  const b = solve([order('a')], [rider('b'), rider('a')], { now });
  assert.equal(a.placements[0].rider.id, 'a');
  assert.equal(a.placements[0].score, b.placements[0].score);
});
test('hard availability, shift, capacity, and existing commitments are never scored as feasible', () => {
  for (const overrides of [{ available: false }, { shift: null }, { shift: { starts_at: iso(-20), ends_at: iso(3), break_minutes: 0 } }, { load: 2 }, { load: 1 }]) {
    const result = solve([order('a')], [rider('a', overrides)], { now });
    assert.equal(result.metrics.feasible_assignments, 0);
  }
});
test('deadlines and invalid records are rejected', () => {
  assert.equal(solve([order('a', 15.85, 11)], [rider('a')], { now }).placements.length, 0);
  assert.ok(validateOrder({ ...order('a'), delivery_latitude: null }, now).includes('missing_coordinates'));
});
test('route honors pickup before dropoff and batches compatible orders', () => {
  const result = solve([order('a'), order('b', 15.851)], [rider('a')], { now });
  assert.equal(result.metrics.feasible_assignments, 2);
  for (const id of ['a', 'b']) {
    const stops = result.placements[0].route.stops;
    assert.ok(stops.findIndex((s) => s.order_id === id && s.stop_type === 'pickup') < stops.findIndex((s) => s.order_id === id && s.stop_type === 'dropoff'));
  }
});
test('incompatible batching is rejected even with spare capacity', () => {
  const result = solve([order('a'), { ...order('b', 16.2), pickup: { ...point(16.2, 75.2) } }], [rider('a')], { now });
  assert.equal(result.metrics.feasible_assignments, 1);
});
test('bounded search reports bounded rather than optimal', () => {
  assert.equal(solve([order('a'), order('b')], [rider('a')], { now, maxNodes: 1 }).metrics.termination, 'bounded');
});
test('runtime: demo break duration reserves shift tail without inventing an interval', () => {
  const shift = usableShift({ starts_at: iso(-20), ends_at: iso(60), break_minutes: 30 }, now);
  assert.equal(shift.ends_at, iso(30));
  assert.equal(shift.original_ends_at, iso(60));
  assert.equal(solve([order('a')], [rider('a', { shift })], { now }).metrics.feasible_assignments, 1);
  assert.equal(solve([order('a')], [rider('a', { shift: usableShift({ starts_at: iso(-20), ends_at: iso(22), break_minutes: 30 }, now) })], { now }).metrics.feasible_assignments, 0);
});
test('runtime: dispatch lead time gives first leg headroom and keeps travel constraints', () => {
  const result = solve([order('a')], [rider('a', { latitude: 15.855 })], { now: now + DISPATCH_LEAD_MS });
  const first = Date.parse(result.placements[0].route.stops[0].planned_arrival);
  assert.ok(first >= now + DISPATCH_LEAD_MS);
  assert.ok(first > now + DISPATCH_LEAD_MS + 30_000);
});
test('runtime: explicit requests reject duplicates, missing records and wrong lifecycle', () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  assert.throws(() => assertRequestedIds([a, a]), { code: '22023' });
  assert.throws(() => assertRequestedOrders([a, b], [{ id: a, status: 'confirmed' }]), { code: 'P0002' });
  assert.throws(() => assertRequestedOrders([a], [{ id: a, status: 'pending' }]), { code: '23514' });
  assert.doesNotThrow(() => assertRequestedOrders([a], [{ id: a, status: 'assigned' }], true));
});
test('static transaction boundary locks resources, limits RPC execution and records proposals', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261125100100_constraint_scheduling.sql', import.meta.url), 'utf8');
  assert.match(sql, /from public\.orders where id = any\(p_order_ids\) order by id for update/i);
  assert.match(sql, /from public\.riders[\s\S]*?order by id for update/i);
  assert.match(sql, /revoke all on function public\.persist_schedule[\s\S]*?authenticated;/i);
  assert.match(sql, /insert into public\.assignments[\s\S]*?insert into public\.route_stops/i);
  assert.match(sql, /exists \(select 1 from public\.assignments where order_id = v_id and is_current\)/i);
});
test('static SQL: rejects repeat riders, malformed input, and checks every requested order', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261125100100_constraint_scheduling.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_rider_id = any\(v_seen_riders\)/i);
  assert.match(sql, /foreach v_id in array p_order_ids loop[\s\S]*?Requested order does not exist/);
  assert.match(sql, /jsonb_typeof\(v_stop -> 'planned_departure'\) is distinct from 'string'/);
  assert.match(sql, /jsonb_typeof\(v_stop -> 'latitude'\) is distinct from 'number'/);
  assert.match(sql, /ends_at - make_interval\(mins => v_shift\.break_minutes\)/);
  assert.match(sql, /A batched route cannot be overridden individually/);
  assert.doesNotMatch(sql, /perform 1 from public\.riders where id = v_old\.rider_id for update/);
});
test('static grants and assignment reads exclude explanations from browser roles', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261125100100_constraint_scheduling.sql', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../frontend/src/services/riders.js', import.meta.url), 'utf8');
  const grants = sql.match(/grant select \([\s\S]*?\)\s+on public\.assignments to authenticated;/i)?.[0];
  assert.ok(grants);
  assert.doesNotMatch(grants, /scheduling_explanation/);
  assert.doesNotMatch(client, /from\('assignments'\)\.select\('\*'\)/);
  assert.doesNotMatch(client.match(/const ASSIGNMENT_FIELDS = `[\s\S]*?`/)?.[0] ?? '', /scheduling_explanation/);
});

test('runtime: cron retries durable unassigned work but skips assigned and recent attempts', async () => {
  const a = '00000000-0000-4000-8000-000000000001';
  const b = '00000000-0000-4000-8000-000000000002';
  const c = '00000000-0000-4000-8000-000000000003';
  const owner = '00000000-0000-4000-8000-000000000004';
  const attempts = [];
  const clientFactory = () => ({ from(table) {
    return {
      select() { return this; }, in() { return this; }, order() { return this; }, gt() { return this; },
      limit() { return Promise.resolve({ data: [{ input_snapshot: { order_ids: [b] }, created_at: new Date().toISOString() }] }); },
      range() { return Promise.resolve({ data: [a, b, c].map((id) => ({ id, restaurant: { owner_id: owner } })) }); },
      eq() { return Promise.resolve({ data: [{ order_id: a }] }); },
    };
  } });
  await runPendingScheduling({}, { clientFactory, scheduleOrder: async (_client, work) => attempts.push(work) });
  assert.deepEqual(attempts, [{ ids: [c], actorId: owner, source: 'automatic' }]);
});

test('runtime: cron retries repaired invalid orders and holds failed attempts for five minutes', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const owner = '00000000-0000-4000-8000-000000000004';
  const attempts = [];
  let minutesAgo = 3;
  const fresh = { ...order(id), estimated_ready_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    delivery_window_start: new Date(Date.now() + 20 * 60_000).toISOString(),
    delivery_window_end: new Date(Date.now() + 90 * 60_000).toISOString(),
    restaurant: { ...order(id).restaurant, owner_id: owner } };
  const clientFactory = () => ({ from(table) {
    return {
      select() { return this; }, in() { return this; }, order() { return this; }, gt() { return this; },
      limit() { return Promise.resolve({ data: [{ status: 'failed', input_snapshot: { order_ids: [id] }, created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() }] }); },
      range() { return Promise.resolve({ data: [fresh] }); },
      eq() { return Promise.resolve({ data: table === 'constraint_violations' ? [{ order_id: id }] : [] }); },
    };
  } });
  await runPendingScheduling({}, { clientFactory, scheduleOrder: async (_client, work) => attempts.push(work) });
  assert.deepEqual(attempts, []);
  minutesAgo = 6;
  await runPendingScheduling({}, { clientFactory, scheduleOrder: async (_client, work) => attempts.push(work) });
  assert.deepEqual(attempts, [{ ids: [id], actorId: owner, source: 'automatic' }]);
});

test('runtime: failed cron scheduling retains a retryable order and records a failed run', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const owner = '00000000-0000-4000-8000-000000000004';
  const recorded = [];
  const clientFactory = () => ({ from(table) {
    return {
      select() { return this; }, in() { return this; }, gt() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: [] }); },
      range() { return Promise.resolve({ data: [{ id, restaurant: { owner_id: owner } }] }); },
      eq() { return Promise.resolve({ data: [] }); },
      insert(row) { recorded.push({ table, row }); return Promise.resolve({ data: null }); },
    };
  } });
  const originalError = console.error;
  console.error = () => {};
  try {
    await runPendingScheduling({}, { clientFactory, scheduleOrder: async () => { const error = new Error('offline'); error.stage = 'resources'; throw error; } });
  } finally { console.error = originalError; }
  assert.deepEqual(recorded.map((entry) => entry.table), ['scheduling_runs']);
  assert.equal(recorded[0].row.status, 'failed');
  assert.deepEqual(recorded[0].row.input_snapshot.order_ids, [id]);
  assert.equal(recorded[0].row.metrics.stage, 'resources');
});

test('static: confirmation is not blocked by scheduling and admin loading is scoped', () => {
  const restaurant = readFileSync(new URL('../backend/src/routes/restaurant.routes.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../backend/src/index.js', import.meta.url), 'utf8');
  const wrangler = readFileSync(new URL('../backend/wrangler.jsonc', import.meta.url), 'utf8');
  const dispatch = readFileSync(new URL('../frontend/src/portals/admin/pages/AdminDispatch.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(restaurant, /await schedule\(/);
  assert.match(worker, /scheduled:.*ctx\.waitUntil\(runPendingSchedulingOnce\(env\)\)/);
  assert.match(wrangler, /"crons": \[\]/);
  assert.match(dispatch, /loading=\{schedulingTarget === order\.id\}/);
  const scheduling = readFileSync(new URL('../backend/src/lib/scheduling.js', import.meta.url), 'utf8');
  assert.match(scheduling, /timeoutMs: SCHEDULING_TIMEOUT_MS/);
  assert.match(scheduling, /timed\('persist_rpc'/);
});

test('runtime: overlapping cron events share one in-flight scheduling run', async () => {
  let release;
  let queueCalls = 0;
  const blocked = new Promise((resolve) => { release = resolve; });
  const clientFactory = () => ({ from: (table) => ({ select: () => table === 'scheduling_runs'
    ? { order: () => ({ limit: async () => { queueCalls += 1; await blocked; return { data: [], error: null }; } }) }
    : { in: () => ({ gt: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) }) } }) });
  const options = {
    clientFactory,
    scheduleOrder: async () => {},
  };
  const first = runPendingSchedulingOnce({}, options);
  const second = runPendingSchedulingOnce({}, options);
  assert.equal(first, second);
  release();
  await first;
  assert.equal(queueCalls, 1);
});

test('static: scheduling timeout is created per privileged HTTP request', () => {
  const supabase = readFileSync(new URL('../backend/src/lib/supabase.js', import.meta.url), 'utf8');
  assert.match(supabase, /fetch: \(input, init\) => fetch\(input, \{[\s\S]*?AbortSignal\.timeout\(timeoutMs\)/);
});

test('runtime: candidate generation obeys its bound before search begins', () => {
  const result = solve([order('a'), order('b')], [rider('a'), rider('b')], { now, maxCandidates: 1 });
  assert.equal(result.metrics.termination, 'bounded');
  assert.equal(result.metrics.candidates_evaluated, 1);
});

test('runtime: valid CSP result matches deployed RPC JSON contract', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const riderId = '00000000-0000-4000-8000-000000000002';
  const item = order(id);
  const result = solve([item], [rider(riderId)], { now });
  const payload = schedulePayload([item], result, riderId, 'admin');
  assert.equal(payload.p_plan.length, 1);
  const route = payload.p_plan[0];
  assert.equal(typeof route.score, 'number');
  assert.equal(typeof route.distance_meters, 'number');
  assert.deepEqual(route.order_ids, [id]);
  assert.deepEqual(route.stops.map((stop) => stop.stop_type), ['pickup', 'dropoff']);
  for (const stop of route.stops) {
    assert.match(stop.planned_arrival, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z$/);
    assert.equal(typeof stop.latitude, 'number');
    assert.equal(typeof stop.longitude, 'number');
    assert.ok(stop.address_line?.trim());
  }
  assert.deepEqual(payloadContractErrors(payload), []);
  assert.deepEqual(payloadContractErrors({ ...payload, p_plan: [{ ...route, stops: [{ ...route.stops[0], address_line: null }, route.stops[1]] }] }), ['route[0].stop[0]']);
});

test('runtime: invalid snapshot is separated from feasible orders before RPC', () => {
  const valid = order('good');
  const invalid = { ...order('bad'), delivery_latitude: null, delivery_longitude: null };
  const expired = order('expired', 15.85, -1);
  const partition = partitionSchedulingOrders([valid, invalid, expired], now);
  assert.deepEqual(partition.valid.map((entry) => entry.id), ['good']);
  assert.deepEqual(partition.invalid.map((entry) => entry.id), ['bad', 'expired']);
});

test('runtime: diagnostics reveal fixed SQL messages without echoing arbitrary details', () => {
  assert.deepEqual(safeSchedulingDiagnostic({ code: '22023', message: 'Invalid route stop.', details: 'private address', hint: 'private' }),
    { code: '22023', message: 'Invalid route stop.', details: '[redacted]', hint: '[redacted]' });
});

test('runtime: address coordinates are required at creation and checkout', () => {
  assert.equal(hasDeliveryCoordinates({ latitude: null, longitude: null }), false);
  assert.equal(validCoordinates(null, null), false);
  assert.throws(() => parseDeliveryCoordinates({ latitude: '', longitude: '' }), /latitude/);
  assert.throws(() => parseDeliveryCoordinates({ latitude: 91, longitude: 0 }), /latitude/);
  assert.deepEqual(parseDeliveryCoordinates({ latitude: '15.85', longitude: '74.5' }), { latitude: 15.85, longitude: 74.5 });
});

test('runtime: blank map coordinates are not converted to Null Island', async () => {
  const { coordinatePoint } = await import('../frontend/src/lib/addressCoordinates.js');
  assert.equal(coordinatePoint({ latitude: '', longitude: '' }), null);
  assert.equal(coordinatePoint({ latitude: null, longitude: null }), null);
  assert.deepEqual(coordinatePoint({ latitude: '15.85', longitude: '74.5' }), { latitude: 15.85, longitude: 74.5 });
});

test('static: atomic new-order guard preserves existing rows while rejecting new coordinate-free checkout', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261125100200_checkout_scheduling_coordinates.sql', import.meta.url), 'utf8');
  assert.match(sql, /before insert on public\.orders/i);
  assert.match(sql, /new\.delivery_latitude is null or new\.delivery_longitude is null/i);
  assert.doesNotMatch(sql, /update public\.orders|delete from public\.orders/i);
});

test('static: additive fix changes only JSON scalar UUID extraction and retains RPC grants', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261125100300_fix_route_order_id_validation.sql', import.meta.url), 'utf8');
  assert.match(sql, /pg_get_functiondef\('public\.persist_schedule/);
  assert.match(sql, /x\.value #>> ''\{\}'' !~\*/);
  assert.match(sql, /btrim\(x\.value::text, chr\(34\)\) !~\*/);
  assert.match(sql, /revoke all on function public\.persist_schedule[\s\S]*grant execute on function public\.persist_schedule/);
  const id = 'c81f1f1c-ecac-4c8c-b16b-16f59147da1b';
  assert.equal(JSON.stringify(id).replace(/^"|"$/g, ''), id);
});

test('runtime: route-order UUID validator accepts canonical UUIDs and rejects malformed IDs', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261125100500_fix_route_order_uuid_pattern.sql', import.meta.url), 'utf8');
  const pattern = migration.match(/v_new constant text := 'x\.value !~\* ''(\^\[[^']+\$)''';/)?.[1];
  assert.ok(pattern, 'additive migration must declare the new UUID regex');
  const valid = new RegExp(pattern, 'i');
  assert.equal(valid.test('c81f1f1c-ecac-4c8c-b16b-16f59147da1b'), true);
  assert.equal(valid.test('00000000-0000-4000-8000-000000000001'), true);
  assert.equal(valid.test('c81f1f1c-ecac-4c8c-b16b-16f59147da1'), false);
  assert.equal(valid.test('c81f1f1c-ecac-4c8c-9683091804ee'), false);
  assert.equal(valid.test('invalid'), false);
  assert.match(migration, /execute replace\(v_definition, v_old, v_new\)/);
});
