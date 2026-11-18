'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download } from 'lucide-react';
import { api } from '@globalantic/api-client';
import { AsyncView, Badge, Button, DataTable, Input, LoadingState, PageHeader, Pagination, Select, Stat, StatGrid, Toolbar, buttonClass, formatDateTime, useAsync, useDebounced, useSession } from '@globalantic/ui';
import { SortHeader, downloadCsv, useRun, useSort } from '@/lib/admin';
import { OPEN_STAGES, PriorityBadge, StageBadge, priorityOptions, sourceLabel, stageOptions } from '@/lib/crm';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function LeadsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const run = useRun();
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState(params.get('assignedToId') ?? '');
  const [followUp, setFollowUp] = useState(params.get('followUp') ?? '');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => {
    toggle(f);
    setPage(1);
  };
  const filters = { search: q, status, priority, assignedToId: owner, followUp };
  const summary = useAsync(() => api().crm.summary(), 'crm-summary');
  const assignees = useAsync(() => api().crm.assignees(), 'crm-assignees');
  const state = useAsync(() => api().crm.leads({ ...filters, page, pageSize: 20, sort }), JSON.stringify({ ...filters, page, sort }));
  const reset = () => setPage(1);
  const t = summary.data?.totals;

  const exportCsv = async () => {
    setExporting(true);
    const r = await run(() => api().crm.exportLeads(filters));
    setExporting(false);
    if (r?.rows.length) downloadCsv(`leads-${new Date().toISOString().slice(0, 10)}.csv`, r.rows);
    else if (r) await run(() => Promise.reject(new Error('No leads match these filters.')));
  };

  return (
    <>
      <PageHeader
        title="Leads"
        description={user?.role === 'ADMIN' ? 'Every website enquiry and manually added lead.' : 'Leads assigned to you and unassigned leads you can pick up.'}
        actions={
          <div className={s.actions}>
            <Button size="sm" variant="outline" onClick={exportCsv} loading={exporting}>
              <Download size={16} aria-hidden /> Export CSV
            </Button>
            <Link href="/leads/new" className={buttonClass('primary', 'sm')}>Add lead</Link>
          </div>
        }
      />
      {t && (
        <StatGrid>
          <Stat label="Open leads" value={t.open} />
          <Stat label="New (uncontacted)" value={summary.data?.byStatus?.NEW ?? 0} hint={t.staleNew ? `${t.staleNew} waiting over 48 h` : undefined} tone={t.staleNew ? 'warning' : undefined} />
          <Stat label="Overdue follow-ups" value={t.overdueFollowUps} tone={t.overdueFollowUps ? 'danger' : undefined} />
          <Stat label="No activity 7+ days" value={t.staleOpen} tone={t.staleOpen ? 'warning' : undefined} />
          <Stat label="Won" value={t.won} hint={t.winRate === null ? 'No closed leads yet' : `Win rate ${t.winRate}%`} tone="success" />
        </StatGrid>
      )}
      <div className={s.spacer} />
      <Toolbar>
        <Input label="Search" placeholder="Name, email, phone, company, reference" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} />
        <Select label="Stage" value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} placeholder="All stages" options={stageOptions} />
        <Select label="Priority" value={priority} onChange={(e) => { setPriority(e.target.value); reset(); }} placeholder="Any" options={priorityOptions} />
        <Select
          label="Owner"
          value={owner}
          onChange={(e) => { setOwner(e.target.value); reset(); }}
          placeholder="Anyone"
          options={[{ value: 'me', label: 'Me' }, { value: 'none', label: 'Unassigned' }, ...((assignees.data ?? []).filter((a) => a.id !== user?.id).map((a) => ({ value: a.id, label: a.name })))]}
        />
        <Select
          label="Follow-up"
          value={followUp}
          onChange={(e) => { setFollowUp(e.target.value); reset(); }}
          placeholder="Any"
          options={[{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'upcoming', label: 'Upcoming' }]}
        />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No leads match', description: 'New website enquiries appear here automatically. You can also add a lead from a call or WhatsApp chat.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Leads"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/leads/${r.id}`)}
              columns={[
                {
                  key: 'name',
                  header: <SortHeader label="Lead" field="name" sort={sort} onSort={onSort} />,
                  render: (r) => (
                    <>
                      <Link href={`/leads/${r.id}`} className={s.link}>{r.name}</Link>
                      {r._count?.duplicates > 0 && <> <Badge tone="info">+{r._count.duplicates} repeat</Badge></>}
                      <div className={s.small}>{[r.company, r.reference].filter(Boolean).join(' · ')}</div>
                    </>
                  ),
                },
                { key: 'service', header: 'Service', hideOnMobile: true, render: (r) => (<>{r.service ?? '—'}<div className={s.small}>{[r.budget, r.timeline].filter(Boolean).join(' · ')}</div></>) },
                { key: 'source', header: 'Source', hideOnMobile: true, render: (r) => (<>{sourceLabel(r.source)}{r.utmCampaign && <div className={s.small}>{r.utmSource} · {r.utmCampaign}</div>}</>) },
                { key: 'status', header: <SortHeader label="Stage" field="status" sort={sort} onSort={onSort} />, render: (r) => (<><StageBadge status={r.status} />{r.priority !== 'MEDIUM' && <div><PriorityBadge priority={r.priority} /></div>}</>) },
                { key: 'owner', header: 'Owner', hideOnMobile: true, render: (r) => r.assignedTo?.name ?? <span className={s.small}>Unassigned</span> },
                {
                  key: 'followUp',
                  header: <SortHeader label="Follow-up" field="followUpAt" sort={sort} onSort={onSort} />,
                  render: (r) =>
                    r.followUpAt ? (
                      <span className={OPEN_STAGES.includes(r.status) && new Date(r.followUpAt) < new Date() ? s.strong : undefined}>
                        {formatDateTime(r.followUpAt)}
                        {OPEN_STAGES.includes(r.status) && new Date(r.followUpAt) < new Date() && <div><Badge tone="danger">Overdue</Badge></div>}
                      </span>
                    ) : (
                      '—'
                    ),
                },
                { key: 'created', header: <SortHeader label="Received" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDateTime(r.createdAt) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
            <p className={s.small}>Repeat enquiries from the same email or phone are grouped under the first lead.</p>
          </>
        )}
      </AsyncView>
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LeadsInner />
    </Suspense>
  );
}
