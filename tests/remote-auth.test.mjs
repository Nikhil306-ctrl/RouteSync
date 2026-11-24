/**
 * Remote authentication, authorization and RLS verification.
 *
 * REQUIRES (never run automatically):
 *   1. All six migrations applied to the Supabase project.
 *   2. The demo seed executed (see docs/PHASE3_DATABASE_AUTH.md).
 *   3. The local Worker running: `npm run dev:worker`.
 *
 * Credentials are read from the environment or from backend/.dev.vars.
 * Values are never printed. Only the publishable key and demo passwords are
 * loaded here; SUPABASE_SECRET_KEY is never read by this suite.
 *
 * The suite is read-only unless RUN_REMOTE_WRITE_TESTS=1. That single gated
 * test creates one throwaway customer via public signup and deletes it again
 * when SUPABASE_SECRET_KEY is available.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');

function readBackendEnv(allowedNames) {
  const file = path.join(projectRoot, 'backend', '.dev.vars');
  const allowed = new Set(allowedNames);
  const result = {};
  if (!fs.existsSync(file)) return result;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !allowed.has(match[1])) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

const fileEnv = readBackendEnv(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']);

const config = {
  backendUrl: (process.env.BACKEND_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  supabaseUrl: (process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL ?? '').replace(/\/$/, ''),
  publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? fileEnv.SUPABASE_PUBLISHABLE_KEY ?? '',
  passwords: {
    admin: process.env.DEMO_ADMIN_PASSWORD,
    restaurant: process.env.DEMO_RESTAURANT_PASSWORD,
    rider: process.env.DEMO_RIDER_PASSWORD,
    customer: process.env.DEMO_CUSTOMER_PASSWORD,
  },
};

const accounts = {
  admin: 'admin.demo@example.com',
  owner1: 'owner1.demo@example.com',
  rider1: 'rider1.demo@example.com',
  customer1: 'customer1.demo@example.com',
  customer2: 'customer2.demo@example.com',
};

const missing = [];
if (!config.supabaseUrl) missing.push('SUPABASE_URL');
if (!config.publishableKey) missing.push('SUPABASE_PUBLISHABLE_KEY');
for (const [key, value] of Object.entries(config.passwords)) {
  if (!value) missing.push(`DEMO_${key.toUpperCase()}_PASSWORD`);
}

const enabled = missing.length === 0;
const skipReason = enabled
  ? false
  : `remote configuration missing: ${missing.join(', ')} (see docs/PHASE3_DATABASE_AUTH.md)`;

const state = {
  health: null,
  healthError: null,
  sessions: {},
  authError: null,
};

const promiseSkip = (condition, reason) => (condition ? { skip: reason } : {});

function url(pathname) {
  return `${config.supabaseUrl}${pathname}`;
}

async function supabaseRequest(pathname, { token, key, method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: key ?? config.publishableKey,
    Authorization: `Bearer ${key ?? token ?? config.publishableKey}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url(pathname), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
}

async function signIn(email, password) {
  return supabaseRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
}

const rest = (query, options = {}) => supabaseRequest(`/rest/v1/${query}`, options);

async function backendRequest(pathname, { token, ...init } = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${config.backendUrl}${pathname}`, { ...init, headers });
}

before(async () => {
  if (!enabled) return;

  try {
    const response = await fetch(`${config.backendUrl}/api/health`);
    state.health = { status: response.status, body: await response.json() };
  } catch (error) {
    state.healthError = error;
  }

  if (!config.supabaseUrl) return;

  try {
    const sessions = {};
    const credentials = [
      ['admin', accounts.admin, config.passwords.admin],
      ['owner1', accounts.owner1, config.passwords.restaurant],
      ['rider1', accounts.rider1, config.passwords.rider],
      ['customer1', accounts.customer1, config.passwords.customer],
      ['customer2', accounts.customer2, config.passwords.customer],
    ];

    for (const [key, email, password] of credentials) {
      const { status, body } = await signIn(email, password);
      if (status === 200 && body?.access_token) {
        sessions[key] = body;
      }
    }
    state.sessions = sessions;
  } catch (error) {
    state.authError = error;
  }
});

test('health endpoint reports Worker + Supabase connectivity', promiseSkip(!enabled, skipReason), async () => {
  assert.equal(
    state.healthError,
    null,
    `Worker not reachable at ${config.backendUrl}. Start it with "npm run dev:worker".`,
  );
  assert.equal(state.health.status, 200);
  assert.equal(state.health.body?.status, 'ok');
  assert.equal(state.health.body?.supabase?.connected, true);
});

test('demo accounts sign in with environment-provided passwords', promiseSkip(!enabled, skipReason), () => {
  assert.equal(state.authError, null, `Supabase auth request failed: ${state.authError?.message}`);
  for (const key of ['admin', 'owner1', 'rider1', 'customer1', 'customer2']) {
    assert.ok(state.sessions[key]?.access_token, `demo account ${key} could not sign in (run the seed first)`);
  }
});

test('invalid credentials are rejected', promiseSkip(!enabled, skipReason), async () => {
  const { status, body } = await signIn(accounts.customer1, 'definitely-not-the-password');
  assert.ok([400, 401].includes(status), `expected 400/401, got ${status}`);
  assert.equal(body?.access_token, undefined);
});

test('protected API rejects anonymous requests with 401', promiseSkip(!enabled, skipReason), async () => {
  const me = await backendRequest('/api/auth/me');
  assert.equal(me.status, 401);

  const admin = await backendRequest('/api/admin/status');
  assert.equal(admin.status, 401);

  const malformed = await backendRequest('/api/auth/me', { token: 'not-a-real-token' });
  assert.equal(malformed.status, 401);
});

test('valid token returns the trusted profile role', promiseSkip(!enabled, skipReason), async () => {
  const token = state.sessions.customer1?.access_token;
  const response = await backendRequest('/api/auth/me', { token });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.role, 'customer');
  assert.equal(body.user.email, accounts.customer1);
});

test('role enforcement returns 403 for the wrong role', promiseSkip(!enabled, skipReason), async () => {
  const customer = await backendRequest('/api/admin/status', {
    token: state.sessions.customer1?.access_token,
  });
  assert.equal(customer.status, 403);

  const admin = await backendRequest('/api/admin/status', {
    token: state.sessions.admin?.access_token,
  });
  assert.equal(admin.status, 200);
  const body = await admin.json();
  assert.equal(body.scope, 'admin');
});

test('public catalogue is readable anonymously', promiseSkip(!enabled, skipReason), async () => {
  const { status, body } = await rest('restaurants?select=id,name,city,is_active&city=eq.Belagavi');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body) && body.length >= 3, 'expected the three seeded Belagavi restaurants');
  assert.ok(body.every((row) => row.city === 'Belagavi'));
});

test('customer reads only their own orders and addresses', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;
  assert.ok(session?.user?.id, 'customer session missing');

  const orders = await rest('orders?select=id,customer_id', { token: session.access_token });
  assert.equal(orders.status, 200);
  assert.ok(Array.isArray(orders.body));
  for (const order of orders.body) {
    assert.equal(order.customer_id, session.user.id, 'customer saw another customer order');
  }

  const addresses = await rest('customer_addresses?select=id,customer_id', {
    token: session.access_token,
  });
  assert.equal(addresses.status, 200);
  assert.ok(addresses.body.length >= 1, 'expected at least one seeded address for customer1');
  for (const address of addresses.body) {
    assert.equal(address.customer_id, session.user.id, 'customer saw another customer address');
  }
});

test('cross-account address lookup is blocked by RLS', promiseSkip(!enabled, skipReason), async () => {
  const mine = await rest('customer_addresses?select=id', { token: state.sessions.customer1.access_token });
  const foreignId = mine.body?.[0]?.id;
  assert.ok(foreignId, 'need a customer1 address id');

  const attempt = await rest(`customer_addresses?select=id&id=eq.${foreignId}`, {
    token: state.sessions.customer2.access_token,
  });
  assert.equal(attempt.status, 200);
  assert.deepEqual(attempt.body, [], 'customer2 must not read customer1 addresses');
});

test('admin-only tables are invisible to customers and riders', promiseSkip(!enabled, skipReason), async () => {
  for (const key of ['customer1', 'rider1']) {
    const runs = await rest('scheduling_runs?select=id', { token: state.sessions[key].access_token });
    assert.equal(runs.status, 200);
    assert.deepEqual(runs.body, [], `${key} must not read scheduling_runs`);

    const audit = await rest('audit_logs?select=id', { token: state.sessions[key].access_token });
    assert.equal(audit.status, 200);
    assert.deepEqual(audit.body, [], `${key} must not read audit_logs`);
  }
});

test('customers cannot insert rider locations or shifts', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;

  const location = await rest('rider_locations', {
    token: session.access_token,
    method: 'POST',
    body: { rider_id: session.user.id, latitude: 15.8, longitude: 74.5 },
    prefer: 'return=representation',
  });
  assert.ok(location.status >= 400, 'customer rider_locations insert must fail');

  const shift = await rest('rider_shifts', {
    token: session.access_token,
    method: 'POST',
    body: {
      rider_id: session.user.id,
      starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    },
    prefer: 'return=representation',
  });
  assert.ok(shift.status >= 400, 'customer rider_shifts insert must fail');
});

test('restaurant owner cannot write another restaurant menu', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.owner1;
  const restaurants = await rest('restaurants?select=id,owner_id&order=slug.asc', {
    token: session.access_token,
  });
  assert.equal(restaurants.status, 200);

  const foreign = restaurants.body.find((row) => row.owner_id !== session.user.id);
  assert.ok(foreign, 'need a restaurant owned by someone else');

  const attempt = await rest('menu_items', {
    token: session.access_token,
    method: 'POST',
    body: {
      restaurant_id: foreign.id,
      name: `Unauthorized probe ${Date.now()}`,
      price_minor: 1000,
    },
    prefer: 'return=representation',
  });
  assert.ok([401, 403].includes(attempt.status), `expected RLS rejection, got ${attempt.status}`);
});

test('role escalation via profile update is blocked', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;

  const attempt = await rest(`profiles?id=eq.${session.user.id}`, {
    token: session.access_token,
    method: 'PATCH',
    body: { role: 'admin' },
    prefer: 'return=representation',
  });
  assert.ok(attempt.status >= 400, `expected privileged column update to fail, got ${attempt.status}`);

  const verify = await rest(`profiles?select=role&id=eq.${session.user.id}`, {
    token: session.access_token,
  });
  assert.equal(verify.status, 200);
  assert.equal(verify.body?.[0]?.role, 'customer');
});

test('role escalation via admin RPC is blocked for non-admins', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;

  const attempt = await rest('rpc/admin_set_user_role', {
    token: session.access_token,
    method: 'POST',
    body: { p_user_id: session.user.id, p_role: 'admin', p_reason: 'self-service probe' },
  });
  assert.ok(!(attempt.status >= 200 && attempt.status < 300), `RPC must reject non-admin, got ${attempt.status}`);
});

test('database constraints reject malformed addresses', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;

  const badPincode = await rest('customer_addresses', {
    token: session.access_token,
    method: 'POST',
    body: {
      customer_id: session.user.id,
      recipient_name: 'Constraint Probe',
      address_line1: 'Nowhere',
      pincode: '12',
    },
    prefer: 'return=representation',
  });
  assert.equal(badPincode.status, 400, 'pincode check constraint should reject 2-digit input');

  const badCoordinates = await rest('customer_addresses', {
    token: session.access_token,
    method: 'POST',
    body: {
      customer_id: session.user.id,
      recipient_name: 'Constraint Probe',
      address_line1: 'Nowhere',
      latitude: 120,
      longitude: 74.5,
    },
    prefer: 'return=representation',
  });
  assert.equal(badCoordinates.status, 400, 'latitude check constraint should reject out-of-range input');
});

test('customer cannot create an address for another account', promiseSkip(!enabled, skipReason), async () => {
  const session = state.sessions.customer1;
  const otherId = state.sessions.customer2.user.id;

  const attempt = await rest('customer_addresses', {
    token: session.access_token,
    method: 'POST',
    body: {
      customer_id: otherId,
      recipient_name: 'Cross Account Probe',
      address_line1: 'Nowhere',
    },
    prefer: 'return=representation',
  });
  assert.ok([401, 403].includes(attempt.status), `expected RLS rejection, got ${attempt.status}`);
});

test(
  'customer self-registration creates a customer profile',
  promiseSkip(!enabled || process.env.RUN_REMOTE_WRITE_TESTS !== '1', 'set RUN_REMOTE_WRITE_TESTS=1 to run this write test'),
  async () => {
    const email = `routesync.phase3.probe.${Date.now()}@example.com`;
    const password = `Probe-${Math.random().toString(36).slice(2)}-A1!`;
    const signUp = await supabaseRequest('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { full_name: 'Phase 3 Probe' } },
    });

    assert.ok([200, 201].includes(signUp.status), `signup failed with ${signUp.status}`);
    const userId = signUp.body?.id ?? signUp.body?.user?.id;
    assert.ok(userId, 'signup did not return a user id');

    if (signUp.body?.access_token) {
      const me = await backendRequest('/api/auth/me', { token: signUp.body.access_token });
      assert.equal(me.status, 200);
      const profile = await me.json();
      assert.equal(profile.user.role, 'customer');
    }

    const secret = process.env.SUPABASE_SECRET_KEY;
    if (secret) {
      const cleanup = await fetch(url(`/auth/v1/admin/users/${userId}`), {
        method: 'DELETE',
        headers: { apikey: secret, Authorization: `Bearer ${secret}` },
      });
      assert.ok([200, 204, 404].includes(cleanup.status), 'cleanup of probe user failed');
    }
  },
);
