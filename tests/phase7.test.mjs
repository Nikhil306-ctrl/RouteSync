/**
 * Phase 7 offline checks: routing helpers, location privacy and static
 * verification of the live-operations RPCs, Worker routes and portal wiring.
 *
 * These are STATIC / PURE tests. They do not call Supabase, OSRM or a database.
 * Remote migration application and end-to-end map/GPS behaviour remain manual.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  geographicEstimate,
  osrmUrl,
  parseOsrmRoute,
  routeSummary,
  fetchRoadRoute,
} from '../frontend/src/lib/routing.js';
import {
  TRACKING_STALE_MS,
  publicRiderLocation,
  validCoordinates,
} from '../backend/src/lib/orderLifecycle.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(projectRoot, ...parts));

const migration = read('supabase', 'migrations', '20261126100100_phase7_live_operations.sql');
const schedulingMigration = read('supabase', 'migrations', '20261125100100_constraint_scheduling.sql');
const lifecycleMigration = read('supabase', 'migrations', '20261124100700_order_lifecycle.sql');
const customerRoutes = read('backend', 'src', 'routes', 'customer.routes.js');
const restaurantRoutes = read('backend', 'src', 'routes', 'restaurant.routes.js');
const riderRoutes = read('backend', 'src', 'routes', 'rider.routes.js');
const adminRoutes = read('backend', 'src', 'routes', 'admin.routes.js');
const lifecycleClient = read('frontend', 'src', 'services', 'lifecycle.js');
const mainSource = read('frontend', 'src', 'main.jsx');
const kitchenBoard = read('frontend', 'src', 'portals', 'restaurant', 'pages', 'KitchenBoard.jsx');
const adminRescheduling = read('frontend', 'src', 'portals', 'admin', 'pages', 'AdminRescheduling.jsx');
const adminAnalytics = read('frontend', 'src', 'portals', 'admin', 'pages', 'AdminAnalytics.jsx');
const packageJson = JSON.parse(read('package.json'));
const phase8Migration = read('supabase', 'migrations', '20261127100100_phase8_security_reliability.sql');

const A = { latitude: 15.8497, longitude: 74.4977 };
const B = { latitude: 15.8612, longitude: 74.5089 };

test('OSRM request uses longitude,latitude order', () => {
  const url = osrmUrl([A, B]);
  assert.match(url, /74\.4977,15\.8497;74\.5089,15\.8612/);
  assert.match(url, /overview=full/);
  assert.match(url, /geometries=geojson/);
});

test('OSRM payload is converted to latitude,longitude pairs', () => {
  const route = parseOsrmRoute({
    code: 'Ok',
    routes: [
      {
        distance: 1234.4,
        duration: 321.6,
        geometry: { coordinates: [[74.4977, 15.8497], [74.5089, 15.8612]] },
      },
    ],
  });
  assert.equal(route.provider, 'osrm');
  assert.equal(route.fallback, false);
  assert.deepEqual(route.coordinates, [[15.8497, 74.4977], [15.8612, 74.5089]]);
  assert.equal(route.distanceMeters, 1234);
  assert.equal(route.durationSeconds, 322);
});

test('invalid OSRM payloads are rejected instead of drawing a fake route', () => {
  assert.throws(() => parseOsrmRoute({ code: 'NoRoute', routes: [] }), /usable road route/i);
  assert.throws(
    () => parseOsrmRoute({ code: 'Ok', routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 2]] } }] }),
    /usable road route/i,
  );
  assert.throws(
    () => parseOsrmRoute({ code: 'Ok', routes: [{ distance: 'bad', duration: 1, geometry: { coordinates: [[1, 2], [3, 4]] } }] }),
    /invalid distance or duration/i,
  );
});

test('geographic fallback is explicitly labelled and measured', () => {
  const estimate = geographicEstimate([A, B]);
  assert.equal(estimate.fallback, true);
  assert.equal(estimate.provider, 'geographic-estimate');
  assert.ok(estimate.distanceMeters > 1000);
  assert.ok(estimate.durationSeconds > 0);
  assert.equal(routeSummary(estimate).label, 'Straight-line estimate · road routing unavailable');
});

test('road route falls back when the provider is unreachable', async () => {
  const result = await fetchRoadRoute(
    [{ latitude: 15.1, longitude: 74.1 }, { latitude: 15.2, longitude: 74.2 }],
    {
      fetchImpl: async () => {
        throw new Error('offline');
      },
      now: 1,
    },
  );
  assert.equal(result.fallback, true);
  assert.match(result.reason, /offline/);
  assert.equal(routeSummary(result).fallback, true);
});

test('road route uses a valid provider response when available', async () => {
  const result = await fetchRoadRoute(
    [{ latitude: 15.3, longitude: 74.3 }, { latitude: 15.4, longitude: 74.4 }],
    {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 900,
              duration: 180,
              geometry: { coordinates: [[74.3, 15.3], [74.4, 15.4]] },
            },
          ],
        }),
      }),
      now: 1,
    },
  );
  assert.equal(result.provider, 'osrm');
  assert.equal(result.fallback, false);
  assert.equal(routeSummary(result).label, 'Road route via OSRM');
});

test('coordinate validation rejects out-of-range and non-numeric values', () => {
  assert.equal(validCoordinates(15.8, 74.5), true);
  assert.equal(validCoordinates('-15.8', '74.5'), true);
  assert.equal(validCoordinates(91, 74.5), false);
  assert.equal(validCoordinates(15.8, -181), false);
  assert.equal(validCoordinates('north', 74.5), false);
  assert.equal(validCoordinates(null, 74.5), false);
});

test('public rider location never includes identity and marks stale records', () => {
  const recent = publicRiderLocation({
    latitude: '15.8',
    longitude: '74.5',
    accuracy_meters: '12',
    source: 'gps',
    recorded_at: new Date(Date.now() - 60_000).toISOString(),
    rider_id: 'should-not-leak',
  });
  assert.equal(recent.latitude, 15.8);
  assert.equal(recent.longitude, 74.5);
  assert.equal(recent.accuracy_meters, 12);
  assert.equal(recent.stale, false);
  assert.equal('rider_id' in recent, false);

  const stale = publicRiderLocation({
    latitude: 15.8,
    longitude: 74.5,
    source: 'manual',
    recorded_at: new Date(Date.now() - TRACKING_STALE_MS - 60_000).toISOString(),
  });
  assert.equal(stale.stale, true);
  assert.equal(publicRiderLocation(null), null);
});

test('phase 7 migration defines both trusted RPCs with pinned search_path', () => {
  assert.match(migration, /create or replace function public\.report_prep_delay\(/i);
  assert.match(migration, /create or replace function public\.record_rider_location\(/i);
  const definers = [...migration.matchAll(/security definer\s*\n?\s*set search_path = ''/gi)];
  assert.equal(definers.length, 2);
});

test('phase 7 RPCs are service-role-only', () => {
  for (const signature of [
    String.raw`report_prep_delay\(uuid, uuid, text, integer, text\)`,
    String.raw`record_rider_location\(uuid, uuid, numeric, numeric, numeric, text\)`,
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon, authenticated;`, 'i'),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${signature}\\s+to service_role;`, 'i'),
    );
  }
  assert.doesNotMatch(migration, /grant execute on function[\s\S]*?to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function[\s\S]*?to anon/i);
});

test('prep delay enforces window, release and rescheduling semantics', () => {
  assert.match(migration, /delivery_window_end/i);
  assert.match(migration, /falls outside the delivery window/i);
  assert.match(migration, /picked_up_at is not null/i);
  assert.match(migration, /status = 'reassigned'/i);
  assert.match(migration, /rescheduling_pending/i);
  assert.match(migration, /update public\.route_stops[\s\S]*?status = 'skipped'/i);
  assert.match(migration, /order\.prep_delay/i);
  assert.match(migration, /'prep_delay'/i);
});

test('rider location writes validate source, bounds and assignment ownership', () => {
  assert.match(migration, /p_source not in \('gps', 'manual', 'simulated'\)/i);
  assert.match(migration, /public\.location_source/i);
  assert.match(migration, /p_latitude < -90 or p_latitude > 90/i);
  assert.match(migration, /p_longitude < -180 or p_longitude > 180/i);
  assert.match(migration, /rider_id = p_rider_id/i);
  assert.match(migration, /no longer active/i);
  assert.match(migration, /insert into public\.rider_locations/i);
});

test('Worker routes expose tracking, delay and rider location endpoints', () => {
  assert.match(customerRoutes, /router\.get\('\/orders\/:orderId\/tracking'/);
  assert.match(restaurantRoutes, /router\.post\('\/orders\/:orderId\/prep-delay'/);
  assert.match(adminRoutes, /router\.post\('\/orders\/:orderId\/prep-delay'/);
  assert.match(adminRoutes, /router\.get\('\/tracking\/riders'/);
  assert.match(riderRoutes, /router\.post\('\/location'/);
  assert.match(adminRoutes, /p_actor_role: 'admin'/);
  assert.match(restaurantRoutes, /p_actor_role: 'restaurant'/);
  assert.match(riderRoutes, /record_rider_location/);
  assert.match(customerRoutes, /publicRiderLocation/);
});

test('frontend lifecycle client calls every phase 7 endpoint', () => {
  for (const path of [
    '/customer/orders/',
    '/tracking',
    '/restaurant/orders/',
    '/prep-delay',
    '/admin/tracking/riders',
    '/admin/orders/',
    '/rider/location',
  ]) {
    assert.match(lifecycleClient, new RegExp(path.replace(/[/]/g, '\\/')));
  }
  for (const name of [
    'fetchCustomerOrderTracking',
    'reportPrepDelay',
    'reportAdminPrepDelay',
    'fetchAdminRiderTracking',
    'shareRiderLocation',
  ]) {
    assert.match(lifecycleClient, new RegExp(`export function ${name}`));
  }
});

test('map and portal wiring is present', () => {
  assert.match(mainSource, /leaflet\/dist\/leaflet\.css/);
  for (const file of [
    ['frontend', 'src', 'components', 'map', 'MapCanvas.jsx'],
    ['frontend', 'src', 'components', 'map', 'RouteMap.jsx'],
    ['frontend', 'src', 'components', 'map', 'StopsMap.jsx'],
    ['frontend', 'src', 'components', 'map', 'LocationPicker.jsx'],
    ['frontend', 'src', 'components', 'map', 'RiderLocationPanel.jsx'],
    ['frontend', 'src', 'portals', 'admin', 'pages', 'AdminLiveTracking.jsx'],
  ]) {
    assert.equal(exists(...file), true, `${file.join('/')} is missing`);
  }
  assert.match(read('frontend', 'src', 'components', 'map', 'MapCanvas.jsx'), /L\.divIcon/);
  assert.match(kitchenBoard, /reportPrepDelay/);
  assert.match(adminRescheduling, /reportAdminPrepDelay/);
  assert.match(adminAnalytics, /from 'recharts'/);
  assert.match(read('frontend', 'src', 'portals', 'admin', 'pages', 'AdminLiveTracking.jsx'), /fetchAdminRiderTracking/);
  assert.match(read('frontend', 'src', 'portals', 'customer', 'pages', 'CustomerOrderTracking.jsx'), /RouteMap/);
  assert.match(read('frontend', 'src', 'portals', 'customer', 'pages', 'CheckoutPage.jsx'), /RouteMap/);
  assert.match(read('frontend', 'src', 'portals', 'rider', 'pages', 'RiderRoute.jsx'), /RiderLocationPanel/);
});

test('phase 7 test is part of the local suite', () => {
  assert.match(packageJson.scripts['test:local'], /tests\/phase7\.test\.mjs/);
  assert.match(packageJson.scripts['test:local'], /tests\/scheduling\.test\.mjs/);
});

test('phase 8 restricts location writes and fixes assignment-first lock ordering', () => {
  assert.match(phase8Migration, /revoke insert, update, delete on public\.rider_locations from authenticated/i);
  assert.match(phase8Migration, /from public\.assignments[\s\S]*?for update;[\s\S]*?from public\.riders[\s\S]*?for update;/i);
  assert.match(phase8Migration, /not v_assignment\.is_current[\s\S]*?not in \('accepted', 'active'\)/i);
  assert.match(phase8Migration, /grant execute on function public\.record_rider_location[\s\S]*?to service_role/i);
});

test('phase 8 serializes availability, shifts and route relationships', () => {
  assert.match(phase8Migration, /create or replace function public\.set_rider_availability/i);
  assert.match(phase8Migration, /order by order_id, id for update/i);
  assert.match(phase8Migration, /pg_advisory_xact_lock/i);
  assert.match(phase8Migration, /Assignment rider does not match its route/i);
  assert.match(phase8Migration, /Route stop does not match its assignment/i);
});

test('phase 8 patches the exact deployed scheduling signature and fails closed on drift', () => {
  assert.match(schedulingMigration, /public\.persist_schedule\(\s*p_actor_id uuid, p_source text, p_order_ids uuid\[\], p_plan jsonb,\s*p_metrics jsonb, p_rejections jsonb/i);
  const shiftTarget = 'order by ends_at - make_interval(mins => break_minutes) desc limit 1;';
  assert.equal(schedulingMigration.split(shiftTarget).length - 1, 2);
  assert.match(phase8Migration, /persist_schedule\(uuid,text,uuid\[\],jsonb,jsonb,jsonb\)'::regprocedure/i);
  assert.match(phase8Migration, /expected exactly two shift-lock targets/i);
  const riderLockTarget = `  perform 1 from public.riders
    where id in (select (value ->> 'rider_id')::uuid from jsonb_array_elements(p_plan))
    order by id for update;`;
  assert.equal(schedulingMigration.split(riderLockTarget).length - 1, 1);
  const assignBody = lifecycleMigration.slice(
    lifecycleMigration.indexOf('create or replace function public.assign_rider('),
    lifecycleMigration.indexOf('create or replace function public.respond_assignment('),
  );
  const assignRiderLockTarget = `  select * into v_rider
  from public.riders
  where id = p_rider_id
  for update;`;
  assert.equal(assignBody.split(assignRiderLockTarget).length - 1, 1);
  assert.match(phase8Migration, /expected exactly one rider-lock target/i);
  assert.match(phase8Migration, /assign_rider expected exactly one rider-lock target/i);
  assert.doesNotMatch(phase8Migration, /persist_schedule\(uuid,uuid\[\],jsonb,jsonb,text,boolean\)/i);
});

test('phase 8 rejects null trusted inputs and removes effective direct write grants', () => {
  assert.match(phase8Migration, /p_source is null or p_source not in/i);
  assert.match(phase8Migration, /if p_is_available is null then/i);
  assert.match(phase8Migration, /revoke update \(vehicle_type, vehicle_number, is_available, current_latitude, current_longitude, last_location_at\)/i);
  assert.match(phase8Migration, /revoke insert \(rider_id, assignment_id, latitude, longitude, accuracy_meters, recorded_at, source\)/i);
  assert.match(phase8Migration, /has_column_privilege\('authenticated', 'public\.riders', 'is_available', 'UPDATE'\)/i);
});

test('phase 8 route lifecycle updates only current assignment stops and preserves skipped history', () => {
  assert.match(phase8Migration, /where assignment_id = v_assignment_id and stop_type = 'pickup'[\s\S]*?status in \('pending', 'arrived'\)/i);
  assert.match(phase8Migration, /where assignment_id = v_assignment_id and stop_type = 'dropoff'[\s\S]*?status in \('pending', 'arrived'\)/i);
  assert.doesNotMatch(phase8Migration, /status <> 'completed'/i);
  assert.doesNotMatch(phase8Migration, /set total_distance_meters = null/i);
  assert.match(phase8Migration, /create or replace function private\.sync_order_route_lifecycle/i);
  assert.match(phase8Migration, /create or replace function private\.sync_assignment_route_lifecycle/i);
  assert.match(phase8Migration, /a\.order_id = new\.order_id and a\.is_current[\s\S]*?for share/i);
  assert.match(phase8Migration, /before insert or update of order_id, rider_id, route_id on public\.assignments/i);
  assert.match(phase8Migration, /A route with assignments cannot change riders/i);
  assert.match(phase8Migration, /stop_type = 'dropoff' and s\.status = 'completed'[\s\S]*?'completed'::public\.route_status/i);
});

test('availability release records assignment and order history, notifications and audit', () => {
  assert.match(phase8Migration, /insert into public\.assignment_events/i);
  assert.match(phase8Migration, /insert into public\.order_status_events/i);
  assert.match(phase8Migration, /Delivery assignment released/i);
  assert.match(phase8Migration, /Delivery partner is being updated/i);
  assert.match(phase8Migration, /rider\.availability_changed/i);
  assert.match(phase8Migration, /v_previous_available is distinct from p_is_available or cardinality\(v_released\) > 0/i);
  assert.match(phase8Migration, /rider\.availability_reconciled/i);
});
