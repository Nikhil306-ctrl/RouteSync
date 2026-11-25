import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  CalendarDays,
  CheckCircle2,
  LocateFixed,
  MapPin,
  Package,
  ShieldCheck,
  Signal,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import RiderAssignmentCard from '../components/RiderAssignmentCard.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDate, formatDateTime, formatTime } from '../../../lib/format.js';
import { getRider, listRiderAssignments, listRiderShifts } from '../../../services/riders.js';
import { setRiderAvailability } from '../../../services/lifecycle.js';

export default function RiderDashboard() {
  useDocumentTitle('Delivery partner overview');
  const { user, profile } = useAuth();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState('');

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    const rider = await getRider(user.id);
    if (!rider) return { rider: null, shifts: [], assignments: [] };
    const [shifts, assignments] = await Promise.all([
      listRiderShifts(user.id),
      listRiderAssignments(user.id),
    ]);
    return { rider, shifts, assignments };
  }, [user.id]);

  const currentAssignments = useMemo(
    () =>
      (data?.assignments ?? []).filter(
        (assignment) => assignment.is_current && ['proposed', 'accepted', 'active'].includes(assignment.status),
      ),
    [data],
  );

  const completedDeliveries = useMemo(
    () =>
      (data?.assignments ?? []).filter(
        (assignment) => assignment.status === 'completed' || assignment.order?.status === 'delivered',
      ),
    [data],
  );

  const nextShift = useMemo(() => {
    const shifts = [...(data?.shifts ?? [])]
      .filter((shift) => ['scheduled', 'active'].includes(shift.status))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const now = Date.now();
    return shifts.find((shift) => new Date(shift.ends_at).getTime() >= now) ?? shifts[0] ?? null;
  }, [data]);

  const toggleAvailability = async () => {
    if (!data?.rider) return;
    setToggling(true);
    setToggleError('');
    try {
      const response = await setRiderAvailability(!data.rider.is_available);
      setData((current) => ({ ...current, rider: response.rider }));
    } catch (availabilityError) {
      setToggleError(availabilityError.message ?? 'Unable to update availability.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <LoadingState rows={4} label="Loading your delivery day" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.rider) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Delivery partner" title={`Hello, ${profile?.full_name?.split(' ')[0] || 'rider'}`} />
        <EmptyState
          icon={Bike}
          title="Rider profile not provisioned"
          description="Your account does not have a linked rider record yet. Ask a dispatcher to complete rider provisioning."
        />
      </div>
    );
  }

  const rider = data.rider;
  const recent = data.assignments.slice(0, 3);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="My delivery day"
        title={`Hello, ${profile?.full_name?.split(' ')[0] || 'rider'}`}
        description="Your availability, tasks and shift in one mobile-first view."
        actions={<LinkButton to="/delivery-partner/assignments" icon={Package}>Assignments</LinkButton>}
      />

      {toggleError ? <InlineNotice tone="danger">{toggleError}</InlineNotice> : null}

      <div className={`rounded-xl border p-4 sm:p-5 ${rider.is_available ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${rider.is_available ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
              <Signal className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-display text-base font-bold text-ink">{rider.is_available ? 'You are available' : 'You are unavailable'}</p>
              <p className="mt-0.5 text-xs leading-5 text-slate-600">
                {rider.is_available
                  ? 'Dispatch can see your availability flag for future assignment planning.'
                  : 'Switch to available when you are ready to receive assignments.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={rider.is_available}
            onClick={toggleAvailability}
            disabled={toggling}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition ${
              rider.is_available
                ? 'border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50'
                : 'border-transparent bg-ink text-white hover:bg-ink-soft'
            } disabled:opacity-60`}
          >
            {toggling ? 'Updating…' : rider.is_available ? 'Go unavailable' : 'Go available'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-black/5 pt-3 text-[0.68rem] font-semibold text-slate-500">
          <StatusBadge status={rider.verification_status} />
          <span className="capitalize">{rider.vehicle_type} · {rider.vehicle_number || 'No vehicle number'}</span>
          <span>Capacity {rider.max_concurrent_orders}</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Current tasks" value={currentAssignments.length} helper="Accepted or proposed assignments" icon={Package} tone="orange" />
        <StatCard label="Next shift" value={nextShift ? formatDate(nextShift.starts_at) : 'None'} helper={nextShift ? `${formatTime(nextShift.starts_at)} – ${formatTime(nextShift.ends_at)}` : 'No scheduled shift'} icon={CalendarDays} />
        <StatCard label="Completed" value={completedDeliveries.length} helper="Historical assignment records" icon={CheckCircle2} tone="green" />
        <StatCard label="Stored location" value={rider.current_latitude != null ? 'Recorded' : 'None'} helper={rider.last_location_at ? formatDateTime(rider.last_location_at) : 'No location timestamp'} icon={LocateFixed} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader
            title="Current assignments"
            description="Assignments eligible for your active delivery work."
            action={<Link to="/delivery-partner/assignments" className="inline-flex items-center gap-1 text-xs font-bold text-accent">View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
          />
          <div className="p-4">
            {currentAssignments.length ? (
              <div className="space-y-3">
                {currentAssignments.map((assignment) => (
                  <RiderAssignmentCard key={assignment.id} assignment={assignment} compact />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={Package}
                title="No current assignment"
                description="When dispatch assigns an order to you, its pickup and delivery details will appear here."
              />
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Shift" description="Shift records are written by dispatch." />
            <CardBody>
              {nextShift ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={nextShift.status} />
                    <span className="text-xs text-muted">{nextShift.break_minutes} min break</span>
                  </div>
                  <div>
                    <p className="font-display text-lg font-bold text-ink">{formatTime(nextShift.starts_at)} – {formatTime(nextShift.ends_at)}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDate(nextShift.starts_at)}</p>
                  </div>
                  {nextShift.notes ? <p className="rounded-lg bg-slate-50 p-2.5 text-xs leading-5 text-slate-600">{nextShift.notes}</p> : null}
                  <Link to="/delivery-partner/shifts" className="inline-flex items-center gap-1 text-xs font-bold text-accent">All shifts <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                </div>
              ) : (
                <p className="text-sm text-muted">No scheduled shift is recorded.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tracking status" description="What this interface can show." />
            <CardBody className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Live GPS tracking is not active. A stored location value is not the same as a live
                position, and no route path is fabricated here.
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                Location history is accessible only to you and an administrator.
              </div>
              <Link to="/delivery-partner/route" className="inline-flex items-center gap-1 text-xs font-bold text-accent">Route records <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </CardBody>
          </Card>
        </div>
      </div>

      {recent.length ? (
        <Card>
          <CardHeader title="Recent assignment records" description="Latest rows from your rider assignment history." />
          <div className="divide-y divide-line">
            {recent.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{assignment.order?.restaurant?.name || 'Assignment'}</p>
                  <p className="text-xs text-muted">{formatDateTime(assignment.created_at)} · {assignment.order?.delivery_address_line || 'No address'}</p>
                </div>
                <StatusBadge status={assignment.status} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
