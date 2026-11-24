/**
 * Static schema + security audit. Runs offline: no database, no network.
 *
 * These checks are intentionally textual. They catch missing migrations,
 * tables without RLS, over-broad grants and privilege-escalation shortcuts
 * before any SQL reaches a Supabase project. Live behaviour is covered by
 * tests/remote-auth.test.mjs after the migrations are applied.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');
const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');

const TABLES = [
  'profiles',
  'restaurants',
  'menu_categories',
  'menu_items',
  'customer_addresses',
  'riders',
  'rider_shifts',
  'orders',
  'order_items',
  'assignments',
  'delivery_routes',
  'route_stops',
  'rider_locations',
  'notifications',
  'scheduling_runs',
  'constraint_violations',
  'audit_logs',
  'order_status_events',
  'assignment_events',
];

const EXPECTED_FILES = [
  '20261124100100_enums.sql',
  '20261124100200_core_tables.sql',
  '20261124100300_operations_tables.sql',
  '20261124100400_functions_and_triggers.sql',
  '20261124100500_rls_policies.sql',
  '20261124100600_grants.sql',
  '20261124100700_order_lifecycle.sql',
];

const migrationFiles = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  : [];

const read = (file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8');

const byFile = Object.fromEntries(migrationFiles.map((file) => [file, read(file)]));
const allSql = migrationFiles.map((file) => byFile[file]).join('\n');
const rlsSql = allSql;
const grantsSql = byFile['20261124100600_grants.sql'] ?? '';
const lifecycleSql = byFile['20261124100700_order_lifecycle.sql'] ?? '';
const functionsSql = byFile['20261124100400_functions_and_triggers.sql'] ?? '';
const enumsSql = byFile['20261124100100_enums.sql'] ?? '';
const tablesSql = [
  byFile['20261124100200_core_tables.sql'] ?? '',
  byFile['20261124100300_operations_tables.sql'] ?? '',
  lifecycleSql,
].join('\n');

const seedPath = path.join(projectRoot, 'backend', 'scripts', 'seed-demo.js');
const seedSource = fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf8') : '';

const policies = [...allSql.matchAll(/create policy\s+(\w+)\s+on\s+public\.(\w+)/gi)].map(
  (match) => ({ name: match[1], table: match[2] }),
);

test('migration files exist in the documented order', () => {
  assert.deepEqual(migrationFiles, EXPECTED_FILES);
});

test('all 19 application tables are created exactly once', () => {
  for (const table of TABLES) {
    const occurrences = tablesSql.match(new RegExp(`create table public\\.${table} \\(`, 'gi')) ?? [];
    assert.equal(occurrences.length, 1, `expected one create table for public.${table}`);
  }
});

test('row level security is enabled on every application table', () => {
  for (const table of TABLES) {
    assert.match(
      rlsSql,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `RLS missing for public.${table}`,
    );
  }
});

test('no migration disables RLS or bypasses it', () => {
  assert.doesNotMatch(allSql, /disable row level security/i);
  assert.doesNotMatch(allSql, /bypassrls/i);
  assert.doesNotMatch(allSql, /security_invoker\s*=\s*false/i);
});

test('no table is granted with an unrestricted GRANT ALL', () => {
  assert.doesNotMatch(grantsSql, /grant\s+all\s+(privileges\s+)?on\s+(all\s+)?tables/i);
  assert.doesNotMatch(grantsSql, /alter default privileges[\s\S]*grant all/i);
});

test('grants are revoked up front and limited to named operations', () => {
  assert.match(grantsSql, /revoke all on all tables in schema public from anon, authenticated;/i);
  assert.match(grantsSql, /grant select on public\.restaurants to anon;/i);
  assert.match(grantsSql, /grant select on public\.menu_categories to anon;/i);
  assert.match(grantsSql, /grant select on public\.menu_items to anon;/i);
  assert.match(grantsSql, /grant select on all tables in schema public to authenticated;/i);
});

test('profiles column grants exclude role, is_active and id', () => {
  assert.match(
    grantsSql,
    /grant update \(full_name, phone, avatar_url\) on public\.profiles to authenticated;/i,
  );
  const profileUpdateGrants = [...grantsSql.matchAll(/grant update \(([^)]*)\) on public\.profiles/gi)]
    .map((match) => match[1])
    .join(', ');
  assert.doesNotMatch(profileUpdateGrants, /\brole\b/i);
  assert.doesNotMatch(profileUpdateGrants, /\bis_active\b/i);
  assert.doesNotMatch(profileUpdateGrants, /\bid\b/i);
});

test('rider column grants exclude capacity and verification fields', () => {
  const riderGrant = grantsSql.match(/grant update \(([\s\S]*?)\) on public\.riders to authenticated;/i);
  assert.ok(riderGrant, 'expected a column-scoped rider update grant');
  assert.doesNotMatch(riderGrant[1], /max_concurrent_orders/i);
  assert.doesNotMatch(riderGrant[1], /verification_status/i);
  assert.doesNotMatch(riderGrant[1], /rating/i);
});

test('every table has at least one RLS policy', () => {
  const covered = new Set(policies.map((policy) => policy.table));
  for (const table of TABLES) {
    assert.ok(covered.has(table), `no RLS policy for public.${table}`);
  }
});

test('every policy targets a known application table', () => {
  assert.ok(policies.length > 20, 'expected a non-trivial number of policies');
  for (const policy of policies) {
    assert.ok(TABLES.includes(policy.table), `policy ${policy.name} targets unknown table ${policy.table}`);
  }
});

test('customer-owned rows are constrained to auth.uid()', () => {
  assert.match(rlsSql, /customer_addresses_select_own[\s\S]*?customer_id = auth\.uid\(\)/i);
  assert.match(rlsSql, /notifications_select_own[\s\S]*?user_id = auth\.uid\(\)/i);
  assert.match(rlsSql, /rider_locations_select_own_or_admin[\s\S]*?rider_id = auth\.uid\(\)/i);
  assert.match(rlsSql, /profiles_select_own_or_admin[\s\S]*?id = auth\.uid\(\)/i);
});

test('privileged resources are admin-only to write', () => {
  for (const table of ['scheduling_runs', 'constraint_violations', 'audit_logs']) {
    const tablePolicies = policies.filter((policy) => policy.table === table);
    assert.ok(tablePolicies.length >= 1, `expected policies on ${table}`);
    assert.ok(
      tablePolicies.every((policy) => /admin/i.test(policy.name)),
      `expected admin-scoped policies on ${table}`,
    );
  }
});

test('signup provisions the customer role and never trusts metadata for role', () => {
  assert.match(functionsSql, /after insert on auth\.users/i);
  assert.match(functionsSql, /'customer'::public\.app_role/i);
  assert.doesNotMatch(functionsSql, /raw_user_meta_data\s*->>\s*'role'/i);
  assert.doesNotMatch(functionsSql, /user_metadata[\s\S]{0,80}\brole\b/i);
});

test('role changes are guarded by a trigger and a trusted RPC', () => {
  assert.match(functionsSql, /create or replace function private\.guard_profile_role\(\)/i);
  assert.match(functionsSql, /Role changes require trusted server provisioning/i);
  assert.match(functionsSql, /create or replace function public\.admin_set_user_role\(/i);
  assert.match(functionsSql, /private\.is_admin\(\)/i);
  assert.match(grantsSql, /grant execute on function public\.admin_set_user_role/i);
});

test('security-definer helpers pin an empty search_path', () => {
  const definers = [...functionsSql.matchAll(/security definer\s*\n?\s*set search_path = ''/gi)];
  assert.ok(definers.length >= 5, `expected pinned search_path on definer functions, found ${definers.length}`);
  for (const fn of ['current_role', 'is_admin', 'owns_restaurant', 'can_view_order', 'handle_new_user']) {
    assert.match(functionsSql, new RegExp(`function private\\.${fn}\\(`, 'i'));
  }
});

test('money is stored in integer minor units', () => {
  for (const column of ['price_minor', 'subtotal_minor', 'delivery_fee_minor', 'discount_minor', 'total_minor', 'unit_price_minor', 'line_total_minor']) {
    assert.match(tablesSql, new RegExp(`${column} integer`, 'i'), `${column} must be integer minor units`);
  }
  assert.doesNotMatch(tablesSql, /\b(price|amount|total)\s+(numeric|decimal|money)\b/i);
});

test('enums cover the required lifecycle values', () => {
  const required = {
    app_role: ['admin', 'restaurant', 'rider', 'customer'],
    order_status: ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'],
    assignment_status: ['proposed', 'accepted', 'rejected', 'active', 'completed', 'cancelled', 'reassigned'],
    route_status: ['planned', 'active', 'completed', 'cancelled'],
    shift_status: ['scheduled', 'active', 'completed', 'cancelled'],
    run_status: ['pending', 'running', 'completed', 'failed', 'infeasible'],
    violation_severity: ['info', 'warning', 'error', 'critical'],
  };

  for (const [type, values] of Object.entries(required)) {
    const block = enumsSql.match(new RegExp(`create type public\\.${type} as enum \\(([\\s\\S]*?)\\);`, 'i'));
    assert.ok(block, `missing enum ${type}`);
    for (const value of values) {
      assert.match(block[1], new RegExp(`'${value}'`), `enum ${type} missing ${value}`);
    }
  }
});

test('every foreign key points at a declared application table', () => {
  const references = [...allSql.matchAll(/references public\.(\w+)/gi)].map((match) => match[1]);
  assert.ok(references.length > 20, 'expected a connected relational schema');
  for (const target of new Set(references)) {
    assert.ok(TABLES.includes(target), `foreign key references unknown table public.${target}`);
  }
});

test('schema supports availability, capacity, windows and rescheduling history', () => {
  assert.match(tablesSql, /is_available boolean/i);
  assert.match(tablesSql, /max_concurrent_orders integer/i);
  assert.match(tablesSql, /delivery_window_start timestamptz/i);
  assert.match(tablesSql, /delivery_window_end timestamptz/i);
  assert.match(tablesSql, /prep_time_minutes integer/i);
  assert.match(tablesSql, /stop_sequence integer/i);
  assert.match(tablesSql, /is_current boolean/i);
  assert.match(tablesSql, /replaced_by_assignment_id uuid/i);
  assert.match(tablesSql, /planned_arrival timestamptz/i);
});

test('order lifecycle functions are trusted definers with a pinned search_path', () => {
  for (const fn of ['quote_order', 'create_order', 'transition_order_status', 'assign_rider', 'respond_assignment']) {
    assert.match(
      lifecycleSql,
      new RegExp(`create or replace function public\\.${fn}\\(`, 'i'),
      `missing trusted function ${fn}`,
    );
  }
  const definers = [...lifecycleSql.matchAll(/security definer\s*\n?\s*set search_path = ''/gi)];
  assert.ok(definers.length >= 5, `expected trusted lifecycle definers, found ${definers.length}`);
});

test('browser roles cannot write order, line or assignment rows directly', () => {
  assert.match(lifecycleSql, /revoke insert, update, delete on public\.orders from authenticated;/i);
  assert.match(lifecycleSql, /revoke insert, update, delete on public\.order_items from authenticated;/i);
  assert.match(lifecycleSql, /revoke insert, update, delete on public\.assignments from authenticated;/i);
  assert.match(lifecycleSql, /revoke insert on public\.notifications from authenticated;/i);
  // Phase 3 granted these two columns independently; the table-level revoke is
  // not enough, so the Phase 5 migration must revoke the column grant too.
  assert.match(
    lifecycleSql,
    /revoke update \(status, cancellation_reason\) on public\.orders from authenticated;/i,
  );
  assert.doesNotMatch(
    lifecycleSql,
    /revoke update \(read_at\) on public\.notifications from authenticated;/i,
  );
});

test('trusted lifecycle RPCs are not browser-callable', () => {
  for (const signature of [
    String.raw`quote_order\(uuid, uuid, uuid, jsonb\)`,
    String.raw`create_order\(uuid, uuid, uuid, jsonb, text, text, text\)`,
    String.raw`transition_order_status\([\s\S]*?\)`,
    String.raw`assign_rider\(uuid, uuid, uuid, text, uuid\)`,
    String.raw`respond_assignment\(uuid, uuid, boolean, text\)`,
  ]) {
    assert.match(
      lifecycleSql,
      new RegExp(`revoke all on function public\\.${signature}\\s+from public, anon, authenticated;`, 'i'),
      `browser revoke missing for ${signature}`,
    );
  }
  assert.match(lifecycleSql, /grant execute on function public\.quote_order[\s\S]*?to service_role;/i);
  assert.match(lifecycleSql, /grant execute on function public\.create_order[\s\S]*?to service_role;/i);
  assert.match(
    lifecycleSql,
    /grant execute on function public\.transition_order_status\([\s\S]*?\) to service_role;/i,
  );
  assert.match(lifecycleSql, /grant execute on function public\.assign_rider[\s\S]*?to service_role;/i);
  assert.match(lifecycleSql, /grant execute on function public\.respond_assignment[\s\S]*?to service_role;/i);
});

test('checkout idempotency and status history are enforced in the database', () => {
  assert.match(lifecycleSql, /create unique index orders_customer_idempotency_idx/i);
  assert.match(lifecycleSql, /p_idempotency_key/i);
  assert.match(lifecycleSql, /pg_advisory_xact_lock/i);
  assert.match(lifecycleSql, /create table public\.order_status_events/i);
  assert.match(lifecycleSql, /create table public\.assignment_events/i);
  assert.match(lifecycleSql, /order_status_events_select_related/i);
  assert.match(lifecycleSql, /assignment_events_select_related/i);
});

test('demo seed is guarded and never hardcodes or prints credentials', () => {
  assert.ok(seedSource, 'seed script missing');
  for (const variable of ['DEMO_ADMIN_PASSWORD', 'DEMO_RESTAURANT_PASSWORD', 'DEMO_RIDER_PASSWORD', 'DEMO_CUSTOMER_PASSWORD']) {
    assert.match(seedSource, new RegExp(variable));
  }
  assert.match(seedSource, /admin\.auth\.admin\.createUser/i);
  assert.match(seedSource, /\.upsert\(/i);
  assert.doesNotMatch(seedSource, /console\.(log|error|warn|info)\([^)]*passwords\./i);
  assert.doesNotMatch(seedSource, /console\.(log|error|warn|info)\([^)]*\.password\b/i);
  assert.doesNotMatch(seedSource, /console\.(log|error|warn|info)\([^)]*(secretKey|access_token|refresh_token)\b/i);
  assert.doesNotMatch(seedSource, /password\s*:\s*['"][^'"]+['"]/i);
  assert.doesNotMatch(seedSource, /SUPABASE_SECRET_KEY\s*=\s*['"][^'"]+['"]/i);
});
