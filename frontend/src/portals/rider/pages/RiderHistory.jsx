import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bike, CheckCircle2, History, Package, ShieldAlert } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDateTime } from '../../../lib/format.js';
import { getRider, listRiderAssignments } from '../../../services/riders.js';

export default function RiderHistory() {
  useDocumentTitle('Delivery history');
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsyncData(async () => {
    const rider = await getRider(user.id);
    if (!rider) return { rider: null, assignments: [] };
    const assignments = await listRiderAssignments(user.id);
    return { rider, assignments };
  }, [user.id]);

  const history = useMemo(
    () =>
      (data?.assignments ?? []).filter(
        (assignment) =>
          ['completed', 'cancelled', 'rejected', 'reassigned'].includes(assignment.status) ||
          ['delivered', 'cancelled', 'rejected'].includes(assignment.order?.status),
      ),
    [data],
  );

  const delivered = history.filter(
    (assignment) => assignment.status === 'completed' || assignment.order?.status === 'delivered',
  );
  const closed = history.length - delivered.length;

  if (loading) return <LoadingState rows={5} label="Loading delivery history" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.rider) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Delivery partner" title="Delivery history" />
        <EmptyState icon={Bike} title="Rider profile not provisioned" description="Ask a dispatcher to link a rider record to your account." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="My records"
        title="Delivery history"
        description="Completed and closed assignment records linked to your rider profile. No earnings or performance score is inferred."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Delivered" value={delivered.length} helper="Order marked delivered" icon={CheckCircle2} tone="green" />
        <StatCard label="Closed" value={closed} helper="Cancelled, rejected or reassigned" icon={History} />
        <StatCard label="Total records" value={history.length} helper="Historical assignments only" icon={Package} tone="orange" />
        <StatCard label="Active now" value={(data.assignments.length - history.length)} helper="Not part of history" icon={Bike} />
      </div>

      <Card>
        <CardHeader
          title="Historical assignments"
          description="Newest records first. Open a record for pickup and delivery details."
          action={
            <Link to="/delivery-partner/assignments" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">
              Current tasks <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        />
        {history.length ? (
          <TableShell className="rounded-none border-x-0 border-b-0" label="Delivery history">
            <THead>
              <tr>
                <TH>Assignment</TH>
                <TH>Restaurant</TH>
                <TH>Status</TH>
                <TH>Order</TH>
                <TH>Window</TH>
                <TH>Recorded</TH>
              </tr>
            </THead>
            <TBody>
              {history.map((assignment) => (
                <TR key={assignment.id}>
                  <TD>
                    <Link
                      to={`/delivery-partner/assignments/${assignment.id}`}
                      className="font-mono text-xs font-bold text-accent hover:text-accent-strong"
                    >
                      #{assignment.id.slice(0, 8)}
                    </Link>
                  </TD>
                  <TD>
                    <p className="font-semibold text-ink">{assignment.order?.restaurant?.name || 'Restaurant'}</p>
                    <p className="max-w-[240px] truncate text-xs text-muted">{assignment.order?.delivery_address_line || 'Address unavailable'}</p>
                  </TD>
                  <TD><StatusBadge status={assignment.status} /></TD>
                  <TD><StatusBadge status={assignment.order?.status} dot={false} /></TD>
                  <TD className="text-xs">
                    {assignment.order?.delivery_window_start
                      ? `${new Date(assignment.order.delivery_window_start).toLocaleDateString()} · ${new Date(assignment.order.delivery_window_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                      : '—'}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(assignment.completed_at || assignment.updated_at || assignment.created_at)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableShell>
        ) : (
          <div className="p-4">
            <EmptyState
              compact
              icon={History}
              title="No completed deliveries yet"
              description="Closed assignment records appear here after a delivery is completed or an assignment is ended by trusted dispatch."
            />
          </div>
        )}
      </Card>

      <InlineNotice tone="neutral" title="Read-only history">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Historical assignment records are read-only for delivery partners. Earnings, ratings and completion
          incentives are not calculated in this phase.
        </span>
      </InlineNotice>
    </div>
  );
}
