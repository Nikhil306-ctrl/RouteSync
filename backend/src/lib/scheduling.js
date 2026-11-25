import { solve } from '../engines/e1-scheduling-optimization/index.js';
import { loadOrders, normalizeOrder, recordInvalidOrders, recordRun, validateOrder } from '../engines/e2-data-validation/index.js';
import { loadResources } from '../engines/e3-resource-management/index.js';
import { schedulingOutcome } from '../engines/e4-communication-tracking/index.js';
import { isUuid, unwrap } from './orderLifecycle.js';
import { createPrivilegedSupabase } from './supabase.js';

// Enough time for a normal Worker/PostgREST round trip before travel starts.
export const DISPATCH_LEAD_MS = 3 * 60_000;
export const SCHEDULING_TIMEOUT_MS = 20_000;
const RETRYABLE_SCHEDULING_CODES = new Set(['40001', '40P01', '55P03']);

export function schedulingClient(env) {
  return createPrivilegedSupabase(env, { isAuthorized: true, timeoutMs: SCHEDULING_TIMEOUT_MS });
}

export function assertRequestedIds(ids) {
  if (ids == null) return;
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some((id) => !isUuid(id)) || new Set(ids).size !== ids.length) {
    const error = new Error('Provide 1 to 30 distinct valid order IDs.'); error.code = '22023'; throw error;
  }
}

export function assertRequestedOrders(ids, orders, override = false) {
  if (ids == null) return;
  assertRequestedIds(ids);
  const found = new Set(orders.map((order) => order.id));
  if (ids.some((id) => !found.has(id))) {
    const error = new Error('One or more requested orders do not exist.'); error.code = 'P0002'; throw error;
  }
  if (orders.some((order) => !['confirmed', 'preparing', 'ready', ...(override ? ['assigned'] : [])].includes(order.status))) {
    const error = new Error('A requested order is not eligible for scheduling.'); error.code = '23514'; throw error;
  }
}

export function partitionSchedulingOrders(orders, now, override = false) {
  const invalid = orders.filter((order) => validateOrder(order, now, override).length);
  const valid = orders.filter((order) => !validateOrder(order, now, override).length).map(normalizeOrder);
  return { invalid, valid };
}

async function persistedByConcurrentRequest(client, orderIds) {
  if (!orderIds.length) return false;
  const rows = await unwrap(client.from('assignments').select('order_id').in('order_id', orderIds).eq('is_current', true));
  return new Set((rows ?? []).map((row) => row.order_id)).size === orderIds.length;
}

export async function schedule(client, { ids, actorId, source = 'admin', riderId, override }) {
  const now = Date.now();
  let stage = 'orders';
  const timed = async (label, operation) => {
    stage = label;
    const started = Date.now();
    try { return await operation(); }
    finally { console.info('[routesync:scheduling] stage', label, 'duration_ms', Date.now() - started); }
  };
  try {
    assertRequestedIds(ids);
    const orders = await timed('orders', () => loadOrders(client, ids, Boolean(override)));
    assertRequestedOrders(ids, orders, Boolean(override));
    const existing = orders.length ? await timed('current_assignments', () => unwrap(client.from('assignments').select('order_id').in('order_id', orders.map((o) => o.id)).eq('is_current', true))) ?? [] : [];
    const occupied = new Set(existing.map((a) => a.order_id));
    const pending = orders.filter((o) => override || !occupied.has(o.id)).slice(0, 30);
    if (!pending.length) return { duplicate: true, assigned: [], unscheduled: [] };
    const { invalid, valid } = partitionSchedulingOrders(pending, now, Boolean(override));
    const riders = valid.length ? await timed('resources', () => loadResources(client, now, riderId)) : [];
    stage = 'solver';
    const solverStart = Date.now();
    const result = solve(valid, riders, { now: Date.now() + DISPATCH_LEAD_MS });
    console.info('[routesync:scheduling] stage solver duration_ms', Date.now() - solverStart, 'orders', valid.length, 'riders', riders.length);
    let persisted = null;
    if (valid.length) {
      const persist = () => recordRun(client, { actorId, orders: valid, result, source, override });
      try {
        persisted = await timed('persist_rpc', persist);
      } catch (persistError) {
        if (!override && await persistedByConcurrentRequest(client, valid.map((order) => order.id))) {
          return { duplicate: true, assigned: [], unscheduled: [], metrics: result.metrics };
        }
        if (!RETRYABLE_SCHEDULING_CODES.has(persistError?.code)) throw persistError;
        await new Promise((resolve) => setTimeout(resolve, 75 + Math.floor(Math.random() * 75)));
        persisted = await timed('persist_rpc_retry', persist);
      }
    }
    // Invalid-input reporting is ancillary: a committed schedule must never be
    // presented as failed (and retried) because its separate history write failed.
    if (invalid.length) {
      try { await timed('invalid_input', () => recordInvalidOrders(client, invalid, actorId, source, now)); }
      catch (error) { console.error('[routesync:scheduling] invalid input history unavailable', error.code ?? error.name ?? 'UNKNOWN'); }
    }
    result.metrics.orders_considered = pending.length;
    result.metrics.unscheduled_orders += invalid.length;
    return { ...schedulingOutcome(result, persisted),
      assigned: persisted?.assigned ?? [],
      unscheduled: [...(persisted?.unscheduled ?? []), ...invalid.map((order) => order.id)],
      invalid_reasons: invalid.map((order) => ({ order_id: order.id, reasons: validateOrder(order, now, Boolean(override)) })),
    };
  } catch (error) {
    console.error('[routesync:scheduling] failed stage', stage, 'elapsed_ms', Date.now() - now, 'code', error?.code ?? error?.name ?? 'UNKNOWN');
    error.stage = stage;
    throw error;
  }
}
