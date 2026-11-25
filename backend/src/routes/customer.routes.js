import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import {
  IDEMPOTENCY_MAX,
  IDEMPOTENCY_MIN,
  ORDER_SELECT,
  ORDER_STATUSES,
  TRACKING_STOP_FIELDS,
  clampLimit,
  computeOrderSummary,
  customerAssignment,
  currentAssignment,
  fail,
  getCustomerOrder,
  getOrderAssignments,
  getOrderEvents,
  handleDbError,
  isUuid,
  parseStatusList,
  privileged,
  publicRiderLocation,
  readJson,
  unwrap,
  validCoordinates,
  validateOrderTarget,
} from '../lib/orderLifecycle.js';

const router = new Hono();

export { validCoordinates };

async function quoteLocationError(client, quote, restaurantId) {
  if (!validCoordinates(quote?.delivery_latitude, quote?.delivery_longitude)) {
    return 'This saved delivery address has no valid coordinates. Edit it in your profile before checkout.';
  }
  const restaurant = await unwrap(client.from('restaurants').select('latitude, longitude').eq('id', restaurantId).maybeSingle());
  if (!validCoordinates(restaurant?.latitude, restaurant?.longitude)) {
    return 'This restaurant has no delivery pickup coordinates. Please contact the restaurant.';
  }
  return null;
}

router.use('*', requireAuth, requireRole('customer'));

async function loadCustomerOrderDetail(client, customerId, orderId) {
  const order = await getCustomerOrder(client, customerId, orderId);
  if (!order) return null;

  const [events, assignments] = await Promise.all([
    getOrderEvents(client, orderId),
    getOrderAssignments(client, orderId),
  ]);

  return {
    order,
    events,
    assignment: customerAssignment(currentAssignment(assignments)),
    summary: computeOrderSummary([order]),
  };
}

router.get('/orders', async (c) => {
  const client = privileged(c);
  const profile = c.get('profile');
  const statuses = parseStatusList(c.req.query('status'));
  const invalid = statuses.find((status) => !ORDER_STATUSES.includes(status));
  if (invalid) return fail(c, 422, 'INVALID_INPUT', `Unknown order status: ${invalid}.`);

  try {
    let query = client
      .from('orders')
      .select(ORDER_SELECT)
      .eq('customer_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(clampLimit(c.req.query('limit'), 100, 200));

    if (statuses.length) query = query.in('status', statuses);

    const orders = (await unwrap(query)) ?? [];
    return c.json({ orders, summary: computeOrderSummary(orders) });
  } catch (error) {
    return handleDbError(c, error, 'Your orders could not be loaded.');
  }
});

router.get('/orders/:orderId', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const client = privileged(c);
  try {
    const detail = await loadCustomerOrderDetail(client, c.get('profile').id, orderId);
    if (!detail) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

    return c.json(detail);
  } catch (error) {
    return handleDbError(c, error, 'The order details could not be loaded.');
  }
});

router.get('/orders/:orderId/tracking', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const client = privileged(c);
  try {
    const order = await getCustomerOrder(client, c.get('profile').id, orderId);
    if (!order) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

    const assignments = await getOrderAssignments(client, orderId, {
      currentOnly: true,
    });
    const current = currentAssignment(assignments);

    let riderLocation = null;
    let stops = [];
    let route = null;

    const mayTrackRider = current && ['picked_up', 'out_for_delivery'].includes(order.status)
      && ['accepted', 'active'].includes(current.status);
    if (current) {
      const [locations, stopRows, routeRow] = await Promise.all([
        mayTrackRider ? unwrap(
          client
            .from('rider_locations')
            .select('latitude, longitude, accuracy_meters, source, recorded_at')
            .eq('rider_id', current.rider_id)
            .order('recorded_at', { ascending: false })
            .limit(1),
        ) : [],
        current.route_id
          ? unwrap(
              client
                .from('route_stops')
                .select(TRACKING_STOP_FIELDS)
                .eq('route_id', current.route_id)
                .eq('order_id', orderId)
                .order('stop_sequence'),
            )
          : [],
        current.route_id
          ? unwrap(
              client
                .from('delivery_routes')
                .select('id, status, planned_start, planned_end')
                .eq('id', current.route_id)
                .maybeSingle(),
            )
          : null,
      ]);

      riderLocation = locations?.[0] ?? null;
      stops = stopRows ?? [];
      route = routeRow ?? null;
    }

    return c.json({
      order: {
        id: order.id,
        status: order.status,
        delivery_address_line: order.delivery_address_line,
        delivery_latitude: order.delivery_latitude,
        delivery_longitude: order.delivery_longitude,
        estimated_ready_at: order.estimated_ready_at,
        delivery_window_start: order.delivery_window_start,
        delivery_window_end: order.delivery_window_end,
        picked_up_at: order.picked_up_at,
        delivered_at: order.delivered_at,
        restaurant: order.restaurant,
      },
      assignment: customerAssignment(current),
      rider_location: publicRiderLocation(riderLocation),
      stops,
      route,
      tracking: {
        available: Boolean(riderLocation),
        source: riderLocation?.source ?? null,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return handleDbError(c, error, 'Live tracking could not be loaded.');
  }
});

router.post('/orders/quote', async (c) => {
  const body = await readJson(c);
  const target = validateOrderTarget(body);
  if (target.error) return fail(c, 422, 'INVALID_INPUT', target.error);

  const client = privileged(c);
  try {
    const { data, error } = await client.rpc('quote_order', {
      p_customer_id: c.get('profile').id,
      p_restaurant_id: target.restaurantId,
      p_address_id: target.addressId,
      p_items: target.items,
    });
    if (error) throw error;

    const locationError = await quoteLocationError(client, data, target.restaurantId);
    if (locationError) return fail(c, 422, 'INVALID_DELIVERY_LOCATION', locationError);

    return c.json({ quote: data });
  } catch (error) {
    return handleDbError(c, error, 'The order quote could not be calculated.');
  }
});

router.post('/orders', async (c) => {
  const body = await readJson(c);
  const target = validateOrderTarget(body);
  if (target.error) return fail(c, 422, 'INVALID_INPUT', target.error);

  const idempotencyKey = String(
    body?.idempotencyKey ?? body?.idempotency_key ?? '',
  ).trim();
  if (idempotencyKey.length < IDEMPOTENCY_MIN || idempotencyKey.length > IDEMPOTENCY_MAX) {
    return fail(
      c,
      422,
      'INVALID_INPUT',
      `A checkout idempotency key between ${IDEMPOTENCY_MIN} and ${IDEMPOTENCY_MAX} characters is required.`,
    );
  }

  const instructions = String(
    body?.specialInstructions ?? body?.special_instructions ?? '',
  ).trim();
  if (instructions.length > 280) {
    return fail(c, 422, 'INVALID_INPUT', 'Delivery instructions may not exceed 280 characters.');
  }

  const paymentMethod = String(
    body?.paymentMethod ?? body?.payment_method ?? 'cash_on_delivery',
  ).trim();
  if (paymentMethod !== 'cash_on_delivery') {
    return fail(c, 422, 'INVALID_INPUT', 'Only cash on delivery is supported in this phase.');
  }

  const client = privileged(c);
  const customerId = c.get('profile').id;

  try {
    const { data: freshQuote, error: quoteError } = await client.rpc('quote_order', {
      p_customer_id: customerId, p_restaurant_id: target.restaurantId,
      p_address_id: target.addressId, p_items: target.items,
    });
    if (quoteError) throw quoteError;
    const locationError = await quoteLocationError(client, freshQuote, target.restaurantId);
    if (locationError) return fail(c, 422, 'INVALID_DELIVERY_LOCATION', locationError);
    const { data, error } = await client.rpc('create_order', {
      p_customer_id: customerId,
      p_restaurant_id: target.restaurantId,
      p_address_id: target.addressId,
      p_items: target.items,
      p_special_instructions: instructions || null,
      p_idempotency_key: idempotencyKey,
      p_payment_method: 'cash_on_delivery',
    });
    if (error) throw error;

    const orderId = data?.order_id;
    if (!orderId) {
      return fail(c, 500, 'ORDER_NOT_CREATED', 'The order was not created.');
    }

    const detail = await loadCustomerOrderDetail(client, customerId, orderId);
    if (!detail) {
      return fail(c, 500, 'ORDER_NOT_FOUND', 'The created order could not be read back.');
    }

    return c.json(
      { ...detail, duplicate: Boolean(data.duplicate) },
      data.duplicate ? 200 : 201,
    );
  } catch (error) {
    return handleDbError(c, error, 'The order could not be created.');
  }
});

router.post('/orders/:orderId/cancel', async (c) => {
  const { orderId } = c.req.param();
  if (!isUuid(orderId)) return fail(c, 404, 'NOT_FOUND', 'Order not found.');

  const body = await readJson(c);
  const reason = String(body?.reason ?? '').trim();
  if (!reason) return fail(c, 422, 'INVALID_INPUT', 'A cancellation reason is required.');
  if (reason.length > 280) {
    return fail(c, 422, 'INVALID_INPUT', 'The cancellation reason may not exceed 280 characters.');
  }

  const expectedStatus = body?.expectedStatus ?? body?.expected_status ?? null;
  if (expectedStatus != null && !ORDER_STATUSES.includes(String(expectedStatus))) {
    return fail(c, 422, 'INVALID_INPUT', 'The expected status is not valid.');
  }

  const client = privileged(c);
  const customerId = c.get('profile').id;

  try {
    const { data, error } = await client.rpc('transition_order_status', {
      p_order_id: orderId,
      p_actor_id: customerId,
      p_actor_role: 'customer',
      p_next: 'cancelled',
      p_expected_status: expectedStatus == null ? null : String(expectedStatus),
      p_reason: reason,
      p_prep_time_minutes: null,
    });
    if (error) throw error;

    const detail = await loadCustomerOrderDetail(client, customerId, orderId);
    return c.json({ result: data, ...detail });
  } catch (error) {
    return handleDbError(c, error, 'The order could not be cancelled.');
  }
});

export default router;
