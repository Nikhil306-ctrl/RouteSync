import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  Check,
  ExternalLink,
  MapPin,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import OrderTimeline from '../../../components/portal/OrderTimeline.jsx';
import RouteMap from '../../../components/map/RouteMap.jsx';
import RiderLocationPanel from '../../../components/map/RiderLocationPanel.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { destinationMapUrl } from '../../../lib/maps.js';
import { formatDateTime } from '../../../lib/format.js';
import {
  fetchRiderAssignment,
  respondToAssignment,
  transitionRiderOrder,
} from '../../../services/lifecycle.js';

function availableOrderActions(assignment) {
  if (!assignment || !['accepted', 'active'].includes(assignment.status)) return [];
  const status = assignment.order?.status;
  if (['ready', 'assigned'].includes(status)) {
    return [{ next: 'picked_up', label: 'Confirm pickup', icon: Check }];
  }
  if (status === 'picked_up') {
    return [{ next: 'out_for_delivery', label: 'Start delivery', icon: Bike }];
  }
  if (status === 'out_for_delivery') {
    return [{ next: 'delivered', label: 'Complete delivery', icon: ShieldCheck }];
  }
  return [];
}

export default function RiderAssignmentDetail() {
  const { assignmentId } = useParams();
  const { profile } = useAuth();
  const [orderActionError, setOrderActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [responseAction, setResponseAction] = useState(null);
  const [reason, setReason] = useState('');
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState('');

  const { data, loading, error, reload, reloadQuiet, setData } = useAsyncData(
    () => fetchRiderAssignment(assignmentId),
    [assignmentId],
  );

  useDocumentTitle('Assignment detail');

  const assignment = data?.assignment ?? null;
  const order = assignment?.order ?? null;
  const orderId = assignment?.order_id ?? null;

  useRealtimeRefresh({
    channelName: `rider-assignment-${assignmentId}`,
    tables: [
      { table: 'assignments', filter: `id=eq.${assignmentId}` },
      { table: 'assignment_events', filter: `assignment_id=eq.${assignmentId}` },
      ...(orderId
        ? [
            { table: 'orders', filter: `id=eq.${orderId}` },
            { table: 'order_status_events', filter: `order_id=eq.${orderId}` },
          ]
        : []),
    ],
    refresh: reloadQuiet,
    enabled: Boolean(assignmentId),
  });

  const pickupUrl = destinationMapUrl(
    order?.restaurant?.latitude,
    order?.restaurant?.longitude,
    order?.restaurant?.name,
  );
  const deliveryUrl = destinationMapUrl(
    order?.delivery_latitude,
    order?.delivery_longitude,
    order?.delivery_address_line,
  );

  const actions = useMemo(() => availableOrderActions(assignment), [assignment]);

  const handleOrderUpdate = async (next) => {
    if (!order) return;
    setOrderActionError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await transitionRiderOrder(order.id, {
        status: next,
        expectedStatus: order.status,
      });
      setData((current) => ({
        ...current,
        order: response.order ?? current.order,
        events: response.events ?? current.events,
        assignment: response.assignment ?? current.assignment,
      }));
      setMessage(`Order ${order.id.slice(0, 8)} moved to ${next.replaceAll('_', ' ')}.`);
      reloadQuiet();
    } catch (updateError) {
      setOrderActionError(updateError.message ?? 'The delivery status could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const openResponse = (type) => {
    setResponseAction(type);
    setReason('');
    setResponseError('');
    setMessage('');
  };

  const submitResponse = async (event) => {
    event?.preventDefault?.();
    if (!assignment || !responseAction) return;
    setResponseError('');

    const accept = responseAction === 'accept';
    if (!accept && !reason.trim()) {
      setResponseError('Add a reason for declining this assignment.');
      return;
    }

    setResponding(true);
    try {
      await respondToAssignment(assignment.id, {
        accept,
        reason: accept ? undefined : reason.trim(),
      });
      setResponseAction(null);
      setReason('');
      setMessage(accept ? 'Assignment accepted. Follow the order status for pickup.' : 'Assignment declined.');
      reloadQuiet();
    } catch (responseFailure) {
      setResponseError(responseFailure.message ?? 'The assignment response could not be saved.');
    } finally {
      setResponding(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading assignment" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!assignment || assignment.rider_id !== profile?.id) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Delivery partner" title="Assignment unavailable" />
        <EmptyState
          icon={ShieldAlert}
          title="This assignment is not available"
          description="It may have been reassigned, removed, or belong to another delivery partner."
          action={<Link to="/delivery-partner/assignments" className="text-xs font-bold text-accent">Back to assignments</Link>}
        />
      </div>
    );
  }

  const assignmentEvents = data?.assignment_events ?? [];
  const isProposed = assignment.status === 'proposed';

  return (
    <div className="space-y-4">
      <Link to="/delivery-partner/assignments" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All assignments
      </Link>

      <PageHeader
        eyebrow="Assignment detail"
        title={order?.restaurant?.name || 'Delivery task'}
        description={order ? `Order ${order.id.slice(0, 8)} · ${order.delivery_address_line}` : 'Assignment record'}
        actions={<StatusBadge status={assignment.status} />}
      />

      {orderActionError ? <InlineNotice tone="danger">{orderActionError}</InlineNotice> : null}
      {message ? <InlineNotice tone="success">{message}</InlineNotice> : null}

      {assignment.scheduling_run_id ? <Card><CardHeader title="Planned delivery route" description="Estimated geographic itinerary · accept the proposal before pickup" /><CardBody>
        <p className="text-xs text-muted">Pickup {formatDateTime(assignment.planned_pickup_at)} · delivery {formatDateTime(assignment.planned_delivery_at)} · {(data?.stops ?? []).filter((stop) => stop.stop_type === 'dropoff').length} orders on this route</p>
        <ol className="mt-2 space-y-1 text-xs">{(data?.stops ?? []).map((stop) => <li key={`${stop.order_id}-${stop.stop_type}`}>{stop.stop_sequence}. {stop.stop_type} · #{stop.order_id.slice(0, 8)} · {formatDateTime(stop.planned_arrival)} · {stop.address_line}</li>)}</ol>
      </CardBody></Card> : null}

      {isProposed ? (
        <InlineNotice tone="warning" title="This assignment needs your response">
          <span className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Accept the proposal to keep the delivery, or decline with a reason so dispatch can reassign it.</span>
            <span className="flex shrink-0 gap-2">
              <Button size="sm" icon={Check} onClick={() => openResponse('accept')}>Accept</Button>
              <Button size="sm" variant="danger" icon={X} onClick={() => openResponse('decline')}>Decline</Button>
            </span>
          </span>
        </InlineNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {order ? (
            <Card>
              <CardHeader title="Pickup & delivery" description="Stored order and venue details." />
              <CardBody className="space-y-3">
                <div className="rounded-lg border border-line p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <Bike className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Pickup
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-ink">{order.restaurant?.name || 'Restaurant'}</p>
                      <p className="mt-0.5 text-xs text-muted">{order.restaurant?.address_line || 'Pickup address unavailable'}</p>
                      {order.restaurant?.landmark ? <p className="text-xs text-muted">{order.restaurant.landmark}</p> : null}
                    </div>
                    {pickupUrl ? (
                      <a href={pickupUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-line p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <MapPin className="h-3.5 w-3.5 text-accent" aria-hidden="true" /> Drop-off
                      </p>
                      <p className="mt-1.5 text-sm font-bold text-ink">{order.delivery_address_line}</p>
                      {order.delivery_contact_phone ? <p className="mt-0.5 text-xs text-muted">{order.delivery_contact_phone}</p> : null}
                    </div>
                    {deliveryUrl ? (
                      <a href={deliveryUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        Navigate <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </div>
              </CardBody>
            </Card>
          ) : null}

          {order ? (
            <Card>
              <CardHeader title="Route map" description="Pickup and drop-off coordinates with optional rider position." />
              <CardBody className="space-y-4">
                <RouteMap
                  restaurant={order.restaurant}
                  dropoff={{
                    latitude: order.delivery_latitude,
                    longitude: order.delivery_longitude,
                  }}
                  height={260}
                  description="Map of the pickup and delivery addresses for this assignment"
                />
                <div className="rounded-xl border border-line bg-slate-50 p-3">
                  <p className="rs-label mb-2">Share your position</p>
                  <RiderLocationPanel
                    assignmentId={assignment.id}
                    defaultPoint={
                      order.restaurant?.latitude != null
                        ? {
                            latitude: order.restaurant.latitude,
                            longitude: order.restaurant.longitude,
                          }
                        : null
                    }
                  />
                </div>
              </CardBody>
            </Card>
          ) : null}

          {order ? (
            <Card>
              <CardHeader title="Order detail" description="Read-only order content available to your assignment." />
              <CardBody>
                <OrderDetailContent order={order} />
              </CardBody>
            </Card>
          ) : (
            <EmptyState icon={ShieldAlert} title="Linked order unavailable" description="The assignment exists but its order is not visible to this account." />
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Progress" description="Recorded order status events." />
            <CardBody>
              {order ? <OrderTimeline order={order} events={data?.events ?? []} /> : <p className="text-sm text-muted">No order status available.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Delivery actions" description="Pickup requires a ready order and an accepted assignment." />
            <CardBody className="space-y-3">
              {isProposed ? (
                <div className="flex gap-2">
                  <Button icon={Check} onClick={() => openResponse('accept')} className="flex-1">Accept assignment</Button>
                  <Button variant="danger" icon={X} onClick={() => openResponse('decline')}>Decline</Button>
                </div>
              ) : actions.length ? (
                <div className="space-y-2">
                  {actions.map((action) => (
                    <Button
                      key={action.next}
                      icon={action.icon}
                      loading={busy}
                      onClick={() => handleOrderUpdate(action.next)}
                      className="w-full"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  {order?.status === 'delivered'
                    ? 'This delivery is already complete.'
                    : ['confirmed', 'preparing'].includes(order?.status)
                      ? 'Waiting for the kitchen to mark this order ready. Pickup stays blocked until then.'
                      : ['rejected', 'cancelled'].includes(assignment.status) || ['cancelled', 'rejected'].includes(order?.status)
                        ? 'This assignment or order was closed. No delivery action is available.'
                        : 'No delivery transition is available for the current assignment and order state.'}
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldAlert className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                The database re-checks assignment ownership and ordering before every delivery status change.
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Assignment record" description="Assignment, plan and response history." />
            <CardBody className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Assignment</span>
                <span className="font-mono text-slate-700">{assignment.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Status</span>
                <StatusBadge status={assignment.status} dot={false} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Route</span>
                <span className="font-mono text-slate-700">{assignment.route_id?.slice(0, 8) || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Pickup plan</span>
                <span className="font-semibold text-slate-700">{formatDateTime(assignment.planned_pickup_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Delivery plan</span>
                <span className="font-semibold text-slate-700">{formatDateTime(assignment.planned_delivery_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Accepted</span>
                <span className="font-semibold text-slate-700">{formatDateTime(assignment.accepted_at)}</span>
              </div>
              {assignment.reason ? (
                <p className="rounded-lg bg-slate-50 p-2.5 leading-5 text-slate-600">{assignment.reason}</p>
              ) : null}

              {assignmentEvents.length ? (
                <div className="border-t border-line pt-3">
                  <p className="text-xs font-semibold text-muted">Assignment events</p>
                  <ul className="mt-2 space-y-2">
                    {assignmentEvents.map((event) => (
                      <li key={event.id} className="flex items-start justify-between gap-3">
                        <span className="text-slate-600">
                          {event.from_status ? `${event.from_status.replaceAll('_', ' ')} → ` : ''}
                          <span className="font-semibold text-slate-700">{event.to_status.replaceAll('_', ' ')}</span>
                          {event.reason ? <span className="block text-[0.68rem] text-muted">{event.reason}</span> : null}
                        </span>
                        <span className="shrink-0 text-[0.68rem] text-muted">{formatDateTime(event.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link to="/delivery-partner/route" className="inline-flex items-center gap-1 pt-1 font-bold text-accent">
                <RouteIcon className="h-4 w-4" aria-hidden="true" /> Open route records
              </Link>
            </CardBody>
          </Card>

          <InlineNotice tone="warning" title="Location sharing is manual">
            External map links still open your preferred navigation app. RouteSync stores a position only
            when you share it here; it never reads background GPS, and simulated positions are labelled.
          </InlineNotice>
        </div>
      </div>

      <Modal
        open={Boolean(responseAction)}
        onClose={() => {
          if (!responding) {
            setResponseAction(null);
            setResponseError('');
          }
        }}
        title={responseAction === 'accept' ? 'Accept this assignment?' : 'Decline this assignment?'}
        description={
          responseAction === 'accept'
            ? 'You become responsible for pickup and delivery. The order becomes assigned when the kitchen has marked it ready.'
            : 'Dispatch is notified with your reason and can choose another delivery partner.'
        }
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setResponseAction(null)} disabled={responding}>Go back</Button>
            <Button
              variant={responseAction === 'accept' ? 'primary' : 'danger'}
              icon={responseAction === 'accept' ? Check : X}
              loading={responding}
              onClick={submitResponse}
            >
              {responseAction === 'accept' ? 'Accept assignment' : 'Decline assignment'}
            </Button>
          </div>
        }
      >
        {responseAction ? (
          <div className="space-y-4">
            {responseError ? <InlineNotice tone="danger">{responseError}</InlineNotice> : null}
            <p className="rounded-lg border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Assignment <span className="font-mono font-bold">#{assignment.id.slice(0, 8)}</span> · Order{' '}
              <span className="font-mono font-bold">#{order?.id.slice(0, 8)}</span>
            </p>
            {responseAction === 'decline' ? (
              <div>
                <label htmlFor="decline-reason" className="rs-label mb-1">
                  Decline reason
                </label>
                <textarea
                  id="decline-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={280}
                  required
                  className="rs-input"
                  placeholder="Explain why you cannot take this delivery."
                />
                <p className="mt-1 text-right text-[0.68rem] text-muted">{reason.length}/280</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
