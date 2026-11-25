import { getSupabaseClient } from '../lib/supabase.js';
import { createSessionRecovery } from './sessionRecovery.js';

/**
 * Trusted Worker API client for the Phase 5 order lifecycle.
 *
 * The Supabase publishable client is used only to read the caller's access
 * token. Every lifecycle write goes to the Hono Worker, which verifies the
 * profile and calls a service-role-only database function. No secret key and
 * no privileged Supabase client is ever created in the browser.
 */

const BASE_URL = '/api';
const RECOVERY_UNAVAILABLE_MESSAGE = 'Authentication service could not be reached. Try again.';
const PRE_HANDLER_INVALID_MESSAGES = new Set([
  'Invalid or expired session.',
  'Authentication required.',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class LifecycleApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED' } = {}) {
    super(message);
    this.name = 'LifecycleApiError';
    this.status = status;
    this.code = code;
  }
}

export const sessionRecovery = createSessionRecovery({ client: getSupabaseClient() });

function safeToRetry({ method, path, payload, bodyText }) {
  const requestMethod = (method || 'GET').toUpperCase();
  if (SAFE_METHODS.has(requestMethod)) return true;

  if (
    payload?.error?.code === 'UNAUTHORIZED' &&
    PRE_HANDLER_INVALID_MESSAGES.has(payload.error.message)
  ) {
    return true;
  }

  if (requestMethod === 'POST' && path === '/customer/orders' && bodyText !== undefined) {
    try {
      return Boolean(JSON.parse(bodyText)?.idempotencyKey);
    } catch {
      return false;
    }
  }

  return false;
}

export function createLifecycleRequest({
  fetchImpl = (input, init) => fetch(input, init),
  recovery = sessionRecovery,
} = {}) {
  return async function request(path, { method = 'GET', body, signal } = {}) {
    const session = await recovery.snapshot();
    if (session.status === 'temporary') {
      throw new LifecycleApiError(RECOVERY_UNAVAILABLE_MESSAGE, {
        status: 0,
        code: 'AUTH_UNAVAILABLE',
      });
    }
    if (!session.token) {
      throw new LifecycleApiError('Your session has expired. Sign in again.', {
        status: 401,
        code: 'UNAUTHORIZED',
      });
    }

    const bodyText = body === undefined ? undefined : JSON.stringify(body);
    const send = (token) => {
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (bodyText !== undefined) headers['Content-Type'] = 'application/json';
      return fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers,
        body: bodyText,
        signal,
      });
    };

    let response;
    try {
      response = await send(session.token);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new LifecycleApiError(
        'The order service could not be reached. Check that the Worker is running.',
        { status: 0, code: 'NETWORK_ERROR' },
      );
    }

    let payload = await response.json().catch(() => null);

    if (response.status === 401 && safeToRetry({ method, path, payload, bodyText })) {
      const recovered = await recovery.recover(session.token, session.userId ?? null);
      if (recovered.status === 'temporary') {
        throw new LifecycleApiError(RECOVERY_UNAVAILABLE_MESSAGE, {
          status: 0,
          code: 'AUTH_UNAVAILABLE',
        });
      }
      if (recovered.status === 'invalid' || recovered.status === 'changed') {
        throw new LifecycleApiError(
          recovered.status === 'changed'
            ? 'Your account changed while recovering your session. Try again.'
            : 'Your session has expired. Sign in again.',
          { status: 401, code: 'UNAUTHORIZED' },
        );
      }

      if (recovered.token) {
        try {
          response = await send(recovered.token);
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          throw new LifecycleApiError(
            'The order service could not be reached. Check that the Worker is running.',
            { status: 0, code: 'NETWORK_ERROR' },
          );
        }
        payload = await response.json().catch(() => null);
      }
    }

    if (!response.ok) {
      throw new LifecycleApiError(
        payload?.error?.message ?? `Request failed with HTTP ${response.status}`,
        { status: response.status, code: payload?.error?.code ?? 'REQUEST_FAILED' },
      );
    }

    return payload;
  };
}

const request = createLifecycleRequest();

function queryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// Customer -----------------------------------------------------------------

export function fetchCustomerOrders({ statuses, limit } = {}) {
  return request(`/customer/orders${queryString({ status: statuses, limit })}`);
}

export function fetchCustomerOrder(orderId) {
  return request(`/customer/orders/${orderId}`);
}

export function fetchCustomerOrderTracking(orderId) {
  return request(`/customer/orders/${orderId}/tracking`);
}

export function quoteOrder({ restaurantId, addressId, items }) {
  return request('/customer/orders/quote', {
    method: 'POST',
    body: { restaurantId, addressId, items },
  });
}

export function createCustomerOrder({
  restaurantId,
  addressId,
  items,
  specialInstructions,
  idempotencyKey,
  paymentMethod = 'cash_on_delivery',
}) {
  return request('/customer/orders', {
    method: 'POST',
    body: {
      restaurantId,
      addressId,
      items,
      specialInstructions,
      idempotencyKey,
      paymentMethod,
    },
  });
}

export function cancelCustomerOrder(orderId, { reason, expectedStatus } = {}) {
  return request(`/customer/orders/${orderId}/cancel`, {
    method: 'POST',
    body: { reason, expectedStatus },
  });
}

// Restaurant ---------------------------------------------------------------

export function fetchRestaurantBoard({ statuses, limit } = {}) {
  return request(`/restaurant/orders${queryString({ status: statuses, limit })}`);
}

export function fetchRestaurantOrder(orderId) {
  return request(`/restaurant/orders/${orderId}`);
}

export function transitionRestaurantOrder(orderId, payload) {
  return request(`/restaurant/orders/${orderId}/transition`, {
    method: 'POST',
    body: payload,
  });
}

export function reportPrepDelay(orderId, { delayMinutes, reason } = {}) {
  return request(`/restaurant/orders/${orderId}/prep-delay`, {
    method: 'POST',
    body: { delayMinutes, reason },
  });
}

// Admin / dispatcher -------------------------------------------------------

export function fetchAdminOrders({ statuses, restaurantId, customerId, limit } = {}) {
  return request(
    `/admin/orders${queryString({ status: statuses, restaurantId, customerId, limit })}`,
  );
}

export function fetchAdminOrder(orderId) {
  return request(`/admin/orders/${orderId}`);
}

export function transitionAdminOrder(orderId, payload) {
  return request(`/admin/orders/${orderId}/transition`, {
    method: 'POST',
    body: payload,
  });
}

export function fetchDispatchQueue() {
  return request('/admin/dispatch/queue');
}

export function runScheduling(orderIds) {
  return request('/admin/dispatch/schedule', { method: 'POST', body: orderIds ? { orderIds } : {} });
}

export function fetchSchedulingRuns() {
  return request('/admin/dispatch/runs');
}

export function fetchEligibleRiders(orderId) {
  return request(`/admin/riders/eligible${queryString({ orderId })}`);
}

export function assignRider(orderId, { riderId, reason, expectedAssignmentId }) {
  return request(`/admin/orders/${orderId}/assign`, {
    method: 'POST',
    body: { riderId, reason, expectedAssignmentId },
  });
}

export function fetchAdminRiderTracking() {
  return request('/admin/tracking/riders');
}

export function reportAdminPrepDelay(orderId, { delayMinutes, reason } = {}) {
  return request(`/admin/orders/${orderId}/prep-delay`, {
    method: 'POST',
    body: { delayMinutes, reason },
  });
}

// Delivery partner ---------------------------------------------------------

export function fetchRiderAssignments({ limit, current } = {}) {
  return request(`/rider/assignments${queryString({ limit, current })}`);
}

export function fetchRiderAssignment(assignmentId) {
  return request(`/rider/assignments/${assignmentId}`);
}

export function respondToAssignment(assignmentId, { accept, reason }) {
  return request(`/rider/assignments/${assignmentId}/respond`, {
    method: 'POST',
    body: { accept, reason },
  });
}

export function transitionRiderOrder(orderId, payload) {
  return request(`/rider/orders/${orderId}/transition`, {
    method: 'POST',
    body: payload,
  });
}

export function setRiderAvailability(isAvailable) {
  return request('/rider/availability', {
    method: 'POST',
    body: { isAvailable: Boolean(isAvailable) },
  });
}

export function shareRiderLocation({
  latitude,
  longitude,
  accuracyMeters,
  source = 'gps',
  assignmentId = null,
} = {}) {
  return request('/rider/location', {
    method: 'POST',
    body: { latitude, longitude, accuracyMeters, source, assignmentId },
  });
}
