import { createPrivilegedSupabase } from './supabase.js';

/**
 * Shared, server-only helpers for the Phase 5 order lifecycle.
 *
 * Every business write is delegated to a SECURITY DEFINER function that the
 * Worker calls with the service role *after* auth.middleware has verified the
 * caller's profile and role. This module never trusts a role supplied by the
 * browser.
 */

export const ORDER_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
];

export const RIDER_STATUSES = ['picked_up', 'out_for_delivery', 'delivered'];
export const IDEMPOTENCY_MIN = 8;
export const IDEMPOTENCY_MAX = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DB_ERRORS = {
  '42501': { status: 403, code: 'FORBIDDEN' },
  P0002: { status: 404, code: 'NOT_FOUND' },
  '40001': { status: 409, code: 'STATE_CONFLICT' },
  '23514': { status: 422, code: 'INVALID_STATE' },
  '23505': { status: 409, code: 'CONFLICT' },
  '23503': { status: 422, code: 'INVALID_REFERENCE' },
  '22023': { status: 422, code: 'INVALID_INPUT' },
  '22P02': { status: 422, code: 'INVALID_INPUT' },
};

const GENERIC_MESSAGES = {
  '22P02': 'One of the supplied values was not valid.',
};

export const ORDER_SELECT = `
  id, customer_id, restaurant_id, delivery_address_id, status, priority,
  subtotal_minor, delivery_fee_minor, discount_minor, total_minor, currency,
  requested_at, delivery_window_start, delivery_window_end, prep_time_minutes,
  delivery_address_line, delivery_latitude, delivery_longitude,
  delivery_contact_phone, special_instructions, cancellation_reason,
  payment_method, restaurant_accepted_at, preparation_started_at, ready_at,
  picked_up_at, delivered_at, cancelled_at, estimated_ready_at,
  created_at, updated_at,
  restaurant:restaurants(id, name, slug, address_line, landmark, city, phone, latitude, longitude),
  items:order_items(id, menu_item_id, item_name, unit_price_minor, quantity, line_total_minor, notes)
`;

export const ADMIN_ORDER_SELECT = `${ORDER_SELECT},
  customer:profiles!orders_customer_id_fkey(id, full_name, email, phone)
`;

export const ASSIGNMENT_SELECT = `
  id, order_id, rider_id, route_id, scheduling_run_id, status, is_current,
  assigned_by, assigned_at, accepted_at, completed_at, planned_pickup_at,
  planned_delivery_at, replaced_by_assignment_id, reason, created_at, updated_at,
  order:orders(${ORDER_SELECT})
`;

export const ASSIGNMENT_EVENT_FIELDS =
  'id, assignment_id, from_status, to_status, actor_id, actor_role, reason, metadata, created_at';

export const ORDER_EVENT_FIELDS =
  'id, order_id, from_status, to_status, actor_id, actor_role, reason, metadata, created_at';

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function clampLimit(value, fallback = 100, max = 250) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function parseStatusList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function readJson(c) {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function privileged(c) {
  return createPrivilegedSupabase(c.env, { isAuthorized: true });
}

export function fail(c, status, code, message) {
  return c.json({ error: { code, message } }, status);
}

export function handleDbError(c, error, fallback = 'The order operation could not be completed.') {
  const mapping = DB_ERRORS[error?.code];
  const message = error?.message || fallback;

  if (mapping) {
    return fail(c, mapping.status, mapping.code, GENERIC_MESSAGES[error?.code] ?? message);
  }

  console.error('[routesync] order lifecycle failed:', message);
  return fail(c, 500, 'INTERNAL_ERROR', fallback);
}

export async function unwrap(result) {
  const resolved = await result;
  if (resolved?.error) {
    const error = new Error(resolved.error.message);
    error.code = resolved.error.code;
    error.details = resolved.error.details;
    throw error;
  }
  return resolved?.data;
}

export async function getOrderById(client, orderId, select = ORDER_SELECT) {
  return unwrap(
    await client.from('orders').select(select).eq('id', orderId).maybeSingle(),
  );
}

export async function getCustomerOrder(client, customerId, orderId) {
  return unwrap(
    await client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .maybeSingle(),
  );
}

export async function getOrderEvents(client, orderId) {
  return (
    unwrap(
      await client
        .from('order_status_events')
        .select(ORDER_EVENT_FIELDS)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ) ?? []
  );
}

export async function getOrderAssignments(client, orderId, { currentOnly = false } = {}) {
  let query = client
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (currentOnly) query = query.eq('is_current', true);

  return unwrap(await query) ?? [];
}

export async function getAssignmentForRider(client, riderId, assignmentId) {
  return unwrap(
    await client
      .from('assignments')
      .select(ASSIGNMENT_SELECT)
      .eq('id', assignmentId)
      .eq('rider_id', riderId)
      .maybeSingle(),
  );
}

export async function getAssignmentEvents(client, assignmentIds) {
  if (!assignmentIds.length) return [];
  return (
    unwrap(
      await client
        .from('assignment_events')
        .select(ASSIGNMENT_EVENT_FIELDS)
        .in('assignment_id', assignmentIds)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }),
    ) ?? []
  );
}

export async function getProfilesByIds(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  return (
    unwrap(
      await client
        .from('profiles')
        .select('id, full_name, email, phone, role, is_active')
        .in('id', unique),
    ) ?? []
  );
}

export async function getOwnerRestaurant(client, ownerId) {
  return unwrap(
    await client
      .from('restaurants')
      .select(
        'id, owner_id, name, slug, phone, address_line, landmark, city, state, opening_time, closing_time, is_active, default_prep_time_minutes',
      )
      .eq('owner_id', ownerId)
      .maybeSingle(),
  );
}

/** Customer-facing assignment view: no rider identity, phone or staff ids. */
export function customerAssignment(assignment) {
  if (!assignment) return null;
  return {
    id: assignment.id,
    order_id: assignment.order_id,
    status: assignment.status,
    is_current: assignment.is_current,
    planned_pickup_at: assignment.planned_pickup_at,
    planned_delivery_at: assignment.planned_delivery_at,
    accepted_at: assignment.accepted_at,
    completed_at: assignment.completed_at,
    created_at: assignment.created_at,
    updated_at: assignment.updated_at,
  };
}

export function currentAssignment(assignments = []) {
  return assignments.find((assignment) => assignment.is_current) ?? null;
}

export function computeOrderSummary(orders = []) {
  const summary = {
    total: orders.length,
    pending: 0,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    assigned: 0,
    pickedUp: 0,
    outForDelivery: 0,
    delivered: 0,
    cancelled: 0,
    active: 0,
    revenueMinor: 0,
  };

  for (const order of orders) {
    const status = String(order.status);
    if (status in summary) summary[status] += 1;
    if (status === 'picked_up') summary.pickedUp += 1;
    if (status === 'out_for_delivery') summary.outForDelivery += 1;
    if (status === 'cancelled' || status === 'rejected') summary.cancelled += 1;
    if (!['delivered', 'cancelled', 'rejected'].includes(status)) summary.active += 1;
    if (status === 'delivered') summary.revenueMinor += Number(order.total_minor ?? 0);
  }

  return summary;
}

export function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'Add at least one menu item to the order.' };
  }
  if (items.length > 50) {
    return { error: 'An order may contain at most 50 different menu items.' };
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of items) {
    if (!entry || typeof entry !== 'object') {
      return { error: 'Each order line must be an object.' };
    }
    const menuItemId = String(entry.menuItemId ?? entry.menu_item_id ?? '').trim();
    const quantity = Number(entry.quantity);
    const notes = entry.notes == null ? null : String(entry.notes).trim() || null;

    if (!isUuid(menuItemId)) {
      return { error: 'A selected menu item is not valid.' };
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      return { error: 'Item quantities must be whole numbers between 1 and 50.' };
    }
    if (notes && notes.length > 280) {
      return { error: 'Item notes may not exceed 280 characters.' };
    }
    if (seen.has(menuItemId)) {
      return { error: 'A menu item may appear only once per order.' };
    }
    seen.add(menuItemId);
    normalized.push({ menu_item_id: menuItemId, quantity, notes });
  }

  return { items: normalized };
}

export function validateOrderTarget(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'A JSON request body is required.' };
  }
  const restaurantId = String(body.restaurantId ?? body.restaurant_id ?? '').trim();
  const addressId = String(body.addressId ?? body.address_id ?? '').trim();
  if (!isUuid(restaurantId)) return { error: 'Choose a valid restaurant.' };
  if (!isUuid(addressId)) return { error: 'Choose a valid delivery address.' };

  const items = normalizeItems(body.items);
  if (items.error) return items;

  return { restaurantId, addressId, items: items.items };
}

export function validateTransitionBody(body, allowedStatuses = ORDER_STATUSES) {
  if (!body || typeof body !== 'object') {
    return { error: 'A JSON request body is required.' };
  }
  const status = String(body.status ?? '').trim();
  if (!allowedStatuses.includes(status)) {
    return { error: 'Choose a valid next status.' };
  }

  const reason = body.reason == null ? null : String(body.reason).trim() || null;
  if (reason && reason.length > 280) {
    return { error: 'The reason may not exceed 280 characters.' };
  }

  const expectedStatus = body.expectedStatus ?? body.expected_status ?? null;
  if (expectedStatus != null && !ORDER_STATUSES.includes(String(expectedStatus))) {
    return { error: 'The expected status is not valid.' };
  }

  let prepTimeMinutes = null;
  if (body.prepTimeMinutes != null || body.prep_time_minutes != null) {
    prepTimeMinutes = Number(body.prepTimeMinutes ?? body.prep_time_minutes);
    if (!Number.isInteger(prepTimeMinutes) || prepTimeMinutes < 1 || prepTimeMinutes > 240) {
      return { error: 'Preparation time must be between 1 and 240 minutes.' };
    }
  }

  return {
    status,
    reason,
    expectedStatus: expectedStatus == null ? null : String(expectedStatus),
    prepTimeMinutes,
  };
}

export async function getOrderParticipants(client, restaurantId) {
  return unwrap(
    await client
      .from('restaurants')
      .select('id, owner_id, name')
      .eq('id', restaurantId)
      .maybeSingle(),
  );
}

export function minutesFromNowIso(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
