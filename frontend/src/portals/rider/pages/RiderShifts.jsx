import { useMemo } from 'react';
import { CalendarDays, Coffee, Clock3, ShieldAlert } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDate, formatTime, isSameDay } from '../../../lib/format.js';
import { getRider, listRiderShifts } from '../../../services/riders.js';

export default function RiderShifts() {
  useDocumentTitle('Shifts');
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsyncData(async () => {
    const rider = await getRider(user.id);
    if (!rider) return { rider: null, shifts: [] };
    const shifts = await listRiderShifts(user.id);
    return { rider, shifts };
  }, [user.id]);

  const groups = useMemo(() => {
    const shifts = data?.shifts ?? [];
    const now = Date.now();
    return {
      today: shifts.filter((shift) => isSameDay(shift.starts_at)),
      upcoming: shifts.filter(
        (shift) => !isSameDay(shift.starts_at) && new Date(shift.starts_at).getTime() > now,
      ),
      past: shifts
        .filter((shift) => !isSameDay(shift.starts_at) && new Date(shift.starts_at).getTime() <= now)
        .reverse(),
    };
  }, [data]);

  if (loading) return <LoadingState rows={3} label="Loading shifts" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.rider) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Delivery partner" title="Shifts" />
        <EmptyState icon={CalendarDays} title="Rider profile not provisioned" description="Ask a dispatcher to link a rider record to your account." />
      </div>
    );
  }

  const activeShift = groups.today.find((shift) => shift.status === 'active') ?? null;
  const totalBreak = data.shifts.reduce((sum, shift) => sum + Number(shift.break_minutes ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="My schedule"
        title="Shifts"
        description="Shift windows recorded by dispatch. Shift creation and changes are protected operational actions."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today" value={groups.today.length} helper={activeShift ? 'One shift active' : 'Scheduled today'} icon={CalendarDays} tone="orange" />
        <StatCard label="Upcoming" value={groups.upcoming.length} helper="Future shift records" icon={Clock3} />
        <StatCard label="Past shifts" value={groups.past.length} helper="Recorded history" icon={Coffee} />
        <StatCard label="Break minutes" value={totalBreak} helper="Sum of stored break values" icon={Coffee} tone="green" />
      </div>

      {activeShift ? (
        <Card>
          <CardHeader title="Active shift" description="This shift window is currently in progress." />
          <CardBody>
            <ShiftRow shift={activeShift} highlight />
          </CardBody>
        </Card>
      ) : null}

      {data.shifts.length ? (
        <div className="space-y-4">
          {[
            ['Today', groups.today],
            ['Upcoming', groups.upcoming],
            ['Past', groups.past],
          ].map(([label, shifts]) => (
            <section key={label}>
              <h2 className="mb-2 text-sm font-bold text-ink">{label}</h2>
              {shifts.length ? (
                <div className="space-y-2">
                  {shifts.map((shift) => <ShiftRow key={shift.id} shift={shift} />)}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-line bg-white px-4 py-5 text-xs text-muted">
                  No {label.toLowerCase()} shifts recorded.
                </p>
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="No shifts scheduled"
          description="Shift records appear here after dispatch schedules them. You cannot create your own shift from this interface."
        />
      )}

      <InlineNotice tone="neutral" title="Shift control">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Rider shift writes belong to trusted dispatch. Availability is the only scheduling signal you can change
          yourself, and it lives on your rider profile.
        </span>
      </InlineNotice>
    </div>
  );
}

function ShiftRow({ shift, highlight = false }) {
  return (
    <div className={`rounded-lg border p-3.5 ${highlight ? 'border-emerald-200 bg-emerald-50/60' : 'border-line bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={shift.status} />
          <span className="text-xs font-semibold text-slate-600">{formatDate(shift.starts_at)}</span>
        </div>
        <p className="font-display text-sm font-bold text-ink">
          {formatTime(shift.starts_at)} – {formatTime(shift.ends_at)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Coffee className="h-3.5 w-3.5" aria-hidden="true" /> {shift.break_minutes} min break
        </span>
        <span className="font-mono text-[0.68rem]">#{shift.id.slice(0, 8)}</span>
      </div>
      {shift.notes ? (
        <p className="mt-2 rounded-md bg-white/70 px-2.5 py-2 text-xs leading-5 text-slate-600">{shift.notes}</p>
      ) : null}
    </div>
  );
}
