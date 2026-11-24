import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bike,
  CalendarClock,
  ClipboardList,
  MapPin,
  Route as RouteIcon,
  Store,
  TriangleAlert,
  Users,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime, formatWindow } from '../../../lib/format.js';
import { listOrders, orderMetrics } from '../../../services/orders.js';
import { listAdminAssignments, listRidersWithProfiles } from '../../../services/riders.js';
import { listAdminRestaurants } from '../../../services/restaurants.js';
import { listConstraintViolations, listSchedulingRuns } from '../../../services/admin.js';

export default function AdminDashboard() {
  useDocumentTitle('Operations overview');
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [orders, riders, restaurants, runs, violations, assignments] = await Promise.all([
      listOrders({ limit: 200 }),
      listRidersWithProfiles(),
      listAdminRestaurants(),
      listSchedulingRuns(20),
      listConstraintViolations(100),
      listAdminAssignments(100),
    ]);

    return { orders, riders, restaurants, runs, violations, assignments };
  }, []);

  if (loading) {
    return (
      <div className="space-y-5">
        <LoadingState rows={3} label="Loading the operations overview" />
        <LoadingState rows={5} label="Loading live orders" />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const metrics = orderMetrics(data.orders);
  const availableRiders = data.riders.filter((rider) => rider.is_available).length;
  const activeRestaurants = data.restaurants.filter((restaurant) => restaurant.is_active).length;
  const openViolations = data.violations.filter((violation) => !violation.is_resolved).length;
  const currentAssignments = data.assignments.filter((assignment) => assignment.is_current);
  const recentOrders = [...data.orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dispatcher workspace"
        title="Operations overview"
        description="Live counts and recent records from the tables your admin role is allowed to read."
        actions={
          <>
            <LinkButton to="/admin/dispatch" variant="secondary" icon={CalendarClock}>Dispatch board</LinkButton>
            <LinkButton to="/admin/orders" icon={ClipboardList}>Manage orders</LinkButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active orders" value={metrics.active} helper={`${metrics.total} total orders visible`} icon={ClipboardList} tone="orange" />
        <StatCard label="Riders available" value={`${availableRiders}/${data.riders.length}`} helper="Availability flag stored on rider records" icon={Bike} tone="green" />
        <StatCard label="Restaurants active" value={`${activeRestaurants}/${data.restaurants.length}`} helper="Catalogue visibility follows is_active" icon={Store} />
        <StatCard label="Open conflicts" value={openViolations} helper={`${data.violations.length} constraint records loaded`} icon={TriangleAlert} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader
            title="Recent orders"
            description="Newest order records visible to the dispatcher account."
            action={<Link to="/admin/orders" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
          />
          {recentOrders.length ? (
            <div className="divide-y divide-line">
              {recentOrders.map((order) => (
                <Link key={order.id} to="/admin/orders" className="flex flex-col gap-2 px-4 py-3.5 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-bold text-slate-500">#{order.id.slice(0, 8)}</p>
                      <StatusBadge status={order.status} />
                      {order.priority === 'urgent' || order.priority === 'high' ? <StatusBadge status={order.priority} dot={false} /> : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold text-ink">{order.restaurant?.name ?? 'Restaurant'}</p>
                    <p className="text-xs text-muted">{order.delivery_address_line}</p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-xs font-semibold text-slate-600">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDateTime(order.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                compact
                icon={ClipboardList}
                title="No orders yet"
                description="Orders will appear here after they are created through the trusted order lifecycle."
                action={<LinkButton to="/admin/dispatch" size="sm" variant="secondary">Open dispatch</LinkButton>}
              />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Dispatch readiness" description="What is connected right now." />
            <CardBody className="space-y-3">
              {[
                {
                  label: 'Scheduling engine',
                  value: data.runs.length ? `${data.runs.length} run record${data.runs.length === 1 ? '' : 's'}` : 'Phase 5 engine not connected',
                  tone: data.runs.length ? 'text-sky-700' : 'text-amber-700',
                  icon: CalendarClock,
                },
                {
                  label: 'Active assignments',
                  value: `${currentAssignments.length} current`,
                  tone: 'text-slate-700',
                  icon: RouteIcon,
                },
                {
                  label: 'Live tracking',
                  value: 'Authorized tracking surface pending',
                  tone: 'text-slate-600',
                  icon: MapPin,
                },
                {
                  label: 'Resource records',
                  value: `${data.riders.length} riders · ${data.restaurants.length} kitchens`,
                  tone: 'text-slate-700',
                  icon: Users,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-3 rounded-lg border border-line p-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink">{item.label}</p>
                      <p className={`mt-0.5 text-xs leading-5 ${item.tone}`}>{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Queue snapshot" description="Statuses that need a dispatcher's attention." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ['Pending', metrics.pending],
                  ['In preparation', metrics.preparing],
                  ['Ready', metrics.ready],
                  ['Cancelled', metrics.cancelled],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className="mt-1 font-display text-xl font-bold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              <Link to="/admin/orders" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">
                Review the queue <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/admin/riders" className="group rounded-xl border border-line bg-white p-4 transition hover:border-orange-200 hover:bg-warm">
          <Bike className="h-5 w-5 text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-ink">Delivery partner capacity</p>
          <p className="mt-1 text-xs leading-5 text-muted">{availableRiders} available · {data.riders.length - availableRiders} unavailable</p>
        </Link>
        <Link to="/admin/restaurants" className="group rounded-xl border border-line bg-white p-4 transition hover:border-orange-200 hover:bg-warm">
          <Store className="h-5 w-5 text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-ink">Restaurant network</p>
          <p className="mt-1 text-xs leading-5 text-muted">{activeRestaurants} active kitchens in the catalogue</p>
        </Link>
        <Link to="/admin/violations" className="group rounded-xl border border-line bg-white p-4 transition hover:border-orange-200 hover:bg-warm">
          <TriangleAlert className="h-5 w-5 text-accent" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-ink">Constraint review</p>
          <p className="mt-1 text-xs leading-5 text-muted">{openViolations} unresolved · {data.violations.length} total records</p>
        </Link>
      </div>
    </div>
  );
}
