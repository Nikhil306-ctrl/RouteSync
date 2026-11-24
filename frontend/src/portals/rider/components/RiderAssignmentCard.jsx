import { Link } from 'react-router-dom';
import { ArrowRight, Clock3, MapPin, Package } from 'lucide-react';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { formatCurrency, formatWindow } from '../../../lib/format.js';

export default function RiderAssignmentCard({ assignment, compact = false }) {
  const order = assignment.order;
  if (!order) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-white p-4 text-sm text-muted">
        Assignment {assignment.id.slice(0, 8)} has no visible order record.
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={assignment.status} />
        <StatusBadge status={order.status} dot={false} />
        {order.priority === 'urgent' || order.priority === 'high' ? <StatusBadge status={order.priority} dot={false} /> : null}
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">{order.restaurant?.name || 'Restaurant pickup'}</p>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-600">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="line-clamp-2">{order.delivery_address_line}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-warm px-2.5 py-1 text-xs font-bold text-orange-900">
          {formatCurrency(order.total_minor, order.currency)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {formatWindow(order.delivery_window_start, order.delivery_window_end)}</span>
        <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" aria-hidden="true" /> {order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0} items</span>
      </div>

      {!compact ? (
        <Link
          to={`/delivery-partner/assignments/${assignment.id}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong"
        >
          Open assignment <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <Link
          to={`/delivery-partner/assignments/${assignment.id}`}
          className="mt-3 flex min-h-9 items-center justify-center rounded-lg border border-line text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          View task
        </Link>
      )}
    </article>
  );
}
