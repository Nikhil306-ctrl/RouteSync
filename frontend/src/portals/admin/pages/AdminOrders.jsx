import { useMemo, useState } from 'react';
import { ClipboardList, Filter, Search, X } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import OrderTimeline from '../../../components/portal/OrderTimeline.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { formatDateTime, formatWindow, titleCase } from '../../../lib/format.js';
import {
  fetchAdminOrder,
  fetchAdminOrders,
  transitionAdminOrder,
} from '../../../services/lifecycle.js';

const STATUS_OPTIONS = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'rejected',
];

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function allowedActions(status) {
  if (status === 'pending') {
    return [
      { next: 'confirmed', label: 'Confirm order', variant: 'primary', icon: null },
      { next: 'rejected', label: 'Reject', variant: 'danger', icon: X, reason: true },
      { next: 'cancelled', label: 'Cancel', variant: 'danger', icon: X, reason: true },
    ];
  }
  if (['confirmed', 'preparing', 'ready', 'assigned'].includes(status)) {
    return [{ next: 'cancelled', label: 'Cancel order', variant: 'danger', icon: X, reason: true }];
  }
  return [];
}

function metricsFor(orders = []) {
  const metric = {
    total: orders.length,
    active: 0,
    pending: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    revenueMinor: 0,
  };
  for (const order of orders) {
    const status = String(order.status);
    if (!['delivered', 'cancelled', 'rejected'].includes(status)) metric.active += 1;
    if (status === 'pending') metric.pending += 1;
    if (['confirmed', 'preparing', 'assigned'].includes(status)) metric.preparing += 1;
    if (status === 'ready') metric.ready += 1;
    if (status === 'delivered') {
      metric.delivered += 1;
      metric.revenueMinor += Number(order.total_minor ?? 0);
    }
    if (status === 'cancelled' || status === 'rejected') metric.cancelled += 1;
  }
  return metric;
}

export default function AdminOrders() {
  useDocumentTitle('Order management');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [restaurantId, setRestaurantId] = useState('all');
  const [customerId, setCustomerId] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchAdminOrders({ limit: 300 }),
    [],
  );

  useRealtimeRefresh({
    channelName: 'admin-order-management',
    tables: [
      { table: 'orders' },
      { table: 'order_status_events' },
      { table: 'assignments' },
    ],
    refresh: reloadQuiet,
  });

  const orders = data?.orders ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (status !== 'all' && order.status !== status) return false;
      if (priority !== 'all' && order.priority !== priority) return false;
      if (restaurantId !== 'all' && order.restaurant_id !== restaurantId) return false;
      if (customerId !== 'all' && order.customer_id !== customerId) return false;
      if (!query) return true;
      return [
        order.id,
        order.restaurant?.name,
        order.delivery_address_line,
        order.customer?.full_name,
        order.customer?.email,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [orders, search, status, priority, restaurantId, customerId]);

  const restaurantOptions = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      if (order.restaurant) map.set(order.restaurant.id, order.restaurant);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const customerOptions = useMemo(() => {
    const map = new Map();
    for (const order of orders) {
      if (order.customer) map.set(order.customer.id, order.customer);
    }
    return [...map.values()].sort((a, b) => (a.full_name || a.email || '').localeCompare(b.full_name || b.email || ''));
  }, [orders]);

  const metrics = metricsFor(orders);
  const hasFilters = search || status !== 'all' || priority !== 'all' || restaurantId !== 'all' || customerId !== 'all';
  const selected = detail?.order ?? orders.find((order) => order.id === selectedId) ?? null;

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setPriority('all');
    setRestaurantId('all');
    setCustomerId('all');
  };

  const openOrder = async (order) => {
    setSelectedId(order.id);
    setDetail({ order, events: [], current_assignment: null });
    setActionError('');
    setDetailLoading(true);
    try {
      const response = await fetchAdminOrder(order.id);
      setDetail({
        order: response.order,
        events: response.events ?? [],
        current_assignment: response.current_assignment ?? null,
      });
    } catch (detailError) {
      setActionError(detailError.message ?? 'The order detail could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  const startAction = (order, option) => {
    setAction({ order, ...option });
    setReason('');
    setActionError('');
    setActionMessage('');
  };

  const submitAction = async (event) => {
    event?.preventDefault?.();
    if (!action) return;
    setActionError('');

    const trimmed = reason.trim();
    if (action.reason && !trimmed) {
      setActionError('Add a reason before continuing.');
      return;
    }

    setSaving(true);
    try {
      const response = await transitionAdminOrder(action.order.id, {
        status: action.next,
        expectedStatus: action.order.status,
        reason: action.reason ? trimmed : null,
      });
      setAction(null);
      setReason('');
      setActionMessage(`Order ${action.order.id.slice(0, 8)} moved to ${response.result?.status ?? action.next}.`);
      setDetail((current) =>
        current && current.order.id === action.order.id
          ? { ...current, order: response.order, events: response.events ?? [] }
          : current,
      );
      reloadQuiet();
    } catch (submitError) {
      setActionError(submitError.message ?? 'The order status could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={7} label="Loading orders" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Order operations"
        title="Order management"
        description="Search and filter live order records. Totals and order lines are server-controlled; status changes and cancellations are written through the trusted admin endpoint."
        actions={
          <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs text-muted">
            <span className="font-bold text-ink">{metrics.active}</span> active · <span className="font-bold text-ink">{metrics.total}</span> loaded
          </div>
        }
      />

      {actionError && !action ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
      {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-2.5 lg:grid-cols-[minmax(220px,1fr)_160px_140px_200px_200px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order, customer, venue…"
                aria-label="Search orders"
                className="pl-9"
              />
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
            </Select>
            <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority">
              <option value="all">All priorities</option>
              {PRIORITIES.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
            </Select>
            <Select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)} aria-label="Filter by restaurant">
              <option value="all">All restaurants</option>
              {restaurantOptions.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
            </Select>
            <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)} aria-label="Filter by customer">
              <option value="all">All customers</option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.full_name || customer.email}</option>
              ))}
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" aria-hidden="true" /> {filtered.length} matching orders</span>
            <span className="h-3 w-px bg-line" aria-hidden="true" />
            <span>{metrics.pending} pending</span>
            <span>{metrics.preparing} confirmed / preparing / assigned</span>
            <span>{metrics.ready} ready</span>
            <span>{metrics.cancelled} cancelled or rejected</span>
          </div>
        </CardBody>
      </Card>

      {filtered.length ? (
        <TableShell label="Order management table">
          <THead>
            <tr>
              <TH>Order</TH>
              <TH>Restaurant</TH>
              <TH>Customer</TH>
              <TH>Window</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((order) => (
              <TR key={order.id} onClick={() => openOrder(order)} className="focus-within:bg-orange-50/50">
                <TD>
                  <button type="button" onClick={() => openOrder(order)} className="text-left">
                    <span className="block font-mono text-xs font-bold text-ink">#{order.id.slice(0, 8)}</span>
                    <span className="mt-0.5 block max-w-[140px] truncate text-xs text-muted">{order.delivery_address_line}</span>
                  </button>
                </TD>
                <TD><span className="font-semibold text-ink">{order.restaurant?.name ?? '—'}</span></TD>
                <TD>
                  <span className="block text-sm text-slate-700">{order.customer?.full_name || 'Customer'}</span>
                  <span className="block max-w-[180px] truncate text-xs text-muted">{order.customer?.email}</span>
                </TD>
                <TD className="whitespace-nowrap text-xs">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</TD>
                <TD><StatusBadge status={order.priority} dot={false} /></TD>
                <TD><StatusBadge status={order.status} /></TD>
                <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(order.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title={hasFilters ? 'No orders match these filters' : 'No orders in the system yet'}
          description={hasFilters ? 'Adjust the search or clear the filters to see more records.' : 'Orders will appear here once the trusted order lifecycle creates them.'}
          action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : null}
        />
      )}

      <InlineNotice tone="neutral" title="Writable boundary">
        Admin actions are limited to confirming a pending order and cancelling accepted work with a reason.
        Subtotal, delivery fee, items, assignment records and totals remain protected by database grants and
        the trusted order lifecycle.
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelectedId(null);
          setDetail(null);
          setActionError('');
        }}
        title="Order detail"
        description={selected ? `Reference ${selected.id.slice(0, 8)} · ${selected.restaurant?.name ?? 'Restaurant'}` : ''}
        size="lg"
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {allowedActions(selected.status).map((option) => (
                <Button
                  key={option.next}
                  size="sm"
                  variant={option.variant}
                  icon={option.icon}
                  onClick={() => startAction(selected, option)}
                >
                  {option.label}
                </Button>
              ))}
              {!allowedActions(selected.status).length ? (
                <p className="text-xs font-semibold text-muted">No admin transition is available for this status.</p>
              ) : null}
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            {detailLoading ? <LoadingState rows={3} label="Loading order history" /> : null}
            <OrderDetailContent order={selected} customer={selected.customer} />
            {detail ? (
              <div>
                <h3 className="mb-3 text-sm font-bold text-ink">Recorded progress</h3>
                <OrderTimeline order={selected} events={detail.events ?? []} />
              </div>
            ) : null}
            {detail?.current_assignment ? (
              <InlineNotice tone="neutral" title="Current assignment">
                Assignment #{detail.current_assignment.id.slice(0, 8)} is{' '}
                {detail.current_assignment.status.replaceAll('_', ' ')}. Manage routing and reassignment from
                the dispatch workspace.
              </InlineNotice>
            ) : null}
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
        title={action?.label ?? 'Update order'}
        description={
          action
            ? action.reason
              ? 'The reason is stored on the order and sent to the customer as an order update.'
              : 'Confirming the order moves it into the kitchen queue.'
            : ''
        }
        size="sm"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAction(null)} disabled={saving}>Go back</Button>
            <Button
              variant={action?.variant ?? 'primary'}
              loading={saving}
              onClick={submitAction}
            >
              {saving ? 'Saving…' : action?.label}
            </Button>
          </div>
        }
      >
        {action ? (
          <div className="space-y-4">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            <p className="rounded-lg border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Order <span className="font-mono font-bold">#{action.order.id.slice(0, 8)}</span> ·{' '}
              {action.order.restaurant?.name ?? 'Restaurant'} · {action.order.delivery_address_line}
            </p>
            {action.reason ? (
              <div>
                <label htmlFor="admin-reason" className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                  Reason
                </label>
                <textarea
                  id="admin-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  maxLength={280}
                  required
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100"
                  placeholder="Explain why this order cannot continue."
                />
                <p className="mt-1 text-right text-[0.68rem] text-muted">{reason.length}/280</p>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                This re-checks the current status before writing, so a stale action is rejected instead of
                overwriting another operation.
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
