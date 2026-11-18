'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Card, DataTable, Input, PageHeader, ProgressBar, Stat, StatGrid, Toolbar, useAsync } from '@globalantic/ui';
import { STAGE_LABEL, sourceLabel } from '@/lib/crm';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

/** Funnel, sources, campaigns and services — from real records only (unmeasured stages say so). */
export default function LeadReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const state = useAsync(() => api().crm.summary({ from: from || undefined, to: to || undefined }), `crm-report-${from}-${to}`);

  return (
    <>
      <PageHeader eyebrow={<Link href="/leads" className={s.link}>← Leads</Link>} title="Funnel & sources" description="Where enquiries come from and how far they get. Counts include only real records in the selected period." />
      <Toolbar>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Toolbar>
      <AsyncView state={state} loadingRows={6}>
        {(d) => {
          const enquiries = d.funnel.find((f: Row) => f.stage === 'Enquiries')?.value ?? 0;
          return (
            <div className={s.stack}>
              <StatGrid>
                <Stat label="Enquiries" value={d.totals.leads} hint={d.totals.repeatEnquiries ? `+${d.totals.repeatEnquiries} repeat` : undefined} />
                <Stat label="Open" value={d.totals.open} />
                <Stat label="Won" value={d.totals.won} tone="success" />
                <Stat label="Lost" value={d.totals.lost} />
                <Stat label="Win rate" value={d.totals.winRate === null ? '—' : `${d.totals.winRate}%`} hint="Won ÷ (won + lost)" />
              </StatGrid>
              <Card title="Funnel">
                <ol className={s.list}>
                  {d.funnel.map((f: Row) => (
                    <li key={f.stage} className={s.listItem}>
                      <div className={s.rowBetween}>
                        <span className={s.strong}>{f.stage}</span>
                        <span>{f.value === null ? 'Not measured' : f.value}</span>
                      </div>
                      {f.value !== null && enquiries > 0 && ['Qualified', 'Consultation', 'Proposal', 'Customer'].includes(f.stage) && (
                        <ProgressBar value={(f.value * 100) / enquiries} label={`${f.stage} as a share of enquiries`} />
                      )}
                      {f.note && <span className={s.small}>{f.note}</span>}
                    </li>
                  ))}
                </ol>
              </Card>
              <div className={s.grid2}>
                <Card title="By source">
                  <DataTable<Row> caption="Leads by source" rows={d.bySource} rowKey={(r) => r.source} columns={[{ key: 'src', header: 'Source', render: (r) => sourceLabel(r.source) }, { key: 'n', header: 'Leads', render: (r) => r.leads }]} />
                </Card>
                <Card title="By campaign (UTM)">
                  {d.byCampaign.length === 0 ? (
                    <p className={s.muted}>No enquiries with campaign tags in this period. Add utm_source / utm_campaign to ad and email links to track them.</p>
                  ) : (
                    <DataTable<Row> caption="Leads by campaign" rows={d.byCampaign} rowKey={(r) => `${r.utmSource}-${r.utmCampaign}`} columns={[{ key: 'src', header: 'Source', render: (r) => r.utmSource ?? '—' }, { key: 'c', header: 'Campaign', render: (r) => r.utmCampaign ?? '—' }, { key: 'n', header: 'Leads', render: (r) => r.leads }]} />
                  )}
                </Card>
                <Card title="By channel">
                  <DataTable<Row>
                    caption="Leads by acquisition channel"
                    rows={d.byChannel ?? []}
                    rowKey={(r) => r.channel}
                    columns={[{ key: 'c', header: 'Channel', render: (r) => r.channel }, { key: 'n', header: 'Leads', render: (r) => r.leads }, { key: 'w', header: 'Won', render: (r) => r.won }]}
                  />
                  <p className={s.small}>From the first external referrer and UTM tags recorded with each enquiry. Browsers often hide referrers, so “Direct / unknown” also includes some search and social visits.</p>
                </Card>
                <Card title="By landing page">
                  <DataTable<Row>
                    caption="Leads by first landing page"
                    rows={d.byLandingPage ?? []}
                    rowKey={(r) => r.page}
                    columns={[{ key: 'p', header: 'Landing page', render: (r) => r.page }, { key: 'n', header: 'Leads', render: (r) => r.leads }, { key: 'w', header: 'Won', render: (r) => r.won }]}
                  />
                </Card>
                <Card title="By service">
                  <DataTable<Row> caption="Leads by service" rows={d.byService} rowKey={(r) => r.service} columns={[{ key: 's', header: 'Service', render: (r) => r.service }, { key: 'n', header: 'Leads', render: (r) => r.leads }]} />
                </Card>
                <Card title="By stage (current)">
                  <DataTable<Row>
                    caption="Leads by current stage"
                    rows={Object.entries(d.byStatus).map(([k, n]) => ({ k, n }))}
                    rowKey={(r) => r.k}
                    columns={[{ key: 'k', header: 'Stage', render: (r) => STAGE_LABEL[r.k] ?? r.k }, { key: 'n', header: 'Leads', render: (r) => r.n as number }]}
                  />
                </Card>
              </div>
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
