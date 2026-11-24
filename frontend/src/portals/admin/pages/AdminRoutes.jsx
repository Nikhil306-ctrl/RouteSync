import { useMemo, useState } from 'react';
import { Bike, MapPin, Route as RouteIcon } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime, titleCase } from '../../../lib/format.js';
import { listAdminRoutes } from '../../../services/admin.js';
import { listRidersWithProfiles } from '../../../services/riders.js';

const routeStatuses = ['all', 'planned', 'active', 'completed', 'cancelled'];

export default function AdminRoutes() {
  useDocumentTitle('Delivery routes');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [routes, riders] = await Promise.all([listAdminRoutes(200), listRidersWithProfiles()]);
    return { routes, riders };
  }, []);

  const riderById = useMemo(
    () => new Map((data?.riders ?? []).map((rider) => [rider.id, rider])),
    [data],
  );

  const filtered = useMemo(
    () => (data?.routes ?? []).filter((route) => status === 'all' || route.status === status),
    [data, status],
  );

  if (loading) return <LoadingState rows={6} label="Loading delivery routes" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const activeRoutes = data.routes.filter((route) => route.status === 'active').length;
  const stops = data.routes.reduce((sum, route) => sum + (route.stops?.length ?? 0), 0);
  const totalDistance = data.routes.reduce((sum, route) => sum + Number(route.total_distance_meters ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Route operations"
        title="Delivery routes"
        description="Planned and active route records, ordered stops and persisted route metrics. No route is generated in the browser."
        actions={
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter route status" className="min-w-40">
            {routeStatuses.map((value) => <option key={value} value={value}>{value === 'all' ? 'All statuses' : titleCase(value)}</option>)}
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active routes" value={activeRoutes} helper={`${data.routes.length} total route records`} icon={RouteIcon} tone="green" />
        <StatCard label="Persisted stops" value={stops} helper="Across all route records" icon={MapPin} />
        <StatCard label="Recorded distance" value={`${(totalDistance / 1000).toFixed(1)} km`} helper="Sum of stored route distance values" icon={Bike} tone="orange" />
      </div>

      {filtered.length ? (
        <TableShell label="Delivery routes table">
          <THead>
            <tr>
              <TH>Route</TH>
              <TH>Delivery partner</TH>
              <TH>Status</TH>
              <TH>Planned start</TH>
              <TH>Stops</TH>
              <TH>Distance</TH>
              <TH>Duration</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((route) => {
              const rider = riderById.get(route.rider_id);
              return (
                <TR key={route.id} onClick={() => setSelected(route)}>
                  <TD><span className="font-mono text-xs font-bold text-ink">#{route.id.slice(0, 8)}</span></TD>
                  <TD>{rider?.profile?.full_name || 'Delivery partner'}</TD>
                  <TD><StatusBadge status={route.status} /></TD>
                  <TD className="whitespace-nowrap text-xs">{formatDateTime(route.planned_start)}</TD>
                  <TD className="tabular-nums">{route.stops?.length ?? 0}</TD>
                  <TD className="tabular-nums">{route.total_distance_meters == null ? '—' : `${(Number(route.total_distance_meters) / 1000).toFixed(1)} km`}</TD>
                  <TD className="tabular-nums">{route.total_duration_seconds == null ? '—' : `${Math.round(Number(route.total_duration_seconds) / 60)} min`}</TD>
                </TR>
              );
            })}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={RouteIcon}
          title={status === 'all' ? 'No delivery routes recorded' : `No ${status} routes`}
          description="Routes are created by the trusted scheduling and dispatch flow. This interface does not fabricate stops or optimization output."
          action={status !== 'all' ? <Button variant="secondary" onClick={() => setStatus('all')}>Show all routes</Button> : null}
        />
      )}

      <InlineNotice tone="warning" title="Map boundary">
        An interactive map is not rendered because the approved frontend dependency set does not
        include a map library. Stop order and stored route values are shown as records, not as a
        fabricated road path.
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Route detail"
        description={selected ? `Route ${selected.id.slice(0, 8)} · ${riderById.get(selected.rider_id)?.profile?.full_name || 'Delivery partner'}` : ''}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.status} />
              <span className="rounded-full border border-line bg-slate-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-slate-600">
                {selected.stops?.length ?? 0} stops
              </span>
            </div>

            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Planned start">{formatDateTime(selected.planned_start)}</DefinitionItem>
              <DefinitionItem label="Planned end">{formatDateTime(selected.planned_end)}</DefinitionItem>
              <DefinitionItem label="Stored distance">{selected.total_distance_meters == null ? '—' : `${(Number(selected.total_distance_meters) / 1000).toFixed(1)} km`}</DefinitionItem>
              <DefinitionItem label="Stored duration">{selected.total_duration_seconds == null ? '—' : `${Math.round(Number(selected.total_duration_seconds) / 60)} min`}</DefinitionItem>
              <DefinitionItem label="Scheduling run">{selected.scheduling_run_id ? <span className="font-mono text-xs">{selected.scheduling_run_id.slice(0, 8)}</span> : '—'}</DefinitionItem>
              <DefinitionItem label="Shift">{selected.shift_id ? <span className="font-mono text-xs">{selected.shift_id.slice(0, 8)}</span> : '—'}</DefinitionItem>
            </dl>

            <section>
              <h3 className="text-sm font-bold text-ink">Ordered stops</h3>
              {selected.stops?.length ? (
                <ol className="mt-2 space-y-2">
                  {[...selected.stops].sort((a, b) => a.stop_sequence - b.stop_sequence).map((stop) => (
                    <li key={stop.id} className="flex gap-3 rounded-lg border border-line p-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warm text-xs font-bold text-accent">
                        {stop.stop_sequence}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{titleCase(stop.stop_type)}</p>
                          <StatusBadge status={stop.status} dot={false} />
                        </div>
                        <p className="mt-1 text-sm text-ink">{stop.address_line || 'Address not recorded'}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          Planned {formatDateTime(stop.planned_arrival)}
                          {stop.latitude != null && stop.longitude != null ? ` · ${Number(stop.latitude).toFixed(4)}, ${Number(stop.longitude).toFixed(4)}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-line p-4 text-xs text-muted">
                  No stops are attached to this route record.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
