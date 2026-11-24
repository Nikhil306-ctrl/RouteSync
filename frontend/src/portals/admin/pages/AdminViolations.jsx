import { useMemo, useState } from 'react';
import { CheckCircle2, Search, ShieldAlert, TriangleAlert, X } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import Badge, { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime, titleCase } from '../../../lib/format.js';
import {
  listConstraintViolations,
  listSchedulingRuns,
  resolveConstraintViolation,
} from '../../../services/admin.js';

const severities = ['all', 'error', 'warning', 'info'];
const resolutionStates = [
  { value: 'all', label: 'All conflicts' },
  { value: 'open', label: 'Unresolved' },
  { value: 'resolved', label: 'Resolved' },
];

export default function AdminViolations() {
  useDocumentTitle('Constraint violations');
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [resolution, setResolution] = useState('all');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [violations, runs] = await Promise.all([
      listConstraintViolations(250),
      listSchedulingRuns(100),
    ]);
    return { violations, runs };
  }, []);

  const runById = useMemo(
    () => new Map((data?.runs ?? []).map((run) => [run.id, run])),
    [data],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.violations ?? []).filter((violation) => {
      if (severity !== 'all' && violation.severity !== severity) return false;
      if (resolution === 'open' && violation.is_resolved) return false;
      if (resolution === 'resolved' && !violation.is_resolved) return false;
      if (!query) return true;
      return [violation.message, violation.constraint_type, violation.id, violation.order_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, severity, resolution]);

  const handleResolve = async () => {
    if (!selected) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await resolveConstraintViolation(selected.id, !selected.is_resolved);
      setSelected(updated);
      reload();
    } catch (resolveError) {
      setActionError(resolveError.message ?? 'Unable to update this conflict.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={6} label="Loading constraint records" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const open = data.violations.filter((violation) => !violation.is_resolved);
  const errors = open.filter((violation) => violation.severity === 'error').length;
  const warnings = open.filter((violation) => violation.severity === 'warning').length;
  const hasFilters = search || severity !== 'all' || resolution !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Scheduling integrity"
        title="Constraints & conflicts"
        description="Hard and soft constraint outcomes retained by scheduling runs. Records only appear after a trusted engine produces them."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Unresolved" value={open.length} helper={`${data.violations.length} total records`} icon={TriangleAlert} tone={open.length ? 'orange' : 'green'} />
        <StatCard label="Hard errors" value={errors} helper="Severity marked error" icon={ShieldAlert} />
        <StatCard label="Warnings" value={warnings} helper="Soft or reviewable conflicts" icon={TriangleAlert} />
      </div>

      <Card>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_160px_170px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search constraint or message…" aria-label="Search conflicts" className="pl-9" />
            </div>
            <Select value={severity} onChange={(event) => setSeverity(event.target.value)} aria-label="Filter severity">
              {severities.map((value) => <option key={value} value={value}>{value === 'all' ? 'All severities' : titleCase(value)}</option>)}
            </Select>
            <Select value={resolution} onChange={(event) => setResolution(event.target.value)} aria-label="Filter resolution">
              {resolutionStates.map((state) => <option key={state.value} value={state.value}>{state.label}</option>)}
            </Select>
            {hasFilters ? <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setSeverity('all'); setResolution('all'); }}>Clear</Button> : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length ? (
        <TableShell label="Constraint conflicts table">
          <THead>
            <tr>
              <TH>Conflict</TH>
              <TH>Run</TH>
              <TH>Order</TH>
              <TH>Severity</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((violation) => (
              <TR key={violation.id} onClick={() => { setSelected(violation); setActionError(''); }}>
                <TD>
                  <p className="font-semibold capitalize text-ink">{violation.constraint_type.replaceAll('_', ' ')}</p>
                  <p className="max-w-[360px] truncate text-xs text-muted">{violation.message}</p>
                </TD>
                <TD><span className="font-mono text-xs">{violation.scheduling_run_id.slice(0, 8)}</span></TD>
                <TD><span className="font-mono text-xs">{violation.order_id?.slice(0, 8) ?? '—'}</span></TD>
                <TD><Badge variant={violation.severity === 'error' ? 'red' : violation.severity === 'warning' ? 'amber' : 'blue'}>{violation.severity}</Badge></TD>
                <TD><StatusBadge status={violation.is_resolved ? 'resolved' : 'open'} /></TD>
                <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(violation.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={ShieldAlert}
          title={hasFilters ? 'No conflicts match these filters' : 'No constraint violations recorded'}
          description={hasFilters ? 'Adjust the filters to inspect the stored conflict records.' : 'The conflict log is empty until the Phase 5 scheduling engine records a hard or soft constraint outcome.'}
          action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(''); setSeverity('all'); setResolution('all'); }}>Clear filters</Button> : null}
        />
      )}

      <InlineNotice tone="neutral" title="No inferred conflicts">
        The interface does not run feasibility checks in the browser. Every row is a stored
        constraint_violations record tied to a scheduling run.
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Conflict detail"
        description={selected ? selected.constraint_type.replaceAll('_', ' ') : ''}
        size="lg"
        footer={
          selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={selected.is_resolved ? 'secondary' : 'primary'}
                size="sm"
                icon={CheckCircle2}
                loading={saving}
                onClick={handleResolve}
              >
                {selected.is_resolved ? 'Mark unresolved' : 'Mark resolved'}
              </Button>
              <StatusBadge status={selected.is_resolved ? 'resolved' : 'open'} />
            </div>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            <div className="flex flex-wrap gap-2">
              <Badge variant={selected.severity === 'error' ? 'red' : selected.severity === 'warning' ? 'amber' : 'blue'}>{selected.severity}</Badge>
              <StatusBadge status={selected.is_resolved ? 'resolved' : 'open'} />
            </div>
            <p className="rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">{selected.message}</p>
            <dl className="grid gap-4 rounded-lg border border-line p-4 sm:grid-cols-2">
              <DefinitionItem label="Scheduling run">
                <span className="font-mono text-xs">{selected.scheduling_run_id}</span>
              </DefinitionItem>
              <DefinitionItem label="Run status">{runById.get(selected.scheduling_run_id)?.status || 'Run record not loaded'}</DefinitionItem>
              <DefinitionItem label="Order">{selected.order_id || '—'}</DefinitionItem>
              <DefinitionItem label="Rider">{selected.rider_id || '—'}</DefinitionItem>
              <DefinitionItem label="Assignment">{selected.assignment_id || '—'}</DefinitionItem>
              <DefinitionItem label="Created">{formatDateTime(selected.created_at)}</DefinitionItem>
            </dl>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Stored details</p>
              <pre className="mt-1.5 max-h-64 overflow-auto rounded-lg bg-ink p-4 text-xs leading-5 text-slate-300">
                {JSON.stringify(selected.details ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
