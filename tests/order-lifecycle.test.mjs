/**
 * Focused offline checks for the Phase 5 order lifecycle.
 *
 * Pure request validation runs against the real backend helpers. Database
 * transitions, grants and history are audited textually. These are STATIC tests,
 * not database integration tests: applying migration 7 and exercising the RPCs
 * against PostgreSQL requires an approved remote Supabase project and is listed
 * as manual verification in docs/PHASE5_ORDER_LIFECYCLE.md. No database
 * integration test was executed by the assistant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  computeOrderSummary,
  normalizeItems,
  validateOrderTarget,
  validateTransitionBody,
} from '../backend/src/lib/orderLifecycle.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

const phase3Grants = read('supabase', 'migrations', '20261124100600_grants.sql');
const lifecycleSql = read('supabase', 'migrations', '20261124100700_order_lifecycle.sql');
const lifecycleLib = read('backend', 'src', 'lib', 'orderLifecycle.js');
const routesIndex = read('backend', 'src', 'routes', 'index.js');
const customerRoutes = read('backend', 'src', 'routes', 'customer.routes.js');
const restaurantRoutes = read('backend', 'src', 'routes', 'restaurant.routes.js');
const adminRoutes = read('backend', 'src', 'routes', 'admin.routes.js');
const riderRoutes = read('backend', 'src', 'routes', 'rider.routes.js');
const lifecycleClient = read('frontend', 'src', 'services', 'lifecycle.js');
const seedSource = read('backend', 'scripts', 'seed-demo.js');

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const ITEM_B = '22222222-2222-4222-8222-222222222222';
const RESTAURANT = '33333333-3333-4333-8333-333333333333';
const ADDRESS = '44444444-4444-4444-8444-444444444444';

test('order target validation accepts a valid single-restaurant cart', () => {
  const target = validateOrderTarget({
    restaurantId: RESTAURANT,
    addressId: ADDRESS,
    items: [
      { menuItemId: ITEM_A, quantity: 2 },
      { menuItemId: ITEM_B, quantity: 1, notes: 'Less spicy' },
    ],
  });

  assert.equal(target.error, undefined);
  assert.equal(target.restaurantId, RESTAURANT);
  assert.equal(target.addressId, ADDRESS);
  assert.deepEqual(target.items, [
    { menu_item_id: ITEM_A, quantity: 2, notes: null },
    { menu_item_id: ITEM_B, quantity: 1, notes: 'Less spicy' },
  ]);
});

test('order target validation rejects invalid ids and missing items', () => {
  assert.match(
    validateOrderTarget({ restaurantId: 'not-a-uuid', addressId: ADDRESS, items: [{ menuItemId: ITEM_A, quantity: 1 }] }).error,
    /valid restaurant/i,
  );
  assert.match(
    validateOrderTarget({ restaurantId: RESTAURANT, addressId: 'nope', items: [{ menuItemId: ITEM_A, quantity: 1 }] }).error,
    /valid delivery address/i,
  );
  assert.match(
    validateOrderTarget({ restaurantId: RESTAURANT, addressId: ADDRESS, items: [] }).error,
    /at least one menu item/i,
  );
});

test('normalizeItems rejects duplicate lines, bad quantities and long notes', () => {
  assert.match(
    normalizeItems([
      { menuItemId: ITEM_A, quantity: 1 },
      { menuItemId: ITEM_A, quantity: 2 },
    ]).error,
    /only once/i,
  );
  assert.match(normalizeItems([{ menuItemId: ITEM_A, quantity: 0 }]).error, /between 1 and 50/i);
  assert.match(normalizeItems([{ menuItemId: ITEM_A, quantity: 1.5 }]).error, /whole numbers/i);
  assert.match(
    normalizeItems([{ menuItemId: ITEM_A, quantity: 1, notes: 'x'.repeat(281) }]).error,
    /280/,
  );
  assert.match(
    normalizeItems(Array.from({ length: 51 }, () => ({ menuItemId: ITEM_A, quantity: 1 }))).error,
    /at most 50/i,
  );
});

test('transition validation enforces status names and preparation bounds', () => {
  assert.equal(validateTransitionBody({ status: 'confirmed', expectedStatus: 'pending', prepTimeMinutes: 25 }).status, 'confirmed');
  assert.match(validateTransitionBody({ status: 'teleported' }).error, /valid next status/i);
  assert.match(validateTransitionBody({ status: 'confirmed', prepTimeMinutes: 0 }).error, /between 1 and 240/i);
  assert.match(validateTransitionBody({ status: 'confirmed', prepTimeMinutes: 241 }).error, /between 1 and 240/i);
  assert.match(validateTransitionBody({ status: 'cancelled', reason: 'x'.repeat(281) }).error, /280/);
  assert.match(validateTransitionBody({ status: 'cancelled', expectedStatus: 'nonsense' }).error, /expected status/i);
});

test('order summaries split active, delivered and rejected records', () => {
  const summary = computeOrderSummary([
    { status: 'pending', total_minor: 1000 },
    { status: 'preparing', total_minor: 2000 },
    { status: 'picked_up', total_minor: 3000 },
    { status: 'out_for_delivery', total_minor: 4000 },
    { status: 'delivered', total_minor: 5000 },
    { status: 'rejected', total_minor: 6000 },
  ]);

  assert.equal(summary.total, 6);
  assert.equal(summary.pending, 1);
  assert.equal(summary.preparing, 1);
  assert.equal(summary.pickedUp, 1);
  assert.equal(summary.outForDelivery, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.cancelled, 1);
  assert.equal(summary.active, 4);
  assert.equal(summary.revenueMinor, 5000);
});

test('database transition matrix keeps roles inside their permitted states', () => {
  assert.match(lifecycleSql, /v_order\.status in \('pending', 'confirmed'\) and p_next = 'cancelled'/i);
  assert.match(lifecycleSql, /v_order\.status = 'pending' and p_next = 'confirmed'/i);
  assert.match(lifecycleSql, /v_order\.status = 'confirmed' and p_next = 'preparing'/i);
  assert.match(lifecycleSql, /v_order\.status = 'preparing' and p_next = 'ready'/i);
  assert.match(lifecycleSql, /v_order\.status in \('ready', 'assigned'\) and p_next = 'picked_up'/i);
  assert.match(lifecycleSql, /Pickup is blocked until the restaurant marks the order ready/i);
  assert.match(lifecycleSql, /v_assignment\.status not in \('accepted', 'active'\)/i);
  assert.match(lifecycleSql, /v_order\.status = 'picked_up' and p_next = 'out_for_delivery'/i);
  assert.match(lifecycleSql, /v_order\.status = 'out_for_delivery' and p_next = 'delivered'/i);
});

test('manual assignment re-checks rider profile, shift, capacity and conflicts', () => {
  assert.match(lifecycleSql, /v_profile\.role <> 'rider'/i);
  assert.match(lifecycleSql, /v_rider\.verification_status <> 'verified'/i);
  assert.match(lifecycleSql, /not v_rider\.is_available/i);
  assert.match(lifecycleSql, /starts_at <= v_now\s+and ends_at > v_now/i);
  assert.match(lifecycleSql, /v_load >= v_rider\.max_concurrent_orders/i);
  assert.match(lifecycleSql, /v_shift\.ends_at < v_delivery/i);
  assert.match(
    lifecycleSql,
    /from public\.riders\s+where id = p_rider_id\s+for update/i,
    'rider rows must be locked while capacity is checked',
  );
  assert.match(lifecycleSql, /The current assignment changed\. Refresh before reassigning/i);
  assert.match(lifecycleSql, /status = 'reassigned'/i);
  assert.match(lifecycleSql, /create unique index assignments_one_active_per_order_idx/i);
});

test('rider responses are restricted to the owning rider and proposed rows', () => {
  assert.match(lifecycleSql, /v_assignment\.rider_id <> p_rider_id/i);
  assert.match(lifecycleSql, /This assignment belongs to another delivery partner/i);
  assert.match(lifecycleSql, /if v_assignment\.status <> 'proposed' then/i);
  assert.match(lifecycleSql, /if v_assignment\.status = 'rejected' and not p_accept then/i);
  assert.match(lifecycleSql, /if v_assignment\.status = 'accepted' and p_accept then/i);
  assert.match(lifecycleSql, /This assignment can no longer be accepted or rejected/i);

  const respondAssignment = lifecycleSql.slice(
    lifecycleSql.indexOf('create or replace function public.respond_assignment'),
  );
  const orderLock = respondAssignment.search(
    /from public\.orders\s+where id = v_order_id\s+for update/i,
  );
  const assignmentLock = respondAssignment.search(
    /from public\.assignments\s+where id = p_assignment_id\s+for update/i,
  );
  assert.ok(orderLock >= 0, 'respond_assignment must lock the order row');
  assert.ok(assignmentLock >= 0, 'respond_assignment must lock the assignment row');
  assert.ok(
    orderLock < assignmentLock,
    'respond_assignment must lock orders before assignments like the other lifecycle RPCs',
  );
});

test('trusted routes mount one role scope and call the matching database RPC', () => {
  for (const mount of ['/customer', '/restaurant', '/admin', '/rider']) {
    assert.match(routesIndex, new RegExp(`route\\('${mount}'`), `missing ${mount} mount`);
  }

  assert.match(customerRoutes, /requireRole\('customer'\)/);
  assert.match(customerRoutes, /rpc\('quote_order'/);
  assert.match(customerRoutes, /rpc\('create_order'/);
  assert.match(customerRoutes, /rpc\('transition_order_status'/);

  assert.match(restaurantRoutes, /requireRole\('restaurant'\)/);
  assert.match(restaurantRoutes, /rpc\('transition_order_status'/);

  assert.match(adminRoutes, /requireRole\('admin'\)/);
  assert.match(adminRoutes, /rpc\('assign_rider'/);
  assert.match(adminRoutes, /rpc\('transition_order_status'/);

  assert.match(riderRoutes, /requireRole\('rider'\)/);
  assert.match(riderRoutes, /rpc\('respond_assignment'/);
  assert.match(riderRoutes, /rpc\('transition_order_status'/);
});

test('browser lifecycle client never touches a secret key or writes Supabase rows', () => {
  assert.match(lifecycleClient, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(lifecycleClient, /SUPABASE_SECRET_KEY|service_role/i);
  assert.doesNotMatch(lifecycleClient, /\.from\(/);
  assert.doesNotMatch(lifecycleClient, /\.insert\(|\.update\(/);
});

test('demo rider shifts cover the current time for assignment eligibility', () => {
  assert.match(seedSource, /now\.getTime\(\) - 60 \* 60_000/);
  assert.match(seedSource, /now\.getTime\(\) \+ \(8 \+ index\) \* 60 \* 60_000/);
  assert.doesNotMatch(seedSource, /at\(1, 9 \+ index/);
});

test('STATIC: Phase 3 column grants are closed without losing read or read_at grants', () => {
  assert.match(
    phase3Grants,
    /grant update \(status, cancellation_reason\) on public\.orders to authenticated;/i,
  );
  assert.match(
    lifecycleSql,
    /revoke update \(status, cancellation_reason\) on public\.orders from authenticated;/i,
  );
  assert.match(lifecycleSql, /grant select on public\.order_status_events to authenticated;/i);
  assert.match(lifecycleSql, /grant select on public\.assignment_events to authenticated;/i);
  assert.doesNotMatch(
    lifecycleSql,
    /revoke update \(read_at\) on public\.notifications from authenticated;/i,
  );

  for (const rpc of [
    'quote_order',
    'create_order',
    'transition_order_status',
    'assign_rider',
    'respond_assignment',
  ]) {
    assert.match(
      lifecycleSql,
      new RegExp(`revoke all on function public\\.${rpc}\\(`, 'i'),
      `${rpc} must be revoked from browser roles`,
    );
    assert.match(
      lifecycleSql,
      new RegExp(`grant execute on function public\\.${rpc}\\([\\s\\S]*?to service_role;`, 'i'),
      `${rpc} must be granted to service_role only`,
    );
  }
});

test('STATIC: planned delivery uses provisional travel, window checks and full shift', () => {
  assert.match(lifecycleSql, /v_travel_minutes constant integer := 25/i);
  assert.match(
    lifecycleSql,
    /v_delivery := greatest\(\s*v_pickup \+ make_interval\(mins => v_travel_minutes\)/i,
  );
  assert.match(lifecycleSql, /v_delivery > v_order\.delivery_window_end/i);
  assert.match(lifecycleSql, /v_shift\.ends_at < v_delivery/i);
  assert.doesNotMatch(lifecycleSql, /v_delivery := greatest\(v_order\.delivery_window_end/i);

  assert.match(adminRoutes, /DISPATCH_BUFFER_MS = 5 \* 60_000/);
  assert.match(adminRoutes, /PROVISIONAL_TRAVEL_MS = 25 \* 60_000/);
  assert.match(adminRoutes, /feasible:[\s\S]*?deliveryMs <= windowEnd/);
  assert.match(adminRoutes, /!plan\.feasible/);
  assert.match(adminRoutes, /Date\.parse\(shift\.ends_at\) < deliveryMs/);
});

test('STATIC: reassignment restores the assigned invariant and preserves history', () => {
  assert.match(lifecycleSql, /Assignments cannot be changed after pickup/i);
  assert.match(lifecycleSql, /v_current\.status in \('active', 'completed'\)/i);
  assert.match(lifecycleSql, /v_restore_ready boolean := false/i);
  assert.match(
    lifecycleSql,
    /set status = 'ready'\s+where id = p_order_id and status = 'assigned'/i,
  );
  assert.match(lifecycleSql, /'assigned', 'ready', p_assigned_by, 'admin'/i);
  assert.match(lifecycleSql, /v_current\.id, v_current\.status, 'reassigned'/i);
  assert.match(lifecycleSql, /'Assignment replaced'/i);
});

test('STATIC: rider responses validate state and re-check rider constraints', () => {
  assert.match(lifecycleSql, /if p_accept is null then/i);
  assert.match(lifecycleSql, /A reason is required when declining an assignment/i);
  assert.match(lifecycleSql, /if not v_assignment\.is_current then/i);
  assert.match(
    lifecycleSql,
    /v_order\.status not in \('confirmed', 'preparing', 'ready', 'assigned'\)/i,
  );
  assert.match(lifecycleSql, /v_rider\.verification_status <> 'verified'/i);
  assert.match(lifecycleSql, /not v_rider\.is_available/i);
  assert.match(lifecycleSql, /v_shift\.ends_at < v_assignment\.planned_delivery_at/i);
  assert.match(lifecycleSql, /v_load >= v_rider\.max_concurrent_orders/i);
  assert.match(lifecycleSql, /'status', 'rejected', 'duplicate', true/i);

  const respondAssignment = lifecycleSql.slice(
    lifecycleSql.indexOf('create or replace function public.respond_assignment'),
  );
  const declineGuard = respondAssignment.search(/Declining must remain possible/i);
  const riderLock = respondAssignment.search(
    /from public\.riders\s+where id = p_rider_id\s+for update/i,
  );
  assert.ok(declineGuard >= 0, 'declines must not be blocked by accept-only constraints');
  assert.ok(riderLock > declineGuard, 'rider constraints must be revalidated only on accept');
});

test('STATIC: assignment history events and deterministic ordering are wired', () => {
  assert.match(lifecycleSql, /v_assignment\.status, 'active'/i);
  assert.match(lifecycleSql, /v_assignment\.status, 'completed'/i);
  assert.match(lifecycleSql, /v_affected_assignment\.status, 'cancelled'/i);
  assert.match(lifecycleSql, /'Order ready for pickup'/i);
  assert.match(lifecycleSql, /'Delivery cancelled'/i);
  assert.match(lifecycleSql, /order_status_events \(order_id, created_at, id\)/i);
  assert.match(lifecycleSql, /assignment_events \(assignment_id, created_at, id\)/i);

  const orderEvents = lifecycleLib.slice(lifecycleLib.indexOf('export async function getOrderEvents'));
  const assignmentEvents = lifecycleLib.slice(
    lifecycleLib.indexOf('export async function getAssignmentEvents'),
  );
  assert.match(orderEvents.slice(0, 600), /\.order\('id', \{ ascending: true \}\)/);
  assert.match(assignmentEvents.slice(0, 600), /\.order\('id', \{ ascending: true \}\)/);
});
