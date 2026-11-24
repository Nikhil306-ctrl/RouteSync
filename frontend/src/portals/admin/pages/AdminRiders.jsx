import { useMemo, useState } from 'react';
import { Bike, MapPin, Search, ShieldCheck, Users, X } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime, initials, titleCase } from '../../../lib/format.js';
import { listAdminAssignments, listRidersWithProfiles } from '../../../services/riders.js';

export default function AdminRiders() {
  useDocumentTitle('Delivery partners');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [verification, setVerification] = useState('all');
  const [selected, setSelected] = useState(null);

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [riders, assignments] = await Promise.all([
      listRidersWithProfiles(),
      listAdminAssignments(250),
    ]);
    return { riders, assignments };
  }, []);

  const currentAssignments = useMemo(() => {
    const map = new Map();
    for (const assignment of data?.assignments ?? []) {
      if (assignment.is_current) {
        map.set(assignment.rider_id, (map.get(assignment.rider_id) ?? 0) + 1);
      }
    }
    return map;
  }, [data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.riders ?? []).filter((rider) => {
      if (availability === 'available' && !rider.is_available) return false;
      if (availability === 'unavailable' && rider.is_available) return false;
      if (verification !== 'all' && rider.verification_status !== verification) return false;
      if (!query) return true;
      return [rider.profile?.full_name, rider.profile?.email, rider.vehicle_number, rider.vehicle_type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, availability, verification]);

  if (loading) return <LoadingState rows={6} label="Loading delivery partners" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const available = data.riders.filter((rider) => rider.is_available).length;
  const verified = data.riders.filter((rider) => rider.verification_status === 'verified').length;
  const active = [...currentAssignments.values()].reduce((sum, count) => sum + count, 0);
  const hasFilters = search || availability !== 'all' || verification !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Resource network"
        title="Delivery partners"
        description="Availability, verification and vehicle records from the riders table. Capacity and verification changes require trusted provisioning."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Available now" value={`${available}/${data.riders.length}`} helper="Stored availability flag" icon={Bike} tone="green" />
        <StatCard label="Verified" value={verified} helper="Verification status is protected" icon={ShieldCheck} />
        <StatCard label="Current assignments" value={active} helper="Current assignment rows" icon={Users} tone="orange" />
      </div>

      <Card>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_180px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email or vehicle…"
                aria-label="Search delivery partners"
                className="pl-9"
              />
            </div>
            <Select value={availability} onChange={(event) => setAvailability(event.target.value)} aria-label="Filter availability">
              <option value="all">All availability</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </Select>
            <Select value={verification} onChange={(event) => setVerification(event.target.value)} aria-label="Filter verification">
              <option value="all">All verification</option>
              {['pending', 'verified', 'rejected', 'suspended'].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setAvailability('all'); setVerification('all'); }}>Clear</Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length ? (
        <TableShell label="Delivery partner table">
          <THead>
            <tr>
              <TH>Partner</TH>
              <TH>Vehicle</TH>
              <TH>Capacity</TH>
              <TH>Availability</TH>
              <TH>Verification</TH>
              <TH>Assignments</TH>
              <TH>Last location</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((rider) => (
              <TR key={rider.id} onClick={() => setSelected(rider)}>
                <TD>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warm text-[0.65rem] font-bold text-accent">
                      {initials(rider.profile?.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{rider.profile?.full_name || 'Delivery partner'}</p>
                      <p className="max-w-[190px] truncate text-xs text-muted">{rider.profile?.email}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <p className="font-semibold capitalize text-ink">{rider.vehicle_type}</p>
                  <p className="text-xs text-muted">{rider.vehicle_number || 'No number'}</p>
                </TD>
                <TD>{rider.max_concurrent_orders}</TD>
                <TD>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${rider.is_available ? 'text-emerald-700' : 'text-slate-500'}`}>
                    <span className={`h-2 w-2 rounded-full ${rider.is_available ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                    {rider.is_available ? 'Available' : 'Unavailable'}
                  </span>
                </TD>
                <TD><StatusBadge status={rider.verification_status} /></TD>
                <TD className="tabular-nums">{currentAssignments.get(rider.id) ?? 0} current</TD>
                <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(rider.last_location_at)}</TD>
              </TR>
            ))}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={Bike}
          title={hasFilters ? 'No riders match these filters' : 'No delivery partners provisioned'}
          description={hasFilters ? 'Clear the filters to review the full rider network.' : 'Rider profiles are created through trusted provisioning, not customer registration.'}
          action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(''); setAvailability('all'); setVerification('all'); }}>Clear filters</Button> : null}
        />
      )}

      <InlineNotice tone="neutral" title="Protected fields">
        The browser grant permits riders to update their own availability and vehicle presentation.
        Verification status, capacity and current location writes need trusted operational flows.
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.profile?.full_name || 'Delivery partner'}
        description={selected?.profile?.email}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={selected.verification_status} />
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-bold ${selected.is_available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${selected.is_available ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                {selected.is_available ? 'Available' : 'Unavailable'}
              </span>
            </div>

            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Phone">{selected.profile?.phone || 'Not recorded'}</DefinitionItem>
              <DefinitionItem label="Vehicle">{titleCase(selected.vehicle_type)}</DefinitionItem>
              <DefinitionItem label="Vehicle number">{selected.vehicle_number || '—'}</DefinitionItem>
              <DefinitionItem label="Concurrent capacity">{selected.max_concurrent_orders} orders</DefinitionItem>
              <DefinitionItem label="Current assignments">{currentAssignments.get(selected.id) ?? 0}</DefinitionItem>
              <DefinitionItem label="Rating">{Number(selected.rating).toFixed(1)}</DefinitionItem>
              <DefinitionItem label="Last location update">{formatDateTime(selected.last_location_at)}</DefinitionItem>
              <DefinitionItem label="Profile ID"><span className="font-mono text-xs">{selected.id}</span></DefinitionItem>
            </dl>

            <div className="rounded-lg border border-line p-4">
              <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                <MapPin className="h-4 w-4 text-accent" aria-hidden="true" /> Stored location record
              </p>
              {selected.current_latitude != null && selected.current_longitude != null ? (
                <p className="mt-1.5 font-mono text-xs text-muted">
                  {Number(selected.current_latitude).toFixed(5)}, {Number(selected.current_longitude).toFixed(5)}
                </p>
              ) : (
                <p className="mt-1.5 text-xs leading-5 text-muted">No stored location values are available.</p>
              )}
              <p className="mt-2 text-[0.7rem] leading-5 text-muted">
                Map visualization is not part of this interface; no live position is inferred.
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
