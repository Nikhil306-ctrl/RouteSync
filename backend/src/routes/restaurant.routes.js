import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  ORDER_SELECT,
  ORDER_STATUSES,
  clampLimit,
  computeOrderSummary,
  currentAssignment,
  fail,
  getOrderAssignments,
  getOrderEvents,
  getProfilesByIds,
  getOwnerRestaurant,
  handleDbError,
  isUuid,
  parseStatusList,
  privileged,
  readJson,
  unwrap,
  validateTransitionBody,
} from '../lib/orderLifecycle.js';

const router = new Hono();

const RESTAURANT_TRANSITIONS = [
  'confirmed',
  'preparing',
  'ready',
  'cancelled',
  'rejected',
];

router.use('*', requireAuth, requireRole('restaurant'));

async function loadRestaurantOrder(client, restaurantId, orderId) {
  return unwrap(
    await client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle(),
  );
}

router.get('/orders', async (c) => {
  const client = privileged(c);
  const profile = c.get('profile');
  const statuses = parseStatusList(c.req.query('status'));
  const invalid = statuses.find((status) => !ORDER_STATUSES.includes(status));
  if (invalid) return fail(c, 422, 'INVALID_INPUT', `Unknown order status: ${invalid}.`);

  try {
    const restaurant = await getOwnerRestaurant(client, profile.id);
    if (!restaurant) {
      return c.json({ restaurant: null, orders: [], summary: computeOrderSummary([]) });
    }

    let query = client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('restaurant_id', restaurant.id)
      .order('created_at', { ascending: false })
      .limit(clampLimit(c.req.query('limit'), 200, 300));

    if (statuses.length) query = query.in('status', statuses);

    const orders = (await unwrap(query)) ?? [];
    return c.json({
      restaurant,
      orders,
      summary: computeOrderSummary(orders),
    });
  } catch (error) {
    return handleDbError(c, error, 'The kitchen orders could not be loaded.');
  }
});

router.get('/orders/:orderId', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const client = privileged(c);
  try {
    const restaurant = await getOwnerRestaurant(client, c.get('profile').id);
    if (!restaurant) return fail(c, 404, 'NOT_FOUND', 'No restaurant is linked to this account.');

    const order = await loadRestaurantOrder(client, restaurant.id, orderId);
    if (!order) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

    const [events, assignments] = await Promise.all([
      getOrderEvents(client, orderId),
      getOrderAssignments(client, orderId, { currentOnly: true }),
    ]);
    const current = currentAssignment(assignments);
    const rider = current ? (await getProfilesByIds(client, [current.rider_id]))[0] : null;

    return c.json({
      restaurant,
      order,
      events,
      assignment: current ? { ...current, rider: rider ? { full_name: rider.full_name } : null } : null,
    });
  } catch (error) {
    return handleDbError(c, error, 'The order details could not be loaded.');
  }
});

router.post('/orders/:orderId/transition', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const transition = validateTransitionBody(
    await readJson(c),
    RESTAURANT_TRANSITIONS,
  );
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
      p_actor_role: 'restaurant',
      p_next: transition.status,
      p_expected_status: transition.expectedStatus,
      p_reason: transition.reason,
      p_prep_time_minutes: transition.prepTimeMinutes,
    });
    if (error) throw error;

    const restaurant = await getOwnerRestaurant(client, profile.id);
    const order = await loadRestaurantOrder(client, restaurant.id, orderId);
    const events = await getOrderEvents(client, orderId);

    // Confirmed orders are durable scheduling work, picked up by the Worker
    // cron. No detached promise depends on this HTTP request staying alive.
    return c.json({ result: data, order, events,
      scheduling: transition.status === 'confirmed' ? { pending: true } : null });
  } catch (error) {
    return handleDbError(c, error, 'The order status could not be updated.');
  }
});

router.post('/orders/:orderId/prep-delay', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const body = await readJson(c);
  if (!body || typeof body !== 'object') {
    return fail(c, 422, 'INVALID_INPUT', 'A JSON request body is required.');
  }

  const delayMinutes = Number(body.delayMinutes ?? body.delay_minutes);
  if (!Number.isInteger(delayMinutes) || delayMinutes < 1 || delayMinutes > 240) {
    return fail(c, 422, 'INVALID_INPUT', 'Preparation delay must be between 1 and 240 minutes.');
  }

  const reason = String(body.reason ?? '').trim();
  if (reason.length > 280) {
    return fail(c, 422, 'INVALID_INPUT', 'The delay reason may not exceed 280 characters.');
  }

  const client = privileged(c);
  const profile = c.get('profile');

  try {
    const { data, error } = await client.rpc('report_prep_delay', {
      p_order_id: orderId,
      p_actor_id: profile.id,
      p_actor_role: 'restaurant',
      p_delay_minutes: delayMinutes,
      p_reason: reason || null,
    });
    if (error) throw error;

    const restaurant = await getOwnerRestaurant(client, profile.id);
    const order = restaurant
      ? await loadRestaurantOrder(client, restaurant.id, orderId)
      : null;
    const [events, assignments] = await Promise.all([
      getOrderEvents(client, orderId),
      getOrderAssignments(client, orderId, { currentOnly: true }),
    ]);
    const current = currentAssignment(assignments);

    return c.json({
      result: data,
      order,
      events,
      assignment: current ?? null,
      scheduling: data?.rescheduling_pending ? { pending: true } : null,
    });
  } catch (error) {
    return handleDbError(c, error, 'The preparation delay could not be recorded.');
  }
});

export default router;
