import { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, History, RefreshCw, Route as RouteIcon, UserRound } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardHeader, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime } from '../../../lib/format.js';
import { listAdminAssignments, listRidersWithProfiles } from '../../../services/riders.js';
import { reportAdminPrepDelay } from '../../../services/lifecycle.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';

const DELAY_ELIGIBLE = ['confirmed', 'preparing', 'ready', 'assigned'];

export default function AdminRescheduling() {
  useDocumentTitle('Rescheduling history');
  const [selected, setSelected] = useState(null);
  const [delayOpen, setDelayOpen] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState('10');
  const [delayReason, setDelayReason] = useState('');
  const [delaySaving, setDelaySaving] = useState(false);
  const [delayError, setDelayError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(async () => {
    const [assignments, riders] = await Promise.all([
      listAdminAssignments(300),
      listRidersWithProfiles(),
    ]);
    return { assignments, riders };
  }, []);

  useRealtimeRefresh({
    channelName: 'admin-rescheduling-history',
    tables: ['orders', 'assignments', 'assignment_events'],
    refresh: reloadQuiet,
    intervalMs: 30_000,
  });

  const riderById = useMemo(
    () => new Map((data?.riders ?? []).map((rider) => [rider.id, rider])),
    [data],
  );

  const current = useMemo(
    () => (data?.assignments ?? []).filter((assignment) => assignment.is_current),
    [data],
  );
  const historical = useMemo(
    () =>
      (data?.assignments ?? []).filter(
        (assignment) =>
          !assignment.is_current ||
          ['reassigned', 'cancelled', 'rejected', 'completed'].includes(assignment.status),
      ),
    [data],
  );
  const replacements = data?.assignments.filter((assignment) => assignment.replaced_by_assignment_id).length ?? 0;
  const canDelay = selected?.order
    && DELAY_ELIGIBLE.includes(selected.order.status)
    && !selected.order.picked_up_at;

  const submitDelay = async (event) => {
    event.preventDefault();
    if (!selected?.order) return;

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
      const response = await reportAdminPrepDelay(selected.order.id, {
        delayMinutes: minutes,
        reason: delayReason.trim(),
      });
      setActionMessage(
        response.result?.released
          ? `Order ${selected.order.id.slice(0, 8)} delayed by ${minutes} min. The current assignment was released and will be rescheduled automatically.`
          : `Order ${selected.order.id.slice(0, 8)} delayed by ${minutes} min.`,
      );
      setDelayOpen(false);
      setSelected(null);
      reloadQuiet();
    } catch (delayFailure) {
      setDelayError(delayFailure.message ?? 'The preparation delay could not be recorded.');
    } finally {
      setDelaySaving(false);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading rescheduling history" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Assignment history"
        title="Rescheduling history"
        description="Current and historical assignment records. Replacement reasons and links appear only when trusted dispatch flows write them."
      />

      {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Current assignments" value={current.length} helper={`${data.assignments.length} assignment rows loaded`} icon={RouteIcon} tone="green" />
        <StatCard label="Historical / closed" value={historical.length} helper="Non-current or terminal assignments" icon={History} />
        <StatCard label="Replacement links" value={replacements} helper="Rows pointing to a replacement assignment" icon={RefreshCw} tone="orange" />
      </div>

      <InlineNotice tone="warning" title="Rescheduling controls">
        A dispatcher can report a preparation delay from an assignment record. The trusted database function
        releases an uncollected assignment and marks it for automatic rescheduling; it never rewrites history or
        invents a replacement partner.
      </InlineNotice>

      <Card>
        <CardHeader title="Current assignments" description="is_current = true, as stored by dispatch." />
        {current.length ? (
          <TableShell className="rounded-none border-x-0 border-b-0">
            <THead>
              <tr>
                <TH>Assignment</TH>
                <TH>Order</TH>
                <TH>Rider</TH>
                <TH>Status</TH>
                <TH>Pickup</TH>
                <TH>Delivery</TH>
                <TH>Assigned</TH>
              </tr>
            </THead>
            <TBody>
              {current.map((assignment) => {
                const rider = riderById.get(assignment.rider_id);
                return (
                  <TR key={assignment.id} onClick={() => setSelected(assignment)}>
                    <TD><span className="font-mono text-xs font-bold">#{assignment.id.slice(0, 8)}</span></TD>
                    <TD><span className="font-mono text-xs">{assignment.order_id.slice(0, 8)}</span></TD>
                    <TD>{rider?.profile?.full_name || 'Delivery partner'}</TD>
                    <TD><StatusBadge status={assignment.status} /></TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(assignment.planned_pickup_at)}</TD>
                    <TD className="whitespace-nowrap text-xs">{formatDateTime(assignment.planned_delivery_at)}</TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(assignment.assigned_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </TableShell>
        ) : (
          <div className="p-5">
            <EmptyState
              compact
              icon={RouteIcon}
              title="No current assignments"
              description="Current dispatch assignments will appear here once the scheduling workflow creates them."
            />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Reassignment and closure history" description="Non-current, reassigned, cancelled, rejected or completed assignment records." />
        {historical.length ? (
          <TableShell className="rounded-none border-x-0 border-b-0">
            <THead>
              <tr>
                <TH>Assignment</TH>
                <TH>Rider</TH>
                <TH>Status</TH>
                <TH>Reason</TH>
                <TH>Replaced by</TH>
                <TH>Recorded</TH>
              </tr>
            </THead>
            <TBody>
              {historical.map((assignment) => {
                const rider = riderById.get(assignment.rider_id);
                return (
                  <TR key={assignment.id} onClick={() => setSelected(assignment)}>
                    <TD><span className="font-mono text-xs">#{assignment.id.slice(0, 8)}</span></TD>
                    <TD>{rider?.profile?.full_name || 'Delivery partner'}</TD>
                    <TD><StatusBadge status={assignment.status} /></TD>
                    <TD><span className="block max-w-[260px] truncate text-xs text-slate-600">{assignment.reason || '—'}</span></TD>
                    <TD><span className="font-mono text-xs">{assignment.replaced_by_assignment_id?.slice(0, 8) || '—'}</span></TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(assignment.updated_at || assignment.created_at)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </TableShell>
        ) : (
          <div className="p-5">
            <EmptyState
              compact
              icon={History}
              title="No reassignment history"
              description="Records appear when a trusted dispatch flow replaces or closes an assignment."
            />
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setDelayOpen(false);
          setDelayError('');
        }}
        title="Assignment record"
        description={selected ? `Assignment ${selected.id.slice(0, 8)}` : ''}
        size="lg"
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-600">
                {selected.is_current ? 'Current' : 'Historical'}
              </span>
            </div>

            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Rider">
                <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{riderById.get(selected.rider_id)?.profile?.full_name || 'Delivery partner'}</span>
              </DefinitionItem>
              <DefinitionItem label="Assigned by">{selected.assigned_by ? <span className="font-mono text-xs">{selected.assigned_by.slice(0, 8)}</span> : 'System / seed'}</DefinitionItem>
              <DefinitionItem label="Pickup">{formatDateTime(selected.planned_pickup_at)}</DefinitionItem>
              <DefinitionItem label="Delivery">{formatDateTime(selected.planned_delivery_at)}</DefinitionItem>
              <DefinitionItem label="Route">{selected.route_id ? <span className="font-mono text-xs">{selected.route_id.slice(0, 8)}</span> : '—'}</DefinitionItem>
              <DefinitionItem label="Scheduling run">{selected.scheduling_run_id ? <span className="font-mono text-xs">{selected.scheduling_run_id.slice(0, 8)}</span> : '—'}</DefinitionItem>
              <DefinitionItem label="Reason">{selected.reason || 'No reason recorded'}</DefinitionItem>
              <DefinitionItem label="Replaced by">{selected.replaced_by_assignment_id || '—'}</DefinitionItem>
            </dl>

            {selected.order ? (
              <section className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">Preparation timing</h3>
                    <p className="mt-0.5 text-xs leading-5 text-muted">
                      Order status: {selected.order.status}. Delays are accepted only before pickup.
                    </p>
                  </div>
                  {canDelay ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={Clock3}
                      onClick={() => {
                        setDelayOpen((open) => !open);
                        setDelayError('');
                        setDelayMinutes('10');
                        setDelayReason('');
                      }}
                    >
                      {delayOpen ? 'Close delay form' : 'Report delay'}
                    </Button>
                  ) : null}
                </div>

                {canDelay && delayOpen ? (
                  <form onSubmit={submitDelay} className="mt-4 space-y-3 border-t border-line pt-4">
                    {delayError ? <InlineNotice tone="danger">{delayError}</InlineNotice> : null}
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                      <p className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        The promised delivery window is enforced
                      </p>
                      <p className="mt-1">
                        A revised readiness time after the delivery window is rejected by the database function.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                      <div>
                        <label htmlFor="admin-delay-minutes" className="rs-label mb-1">
                          Minutes
                        </label>
                        <Input
                          id="admin-delay-minutes"
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
                        <label htmlFor="admin-delay-reason" className="rs-label mb-1">
                          Reason (optional)
                        </label>
                        <Input
                          id="admin-delay-reason"
                          value={delayReason}
                          onChange={(event) => setDelayReason(event.target.value)}
                          maxLength={280}
                          placeholder="Restaurant or dispatch reason"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setDelayOpen(false)} disabled={delaySaving}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm" icon={Clock3} loading={delaySaving}>
                        {delaySaving ? 'Saving…' : 'Apply delay'}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </section>
            ) : null}

            {selected.order ? (
              <OrderDetailContent order={selected.order} />
            ) : (
              <p className="rounded-lg border border-dashed border-line p-4 text-xs text-muted">
                The linked order is not visible or no longer exists.
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
