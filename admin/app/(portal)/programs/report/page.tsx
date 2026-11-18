'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { AsyncView, Card, DescriptionList, Input, PageHeader, Select, Stat, StatGrid, Toolbar, formatINR, useAsync } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ProgramReportPage() {
  const [programId, setProgramId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const programs = useAsync(() => api().programAdmin.programs(), 'programs');
  const q = { programId: programId || undefined, from: from || undefined, to: to || undefined };
  const state = useAsync(() => api().programAdmin.report(q), JSON.stringify(q));

  return (
    <>
      <PageHeader eyebrow={<Link href="/programs" className={s.link}>← Programs</Link>} title="Program report" description="Registrations, verified payments, completions and certificates, straight from the database. Dates use India time." />
      <Toolbar>
        <Select label="Program" value={programId} onChange={(e) => setProgramId(e.target.value)} placeholder="All programs" options={(programs.data ?? []).map((p: Row) => ({ value: p.id, label: p.title }))} />
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.rows.length === 0} empty={{ title: 'No programs to report on', description: 'Create a program first.' }}>
        {(d) => {
          const sum = (k: string) => d.rows.reduce((t: number, r: Row) => t + (r[k] ?? 0), 0);
          return (
            <div className={s.stack}>
              <StatGrid>
                <Stat label="Registrations" value={sum('registrations')} />
                <Stat label="Verified payments" value={sum('paidPayments')} />
                <Stat label="Collected" value={formatINR(sum('collectedPaise'))} hint={sum('refundedPaise') ? `${formatINR(sum('refundedPaise'))} refunded` : undefined} />
                <Stat label="Certificates issued" value={sum('certificatesIssued')} tone="success" />
              </StatGrid>
              {d.rows.map((r: Row) => (
                <Card key={r.programId} title={r.program}>
                  <DescriptionList
                    items={[
                      { label: 'Current fee', value: formatINR(r.currentFeePaise) },
                      { label: 'Registrations', value: r.registrations },
                      { label: 'Pending payment', value: r.pendingPayment },
                      { label: 'Active (paid)', value: r.active },
                      { label: 'Completed', value: r.completed },
                      { label: 'Cancelled', value: r.cancelled },
                      { label: 'Refunded', value: r.refunded },
                      { label: 'Verified payments', value: `${r.paidPayments} · ${formatINR(r.collectedPaise)}` },
                      { label: 'Refunds', value: formatINR(r.refundedPaise) },
                      { label: 'Certificates', value: `${r.certificatesIssued} issued · ${r.certificatesRevoked} revoked` },
                      { label: 'Assessment attempts', value: r.attempts ? `${r.attempts} · ${r.attemptPassRate}% passed` : 'None yet' },
                    ]}
                  />
                </Card>
              ))}
            </div>
          );
        }}
      </AsyncView>
    </>
  );
}
