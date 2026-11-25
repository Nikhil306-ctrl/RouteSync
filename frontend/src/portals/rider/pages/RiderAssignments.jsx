import { useMemo, useState } from 'react';
import { Bike, CalendarDays, CheckCircle2, Package, Search, ShieldCheck } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input } from '../../../components/ui/Field.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import RiderAssignmentCard from '../components/RiderAssignmentCard.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { getRider } from '../../../services/riders.js';
import { fetchRiderAssignments } from '../../../services/lifecycle.js';

function isClosed(assignment) {
  return (
    ['completed', 'cancelled', 'rejected', 'reassigned'].includes(assignment.status) ||
    ['delivered', 'cancelled', 'rejected'].includes(assignment.order?.status)
  );
}

export default function RiderAssignments() {
  useDocumentTitle('Assignments');
  const { user } = useAuth();
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(async () => {
    if (!user) return { rider: null, assignments: [] };
    const rider = await getRider(user.id);
    if (!rider) return { rider: null, assignments: [] };
    const response = await fetchRiderAssignments({ limit: 250 });
    return { rider, assignments: response.assignments ?? [] };
  }, [user?.id]);

  useRealtimeRefresh({
    channelName: `rider-assignments-${user?.id ?? 'anonymous'}`,
    tables: user?.id
      ? [
          { table: 'assignments', filter: `rider_id=eq.${user.id}` },
          { table: 'assignment_events' },
          { table: 'orders' },
        ]
      : [],
    refresh: reloadQuiet,
    enabled: Boolean(user?.id && data?.rider),
  });

  const groups = useMemo(() => {
    const assignments = data?.assignments ?? [];
    return {
      action: assignments.filter((assignment) => assignment.status === 'proposed' && !isClosed(assignment)),
      active: assignments.filter(
        (assignment) => ['accepted', 'active'].includes(assignment.status) && !isClosed(assignment),
      ),
      history: assignments.filter(isClosed),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (groups[tab] ?? []).filter((assignment) => {
      if (!query) return true;
      return [
        assignment.id,
        assignment.order?.id,
        assignment.order?.restaurant?.name,
        assignment.order?.delivery_address_line,
        assignment.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [groups, tab, search]);

  if (loading) return <LoadingState rows={4} label="Loading assignments" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.rider) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Delivery partner" title="Assignments" />
        <EmptyState icon={Bike} title="Rider profile not provisioned" description="Ask a dispatcher to link a rider record to your account." />
      </div>
    );
  }

  const tabs = [
    { value: 'action', label: 'Action needed', count: groups.action.length },
    { value: 'active', label: 'In progress', count: groups.active.length },
    { value: 'history', label: 'History', count: groups.history.length },
  ];

  const emptyCopy = {
    action: ['No assignments need a response', 'Proposed assignments appear here when dispatch requests you for an order.'],
    active: ['No delivery in progress', 'Accept a proposed assignment or wait for dispatch to send one.'],
    history: ['No delivery history', 'Completed, rejected, cancelled and reassigned records will appear here.'],
  }[tab];

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="My tasks"
        title="Assignments"
        description="Proposed, current and historical delivery tasks linked to your rider profile. Assignment actions are written through the trusted delivery endpoint."
        actions={
          <>
            <LinkButton to="/delivery-partner/shifts" variant="secondary" icon={CalendarDays}>Shifts</LinkButton>
            <LinkButton to="/delivery-partner/history" variant="secondary" icon={CheckCircle2}>History</LinkButton>
          </>
        }
      />

      {groups.action.length ? (
        <InlineNotice tone="warning" title={`${groups.action.length} assignment${groups.action.length === 1 ? '' : 's'} need your response`}>
          <span className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Open a proposed task to accept it or decline with a reason.</span>
            {tab !== 'action' ? (
              <Button size="sm" variant="secondary" onClick={() => setTab('action')}>Review assignments</Button>
            ) : null}
          </span>
        </InlineNotice>
      ) : null}

      <div className="rs-panel">
        <Tabs tabs={tabs} value={tab} onChange={setTab} className="px-3 pt-1" ariaLabel="Assignment groups" />
        <div className="p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search venue, address or reference…" aria-label="Search assignments" className="pl-9" />
          </div>
        </div>
      </div>

      {filtered.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((assignment) => (
            <RiderAssignmentCard key={assignment.id} assignment={assignment} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Package}
          title={search ? 'No assignments match this search' : emptyCopy[0]}
          description={search ? 'Try a different venue, address or reference.' : emptyCopy[1]}
          action={search ? <button type="button" onClick={() => setSearch('')} className="text-xs font-bold text-accent">Clear search</button> : null}
        />
      )}

      <div className="rs-panel p-4 text-xs leading-5 text-muted">
        <p className="flex items-center gap-2 font-semibold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Assignment acceptance, pickup and delivery are trusted lifecycle actions.
        </p>
        <p className="mt-1">
          Pickup is blocked until the kitchen marks the order ready and you accept the assignment. This screen
          does not invent a new assignment or GPS position.
        </p>
      </div>
    </div>
  );
}
