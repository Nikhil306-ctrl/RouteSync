import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MapPin,
  ReceiptText,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatCurrency, formatDateTime, formatWindow } from '../../../lib/format.js';
import { fetchCustomerOrders } from '../../../services/lifecycle.js';

const ACTIVE_STATUSES = [
  'draft',
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'assigned',
  'picked_up',
  'out_for_delivery',
];

const FINAL_STATUSES = ['delivered', 'cancelled', 'rejected'];

export default function CustomerOrders() {
  useDocumentTitle('My orders');
  const { user } = useAuth();
  const [tab, setTab] = useState('all');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(async () => {
    if (!user) return [];
    const response = await fetchCustomerOrders({ limit: 100 });
    return response.orders ?? [];
  }, [user?.id]);

  useRealtimeRefresh({
    channelName: `customer-orders-${user?.id ?? 'anonymous'}`,
    tables: [{ table: 'orders', filter: user ? `customer_id=eq.${user.id}` : undefined }],
    refresh: reloadQuiet,
    enabled: Boolean(user?.id),
  });

  const orders = data ?? [];

  const groups = useMemo(
    () => ({
      all: orders,
      active: orders.filter((order) => ACTIVE_STATUSES.includes(order.status)),
      completed: orders.filter((order) => order.status === 'delivered'),
      cancelled: orders.filter((order) => order.status === 'cancelled' || order.status === 'rejected'),
    }),
    [orders],
  );

  const filtered = groups[tab] ?? groups.all;
  const delivered = groups.completed.length;
  const active = groups.active.length;
  const cancelled = groups.cancelled.length;

  if (loading) return <LoadingState rows={5} label="Loading your orders" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Customer account"
        title="My orders"
        description="Orders linked to your signed-in customer account. Status values are recorded by the restaurant, dispatch and rider operations."
        actions={<LinkButton to="/customer" variant="secondary" icon={Store}>Discover kitchens</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="All orders" value={orders.length} helper="Loaded from your account" icon={ClipboardList} />
        <StatCard label="Active" value={active} helper="Not yet delivered or closed" icon={Truck} tone="orange" />
        <StatCard label="Delivered" value={delivered} helper="Recorded as delivered" icon={CheckCircle2} tone="green" />
        <StatCard label="Cancelled" value={cancelled} helper="Cancelled or rejected" icon={XCircle} />
      </div>

      <Card>
        <Tabs
          tabs={[
            { value: 'all', label: 'All orders', count: groups.all.length },
            { value: 'active', label: 'Active', count: groups.active.length },
            { value: 'completed', label: 'Delivered', count: groups.completed.length },
            { value: 'cancelled', label: 'Cancelled', count: groups.cancelled.length },
          ]}
          value={tab}
          onChange={setTab}
          className="px-4 pt-2"
          ariaLabel="Filter your orders"
        />

        {filtered.length ? (
          <ul className="divide-y divide-line">
            {filtered.map((order) => {
              const isActive = ACTIVE_STATUSES.includes(order.status);
              const isFinal = FINAL_STATUSES.includes(order.status);
              const itemCount = (order.items ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
              const itemSummary = (order.items ?? [])
                .map((item) => `${item.quantity}× ${item.item_name}`)
                .join(' · ');

              return (
                <li key={order.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-warm text-accent">
                        <ReceiptText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[0.68rem] font-bold text-slate-500">#{order.id.slice(0, 8)}</p>
                        <h2 className="mt-0.5 font-display text-base font-bold text-ink">
                          {order.restaurant?.name ?? 'Restaurant'}
                        </h2>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-600">
                          {itemSummary || 'Order lines are not visible.'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={order.status} />
                      <StatusBadge status={order.priority} dot={false} />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      Placed {formatDateTime(order.created_at)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {formatWindow(order.delivery_window_start, order.delivery_window_end)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {itemCount} item{itemCount === 1 ? '' : 's'} · {formatCurrency(order.total_minor, order.currency)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <LinkButton to={`/customer/orders/${order.id}`} variant="secondary" size="sm" icon={ReceiptText}>
                      View details
                    </LinkButton>
                    {!isFinal ? (
                      <LinkButton to={`/customer/orders/${order.id}/tracking`} size="sm" icon={MapPin}>
                        Track order
                      </LinkButton>
                    ) : null}
                    {order.restaurant?.slug ? (
                      <Link
                        to={`/customer/restaurants/${order.restaurant.slug}`}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-ink"
                      >
                        Visit kitchen <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </div>

                  {isActive ? (
                    <p className="mt-2 text-[0.68rem] text-muted">
                      Live rider GPS is not shown in this phase. Tracking shows recorded order and assignment status.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <CardBody>
            <EmptyState
              compact
              icon={ClipboardList}
              title={
                tab === 'active'
                  ? 'No active orders'
                  : tab === 'completed'
                    ? 'No delivered orders yet'
                    : tab === 'cancelled'
                      ? 'No cancelled orders'
                      : 'No orders yet'
              }
              description={
                orders.length
                  ? 'There are no orders in this tab. Switch tabs to review the rest of your order history.'
                  : 'Orders appear here after the trusted order flow creates one for your account. This page does not create placeholder orders.'
              }
              action={orders.length ? null : <LinkButton to="/customer" icon={Store}>Browse kitchens</LinkButton>}
            />
          </CardBody>
        )}
      </Card>

      <InlineNotice tone="neutral" title="Trusted order records">
        Customers can view their own orders and cancel an order only while it is pending or confirmed.
        Totals, fees, items and later statuses are controlled by trusted operations; this interface
        does not rewrite them. The list refreshes from authorized Realtime events with a polling
        fallback.
      </InlineNotice>
    </div>
  );
}
