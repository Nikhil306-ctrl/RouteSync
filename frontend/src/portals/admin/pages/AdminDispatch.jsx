import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import Badge, { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { formatDateTime, formatWindow, titleCase } from '../../../lib/format.js';
import {
  assignRider,
  fetchDispatchQueue,
  fetchEligibleRiders,
  runScheduling,
  fetchSchedulingRuns,
} from '../../../services/lifecycle.js';

const QUEUE_FILTERS = [
  { value: 'all', label: 'Whole queue' },
  { value: 'needs_assignment', label: 'Needs assignment' },
  { value: 'awaiting_response', label: 'Awaiting rider response' },
  { value: 'assigned', label: 'Assigned' },
];

function assignmentLabel(order) {
  const current = order.current_assignment;
  if (!current) return { label: 'Needs assignment', detail: 'No current assignment', tone: 'amber' };
  const rider = current.rider?.full_name || current.rider?.email || 'Delivery partner';
  if (current.status === 'proposed') {
    return { label: 'Awaiting response', detail: `Proposed to ${rider}`, tone: 'blue' };
  }
  if (['accepted', 'active'].includes(current.status)) {
    return { label: 'Assigned', detail: rider, tone: 'green' };
  }
  return { label: titleCase(current.status), detail: rider, tone: 'neutral' };
}

function matchesFilter(order, filter) {
  if (filter === 'all') return true;
  const current = order.current_assignment;
  if (filter === 'needs_assignment') return !current;
  if (filter === 'awaiting_response') return current?.status === 'proposed';
  if (filter === 'assigned') return ['accepted', 'active'].includes(current?.status);
  return true;
}

function RiderOption({ rider, selected, onSelect, disabled }) {
  return (
    <label
      className={`flex gap-3 rounded-xl border p-3.5 transition ${
        disabled
          ? 'cursor-not-allowed border-line bg-slate-50/70 opacity-80'
          : selected
            ? 'cursor-pointer border-accent bg-warm'
            : 'cursor-pointer border-line bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input
        type="radio"
        name="eligible-rider"
        value={rider.id}
        checked={selected}
        onChange={() => onSelect(rider.id)}
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-orange-600"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{rider.full_name || rider.email || 'Delivery partner'}</span>
          <StatusBadge status={rider.verification_status} dot={false} />
          {rider.is_available ? <StatusBadge status="active" dot={false} /> : <StatusBadge status="suspended" dot={false} />}
        </span>
        <span className="mt-1 block text-xs text-slate-600">
          {rider.vehicle_type ? `${titleCase(rider.vehicle_type)} · ` : ''}
          {rider.vehicle_number || 'No vehicle number'} · Load {rider.active_load}/{rider.max_concurrent_orders}
        </span>
        <span className="mt-1 block text-xs text-muted">
          Shift ends {rider.shift_ends_at ? formatDateTime(rider.shift_ends_at) : 'not covering now'}
        </span>
        {!rider.eligible && rider.reason ? (
          <span className="mt-1.5 flex items-start gap-1.5 text-[0.68rem] font-semibold leading-4 text-red-700">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            {rider.reason}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function AdminDispatch() {
  useDocumentTitle('Scheduling & dispatch');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedRiderId, setSelectedRiderId] = useState(null);
  const [reason, setReason] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignMessage, setAssignMessage] = useState('');
  const [schedulingTarget, setSchedulingTarget] = useState(null);
  const [scheduleResult, setScheduleResult] = useState(null);
  const { data: runData, loading: runsLoading, error: runsError, reload: reloadRuns } = useAsyncData(() => fetchSchedulingRuns(), []);

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchDispatchQueue(),
    [],
  );

  useRealtimeRefresh({
    channelName: 'admin-dispatch-queue',
    tables: [
      { table: 'orders' },
      { table: 'assignments' },
      { table: 'assignment_events' },
    ],
    refresh: reloadQuiet,
  });

  const {
    data: eligibleData,
    loading: eligibleLoading,
    error: eligibleError,
    reload: reloadEligible,
  } = useAsyncData(async () => {
    if (!selectedOrderId) return null;
    return fetchEligibleRiders(selectedOrderId);
  }, [selectedOrderId]);

  const queue = data?.orders ?? [];
  const summary = data?.summary ?? {
    queue: 0,
    awaitingAssignment: 0,
    awaitingResponse: 0,
    assigned: 0,
    needsAction: 0,
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return queue.filter((order) => {
      if (!matchesFilter(order, filter)) return false;
      if (!needle) return true;
      return [
        order.id,
        order.restaurant?.name,
        order.delivery_address_line,
        order.current_assignment?.rider?.full_name,
        order.current_assignment?.rider?.email,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [queue, query, filter]);

  const selectedOrder = queue.find((order) => order.id === selectedOrderId) ?? null;
  const selectedRider = (eligibleData?.riders ?? []).find((rider) => rider.id === selectedRiderId) ?? null;
  const reassigning = Boolean(selectedOrder?.current_assignment);

  const openOrder = (order) => {
    setSelectedOrderId(order.id);
    setSelectedRiderId(null);
    setReason('');
    setAssignError('');
    setAssignMessage('');
  };

  const close = () => {
    if (assigning) return;
    setSelectedOrderId(null);
    setSelectedRiderId(null);
    setReason('');
    setAssignError('');
  };

  const submitAssignment = async (event) => {
    event?.preventDefault?.();
    if (!selectedOrder) return;
    setAssignError('');
    setAssignMessage('');

    if (!selectedRiderId) {
      setAssignError('Choose an eligible delivery partner first.');
      return;
    }
    if (!selectedRider?.eligible) {
      setAssignError(selectedRider?.reason || 'This delivery partner is not eligible for the order.');
      return;
    }
    if (reassigning && !reason.trim()) {
      setAssignError('Add a reason for this reassignment.');
      return;
    }

    setAssigning(true);
    try {
      const response = await assignRider(selectedOrder.id, {
        riderId: selectedRiderId,
        reason: reason.trim() || null,
        expectedAssignmentId: selectedOrder.current_assignment?.id ?? null,
      });
      const duplicate = Boolean(response.result?.duplicate);
      setAssignMessage(
        duplicate
          ? 'This delivery partner already holds the current assignment. No duplicate was created.'
          : reassigning
            ? 'The order was reassigned. The previous assignment is kept in history.'
            : 'The delivery partner has been proposed for this order and must accept it.',
      );
      setReason('');
      setSelectedRiderId(null);
      await reloadEligible();
      reloadQuiet();
    } catch (assignFailure) {
      setAssignError(assignFailure.message ?? 'The assignment could not be saved.');
    } finally {
      setAssigning(false);
    }
  };

  const startScheduling = async (ids) => {
    if (schedulingTarget) return;
    setSchedulingTarget(ids?.[0] ?? 'batch');
    setAssignError('');
    try {
      setScheduleResult(await runScheduling(ids));
      reloadQuiet();
      reloadRuns();
    } catch (failure) { setAssignError(failure.message); }
    finally { setSchedulingTarget(null); }
  };

  if (loading) return <LoadingState rows={7} label="Loading the dispatch workspace" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Scheduling control"
        title="Scheduling & dispatch"
        description="Constraint-based scheduling proposals, rider responses and controlled dispatch. Geographic route estimates are not road navigation."
        actions={
          <>
            <LinkButton to="/admin/orders" variant="secondary" icon={ArrowRight}>Orders</LinkButton>
            <Button loading={schedulingTarget === 'batch'} disabled={Boolean(schedulingTarget)} onClick={() => startScheduling()} icon={RouteIcon}>Batch schedule</Button>
            <Button variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>
          </>
        }
      />

      {assignError && !selectedOrder ? <InlineNotice tone="danger">{assignError}</InlineNotice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Dispatch queue" value={summary.queue} helper="Accepted orders before pickup" icon={RouteIcon} tone="orange" />
        <StatCard label="Needs assignment" value={summary.awaitingAssignment} helper="No current rider assignment" icon={CircleDashed} tone={summary.awaitingAssignment ? 'orange' : 'default'} />
        <StatCard label="Awaiting response" value={summary.awaitingResponse} helper="Proposed to a delivery partner" icon={CalendarClock} />
        <StatCard label="Assigned" value={summary.assigned} helper={`${summary.needsAction} order${summary.needsAction === 1 ? '' : 's'} need action`} icon={UserCheck} tone="green" />
      </div>

      {scheduleResult ? <InlineNotice tone="neutral" title={`Scheduling ${scheduleResult.metrics?.termination ?? 'complete'}`}>
        {scheduleResult.assigned?.length ?? 0} assigned · {scheduleResult.unscheduled?.length ?? 0} unscheduled · {scheduleResult.metrics?.search_nodes ?? 0} nodes · {scheduleResult.metrics?.backtracks ?? 0} backtracks · {scheduleResult.metrics?.execution_ms ?? 0} ms.
      </InlineNotice> : null}
      <Card><CardHeader title="Recent scheduling runs" description="Execution metrics from persisted solver runs" /><CardBody>
        {runsLoading ? <p className="text-xs text-muted">Loading scheduling runs…</p> : runsError ? <div className="flex items-center justify-between gap-3"><p className="text-xs text-red-700">{runsError.message}</p><Button size="sm" variant="secondary" onClick={reloadRuns}>Retry</Button></div> : (runData?.runs ?? []).length ? <ul className="space-y-2 text-xs">{runData.runs.slice(0, 8).map((run) => <li key={run.id} className="rounded-lg border border-line p-2">#{run.id.slice(0, 8)} · {run.status} · {formatDateTime(run.created_at)} · {run.metrics?.feasible_assignments ?? 0} assigned · {run.metrics?.unscheduled_orders ?? 0} unscheduled · {run.metrics?.termination ?? '—'}</li>)}</ul> : <p className="text-xs text-muted">No scheduling runs yet.</p>}
      </CardBody></Card>

      <Card>
        <CardHeader
          title="Assignment queue"
          description="Orders accepted by the kitchen and not yet picked up. Reassignments keep the previous record."
          action={<Link to="/admin/riders" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">Delivery partners <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        />
        <div className="grid gap-2.5 border-b border-line p-3 sm:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search order, venue, address or rider…"
              aria-label="Search dispatch queue"
              className="pl-9"
            />
          </div>
          <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter dispatch queue">
            {QUEUE_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        </div>

        {filtered.length ? (
          <TableShell className="rounded-none border-x-0 border-b-0" label="Dispatch assignment queue">
            <THead>
              <tr>
                <TH>Order</TH>
                <TH>Restaurant & drop-off</TH>
                <TH>Window</TH>
                <TH>Status</TH>
                <TH>Current assignment</TH>
                <TH>Reassignments</TH>
                <TH>Action</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((order) => {
                const current = assignmentLabel(order);
                return (
                  <TR key={order.id} onClick={() => openOrder(order)} className="focus-within:bg-orange-50/50">
                    <TD>
                      <button type="button" onClick={() => openOrder(order)} className="text-left">
                        <span className="block font-mono text-xs font-bold text-ink">#{order.id.slice(0, 8)}</span>
                        <span className="mt-0.5 block text-xs text-muted">{formatDateTime(order.created_at)}</span>
                      </button>
                    </TD>
                    <TD>
                      <p className="max-w-[220px] truncate font-semibold text-ink">{order.restaurant?.name ?? 'Restaurant'}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted">{order.delivery_address_line}</p>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</TD>
                    <TD><StatusBadge status={order.status} /></TD>
                    <TD>
                      <Badge variant={current.tone}>{current.label}</Badge>
                      <p className="mt-1 max-w-[180px] truncate text-xs text-muted">{current.detail}</p>
                      {order.current_assignment ? <p className="text-xs text-muted">{order.current_assignment.scheduling_explanation?.source ?? 'manual'} · {order.current_assignment.scheduling_explanation?.score?.toFixed?.(3) ?? '—'}</p> : <Button size="sm" variant="secondary" loading={schedulingTarget === order.id} disabled={Boolean(schedulingTarget)} onClick={(event) => { event.stopPropagation(); startScheduling([order.id]); }}>Run scheduler</Button>}
                    </TD>
                    <TD className="text-xs tabular-nums text-slate-600">{order.reassignment_count ?? 0}</TD>
                    <TD>
                      <Button
                        size="sm"
                        variant={order.current_assignment ? 'secondary' : 'primary'}
                        icon={order.current_assignment ? RefreshCw : UserCheck}
                        onClick={(event) => {
                          event.stopPropagation();
                          openOrder(order);
                        }}
                      >
                        {order.current_assignment ? 'Reassign' : 'Assign'}
                      </Button>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableShell>
        ) : (
          <div className="p-5">
            <EmptyState
              compact
              icon={query || filter !== 'all' ? Search : CircleDashed}
              title={queue.length ? 'No orders match this view' : 'No orders awaiting assignment'}
              description={
                queue.length
                  ? 'Adjust the search or filter to review the rest of the queue.'
                  : 'Accepted orders that have not been picked up will appear here. Create or accept an order first.'
              }
              action={queue.length ? <Button variant="secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Clear view</Button> : null}
            />
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selectedOrder)}
        onClose={close}
        title={selectedOrder ? `Assign order #${selectedOrder.id.slice(0, 8)}` : 'Assign order'}
        description={
          selectedOrder
            ? `${selectedOrder.restaurant?.name ?? 'Restaurant'} · ${selectedOrder.delivery_address_line}`
            : ''
        }
        size="lg"
        footer={
          selectedOrder ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.68rem] leading-4 text-muted">
                The rider is proposed first. The order becomes assigned when they accept (or immediately if it is already ready).
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" onClick={close} disabled={assigning}>Close</Button>
                <Button
                  icon={UserCheck}
                  loading={assigning}
                  disabled={!selectedRiderId || Boolean(selectedRider && !selectedRider.eligible)}
                  onClick={submitAssignment}
                >
                  {reassigning ? 'Reassign order' : 'Assign delivery partner'}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selectedOrder ? (
          <div className="space-y-5">
            {assignError ? <InlineNotice tone="danger">{assignError}</InlineNotice> : null}
            {assignMessage ? <InlineNotice tone="success">{assignMessage}</InlineNotice> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-slate-50 p-3.5">
                <p className="text-xs font-semibold text-muted">Order state</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={selectedOrder.status} />
                  <StatusBadge status={selectedOrder.priority} dot={false} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Window {formatWindow(selectedOrder.delivery_window_start, selectedOrder.delivery_window_end)}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-slate-50 p-3.5">
                <p className="text-xs font-semibold text-muted">Planned timing</p>
                {eligibleData?.plan ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-700">
                    <p>Pickup {formatDateTime(eligibleData.plan.pickupAt)}</p>
                    <p>Delivery {formatDateTime(eligibleData.plan.deliveryAt)}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted">Calculated when eligible riders are loaded.</p>
                )}
              </div>
            </div>

            {selectedOrder.current_assignment ? (
              <div className="rounded-lg border border-line p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-ink">Current assignment</p>
                  <StatusBadge status={selectedOrder.current_assignment.status} />
                  <span className="font-mono text-[0.68rem] text-muted">#{selectedOrder.current_assignment.id.slice(0, 8)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedOrder.current_assignment.rider?.full_name || selectedOrder.current_assignment.rider?.email || 'Delivery partner'}
                  {selectedOrder.current_assignment.reason ? ` · ${selectedOrder.current_assignment.reason}` : ''}
                </p>
                {selectedOrder.current_assignment.scheduling_explanation ? <p className="mt-2 text-xs text-muted">{selectedOrder.current_assignment.scheduling_explanation.source} · score {Number(selectedOrder.current_assignment.scheduling_explanation.score).toFixed(3)} · batch {selectedOrder.current_assignment.scheduling_explanation.batch_size} · pickup {formatDateTime(selectedOrder.current_assignment.planned_pickup_at)} · delivery {formatDateTime(selectedOrder.current_assignment.planned_delivery_at)} · {JSON.stringify(selectedOrder.current_assignment.scheduling_explanation.breakdown)}</p> : null}
                <div>
                  <label htmlFor="assign-reason" className="rs-label mt-3">
                    Reassignment reason
                  </label>
                  <input
                    id="assign-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={280}
                    className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-orange-100"
                    placeholder="Why is this assignment changing?"
                  />
                  <p className="mt-1 text-right text-[0.68rem] text-muted">{reason.length}/280</p>
                </div>
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">Eligible delivery partners</h3>
                <span className="text-xs text-muted">{eligibleData?.riders?.filter((rider) => rider.eligible).length ?? 0} eligible</span>
              </div>
              {eligibleLoading ? (
                <LoadingState rows={3} label="Loading eligible delivery partners" />
              ) : eligibleError ? (
                <InlineNotice tone="danger" title="Eligible riders could not be loaded">
                  {eligibleError.message}
                </InlineNotice>
              ) : eligibleData?.riders?.length ? (
                <div className="mt-2 space-y-2.5">
                  {eligibleData.riders.map((rider) => (
                    <RiderOption
                      key={rider.id}
                      rider={rider}
                      selected={rider.id === selectedRiderId}
                      onSelect={setSelectedRiderId}
                      disabled={!rider.eligible}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Bike}
                  title="No delivery partner records"
                  description="Provision a verified delivery partner profile before assigning this order."
                />
              )}
            </div>

            {selectedOrder.assignment_history?.length ? (
              <div>
                <h3 className="mb-2 text-sm font-bold text-ink">Reassignment history</h3>
                <ul className="space-y-2">
                  {selectedOrder.assignment_history.map((assignment) => (
                    <li key={assignment.id} className="rounded-lg border border-line bg-slate-50 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={assignment.status} dot={false} />
                        <span className="font-mono text-[0.68rem] text-muted">#{assignment.id.slice(0, 8)}</span>
                        <span className="font-semibold text-slate-700">
                          {assignment.rider?.full_name || assignment.rider?.email || 'Delivery partner'}
                        </span>
                      </div>
                      {assignment.reason ? <p className="mt-1 text-muted">{assignment.reason}</p> : null}
                      <p className="mt-1 text-[0.68rem] text-muted">Recorded {formatDateTime(assignment.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <InlineNotice tone="warning" title="Eligibility is advisory here">
              <span className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Active account, rider role, verification, availability, a shift covering now, capacity and the expected
                current assignment are checked again by the database function when you submit.
              </span>
            </InlineNotice>
          </div>
        ) : null}
      </Modal>

      <Card>
        <CardHeader
          title="Assignment records"
          description="Current and replaced assignments are retained with their recorded status and reason."
          action={<LinkButton to="/admin/riders" variant="secondary" size="sm" icon={CheckCircle2}>Delivery partners</LinkButton>}
        />
        <CardBody>
          <p className="text-xs leading-5 text-muted">
            Reassigning an order marks the previous assignment as reassigned and creates a new proposed assignment.
            The queue never deletes history, and the order does not move to assigned until the rider accepts.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
