import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Clock3,
  MapPin,
  Phone,
  ReceiptText,
  Route as RouteIcon,
  ShieldAlert,
  Store,
  Truck,
  UserRound,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import OrderTimeline from '../../../components/portal/OrderTimeline.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDateTime, formatWindow } from '../../../lib/format.js';
import { fetchCustomerOrder } from '../../../services/lifecycle.js';

export default function CustomerOrderTracking() {
  const { orderId } = useParams();
  const { user } = useAuth();
  useDocumentTitle('Order tracking');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchCustomerOrder(orderId),
    [orderId],
  );

  useRealtimeRefresh({
    channelName: `customer-tracking-${orderId}`,
    tables: [
      { table: 'orders', filter: `id=eq.${orderId}` },
      { table: 'order_status_events', filter: `order_id=eq.${orderId}` },
      { table: 'assignments', filter: `order_id=eq.${orderId}` },
    ],
    refresh: reloadQuiet,
    enabled: Boolean(orderId),
  });

  if (loading) return <LoadingState rows={5} label="Loading order tracking" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const order = data?.order;
  const assignment = data?.assignment;
  const events = data?.events ?? [];

  if (!order || order.customer_id !== user?.id) {
    return (
      <div className="space-y-5">
        <Link to="/customer/orders" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders
        </Link>
        <EmptyState
          icon={RouteIcon}
          title="Tracking is not available for this order"
          description="The order does not exist for your account or is not visible under the current row permissions."
          action={<LinkButton to="/customer/orders" icon={ReceiptText}>Back to my orders</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to={`/customer/orders/${order.id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Order details
      </Link>

      <PageHeader
        eyebrow={`Order #${order.id.slice(0, 8)}`}
        title="Order tracking"
        description="Recorded order and assignment state. This is not a live GPS map and no route line is drawn."
        actions={
          <>
            <LinkButton to="/customer/orders" variant="secondary" icon={ReceiptText}>All orders</LinkButton>
            <LinkButton to={`/customer/orders/${order.id}`} icon={ReceiptText}>Order details</LinkButton>
          </>
        }
      />

      <InlineNotice tone="neutral" title="Live tracking is not available in this phase">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          Rider GPS positions, route polylines and live ETAs are not exposed by the current interface.
          This page shows only recorded order and assignment timestamps from the database.
        </span>
      </InlineNotice>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader title="Order progress" description="Derived from the recorded order status." />
            <CardBody>
              <OrderTimeline order={order} events={events} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Current state" description="Recorded values, not a promise." />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Order status</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Delivery window</span>
                <span className="text-xs font-bold text-ink">
                  {formatWindow(order.delivery_window_start, order.delivery_window_end)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Preparation estimate</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-ink">
                  <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {order.prep_time_minutes} min
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Delivery assignment"
              description="Assignment records are visible for your order when trusted dispatch has created one."
            />
            {assignment ? (
              <CardBody>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={assignment.status} />
                  <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-600">
                    Assignment #{assignment.id.slice(0, 8)}
                  </span>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DefinitionItem label="Planned pickup">{formatDateTime(assignment.planned_pickup_at)}</DefinitionItem>
                  <DefinitionItem label="Planned delivery">{formatDateTime(assignment.planned_delivery_at)}</DefinitionItem>
                  <DefinitionItem label="Accepted">{formatDateTime(assignment.accepted_at)}</DefinitionItem>
                  <DefinitionItem label="Completed">{formatDateTime(assignment.completed_at)}</DefinitionItem>
                </dl>
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  Rider identity, phone number and live location are not exposed to customers in this phase.
                </p>
              </CardBody>
            ) : (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={Truck}
                  title="No delivery assignment recorded"
                  description="A trusted dispatch operation has not created an assignment for this order yet. Nothing is simulated here."
                />
              </div>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Pickup" description="Restaurant record attached to this order." />
              <CardBody className="space-y-3">
                <p className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Store className="h-4 w-4 text-accent" aria-hidden="true" />
                  {order.restaurant?.name ?? 'Restaurant'}
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  {[order.restaurant?.address_line, order.restaurant?.landmark, order.restaurant?.city]
                    .filter(Boolean)
                    .join(', ') || 'Pickup address is not visible.'}
                </p>
                {order.restaurant?.phone ? (
                  <a
                    href={`tel:${order.restaurant.phone}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-strong"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {order.restaurant.phone}
                  </a>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Drop-off" description="Delivery address recorded on the order." />
              <CardBody className="space-y-3">
                <p className="flex items-start gap-1.5 text-sm font-semibold leading-6 text-ink">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  {order.delivery_address_line}
                </p>
                {order.delivery_contact_phone ? (
                  <p className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" /> {order.delivery_contact_phone}
                  </p>
                ) : null}
                <p className="rounded-lg border border-line bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">
                  {order.special_instructions || 'No delivery instructions recorded.'}
                </p>
              </CardBody>
            </Card>
          </div>

          <InlineNotice tone="neutral" title="Why there is no map">
            <span className="flex items-start gap-2">
              <RouteIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Route geometry and live rider positions require a tracking integration that is not part of
              this phase. Showing a fabricated route or ETA would misrepresent the order state.
            </span>
          </InlineNotice>
        </div>
      </div>
    </div>
  );
}
