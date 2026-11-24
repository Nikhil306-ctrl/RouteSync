import { requireSupabase, unwrap } from './client.js';

export const ORDER_FIELDS = `
  id, customer_id, restaurant_id, delivery_address_id, status, priority,
  subtotal_minor, delivery_fee_minor, discount_minor, total_minor, currency,
  requested_at, delivery_window_start, delivery_window_end, prep_time_minutes,
  delivery_address_line, delivery_latitude, delivery_longitude,
  delivery_contact_phone, special_instructions, cancellation_reason,
  created_at, updated_at,
  restaurant:restaurants(id, name, slug, address_line, landmark, city, phone, latitude, longitude),
  items:order_items(id, menu_item_id, item_name, unit_price_minor, quantity, line_total_minor, notes)
`;

export async function listOrders({ statuses, restaurantId, customerId, limit = 250 } = {}) {
  const supabase = requireSupabase();
  let query = supabase.from('orders').select(ORDER_FIELDS).order('created_at', { ascending: false }).limit(limit);

  if (statuses?.length) query = query.in('status', statuses);
  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (customerId) query = query.eq('customer_id', customerId);

  return unwrap(await query) ?? [];
}

export async function getOrder(id) {
  const supabase = requireSupabase();
  return unwrap(await supabase.from('orders').select(ORDER_FIELDS).eq('id', id).maybeSingle());
}

export async function updateOrderStatus(id, status, cancellationReason = null) {
  const supabase = requireSupabase();
  const patch = { status };
  if (status === 'cancelled' || status === 'rejected') {
    patch.cancellation_reason = cancellationReason?.trim() || null;
  }
  return unwrap(
    await supabase
      .from('orders')
      .update(patch)
      .eq('id', id)
      .select(ORDER_FIELDS)
      .single(),
  );
}

export function orderMetrics(orders = []) {
  const metric = {
    total: orders.length,
    active: 0,
    pending: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    revenueMinor: 0,
  };

  for (const order of orders) {
    const status = String(order.status);
    if (!['delivered', 'cancelled', 'rejected'].includes(status)) metric.active += 1;
    if (status === 'pending') metric.pending += 1;
    if (['confirmed', 'preparing', 'assigned'].includes(status)) metric.preparing += 1;
    if (status === 'ready') metric.ready += 1;
    if (status === 'delivered') {
      metric.delivered += 1;
      metric.revenueMinor += Number(order.total_minor ?? 0);
    }
    if (status === 'cancelled' || status === 'rejected') metric.cancelled += 1;
  }

  return metric;
}

export function groupOrderItems(orders = []) {
  return new Map(orders.map((order) => [order.id, order.items ?? []]));
}
