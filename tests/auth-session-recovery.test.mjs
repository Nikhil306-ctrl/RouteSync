import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LifecycleApiError,
  createLifecycleRequest,
} from '../frontend/src/services/lifecycle.js';
import { createSessionRecovery } from '../frontend/src/services/sessionRecovery.js';

const ok = (body = { ok: true }) => ({ ok: true, status: 200, json: async () => body });
const unauthorized = (message = 'Invalid or expired session.') => ({
  ok: false,
  status: 401,
  json: async () => ({ error: { code: 'UNAUTHORIZED', message } }),
});
const forbidden = () => ({
  ok: false,
  status: 403,
  json: async () => ({
    error: { code: 'FORBIDDEN', message: 'The account profile is missing or inactive.' },
  }),
});

function fetchSequence(responses) {
  const calls = [];
  let index = 0;
  return {
    calls,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      const next = responses[index++] ?? responses[responses.length - 1];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

function fakeRecovery({
  token = 'token-1',
  userId = 'user-1',
  snapshotResult = null,
  recoverResult = null,
} = {}) {
  const calls = { snapshot: 0, recover: [], listeners: [] };
  return {
    calls,
    async snapshot() {
      calls.snapshot += 1;
      return snapshotResult ?? { status: 'valid', token, userId };
    },
    async recover(rejectedToken, expectedUserId) {
      calls.recover.push({ rejectedToken, expectedUserId });
      return typeof recoverResult === 'function'
        ? recoverResult(calls.recover.length)
        : (recoverResult ?? { status: 'refreshed', token: 'token-2', userId });
    },
    onInvalidSession(listener) {
      calls.listeners.push(listener);
      return () => {};
    },
  };
}

function assertLifecycleError(error, status, code) {
  assert.ok(error instanceof LifecycleApiError);
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  return true;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Expected condition was not met.');
}

test('valid session sends one request without attempting recovery', async () => {
  const recovery = fakeRecovery();
  const { fetchImpl, calls } = fetchSequence([ok({ orders: [] })]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  assert.deepEqual(await request('/customer/orders'), { orders: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-1');
  assert.equal(recovery.calls.recover.length, 0);
});

test('expired token is refreshed and the original request is retried once', async () => {
  const recovery = fakeRecovery({
    recoverResult: { status: 'refreshed', token: 'token-2', userId: 'user-1' },
  });
  const { fetchImpl, calls } = fetchSequence([unauthorized(), ok({ orders: [] })]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  assert.deepEqual(await request('/customer/orders'), { orders: [] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-2');
  assert.deepEqual(recovery.calls.recover, [
    { rejectedToken: 'token-1', expectedUserId: 'user-1' },
  ]);
});

test('definitively invalid refresh session clears the error path without retrying', async () => {
  const recovery = fakeRecovery({
    recoverResult: { status: 'invalid', token: null, userId: 'user-1' },
  });
  const { fetchImpl, calls } = fetchSequence([unauthorized()]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  await assert.rejects(
    request('/customer/orders'),
    (error) => assertLifecycleError(error, 401, 'UNAUTHORIZED'),
  );
  assert.equal(calls.length, 1);
});

test('concurrent 401 responses share one refresh and both retry with the new token', async () => {
  let refreshCount = 0;
  let refreshDone = false;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve;
  });
  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: refreshDone ? 'token-2' : 'token-1',
              user: { id: 'user-1' },
            },
          },
        };
      },
      async refreshSession() {
        refreshCount += 1;
        await refreshGate;
        refreshDone = true;
        return {
          data: { session: { access_token: 'token-2', user: { id: 'user-1' } } },
        };
      },
    },
  };
  const recovery = createSessionRecovery({ client });
  let invalidCount = 0;
  recovery.onInvalidSession(() => {
    invalidCount += 1;
  });

  const pendingResponses = [];
  const fetchImpl = async (url, init) => {
    if (pendingResponses.length < 2) {
      return new Promise((resolve) => {
        pendingResponses.push({ resolve, init });
      });
    }
    return ok({ url, token: init.headers.Authorization });
  };
  const request = createLifecycleRequest({ fetchImpl, recovery });
  const first = request('/customer/orders');
  const second = request('/customer/orders/tracking');

  await waitFor(() => pendingResponses.length === 2);
  for (const pending of pendingResponses) pending.resolve(unauthorized());
  await waitFor(() => refreshCount === 1);
  releaseRefresh();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.token, 'Bearer token-2');
  assert.equal(secondResult.token, 'Bearer token-2');
  assert.equal(refreshCount, 1);
  assert.equal(invalidCount, 0);
});

test('a token refreshed by another request is not refreshed again', async () => {
  let refreshCount = 0;
  const recovery = createSessionRecovery({
    client: {
      auth: {
        async getSession() {
          return {
            data: { session: { access_token: 'token-2', user: { id: 'user-1' } } },
          };
        },
        async refreshSession() {
          refreshCount += 1;
          throw new Error('refreshSession should not be called');
        },
      },
    },
  });

  const result = await recovery.recover('token-1', 'user-1');
  assert.equal(result.status, 'already-refreshed');
  assert.equal(result.token, 'token-2');
  assert.equal(refreshCount, 0);
});

test('a second 401 after retry is surfaced instead of looping', async () => {
  const recovery = fakeRecovery({
    recoverResult: { status: 'refreshed', token: 'token-2', userId: 'user-1' },
  });
  const { fetchImpl, calls } = fetchSequence([
    unauthorized(),
    unauthorized('Session rejected again.'),
  ]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  await assert.rejects(
    request('/customer/orders'),
    (error) => {
      assertLifecycleError(error, 401, 'UNAUTHORIZED');
      assert.equal(error.message, 'Session rejected again.');
      return true;
    },
  );
  assert.equal(calls.length, 2);
});

test('temporary recovery failure does not emit an invalid-session event or clear the session', async () => {
  let invalidCount = 0;
  const recovery = createSessionRecovery({
    client: {
      auth: {
        async getSession() {
          return {
            data: { session: { access_token: 'token-1', user: { id: 'user-1' } } },
          };
        },
        async refreshSession() {
          const error = new Error('Network unavailable.');
          error.name = 'AuthRetryableFetchError';
          throw error;
        },
      },
    },
  });
  recovery.onInvalidSession(() => {
    invalidCount += 1;
  });

  const result = await recovery.recover('token-1', 'user-1');
  assert.equal(result.status, 'temporary');
  assert.equal(result.token, null);
  assert.equal(invalidCount, 0);

  const request = createLifecycleRequest({
    fetchImpl: fetchSequence([unauthorized()]).fetchImpl,
    recovery: fakeRecovery({
      recoverResult: { status: 'temporary', token: null, userId: 'user-1' },
    }),
  });
  await assert.rejects(
    request('/customer/orders'),
    (error) => assertLifecycleError(error, 0, 'AUTH_UNAVAILABLE'),
  );
});

test('an account switch during recovery never retries with the new user token', async () => {
  let invalidReason = null;
  const recovery = createSessionRecovery({
    client: {
      auth: {
        async getSession() {
          return {
            data: { session: { access_token: 'token-1', user: { id: 'user-1' } } },
          };
        },
        async refreshSession() {
          return {
            data: { session: { access_token: 'token-2', user: { id: 'user-2' } } },
          };
        },
      },
    },
  });
  recovery.onInvalidSession((event) => {
    invalidReason = event.reason;
  });

  const recovered = await recovery.recover('token-1', 'user-1');
  assert.equal(recovered.status, 'changed');
  assert.equal(recovered.token, null);
  assert.equal(invalidReason, 'account-changed');

  const { fetchImpl, calls } = fetchSequence([unauthorized()]);
  const request = createLifecycleRequest({
    fetchImpl,
    recovery: fakeRecovery({
      recoverResult: { status: 'changed', token: null, userId: 'user-2' },
    }),
  });
  await assert.rejects(
    request('/customer/orders'),
    (error) => assertLifecycleError(error, 401, 'UNAUTHORIZED'),
  );
  assert.equal(calls.length, 1);
});

test('403 responses never trigger session refresh', async () => {
  const recovery = fakeRecovery();
  const { fetchImpl, calls } = fetchSequence([forbidden()]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  await assert.rejects(
    request('/customer/orders'),
    (error) => assertLifecycleError(error, 403, 'FORBIDDEN'),
  );
  assert.equal(calls.length, 1);
  assert.equal(recovery.calls.recover.length, 0);
});

test('checkout retry preserves the exact body and idempotency key', async () => {
  const recovery = fakeRecovery({
    recoverResult: { status: 'refreshed', token: 'token-2', userId: 'user-1' },
  });
  const { fetchImpl, calls } = fetchSequence([unauthorized(), ok({ order: 'created' })]);
  const request = createLifecycleRequest({ fetchImpl, recovery });
  const body = {
    restaurantId: 'restaurant-1',
    addressId: 'address-1',
    items: [{ id: 'item-1', quantity: 2 }],
    idempotencyKey: 'checkout-123',
    paymentMethod: 'cash_on_delivery',
  };

  assert.deepEqual(await request('/customer/orders', { method: 'POST', body }), {
    order: 'created',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.match(calls[0].init.body, /"idempotencyKey":"checkout-123"/);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer token-2');
});

test('unsafe writes are not retried after a handler-level 401 rejection', async () => {
  const recovery = fakeRecovery({
    recoverResult: { status: 'refreshed', token: 'token-2', userId: 'user-1' },
  });
  const { fetchImpl, calls } = fetchSequence([
    unauthorized('You cannot accept this assignment.'),
    ok({ ok: true }),
  ]);
  const request = createLifecycleRequest({ fetchImpl, recovery });

  await assert.rejects(
    request('/rider/assignments/assignment-1/respond', {
      method: 'POST',
      body: { accept: true },
    }),
    (error) => assertLifecycleError(error, 401, 'UNAUTHORIZED'),
  );
  assert.equal(calls.length, 1);
  assert.equal(recovery.calls.recover.length, 0);
});
