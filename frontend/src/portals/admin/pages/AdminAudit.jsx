import { useMemo, useState } from 'react';
import { LockKeyhole, ScrollText, Search, X } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, DefinitionItem } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatDateTime, titleCase } from '../../../lib/format.js';
import { listAuditLogs } from '../../../services/admin.js';
import { listProfilesByIds } from '../../../services/profiles.js';

export default function AdminAudit() {
  useDocumentTitle('Audit history');
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('all');
  const [selected, setSelected] = useState(null);

  const { data, loading, error, reload } = useAsyncData(async () => {
    const logs = await listAuditLogs(300);
    const profiles = await listProfilesByIds([...new Set(logs.map((log) => log.actor_id).filter(Boolean))]);
    return { logs, profiles };
  }, []);

  const actorById = useMemo(
    () => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])),
    [data],
  );

  const entities = useMemo(
    () => [...new Set((data?.logs ?? []).map((log) => log.entity_type))].sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.logs ?? []).filter((log) => {
      if (entity !== 'all' && log.entity_type !== entity) return false;
      if (!query) return true;
      return [log.action, log.entity_type, log.entity_id, log.actor_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, entity]);

  if (loading) return <LoadingState rows={6} label="Loading audit history" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const hasFilters = search || entity !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Trusted history"
        title="Audit history"
        description="Read-only records written by trusted operations such as role provisioning. Browser users cannot insert audit entries."
      />

      <Card>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_200px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action or entity…" aria-label="Search audit history" className="pl-9" />
            </div>
            <Select value={entity} onChange={(event) => setEntity(event.target.value)} aria-label="Filter entity type">
              <option value="all">All entity types</option>
              {entities.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </Select>
            {hasFilters ? <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setEntity('all'); }}>Clear</Button> : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length ? (
        <TableShell label="Audit history table">
          <THead>
            <tr>
              <TH>Action</TH>
              <TH>Actor</TH>
              <TH>Role</TH>
              <TH>Entity</TH>
              <TH>Entity ID</TH>
              <TH>Recorded</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((log) => {
              const actor = actorById.get(log.actor_id);
              return (
                <TR key={log.id} onClick={() => setSelected(log)}>
                  <TD><span className="font-mono text-xs font-semibold text-ink">{log.action}</span></TD>
                  <TD>{actor?.full_name || (log.actor_id ? 'Unknown profile' : 'System')}</TD>
                  <TD>{log.actor_role ? <Badge variant="neutral">{titleCase(log.actor_role)}</Badge> : '—'}</TD>
                  <TD>{titleCase(log.entity_type)}</TD>
                  <TD><span className="font-mono text-xs">{log.entity_id?.slice(0, 12) || '—'}</span></TD>
                  <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(log.created_at)}</TD>
                </TR>
              );
            })}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={ScrollText}
          title={hasFilters ? 'No audit entries match these filters' : 'No audit entries recorded'}
          description={hasFilters ? 'Adjust the search to review the stored audit trail.' : 'Trusted operations such as role provisioning append audit records. The empty log is shown as-is.'}
          action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(''); setEntity('all'); }}>Clear filters</Button> : null}
        />
      )}

      <InlineNotice tone="neutral" title="Immutable by design">
        <span className="flex items-start gap-2">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          No insert, update or delete grant is issued to browser roles for audit_logs. A recorded entry
          is not editable from this interface.
        </span>
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Audit entry"
        description={selected ? selected.action : ''}
        size="lg"
      >
        {selected ? (
          <div className="space-y-4">
            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Actor">{actorById.get(selected.actor_id)?.full_name || 'System / unavailable'}</DefinitionItem>
              <DefinitionItem label="Actor role">{selected.actor_role ? titleCase(selected.actor_role) : '—'}</DefinitionItem>
              <DefinitionItem label="Entity">{titleCase(selected.entity_type)}</DefinitionItem>
              <DefinitionItem label="Entity ID"><span className="font-mono text-xs">{selected.entity_id || '—'}</span></DefinitionItem>
              <DefinitionItem label="Recorded">{formatDateTime(selected.created_at)}</DefinitionItem>
              <DefinitionItem label="Log ID"><span className="font-mono text-xs">{selected.id}</span></DefinitionItem>
            </dl>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted">Before</p>
                <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-ink p-3.5 text-xs leading-5 text-slate-300">
                  {JSON.stringify(selected.before_state ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted">After</p>
                <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-ink p-3.5 text-xs leading-5 text-slate-300">
                  {JSON.stringify(selected.after_state ?? {}, null, 2)}
                </pre>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted">Metadata</p>
              <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-ink p-3.5 text-xs leading-5 text-slate-300">
                {JSON.stringify(selected.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
