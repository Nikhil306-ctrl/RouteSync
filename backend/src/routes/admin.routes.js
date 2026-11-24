import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  ADMIN_ORDER_SELECT,
  ORDER_STATUSES,
  clampLimit,
  computeOrderSummary,
  fail,
  getAssignmentEvents,
  getOrderAssignments,
  getOrderById,
  getOrderEvents,
  getProfilesByIds,
  handleDbError,
  isUuid,
  parseStatusList,
  privileged,
  readJson,
  unwrap,
  validateTransitionBody,
} from '../lib/orderLifecycle.js';

const router = new Hono();

const ASSIGNMENT_PLAIN_FIELDS = `
  id, order_id, rider_id, route_id, scheduling_run_id, status, is_current,
  assigned_by, assigned_at, accepted_at, completed_at, planned_pickup_at,
  planned_delivery_at, replaced_by_assignment_id, reason, created_at, updated_at
`;

const ADMIN_TRANSITIONS = ['confirmed', 'rejected', 'cancelled'];
const ASSIGNABLE_STATUSES = ['confirmed', 'preparing', 'ready', 'assigned'];
// Provisional Phase 5 timing. Phase 6 replaces travel time with route optimisation.
const DISPATCH_BUFFER_MS = 5 * 60_000;
const PROVISIONAL_TRAVEL_MS = 25 * 60_000;

router.use('*', requireAuth, requireRole('admin'));

// Kept for role-enforcement checks and local smoke tests.
router.get('/status', (c) => c.json({ status: 'ok', scope: 'admin' }));

async function enrichAssignments(client, assignments) {
  const ids = assignments.map((assignment) => assignment.id);
  const riderIds = [...new Set(assignments.map((assignment) => assignment.rider_id))];
  const [events, profiles] = await Promise.all([
    getAssignmentEvents(client, ids),
    getProfilesByIds(client, riderIds),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const eventsByAssignment = new Map();
  for (const event of events) {
    const list = eventsByAssignment.get(event.assignment_id) ?? [];
    list.push(event);
    eventsByAssignment.set(event.assignment_id, list);
  }

  return assignments.map((assignment) => ({
    ...assignment,
    rider: profileById.get(assignment.rider_id) ?? null,
    events: eventsByAssignment.get(assignment.id) ?? [],
  }));
}

async function loadDispatchQueue(client) {
  const orders = (
    await unwrap(
      await client
        .from('orders')
        .select(ADMIN_ORDER_SELECT)
        .in('status', ASSIGNABLE_STATUSES)
        .order('delivery_window_start', { ascending: true })
        .limit(200),
    )
  ) ?? [];

  const orderIds = orders.map((order) => order.id);
  const assignments = orderIds.length
    ? (
        await unwrap(
          await client
            .from('assignments')
            .select(ASSIGNMENT_PLAIN_FIELDS)
            .in('order_id', orderIds)
            .order('created_at', { ascending: true }),
        )
      ) ?? []
    : [];

  const riderIds = [...new Set(assignments.map((assignment) => assignment.rider_id))];
  const riderProfiles = await getProfilesByIds(client, riderIds);
  const profileById = new Map(riderProfiles.map((profile) => [profile.id, profile]));

  const assignmentsByOrder = new Map();
  for (const assignment of assignments) {
    const list = assignmentsByOrder.get(assignment.order_id) ?? [];
    list.push({ ...assignment, rider: profileById.get(assignment.rider_id) ?? null });
    assignmentsByOrder.set(assignment.order_id, list);
  }

  const queue = orders.map((order) => {
    const rows = assignmentsByOrder.get(order.id) ?? [];
    const current = rows.find((assignment) => assignment.is_current) ?? null;
    const history = rows.filter((assignment) => !assignment.is_current);

    return {
      ...order,
      current_assignment: current,
      assignment_history: history,
      reassignment_count: history.length,
    };
  });

  let awaitingAssignment = 0;
  let awaitingResponse = 0;
  let assigned = 0;
  for (const order of queue) {
    if (!order.current_assignment) awaitingAssignment += 1;
    else if (order.current_assignment.status === 'proposed') awaitingResponse += 1;
    else if (['accepted', 'active'].includes(order.current_assignment.status)) assigned += 1;
  }

  return {
    orders: queue,
    summary: {
      queue: queue.length,
      awaitingAssignment,
      awaitingResponse,
      assigned,
      needsAction: awaitingAssignment + awaitingResponse,
    },
  };
}

async function recomputePlannedPlan(client, order) {
  void client;
  const now = Date.now();
  const windowStart = order.delivery_window_start ? Date.parse(order.delivery_window_start) : now;
  const windowEnd = order.delivery_window_end
    ? Date.parse(order.delivery_window_end)
    : windowStart + 30 * 60_000;
  const readyAt = order.estimated_ready_at
    ? Date.parse(order.estimated_ready_at)
    : windowStart - 15 * 60_000;
  const pickupMs = Math.max(
    now + DISPATCH_BUFFER_MS,
    Number.isFinite(readyAt) ? readyAt : now + DISPATCH_BUFFER_MS,
  );
  const deliveryMs = Math.max(
    pickupMs + PROVISIONAL_TRAVEL_MS,
    Number.isFinite(windowStart) ? windowStart : pickupMs + PROVISIONAL_TRAVEL_MS,
  );

  return {
    pickupAt: new Date(pickupMs).toISOString(),
    deliveryAt: new Date(deliveryMs).toISOString(),
    travelEstimateMinutes: PROVISIONAL_TRAVEL_MS / 60_000,
    windowEnd: Number.isFinite(windowEnd) ? new Date(windowEnd).toISOString() : null,
    feasible: Number.isFinite(windowEnd) && deliveryMs <= windowEnd,
  };
}

async function computeRiderLoads(client, riderIds, orderId) {
  if (!riderIds.length) return new Map();

  const loads =
    (await unwrap(
      await client
        .from('assignments')
        .select('id, rider_id, order_id, status, is_current')
        .in('rider_id', riderIds)
        .eq('is_current', true)
        .in('status', ['proposed', 'accepted', 'active']),
    )) ?? [];

  const loadOrderIds = [
    ...new Set(
      loads
        .map((assignment) => assignment.order_id)
        .filter((id) => id && id !== orderId),
    ),
  ];

  const finalOrderIds = new Set();
  if (loadOrderIds.length) {
    const loadOrders =
      (await unwrap(
        await client.from('orders').select('id, status').in('id', loadOrderIds),
      )) ?? [];
    for (const loadOrder of loadOrders) {
      if (['delivered', 'cancelled', 'rejected'].includes(loadOrder.status)) {
        finalOrderIds.add(loadOrder.id);
      }
    }
  }

  const counts = new Map();
  for (const assignment of loads) {
    if (assignment.order_id === orderId) continue;
    if (finalOrderIds.has(assignment.order_id)) continue;
    counts.set(assignment.rider_id, (counts.get(assignment.rider_id) ?? 0) + 1);
  }
  return counts;
}

router.get('/orders', async (c) => {
  const client = privileged(c);
  const statuses = parseStatusList(c.req.query('status'));
  const invalid = statuses.find((status) => !ORDER_STATUSES.includes(status));
  if (invalid) return fail(c, 422, 'INVALID_INPUT', `Unknown order status: ${invalid}.`);

  const restaurantId = c.req.query('restaurantId');
  const customerId = c.req.query('customerId');
  if (restaurantId && !isUuid(restaurantId)) {
    return fail(c, 422, 'INVALID_INPUT', 'The restaurant filter is not valid.');
  }
  if (customerId && !isUuid(customerId)) {
    return fail(c, 422, 'INVALID_INPUT', 'The customer filter is not valid.');
  }

  try {
    let query = client
      .from('orders')
      .select(ADMIN_ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(clampLimit(c.req.query('limit'), 250, 300));

    if (statuses.length) query = query.in('status', statuses);
    if (restaurantId) query = query.eq('restaurant_id', restaurantId);
    if (customerId) query = query.eq('customer_id', customerId);

    const orders = (await unwrap(query)) ?? [];
    return c.json({ orders, summary: computeOrderSummary(orders) });
  } catch (error) {
    return handleDbError(c, error, 'The order list could not be loaded.');
  }
});

router.get('/orders/:orderId', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const client = privileged(c);
  try {
    const order = await getOrderById(client, orderId, ADMIN_ORDER_SELECT);
    if (!order) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

    const [events, assignments] = await Promise.all([
      getOrderEvents(client, orderId),
      getOrderAssignments(client, orderId),
    ]);
    const enriched = await enrichAssignments(client, assignments);

    return c.json({
      order,
      events,
      assignments: enriched,
      current_assignment: enriched.find((assignment) => assignment.is_current) ?? null,
      assignment_history: enriched.filter((assignment) => !assignment.is_current),
    });
  } catch (error) {
    return handleDbError(c, error, 'The order details could not be loaded.');
  }
});

router.post('/orders/:orderId/transition', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const transition = validateTransitionBody(await readJson(c), ADMIN_TRANSITIONS);
  if (transition.error) return fail(c, 422, 'INVALID_INPUT', transition.error);

  if (
    ['cancelled', 'rejected'].includes(transition.status) &&
    !transition.reason
  ) {
    return fail(c, 422, 'INVALID_INPUT', 'A cancellation or rejection reason is required.');
  }

  const client = privileged(c);
  const profile = c.get('profile');

  try {
    const { data, error } = await client.rpc('transition_order_status', {
      p_order_id: orderId,
      p_actor_id: profile.id,
      p_actor_role: 'admin',
      p_next: transition.status,
      p_expected_status: transition.expectedStatus,
      p_reason: transition.reason,
      p_prep_time_minutes: null,
    });
    if (error) throw error;

    const order = await getOrderById(client, orderId, ADMIN_ORDER_SELECT);
    const events = await getOrderEvents(client, orderId);
    return c.json({ result: data, order, events });
  } catch (error) {
    return handleDbError(c, error, 'The order status could not be updated.');
  }
});

router.get('/dispatch/queue', async (c) => {
  const client = privileged(c);
  try {
    const queue = await loadDispatchQueue(client);
    return c.json(queue);
  } catch (error) {
    return handleDbError(c, error, 'The dispatch queue could not be loaded.');
  }
});

router.get('/riders/eligible', async (c) => {
  const orderId = c.req.query('orderId');
  if (!isUuid(orderId)) {
    return fail(c, 422, 'INVALID_INPUT', 'Choose a valid order before listing riders.');
  }

  const client = privileged(c);
  try {
    const order = await getOrderById(
      client,
      orderId,
      'id, status, restaurant_id, delivery_address_line, estimated_ready_at, delivery_window_start, delivery_window_end',
    );
    if (!order) return fail(c, 404, 'NOT_FOUND', 'Order not found.');
    if (!ASSIGNABLE_STATUSES.includes(order.status)) {
      return fail(
        c,
        422,
        'INVALID_STATE',
        'Only accepted orders that have not been picked up can be assigned.',
      );
    }

    const plan = await recomputePlannedPlan(client, order);
    const deliveryMs = Date.parse(plan.deliveryAt);
    const nowIso = new Date().toISOString();

    const riders =
      (await unwrap(
        await client
          .from('riders')
          .select(
            'id, vehicle_type, vehicle_number, max_concurrent_orders, is_available, verification_status, rating',
          ),
      )) ?? [];
    const riderIds = riders.map((rider) => rider.id);
    const profiles = riderIds.length ? await getProfilesByIds(client, riderIds) : [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    let shifts = [];
    let loads = new Map();
    if (riderIds.length) {
      shifts =
        (await unwrap(
          await client
            .from('rider_shifts')
            .select('id, rider_id, starts_at, ends_at, status')
            .in('rider_id', riderIds)
            .in('status', ['scheduled', 'active'])
            .lte('starts_at', nowIso)
            .gt('ends_at', nowIso)
            .order('starts_at', { ascending: false }),
        )) ?? [];
      loads = await computeRiderLoads(client, riderIds, orderId);
    }

    const shiftByRider = new Map();
    for (const shift of shifts) {
      if (!shiftByRider.has(shift.rider_id)) shiftByRider.set(shift.rider_id, shift);
    }

    const candidates = riders.map((rider) => {
      const profile = profileById.get(rider.id) ?? null;
      const shift = shiftByRider.get(rider.id) ?? null;
      const activeLoad = loads.get(rider.id) ?? 0;

      let reason = null;
      if (!profile || !profile.is_active || profile.role !== 'rider') {
        reason = 'The delivery partner account is missing or inactive.';
      } else if (rider.verification_status !== 'verified') {
        reason = 'Verification is not complete.';
      } else if (!rider.is_available) {
        reason = 'The delivery partner is marked unavailable.';
      } else if (!plan.feasible) {
        reason = 'The provisional delivery plan falls outside the delivery window.';
      } else if (!shift) {
        reason = 'No scheduled shift covers the current time.';
      } else if (activeLoad >= rider.max_concurrent_orders) {
        reason = `At capacity (${activeLoad} of ${rider.max_concurrent_orders} active orders).`;
      } else if (Date.parse(shift.ends_at) < deliveryMs) {
        reason = 'The shift ends before the planned delivery.';
      }

      return {
        id: rider.id,
        full_name: profile?.full_name ?? '',
        email: profile?.email ?? null,
        phone: profile?.phone ?? null,
        vehicle_type: rider.vehicle_type,
        vehicle_number: rider.vehicle_number,
        max_concurrent_orders: rider.max_concurrent_orders,
        is_available: rider.is_available,
        verification_status: rider.verification_status,
        rating: rider.rating,
        active_load: activeLoad,
        shift_ends_at: shift?.ends_at ?? null,
        eligible: reason === null,
        reason,
      };
    });

    candidates.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '');
    });

    return c.json({
      order: {
        id: order.id,
        status: order.status,
        delivery_address_line: order.delivery_address_line,
      },
      plan,
      riders: candidates,
    });
  } catch (error) {
    return handleDbError(c, error, 'Eligible riders could not be loaded.');
  }
});

router.post('/orders/:orderId/assign', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const body = await readJson(c);
  const riderId = String(body?.riderId ?? body?.rider_id ?? '').trim();
  if (!isUuid(riderId)) {
    return fail(c, 422, 'INVALID_INPUT', 'Choose a valid delivery partner.');
  }

  const reason = String(body?.reason ?? '').trim();
  if (reason.length > 280) {
    return fail(c, 422, 'INVALID_INPUT', 'The assignment reason may not exceed 280 characters.');
  }

  const expectedAssignmentId =
    body?.expectedAssignmentId ?? body?.expected_assignment_id ?? null;
  if (expectedAssignmentId != null && !isUuid(String(expectedAssignmentId))) {
    return fail(c, 422, 'INVALID_INPUT', 'The expected assignment reference is not valid.');
  }

  const client = privileged(c);
  const profile = c.get('profile');

  try {
    const { data, error } = await client.rpc('assign_rider', {
      p_order_id: orderId,
      p_rider_id: riderId,
      p_assigned_by: profile.id,
      p_reason: reason || null,
      p_expected_assignment_id: expectedAssignmentId == null ? null : String(expectedAssignmentId),
    });
    if (error) throw error;

    return c.json({ result: data }, data?.duplicate ? 200 : 201);
  } catch (error) {
    return handleDbError(c, error, 'The rider assignment could not be saved.');
  }
});

export default router;
