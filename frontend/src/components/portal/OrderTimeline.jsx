import { Check, Circle } from 'lucide-react';
import { formatDateTime } from '../../lib/format.js';

const steps = [
  { key: 'pending', label: 'Order received' },
  { key: 'confirmed', label: 'Restaurant confirmed' },
  { key: 'preparing', label: 'Preparation started' },
  { key: 'ready', label: 'Ready for pickup' },
  { key: 'assigned', label: 'Rider assigned' },
  { key: 'picked_up', label: 'Picked up' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const orderIndex = Object.fromEntries(steps.map((step, index) => [step.key, index]));

const FALLBACK_TIMESTAMPS = {
  pending: 'created_at',
  confirmed: 'restaurant_accepted_at',
  preparing: 'preparation_started_at',
  ready: 'ready_at',
  assigned: 'ready_at',
  picked_up: 'picked_up_at',
  delivered: 'delivered_at',
};

export default function OrderTimeline({ order, events = [] }) {
  if (!order) return null;

  const firstEventFor = (status) =>
    events.find((event) => event.to_status === status) ?? null;

  const reachedStatuses = new Set(
    events.map((event) => event.to_status).filter((status) => status in orderIndex),
  );
  if (order.status in orderIndex) reachedStatuses.add(order.status);

  const currentIndex = Math.max(
    ...steps.map((step, index) => (reachedStatuses.has(step.key) ? index : -1)),
    orderIndex[order.status] ?? 0,
  );

  if (order.status === 'cancelled' || order.status === 'rejected') {
    const cancellationEvent = [...events]
      .reverse()
      .find((event) => ['cancelled', 'rejected'].includes(event.to_status));

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-bold">This order was {order.status}.</p>
          <p className="mt-1 text-xs leading-5 text-red-800">
            {order.cancellation_reason || 'No cancellation reason was recorded.'}
          </p>
          <p className="mt-1 text-[0.68rem] text-red-700">
            {formatDateTime(cancellationEvent?.created_at || order.cancelled_at || order.updated_at)}
          </p>
        </div>

        {currentIndex > 0 ? (
          <ol className="space-y-0" aria-label="Order progress before cancellation">
            {steps.slice(0, currentIndex + 1).map((step) => (
              <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
                <span className="relative z-10 mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border border-slate-400 bg-white text-slate-500">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <p className="text-xs font-semibold text-slate-600">{step.label}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    );
  }

  return (
    <ol className="space-y-0" aria-label="Order progress">
      {steps.map((step, index) => {
        const complete = index <= currentIndex;
        const current = index === currentIndex;
        const event = firstEventFor(step.key);
        const fallbackKey = FALLBACK_TIMESTAMPS[step.key];
        const timestamp = event?.created_at ?? (fallbackKey ? order[fallbackKey] : null);

        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                className={`absolute left-[9px] top-5 h-full border-l ${complete ? 'border-emerald-300' : 'border-slate-200'}`}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`relative z-10 mt-0.5 grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border ${
                complete
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-300 bg-white text-slate-300'
              }`}
            >
              {complete ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Circle className="h-2 w-2 fill-current" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${current ? 'text-ink' : complete ? 'text-slate-700' : 'text-slate-400'}`}>
                {step.label}
                {current ? (
                  <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[0.68rem] font-semibold text-orange-800">
                    Now
                  </span>
                ) : null}
              </p>
              {complete && timestamp ? (
                <p className="mt-0.5 text-xs text-muted">{formatDateTime(timestamp)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
