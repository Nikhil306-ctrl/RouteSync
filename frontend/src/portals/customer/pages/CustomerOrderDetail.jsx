import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  ClipboardList,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderTimeline from '../../../components/portal/OrderTimeline.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDateTime } from '../../../lib/format.js';
import { cancelCustomerOrder, fetchCustomerOrder } from '../../../services/lifecycle.js';

const CANCELLABLE = ['pending', 'confirmed'];

export default function CustomerOrderDetail() {
  const { orderId } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  useDocumentTitle('Order details');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchCustomerOrder(orderId),
    [orderId],
  );

  useRealtimeRefresh({
    channelName: `customer-order-${orderId}`,
    tables: [
      { table: 'orders', filter: `id=eq.${orderId}` },
      { table: 'order_status_events', filter: `order_id=eq.${orderId}` },
      { table: 'assignments', filter: `order_id=eq.${orderId}` },
    ],
    refresh: reloadQuiet,
    enabled: Boolean(orderId),
  });

  if (loading) return <LoadingState rows={5} label="Loading order details" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const order = data?.order;
  const assignment = data?.assignment;

  if (!order || order.customer_id !== user?.id) {
    return (
      <div className="space-y-5">
        <Link to="/customer/orders" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders
        </Link>
        <EmptyState
          icon={ReceiptText}
          title="Order not found"
          description="This order does not exist for your account or is not visible under the current row permissions."
          action={<LinkButton to="/customer/orders" icon={ClipboardList}>Back to my orders</LinkButton>}
        />
      </div>
    );
  }

  const isFinal = ['delivered', 'cancelled', 'rejected'].includes(order.status);
  const canCancel = CANCELLABLE.includes(order.status);
  const justCreated = location.state?.justCreated;

  const submitCancellation = async (event) => {
    event.preventDefault();
    setActionError('');
    setActionMessage('');
    if (!reason.trim()) {
      setActionError('Add a reason for the cancellation.');
      return;
    }

    setCancelling(true);
    try {
      await cancelCustomerOrder(order.id, {
        reason: reason.trim(),
        expectedStatus: order.status,
      });
      setCancelOpen(false);
      setReason('');
      setActionMessage('The order was cancelled.');
      reload();
    } catch (cancelError) {
      setActionError(cancelError.message ?? 'The order could not be cancelled.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/customer/orders" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders
      </Link>

      {justCreated ? (
        <InlineNotice tone="success" title={location.state?.duplicate ? 'Order already recorded' : 'Order placed'}>
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {location.state?.duplicate
              ? 'This checkout was already processed. The same order is shown below instead of creating a duplicate.'
              : 'The restaurant has received your cash-on-delivery order. Follow its progress below.'}
          </span>
        </InlineNotice>
      ) : null}

      {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
      {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

      <PageHeader
        eyebrow={`Order #${order.id.slice(0, 8)}`}
        title={order.restaurant?.name ?? 'Order details'}
        description="Recorded order contents, delivery details and progress. Status values are written only by trusted operations."
        actions={
          <>
            <LinkButton to="/customer/orders" variant="secondary" icon={ClipboardList}>All orders</LinkButton>
            {!isFinal ? <LinkButton to={`/customer/orders/${order.id}/tracking`} icon={MapPin}>Track order</LinkButton> : null}
            {canCancel ? (
              <Button variant="danger" icon={Ban} onClick={() => setCancelOpen(true)}>
                Cancel order
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader title="Progress" description="Recorded state changes for this order." />
            <CardBody>
              <OrderTimeline order={order} events={data?.events ?? []} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery assignment" description="Visible when dispatch has created one." />
            <CardBody>
              {assignment ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={assignment.status} />
                    <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-600">
                      Assignment #{assignment.id.slice(0, 8)}
                    </span>
                  </div>
                  <dl className="grid gap-3">
                    <DefinitionItem label="Planned pickup">{formatDateTime(assignment.planned_pickup_at)}</DefinitionItem>
                    <DefinitionItem label="Planned delivery">{formatDateTime(assignment.planned_delivery_at)}</DefinitionItem>
                  </dl>
                  <p className="rounded-lg border border-line bg-slate-50 p-2.5 text-[0.68rem] leading-4 text-slate-600">
                    Rider identity, phone number and live location are not exposed to customers in this phase.
                  </p>
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted">
                  Dispatch has not created an assignment yet. When one exists, its recorded status and planned
                  pickup times appear here.
                </p>
              )}
            </CardBody>
          </Card>

          {!isFinal ? (
            <Card>
              <CardHeader title="Delivery tracking" description="Status only; live GPS is not available." />
              <CardBody className="space-y-3">
                <p className="text-xs leading-5 text-muted">
                  Open tracking to see the current state and recorded assignment timestamps.
                </p>
                <LinkButton to={`/customer/orders/${order.id}/tracking`} icon={MapPin} className="w-full">
                  Open tracking
                </LinkButton>
              </CardBody>
            </Card>
          ) : null}

          <InlineNotice tone="neutral" title={canCancel ? 'Cancellation window open' : 'Read-only record'}>
            <span className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              {canCancel
                ? 'You may cancel before the kitchen starts preparation. The cancellation is recorded with a reason.'
                : 'Cancellation is closed once preparation starts or the order is final. Refunds and later changes require a support flow that is not part of this phase.'}
            </span>
          </InlineNotice>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Order detail"
              description="Items, delivery address and recorded totals from the order row."
            />
            <CardBody>
              <OrderDetailContent order={order} />
            </CardBody>
          </Card>

          {order.estimated_ready_at ? (
            <Card>
              <CardHeader title="Kitchen timing" description="Recorded estimate from the restaurant acceptance." />
              <CardBody className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                  <Truck className="h-4 w-4 text-accent" aria-hidden="true" /> Estimated ready
                </span>
                <span className="font-bold text-ink">{formatDateTime(order.estimated_ready_at)}</span>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => {
          if (!cancelling) {
            setCancelOpen(false);
            setActionError('');
          }
        }}
        title="Cancel this order?"
        description="The restaurant will stop preparing it. The reason is stored with the order."
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setCancelOpen(false)}
              disabled={cancelling}
            >
              Keep order
            </Button>
            <Button
              variant="danger"
              icon={Ban}
              loading={cancelling}
              disabled={!reason.trim()}
              onClick={submitCancellation}
            >
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </Button>
          </div>
        }
      >
        <label htmlFor="cancel-reason" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
          Cancellation reason
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={280}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100"
          placeholder="Explain why this order cannot continue."
        />
        <p className="mt-1 text-right text-[0.68rem] text-muted">{reason.length}/280</p>
      </Modal>
    </div>
  );
}
