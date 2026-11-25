import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  CookingPot,
  RefreshCw,
  Search,
  Store,
  Timer,
  X,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import OrderTimeline from '../../../components/portal/OrderTimeline.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { formatCurrency, formatTime, formatWindow, titleCase } from '../../../lib/format.js';
import {
  fetchRestaurantBoard,
  fetchRestaurantOrder,
  reportPrepDelay,
  transitionRestaurantOrder,
} from '../../../services/lifecycle.js';

const laneDefinitions = [
  { key: 'pending', label: 'Incoming', statuses: ['pending'], helper: 'Accept or reject' },
  { key: 'confirmed', label: 'Accepted', statuses: ['confirmed'], helper: 'Start preparation' },
  { key: 'preparing', label: 'Preparing', statuses: ['preparing'], helper: 'Mark ready' },
  { key: 'ready', label: 'Ready', statuses: ['ready'], helper: 'Awaiting pickup' },
];

const forwardStatus = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
};

const DELAY_ELIGIBLE = ['confirmed', 'preparing', 'ready', 'assigned'];

const actionCopy = {
  accept: {
    title: 'Accept this order',
    description: 'Confirm the order and set the preparation estimate used by dispatch and the customer.',
    confirm: 'Accept order',
    success: 'Order accepted.',
  },
  reject: {
    title: 'Reject this order',
    description: 'Rejection is recorded with a reason and the customer is notified.',
    confirm: 'Reject order',
    success: 'Order rejected.',
  },
  cancel: {
    title: 'Cancel this order',
    description: 'The cancellation is recorded with a reason and the customer is notified.',
    confirm: 'Cancel order',
    success: 'Order cancelled.',
  },
};

function OrderCard({ order, onAction, onDirect, onDelay, onOpen, busy }) {
  const next = forwardStatus[order.status];
  const canDelay = DELAY_ELIGIBLE.includes(order.status) && !order.picked_up_at;

  return (
    <article className={`rounded-xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${order.priority === 'urgent' ? 'border-red-200' : order.priority === 'high' ? 'border-orange-200' : 'border-line'}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[0.7rem] font-bold text-slate-500">#{order.id.slice(0, 8)}</span>
        <StatusBadge status={order.priority} dot={false} />
      </div>
      <p className="mt-2 text-sm font-bold text-ink">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
        {order.items?.map((item) => `${item.quantity}× ${item.item_name}`).join(' · ') || 'Order lines unavailable'}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs font-semibold text-slate-600">{formatCurrency(order.total_minor, order.currency)}</span>
        <span className="text-[0.68rem] text-muted">{order.prep_time_minutes} min prep</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === 'pending' ? (
          <>
            <Button size="sm" icon={Check} onClick={() => onAction(order, 'accept')} className="flex-1">
              Accept
            </Button>
            <Button size="sm" variant="danger" icon={X} onClick={() => onAction(order, 'reject')}>
              Reject
            </Button>
          </>
        ) : next === 'preparing' ? (
          <Button
            size="sm"
            icon={Check}
            onClick={() => onDirect(order, 'preparing')}
            loading={busy === order.id}
            className="flex-1"
          >
            Start preparation
          </Button>
        ) : next === 'ready' ? (
          <Button
            size="sm"
            icon={Timer}
            onClick={() => onDirect(order, 'ready')}
            loading={busy === order.id}
            className="flex-1"
          >
            Mark ready
          </Button>
        ) : order.status === 'ready' ? (
          <span className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line px-2 py-1.5 text-xs font-semibold text-muted">
            Waiting for rider
          </span>
        ) : null}
        {canDelay ? (
          <Button size="sm" variant="secondary" icon={Clock3} onClick={() => onDelay(order)}>
            Delay
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => onOpen(order)}>Details</Button>
      </div>
    </article>
  );
}

export default function KitchenBoard() {
  useDocumentTitle('Kitchen board');
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('all');
  const [selected, setSelected] = useState(null);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [action, setAction] = useState(null);
  const [prepTime, setPrepTime] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [delayTarget, setDelayTarget] = useState(null);
  const [delayMinutes, setDelayMinutes] = useState('10');
  const [delayReason, setDelayReason] = useState('');
  const [delaySaving, setDelaySaving] = useState(false);
  const [delayError, setDelayError] = useState('');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchRestaurantBoard({ limit: 300 }),
    [],
  );

  useRealtimeRefresh({
    channelName: `kitchen-board-${data?.restaurant?.id ?? 'unlinked'}`,
    tables: data?.restaurant?.id
      ? [
          { table: 'orders', filter: `restaurant_id=eq.${data.restaurant.id}` },
          { table: 'assignments' },
        ]
      : [],
    refresh: reloadQuiet,
    enabled: Boolean(data?.restaurant?.id),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.orders ?? []).filter((order) => {
      if (priority !== 'all' && order.priority !== priority) return false;
      if (!query) return true;
      return [order.id, order.delivery_address_line, ...(order.items ?? []).map((item) => item.item_name)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, priority]);

  const counts = useMemo(() => {
    const map = new Map();
    for (const order of data?.orders ?? []) map.set(order.status, (map.get(order.status) ?? 0) + 1);
    return map;
  }, [data]);

  const openDetails = async (order) => {
    setSelected(order);
    setSelectedEvents([]);
    setSelectedAssignment(null);
    setDetailLoading(true);
    setActionError('');
    try {
      const detail = await fetchRestaurantOrder(order.id);
      setSelected(detail.order);
      setSelectedEvents(detail.events ?? []);
      setSelectedAssignment(detail.assignment ?? null);
    } catch (detailError) {
      setActionError(detailError.message ?? 'The order detail could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  const startAction = (order, type) => {
    setSelected(null);
    setAction({ order, type });
    setActionError('');
    setReason('');
    setPrepTime(String(order.prep_time_minutes || data?.restaurant?.default_prep_time_minutes || 20));
  };

  const handleDirect = async (order, next) => {
    setBusy(order.id);
    setActionError('');
    setActionMessage('');
    try {
      const response = await transitionRestaurantOrder(order.id, {
        status: next,
        expectedStatus: order.status,
      });
      setActionMessage(`Order ${order.id.slice(0, 8)} moved to ${next.replaceAll('_', ' ')}.`);
      if (selected?.id === order.id) {
        setSelected(response.order);
        setSelectedEvents(response.events ?? []);
      }
      reloadQuiet();
    } catch (advanceError) {
      setActionError(advanceError.message ?? 'Unable to update this order.');
    } finally {
      setBusy(null);
    }
  };

  const startDelay = (order) => {
    setDelayTarget(order);
    setDelayMinutes('10');
    setDelayReason('');
    setDelayError('');
  };

  const submitDelay = async (event) => {
    event.preventDefault();
    if (!delayTarget) return;

    const minutes = Number.parseInt(delayMinutes, 10);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      setDelayError('Delay must be a whole number between 1 and 240 minutes.');
      return;
    }
    if (delayReason.trim().length > 280) {
      setDelayError('The delay reason may not exceed 280 characters.');
      return;
    }

    setDelaySaving(true);
    setDelayError('');
    try {
      const response = await reportPrepDelay(delayTarget.id, {
        delayMinutes: minutes,
        reason: delayReason.trim(),
      });
      setDelayTarget(null);
      if (selected?.id === delayTarget.id) setSelected(null);
      setActionMessage(
        response.result?.released
          ? `Order ${delayTarget.id.slice(0, 8)} delayed by ${minutes} min. The delivery assignment was released and will be rescheduled automatically.`
          : `Order ${delayTarget.id.slice(0, 8)} delayed by ${minutes} min. The new estimate is stored.`,
      );
      reloadQuiet();
    } catch (delayFailure) {
      setDelayError(delayFailure.message ?? 'The preparation delay could not be recorded.');
    } finally {
      setDelaySaving(false);
    }
  };

  const submitAction = async (event) => {
    event.preventDefault();
    if (!action) return;
    setActionError('');

    const { order, type } = action;
    let payload;

    if (type === 'accept') {
      const minutes = Number.parseInt(prepTime, 10);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
        setActionError('Preparation time must be a whole number between 1 and 240 minutes.');
        return;
      }
      payload = { status: 'confirmed', expectedStatus: 'pending', prepTimeMinutes: minutes };
    } else {
      const trimmed = reason.trim();
      if (!trimmed) {
        setActionError('Add a reason before continuing.');
        return;
      }
      payload = {
        status: type === 'reject' ? 'rejected' : 'cancelled',
        expectedStatus: order.status,
        reason: trimmed,
      };
    }

    setSaving(true);
    try {
      const response = await transitionRestaurantOrder(order.id, payload);
      setAction(null);
      setActionMessage(type === 'accept'
        ? `${actionCopy[type].success} ${response.scheduling?.error ?? (response.scheduling?.assigned?.length ? 'A delivery partner has been proposed.' : 'Awaiting a feasible delivery partner; dispatch can retry.')} Reference ${order.id.slice(0, 8)}.`
        : `${actionCopy[type].success} Reference ${order.id.slice(0, 8)}.`);
      setReason('');
      if (selected?.id === order.id) {
        setSelected(response.order);
        setSelectedEvents(response.events ?? []);
      }
      reloadQuiet();
    } catch (submitError) {
      setActionError(submitError.message ?? 'The order could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading the kitchen board" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.restaurant) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Kitchen operations" title="Kitchen board" />
        <EmptyState icon={Store} title="Restaurant profile unavailable" description="A restaurant must be linked to this account before the kitchen board can load orders." />
      </div>
    );
  }

  const closedStatuses = ['delivered', 'cancelled', 'rejected'];
  const laneOrders = laneDefinitions.map((lane) => ({
    ...lane,
    orders: filtered.filter((order) => lane.statuses.includes(order.status)),
  }));
  const withRider = filtered.filter((order) => ['assigned', 'picked_up', 'out_for_delivery'].includes(order.status));
  const closed = filtered.filter((order) => closedStatuses.includes(order.status));

  const tabs = [
    { value: 'all', label: 'Live board', count: filtered.filter((order) => !closedStatuses.includes(order.status)).length },
    { value: 'pending', label: 'Incoming', count: counts.get('pending') ?? 0 },
    { value: 'confirmed', label: 'Accepted', count: counts.get('confirmed') ?? 0 },
    { value: 'preparing', label: 'Preparing', count: counts.get('preparing') ?? 0 },
    { value: 'ready', label: 'Ready', count: counts.get('ready') ?? 0 },
    { value: 'delivered', label: 'Completed', count: counts.get('delivered') ?? 0 },
    { value: 'cancelled', label: 'Cancelled', count: (counts.get('cancelled') ?? 0) + (counts.get('rejected') ?? 0) },
  ];

  const renderCard = (order) => (
    <OrderCard
      key={order.id}
      order={order}
      onAction={startAction}
      onDirect={handleDirect}
      onDelay={startDelay}
      onOpen={openDetails}
      busy={busy}
    />
  );

  const copy = action ? actionCopy[action.type] : null;
  const detailCanAccept = selected?.status === 'pending';
  const detailCanPrepare = selected?.status === 'confirmed';
  const detailCanReady = selected?.status === 'preparing';
  const detailCanCancel = selected && ['confirmed', 'preparing', 'ready'].includes(selected.status);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${data.restaurant.name} · ${formatTime(data.restaurant.opening_time)} – ${formatTime(data.restaurant.closing_time)}`}
        title="Kitchen board"
        description="Incoming, accepted, preparing and ready orders. Every action is written through the trusted restaurant endpoint and recorded in order history."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>}
      />

      {actionError && !action ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
      {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

      <div className="rs-panel">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-3 pt-1" ariaLabel="Kitchen order status" />
        <div className="grid gap-2.5 p-3 sm:grid-cols-[1fr_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order, item or address…" aria-label="Search kitchen orders" className="pl-9" />
          </div>
          <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter priority">
            <option value="all">All priorities</option>
            {['urgent', 'high', 'normal', 'low'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
          </Select>
        </div>
      </div>

      {!data.orders.length ? (
        <EmptyState
          icon={CookingPot}
          title="No orders on the board"
          description="When a customer completes the trusted checkout, the new order appears here for confirmation."
        />
      ) : tab === 'all' ? (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {laneOrders.map((lane) => (
              <section key={lane.key} className="min-w-0 rounded-xl border border-line bg-slate-50/60">
                <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-ink">{lane.label}</h2>
                    <p className="text-[0.62rem] text-muted">{lane.helper}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-bold text-slate-600 ring-1 ring-line">{lane.orders.length}</span>
                </header>
                <div className="space-y-2.5 p-2.5">
                  {lane.orders.length ? lane.orders.map(renderCard) : (
                    <p className="rounded-lg border border-dashed border-line bg-white/60 px-3 py-6 text-center text-xs text-muted">No orders</p>
                  )}
                </div>
              </section>
            ))}
          </div>

          {withRider.length ? (
            <section>
              <h2 className="mb-2 text-sm font-bold text-ink">With delivery partner</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{withRider.map(renderCard)}</div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(tab === 'cancelled'
            ? filtered.filter((order) => ['cancelled', 'rejected'].includes(order.status))
            : filtered.filter((order) => order.status === tab)
          ).map(renderCard)}
          {!(tab === 'cancelled'
            ? filtered.filter((order) => ['cancelled', 'rejected'].includes(order.status))
            : filtered.filter((order) => order.status === tab)
          ).length ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <EmptyState compact icon={CookingPot} title={`No ${tab === 'cancelled' ? 'cancelled' : tab} orders`} description="This status lane is currently clear." />
            </div>
          ) : null}
        </div>
      )}

      {closed.length && tab === 'all' ? (
        <InlineNotice tone="neutral">
          {closed.length} completed or cancelled order{closed.length === 1 ? '' : 's'} are kept in the history tabs.
        </InlineNotice>
      ) : null}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Kitchen order"
        description={selected ? `Order ${selected.id.slice(0, 8)} · ${selected.status.replaceAll('_', ' ')}` : ''}
        size="lg"
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {detailCanAccept ? (
                <>
                  <Button size="sm" icon={Check} onClick={() => startAction(selected, 'accept')}>Accept</Button>
                  <Button size="sm" variant="danger" icon={X} onClick={() => startAction(selected, 'reject')}>Reject</Button>
                </>
              ) : null}
              {detailCanPrepare ? (
                <Button size="sm" icon={Check} loading={busy === selected.id} onClick={() => handleDirect(selected, 'preparing')}>
                  Start preparation
                </Button>
              ) : null}
              {detailCanReady ? (
                <Button size="sm" icon={Timer} loading={busy === selected.id} onClick={() => handleDirect(selected, 'ready')}>
                  Mark ready
                </Button>
              ) : null}
              {detailCanCancel ? (
                <Button size="sm" variant="danger" icon={X} onClick={() => startAction(selected, 'cancel')}>Cancel</Button>
              ) : null}
              {DELAY_ELIGIBLE.includes(selected.status) && !selected.picked_up_at ? (
                <Button size="sm" variant="secondary" icon={Clock3} onClick={() => startDelay(selected)}>
                  Report delay
                </Button>
              ) : null}
              {!detailCanAccept && !detailCanPrepare && !detailCanReady && !detailCanCancel ? (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  No further kitchen status transition is available for this order.
                </p>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            {detailLoading ? <LoadingState rows={3} label="Loading order events" /> : null}
            <OrderDetailContent order={selected} restaurant={data.restaurant} />
            <div>
              <h3 className="mb-3 text-sm font-bold text-ink">Recorded progress</h3>
              <OrderTimeline order={selected} events={selectedEvents} />
            </div>
            {selectedAssignment ? (
              <InlineNotice tone="neutral" title="Delivery assignment">
                Assignment #{selectedAssignment.id.slice(0, 8)} is {selectedAssignment.status.replaceAll('_', ' ')}.
                {selectedAssignment.rider?.full_name ? ` Delivery partner: ${selectedAssignment.rider.full_name}.` : ''}
                {selectedAssignment.scheduling_run_id ? ' Automatically scheduled.' : ''}
                Pickup is blocked until the kitchen marks the order ready.
              </InlineNotice>
            ) : selected.status === 'confirmed' || selected.status === 'preparing' || selected.status === 'ready' ? <InlineNotice tone="neutral" title="Awaiting scheduling">Dispatch can retry if a feasible rider is not yet available.</InlineNotice> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(action)}
        onClose={() => {
          if (!saving) {
            setAction(null);
            setActionError('');
          }
        }}
        title={copy?.title ?? 'Update order'}
        description={copy?.description}
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAction(null)} disabled={saving}>Go back</Button>
            <Button
              variant={action?.type === 'accept' ? 'primary' : 'danger'}
              loading={saving}
              onClick={submitAction}
            >
              {saving ? 'Saving…' : copy?.confirm}
            </Button>
          </div>
        }
      >
        {action ? (
          <form onSubmit={submitAction} className="space-y-4">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            <p className="rounded-lg border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Order <span className="font-mono font-bold">#{action.order.id.slice(0, 8)}</span> ·{' '}
              {action.order.items?.map((item) => `${item.quantity}× ${item.item_name}`).join(' · ') || 'No lines'}
            </p>

            {action.type === 'accept' ? (
              <div>
                <label htmlFor="prep-time" className="rs-label mb-1">
                  Preparation estimate (minutes)
                </label>
                <Input
                  id="prep-time"
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  value={prepTime}
                  onChange={(event) => setPrepTime(event.target.value)}
                  required
                />
                <p className="mt-1 text-xs leading-5 text-muted">
                  The estimate is stored on the order and used for the customer timeline and dispatch planning.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="action-reason" className="rs-label mb-1">
                  {action.type === 'reject' ? 'Rejection reason' : 'Cancellation reason'}
                </label>
                <textarea
                  id="action-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={280}
                  required
                  className="rs-input"
                  placeholder="Explain why this order cannot continue."
                />
                <p className="mt-1 text-right text-[0.68rem] text-muted">{reason.length}/280</p>
              </div>
            )}
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(delayTarget)}
        onClose={() => {
          if (!delaySaving) {
            setDelayTarget(null);
            setDelayError('');
          }
        }}
        title="Report a preparation delay"
        description="The new estimate is stored on the order. If a delivery partner has not picked it up, the assignment is released and dispatch reschedules it automatically."
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDelayTarget(null)} disabled={delaySaving}>Go back</Button>
            <Button type="submit" form="delay-form" icon={Clock3} loading={delaySaving}>
              {delaySaving ? 'Saving…' : 'Report delay'}
            </Button>
          </div>
        }
      >
        {delayTarget ? (
          <form id="delay-form" onSubmit={submitDelay} className="space-y-4">
            {delayError ? <InlineNotice tone="danger">{delayError}</InlineNotice> : null}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              <p className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                Order #{delayTarget.id.slice(0, 8)}
              </p>
              <p className="mt-1">
                Current estimate: {delayTarget.estimated_ready_at ? formatTime(delayTarget.estimated_ready_at) : 'not recorded'}.
                A delay beyond the promised delivery window is rejected.
              </p>
            </div>
            <div>
              <label htmlFor="delay-minutes" className="rs-label mb-1">
                Additional minutes
              </label>
              <Input
                id="delay-minutes"
                type="number"
                min={1}
                max={240}
                step={1}
                value={delayMinutes}
                onChange={(event) => setDelayMinutes(event.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="delay-reason" className="rs-label mb-1">
                Reason (optional)
              </label>
              <textarea
                id="delay-reason"
                value={delayReason}
                onChange={(event) => setDelayReason(event.target.value)}
                rows={3}
                maxLength={280}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="Ingredient issue, equipment delay, unusually high volume…"
              />
              <p className="mt-1 text-right text-[0.68rem] text-muted">{delayReason.length}/280</p>
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
