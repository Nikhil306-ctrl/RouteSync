import { useMemo, useState } from 'react';
import { Bike, CircleAlert, MapPin, Radio, RefreshCw, Search, Users } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import MapCanvas from '../../../components/map/MapCanvas.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh.js';
import { fetchAdminRiderTracking } from '../../../services/lifecycle.js';
import { formatDateTime, formatRelative, initials, titleCase } from '../../../lib/format.js';

const scopes = [
  { value: 'all', label: 'All delivery partners' },
  { value: 'active', label: 'On an active assignment' },
  { value: 'sharing', label: 'Sharing a recent location' },
  { value: 'stale', label: 'Location older than 5 minutes' },
];

function locationColor(rider) {
  if (!rider.location) return '#94a3b8';
  if (rider.location.stale) return '#94a3b8';
  if (rider.assignment) return '#2563eb';
  return rider.is_available ? '#059669' : '#f97316';
}

function LocationSummary({ rider }) {
  if (!rider.location) {
    return <span className="text-xs text-muted">No location recorded</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${rider.location.stale ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        {rider.location.stale ? 'Stale' : 'Recent'}
      </span>
      <span className="text-[0.68rem] text-muted">{formatRelative(rider.location.recorded_at)}</span>
    </span>
  );
}

export default function AdminLiveTracking() {
  useDocumentTitle('Live delivery tracking');
  const [scope, setScope] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const { data, loading, error, reload, reloadQuiet } = useAsyncData(
    () => fetchAdminRiderTracking(),
    [],
  );

  useRealtimeRefresh({
    channelName: 'admin-live-tracking',
    tables: [
      { table: 'riders' },
      { table: 'rider_locations' },
      { table: 'assignments' },
    ],
    refresh: reloadQuiet,
    intervalMs: 15_000,
  });

  const riders = data?.riders ?? [];

  const located = useMemo(() => riders.filter((rider) => rider.location), [riders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return riders.filter((rider) => {
      if (scope === 'active' && !rider.assignment) return false;
      if (scope === 'sharing' && (!rider.location || rider.location.stale)) return false;
      if (scope === 'stale' && (!rider.location || !rider.location.stale)) return false;
      if (!query) return true;
      return [
        rider.full_name,
        rider.email,
        rider.phone,
        rider.vehicle_number,
        rider.assignment?.order_id,
        rider.assignment?.order?.delivery_address_line,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [riders, scope, search]);

  const selected = useMemo(
    () => riders.find((rider) => rider.id === selectedId) ?? located[0] ?? riders[0] ?? null,
    [riders, selectedId, located],
  );

  if (loading) return <LoadingState rows={6} label="Loading delivery partner locations" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const sharing = located.filter((rider) => !rider.location.stale).length;
  const stale = located.filter((rider) => rider.location.stale).length;
  const onAssignment = riders.filter((rider) => rider.assignment).length;

  const mapPoints = located.map((rider) => ({
    id: rider.id,
    latitude: rider.location.latitude,
    longitude: rider.location.longitude,
    label: initials(rider.full_name),
    color: locationColor(rider),
    title: rider.full_name || 'Delivery partner',
    popup: (
      <span className="block text-xs">
        <span className="block font-bold text-ink">{rider.full_name || 'Delivery partner'}</span>
        <span className="block text-slate-600">
          {rider.location.stale ? 'Last known' : 'Recent'} · {formatRelative(rider.location.recorded_at)}
        </span>
        {rider.assignment ? (
          <span className="mt-0.5 block text-slate-600">Order #{rider.assignment.order_id.slice(0, 8)}</span>
        ) : null}
      </span>
    ),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Live operations"
        title="Delivery partner tracking"
        description="Latest locations recorded through the trusted rider location endpoint, joined to the current assignment. The browser does not estimate a position when no record exists."
        actions={
          <>
            <Select value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Filter delivery partners" className="min-w-52">
              {scopes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <Button variant="secondary" icon={RefreshCw} onClick={reload}>Refresh</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Delivery partners" value={riders.length} helper={`${onAssignment} on a current assignment`} icon={Bike} tone="orange" />
        <StatCard label="Recent locations" value={sharing} helper="Recorded within the last 5 minutes" icon={Radio} tone="green" />
        <StatCard label="Stale locations" value={stale} helper="Older than 5 minutes; not presented as live" icon={CircleAlert} />
        <StatCard label="No location" value={riders.length - located.length} helper="No GPS, manual or simulated record" icon={MapPin} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader
            title="Latest known positions"
            description={`${located.length} of ${riders.length} delivery partners have a recorded location. Grey pins are older than five minutes.`}
          />
          <CardBody>
            {located.length ? (
              <MapCanvas
                points={mapPoints}
                height={390}
                description="Map of the latest recorded delivery partner locations"
              />
            ) : (
              <EmptyState
                compact
                icon={MapPin}
                title="No location records yet"
                description="Locations appear after a delivery partner shares a GPS, manual or simulated position from the delivery partner portal."
              />
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-[0.68rem] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-600" aria-hidden="true" /> On assignment</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" /> Available</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" aria-hidden="true" /> Unavailable</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden="true" /> Stale / no record</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Selected delivery partner" description="Recorded fields only." />
          {selected ? (
            <CardBody className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warm text-sm font-bold text-accent">
                  {initials(selected.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{selected.full_name || 'Delivery partner'}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[titleCase(selected.vehicle_type), selected.vehicle_number].filter(Boolean).join(' · ') || 'Vehicle not recorded'}
                  </p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${selected.is_available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  {selected.is_available ? 'Available' : 'Unavailable'}
                </span>
              </div>

              <dl className="grid gap-3 rounded-lg border border-line bg-slate-50 p-3 sm:grid-cols-2">
                <DefinitionItem label="Verification">{titleCase(selected.verification_status ?? 'unknown')}</DefinitionItem>
                <DefinitionItem label="Phone">{selected.phone || 'Not recorded'}</DefinitionItem>
                <DefinitionItem label="Latest source">{selected.location ? titleCase(selected.location.source ?? 'unknown') : '—'}</DefinitionItem>
                <DefinitionItem label="Recorded">{selected.location ? formatDateTime(selected.location.recorded_at) : '—'}</DefinitionItem>
                <DefinitionItem label="Coordinates">
                  {selected.location
                    ? `${Number(selected.location.latitude).toFixed(5)}, ${Number(selected.location.longitude).toFixed(5)}`
                    : '—'}
                </DefinitionItem>
                <DefinitionItem label="Accuracy">
                  {selected.location?.accuracy_meters == null
                    ? 'Not reported'
                    : `±${Math.round(Number(selected.location.accuracy_meters))} m`}
                </DefinitionItem>
              </dl>

              {selected.assignment ? (
                <div className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selected.assignment.status} />
                    {selected.assignment.order?.status ? <StatusBadge status={selected.assignment.order.status} dot={false} /> : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">Order #{selected.assignment.order_id.slice(0, 8)}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted">
                    {selected.assignment.order?.delivery_address_line || 'Delivery address not returned'}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Planned delivery: {formatDateTime(selected.assignment.planned_delivery_at)}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line p-3 text-xs leading-5 text-muted">
                  No current assignment is attached to this delivery partner.
                </div>
              )}
            </CardBody>
          ) : (
            <CardBody>
              <p className="text-sm text-muted">Select a delivery partner to inspect recorded fields.</p>
            </CardBody>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Tracking records"
          description="Search and filter the records returned by the admin tracking endpoint."
          action={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, vehicle or order"
                aria-label="Search tracking records"
                className="pl-9"
              />
            </div>
          }
        />
        {filtered.length ? (
          <TableShell className="rounded-none border-x-0 border-b-0">
            <THead>
              <tr>
                <TH>Delivery partner</TH>
                <TH>Availability</TH>
                <TH>Location</TH>
                <TH>Source</TH>
                <TH>Current assignment</TH>
                <TH>Recorded</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((rider) => (
                <TR
                  key={rider.id}
                  onClick={() => setSelectedId(rider.id)}
                  className={selected?.id === rider.id ? 'bg-orange-50/60' : undefined}
                >
                  <TD>
                    <span className="block text-sm font-semibold text-ink">{rider.full_name || 'Delivery partner'}</span>
                    <span className="block text-xs text-muted">{rider.vehicle_number || titleCase(rider.vehicle_type ?? '')}</span>
                  </TD>
                  <TD>
                    <span className={`text-xs font-semibold ${rider.is_available ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {rider.is_available ? 'Available' : 'Unavailable'}
                    </span>
                  </TD>
                  <TD>
                    {rider.location ? (
                      <span className="block">
                        <span className="font-mono text-[0.68rem] text-slate-600">
                          {Number(rider.location.latitude).toFixed(4)}, {Number(rider.location.longitude).toFixed(4)}
                        </span>
                        <LocationSummary rider={rider} />
                      </span>
                    ) : (
                      <LocationSummary rider={rider} />
                    )}
                  </TD>
                  <TD className="text-xs">{rider.location ? titleCase(rider.location.source ?? 'unknown') : '—'}</TD>
                  <TD>
                    {rider.assignment ? (
                      <span>
                        <span className="block font-mono text-xs">#{rider.assignment.order_id.slice(0, 8)}</span>
                        <StatusBadge status={rider.assignment.status} dot={false} />
                      </span>
                    ) : (
                      <span className="text-xs text-muted">None</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted">
                    {rider.location ? formatDateTime(rider.location.recorded_at) : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableShell>
        ) : (
          <div className="p-5">
            <EmptyState
              compact
              icon={Users}
              title="No matching delivery partners"
              description="Change the search text or filter. Empty results are not replaced with sample records."
              action={scope !== 'all' || search ? <Button size="sm" variant="secondary" onClick={() => { setScope('all'); setSearch(''); }}>Clear filters</Button> : null}
            />
          </div>
        )}
      </Card>

      <InlineNotice tone="warning" title="Location scope">
        Only positions written through the trusted rider location endpoint are shown. GPS sharing runs only while the
        delivery partner has the sharing control active; simulated and manual positions are labelled by their source and
        are never presented as a live GPS track.
      </InlineNotice>
    </div>
  );
}
