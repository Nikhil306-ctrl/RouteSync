import { MapPin, Phone, ReceiptText, StickyNote } from 'lucide-react';
import { DefinitionItem } from '../ui/Card.jsx';
import { StatusBadge } from '../ui/Badge.jsx';
import { formatCurrency, formatDateTime, formatWindow, titleCase } from '../../lib/format.js';

export default function OrderDetailContent({ order, customer = null, restaurant = null }) {
  if (!order) return null;
  const items = order.items ?? [];
  const venue = restaurant ?? order.restaurant;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <StatusBadge status={order.priority} dot={false} />
        <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-600">
          {formatWindow(order.delivery_window_start, order.delivery_window_end)}
        </span>
      </div>

      <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
        <DefinitionItem label="Order reference">
          <span className="font-mono text-xs">{order.id}</span>
        </DefinitionItem>
        <DefinitionItem label="Placed">{formatDateTime(order.created_at)}</DefinitionItem>
        <DefinitionItem label="Restaurant">{venue?.name ?? 'Restaurant'}</DefinitionItem>
        <DefinitionItem label="Delivery window">
          {formatWindow(order.delivery_window_start, order.delivery_window_end)}
        </DefinitionItem>
        <DefinitionItem label="Preparation estimate">{order.prep_time_minutes} min</DefinitionItem>
        <DefinitionItem label="Priority">{titleCase(order.priority)}</DefinitionItem>
        {customer ? <DefinitionItem label="Customer">{customer.full_name || customer.email}</DefinitionItem> : null}
        {customer?.phone ? <DefinitionItem label="Customer phone">{customer.phone}</DefinitionItem> : null}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line p-4">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
            <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Delivery address
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink">{order.delivery_address_line}</p>
          <p className="mt-1 text-xs text-muted">
            {order.delivery_latitude != null && order.delivery_longitude != null
              ? 'Coordinates are recorded for routing and are not displayed in this view.'
              : 'No additional delivery address detail is visible.'}
          </p>
          {order.delivery_contact_phone ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {order.delivery_contact_phone}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-line p-4">
          <p className="flex items-center gap-1.5 text-[0.66rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
            <StickyNote className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Instructions
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{order.special_instructions || 'No special instructions recorded.'}</p>
          {order.cancellation_reason ? (
            <p className="mt-2 rounded-md bg-red-50 px-2.5 py-2 text-xs leading-5 text-red-800">
              Cancellation reason: {order.cancellation_reason}
            </p>
          ) : null}
        </div>
      </div>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <ReceiptText className="h-4 w-4 text-slate-500" aria-hidden="true" /> Order items
        </h3>
        <div className="mt-2 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-sm" aria-label="Order items">
            <thead className="bg-slate-50 text-[0.64rem] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-bold">Item</th>
                <th className="px-3 py-2 text-center font-bold">Qty</th>
                <th className="px-3 py-2 text-right font-bold">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.length ? items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{item.item_name}</p>
                    {item.notes ? <p className="text-xs text-muted">{item.notes}</p> : null}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {formatCurrency(item.line_total_minor ?? item.unit_price_minor * item.quantity, order.currency)}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted">
                    No order lines are visible for this order.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between gap-5">
          <dt className="text-muted">Subtotal</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(order.subtotal_minor, order.currency)}</dd>
        </div>
        <div className="flex justify-between gap-5">
          <dt className="text-muted">Delivery fee</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(order.delivery_fee_minor, order.currency)}</dd>
        </div>
        {Number(order.discount_minor) > 0 ? (
          <div className="flex justify-between gap-5 text-emerald-700">
            <dt>Discount</dt>
            <dd className="font-semibold tabular-nums">−{formatCurrency(order.discount_minor, order.currency)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-5 border-t border-line pt-2 text-base">
          <dt className="font-bold text-ink">Recorded total</dt>
          <dd className="font-bold tabular-nums text-ink">{formatCurrency(order.total_minor, order.currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
