import { useMemo, useState } from 'react';
import { History, RefreshCw, Route as RouteIcon, UserRound } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardHeader, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import OrderDetailContent from '../../../components/portal/OrderDetailContent.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime } from '../../../lib/format.js';
import { listAdminAssignments, listRidersWithProfiles } from '../../../services/riders.js';

export default function AdminRescheduling() {
  useDocumentTitle('Rescheduling history');
  const [selected, setSelected] = useState(null);

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [assignments, riders] = await Promise.all([
      listAdminAssignments(300),
      listRidersWithProfiles(),
    ]);
    return { assignments, riders };
  }, []);

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

  if (loading) return <LoadingState rows={6} label="Loading rescheduling history" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Assignment history"
        title="Rescheduling history"
        description="Current and historical assignment records. Replacement reasons and links appear only when trusted dispatch flows write them."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Current assignments" value={current.length} helper={`${data.assignments.length} assignment rows loaded`} icon={RouteIcon} tone="green" />
        <StatCard label="Historical / closed" value={historical.length} helper="Non-current or terminal assignments" icon={History} />
        <StatCard label="Replacement links" value={replacements} helper="Rows pointing to a replacement assignment" icon={RefreshCw} tone="orange" />
      </div>

      <InlineNotice tone="warning" title="Phase 5 dependency">
        Automatic rescheduling needs the trusted assignment service and conflict-resolution workflow.
        This page reads existing records; it does not reassign riders or invent a conflict resolution.
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
        onClose={() => setSelected(null)}
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
