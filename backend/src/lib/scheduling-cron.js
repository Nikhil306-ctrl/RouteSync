import { schedule, schedulingClient } from './scheduling.js';
import { unwrap } from './orderLifecycle.js';
import { validateOrder } from '../engines/e2-data-validation/index.js';

let activeSchedulingRun = null;

export function runPendingSchedulingOnce(env, options) {
  if (activeSchedulingRun) return activeSchedulingRun;
  activeSchedulingRun = runPendingScheduling(env, options).finally(() => {
    activeSchedulingRun = null;
  });
  return activeSchedulingRun;
}

// Confirmed, unassigned orders are the durable queue. A cron invocation can be
// retried after a Worker restart; persist_schedule still locks and rechecks them.
export async function runPendingScheduling(env, { clientFactory = schedulingClient, scheduleOrder = schedule } = {}) {
  const client = clientFactory(env);
  const started = Date.now();
  try {
    const runs = await unwrap(client.from('scheduling_runs').select('input_snapshot, created_at, status')
      .order('created_at', { ascending: false }).limit(50));
    const recent = new Set((runs ?? []).filter((run) => Date.now() - Date.parse(run.created_at) < (run.status === 'failed' ? 5 : 2) * 60_000)
      .flatMap((run) => run.input_snapshot?.order_ids ?? []));
    const pending = [];
    for (let page = 0; page < 5 && pending.length < 2; page++) {
      const orders = await unwrap(client.from('orders').select('id, status, delivery_latitude, delivery_longitude, delivery_address_line, estimated_ready_at, delivery_window_start, delivery_window_end, restaurant:restaurants(owner_id,latitude,longitude,address_line)')
        .in('status', ['confirmed', 'preparing', 'ready'])
        .gt('delivery_window_end', new Date().toISOString())
        .order('delivery_window_end').range(page * 80, page * 80 + 79));
      if (!orders?.length) break;
      const ids = orders.map((o) => o.id);
      const [current, invalid] = await Promise.all([
        unwrap(client.from('assignments').select('order_id').in('order_id', ids).eq('is_current', true)),
        unwrap(client.from('constraint_violations').select('order_id').in('order_id', ids)
          .eq('constraint_type', 'invalid_scheduling_data')),
      ]);
      const assigned = new Set((current ?? []).map((a) => a.order_id));
      const permanentlyInvalid = new Set((invalid ?? []).map((row) => row.order_id));
      // A repaired order must not stay excluded because of an old violation.
      pending.push(...orders.filter((o) => !assigned.has(o.id) && !recent.has(o.id)
        && (!permanentlyInvalid.has(o.id) || !validateOrder(o, Date.now()).length)).slice(0, 2 - pending.length));
      if (orders.length < 80) break;
    }
    for (const order of pending) {
      if (!order.restaurant?.owner_id) continue;
      try {
        await scheduleOrder(clientFactory(env), { ids: [order.id], actorId: order.restaurant.owner_id, source: 'automatic' });
      } catch (error) {
        console.error('[routesync:scheduling] cron failed stage', error.stage ?? 'queue', 'code', error.code ?? error.name ?? 'UNKNOWN');
        try {
          const current = await unwrap(clientFactory(env).from('assignments').select('id').in('order_id', [order.id]).eq('is_current', true));
          if (current?.length) continue;
        } catch (checkError) {
          console.error('[routesync:scheduling] post-failure check unavailable', checkError.code ?? checkError.name ?? 'UNKNOWN');
        }
        // Failure history is best-effort; the order remains durable and retryable.
        try {
          await unwrap(clientFactory(env).from('scheduling_runs').insert({
            requested_by: order.restaurant.owner_id, status: 'failed', algorithm: 'csp-backtracking-geographic-estimate',
            input_snapshot: { order_ids: [order.id], source: 'automatic' },
            metrics: { termination: 'failed', stage: error.stage ?? 'queue' },
            started_at: new Date(started).toISOString(), completed_at: new Date().toISOString(),
          }));
        } catch (recordError) {
          console.error('[routesync:scheduling] failure history unavailable', recordError.code ?? recordError.name ?? 'UNKNOWN');
        }
      }
    }
  } catch (error) {
    console.error('[routesync:scheduling] cron queue failed code', error.code ?? error.name ?? 'UNKNOWN');
  }
}
