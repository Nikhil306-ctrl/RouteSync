import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bike,
  CalendarClock,
  ExternalLink,
  MapPin,
  Navigation,
  Route as RouteIcon,
  ShieldAlert,
  Timer,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatDateTime, titleCase } from '../../../lib/format.js';
import { destinationMapUrl } from '../../../lib/maps.js';
import { getRider, listRiderRoutes } from '../../../services/riders.js';

export default function RiderRoute() {
  useDocumentTitle('Route records');
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);

  const { data, loading, error, reload } = useAsyncData(async () => {
    const rider = await getRider(user.id);
    if (!rider) return { rider: null, routes: [] };
    const routes = await listRiderRoutes(user.id);
    return { rider, routes };
  }, [user.id]);

  const activeRoute = useMemo(
    () => (data?.routes ?? []).find((route) => route.status === 'active') ?? null,
    [data],
  );

  if (loading) return <LoadingState rows={4} label="Loading route records" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.rider) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Delivery partner" title="Route" />
        <EmptyState icon={Bike} title="Rider profile not provisioned" description="Ask a dispatcher to link a rider record to your account." />
      </div>
    );
  }

  const totalStops = data.routes.reduce((sum, route) => sum + (route.stops?.length ?? 0), 0);
  const completedStops = data.routes.reduce(
    (sum, route) => sum + (route.stops ?? []).filter((stop) => ['arrived', 'completed'].includes(stop.status)).length,
    0,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="My route"
        title="Route records"
        description="Planned routes and ordered stops stored by dispatch. Navigation opens your map app; RouteSync does not draw a live route line."
        actions={
          <Link
            to="/delivery-partner/assignments"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <RouteIcon className="h-3.5 w-3.5" aria-hidden="true" /> Assignments
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Routes" value={data.routes.length} helper="Stored route records" icon={RouteIcon} tone="orange" />
        <StatCard label="Planned stops" value={totalStops} helper="Across all routes" icon={MapPin} />
        <StatCard label="Stops reached" value={completedStops} helper="Marked arrived or completed" icon={CalendarClock} tone="green" />
        <StatCard label="Active route" value={activeRoute ? 'Yes' : 'None'} helper={activeRoute ? 'In progress now' : 'No active route record'} icon={Navigation} />
      </div>

      {activeRoute ? (
        <Card>
          <CardHeader title="Current route" description="The active route assigned to your rider profile." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={activeRoute.status} />
              <span className="text-xs font-semibold text-slate-600">{activeRoute.stops?.length ?? 0} stops</span>
              {activeRoute.planned_start ? (
                <span className="text-xs text-muted">Starts {formatDateTime(activeRoute.planned_start)}</span>
              ) : null}
            </div>
            {activeRoute.total_distance_meters != null ? (
              <p className="text-xs text-muted">
                Stored plan: {(Number(activeRoute.total_distance_meters) / 1000).toFixed(1)} km
                {activeRoute.total_duration_seconds != null ? ` · ${Math.round(Number(activeRoute.total_duration_seconds) / 60)} min` : ''}
              </p>
            ) : null}
            <RouteStops route={activeRoute} />
          </CardBody>
        </Card>
      ) : null}

      {data.routes.length ? (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-ink">All route records</h2>
          <TableShell label="Route records">
            <THead>
              <tr>
                <TH>Route</TH>
                <TH>Status</TH>
                <TH>Planned start</TH>
                <TH>Stops</TH>
                <TH>Distance</TH>
              </tr>
            </THead>
            <TBody>
              {data.routes.map((route) => (
                <TR key={route.id} onClick={() => setSelected(route)}>
                  <TD><span className="font-mono text-xs font-bold text-ink">#{route.id.slice(0, 8)}</span></TD>
                  <TD><StatusBadge status={route.status} /></TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(route.planned_start)}</TD>
                  <TD className="tabular-nums">{route.stops?.length ?? 0}</TD>
                  <TD className="tabular-nums text-xs">
                    {route.total_distance_meters == null ? '—' : `${(Number(route.total_distance_meters) / 1000).toFixed(1)} km`}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableShell>
        </div>
      ) : (
        <EmptyState
          icon={RouteIcon}
          title="No route records yet"
          description="Routes are created by the trusted scheduling and dispatch flow. Until then there is no route to display — nothing is invented here."
        />
      )}

      <InlineNotice tone="warning" title="No live tracking">
        <span className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          A map is not rendered inside RouteSync. Stop coordinates only open an external map application, and your
          stored location is not streamed as a live position in this phase.
        </span>
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Route detail"
        description={selected ? `Route ${selected.id.slice(0, 8)} · ${titleCase(selected.status)}` : ''}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Planned start">{formatDateTime(selected.planned_start)}</DefinitionItem>
              <DefinitionItem label="Planned end">{formatDateTime(selected.planned_end)}</DefinitionItem>
              <DefinitionItem label="Stored distance">
                {selected.total_distance_meters == null ? '—' : `${(Number(selected.total_distance_meters) / 1000).toFixed(1)} km`}
              </DefinitionItem>
              <DefinitionItem label="Stored duration">
                {selected.total_duration_seconds == null ? '—' : `${Math.round(Number(selected.total_duration_seconds) / 60)} min`}
              </DefinitionItem>
            </dl>
            <RouteStops route={selected} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RouteStops({ route }) {
  const stops = [...(route.stops ?? [])].sort((a, b) => a.stop_sequence - b.stop_sequence);

  if (!stops.length) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-white p-4 text-xs text-muted">
        No stops are attached to this route record.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {stops.map((stop) => {
        const mapUrl = destinationMapUrl(stop.latitude, stop.longitude, stop.address_line || 'Route stop');
        return (
          <li key={stop.id} className="rounded-lg border border-line bg-white p-3">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warm text-xs font-bold text-accent">
                {stop.stop_sequence}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-wide text-slate-500">{titleCase(stop.stop_type)}</p>
                  <StatusBadge status={stop.status} dot={false} />
                </div>
                <p className="mt-1 text-sm font-semibold text-ink">{stop.address_line || 'Address not recorded'}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Planned {formatDateTime(stop.planned_arrival)}
                </p>
              </div>
              {mapUrl ? (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
