'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, DataTable, Input, PageHeader, Select, StatusBadge, Toolbar, buttonClass, useAsync, useSession } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

/** Trainers with workload (active batches / active students) and current batch assignments. */
export default function TrainersPage() {
  const { can } = useSession();
  const state = useAsync(() => api().admin.trainers(), 'trainers-workload');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [order, setOrder] = useState<'name' | 'batches' | 'students'>('name');

  const filter = useMemo(
    () => (rows: Row[]) => {
      const q = search.trim().toLowerCase();
      const out = rows.filter((t) => (!status || t.status === status) && (!q || `${t.name} ${t.email}`.toLowerCase().includes(q)));
      return [...out].sort((a, b) =>
        order === 'batches'
          ? b.workload.activeBatches - a.workload.activeBatches
          : order === 'students'
            ? b.workload.activeStudents - a.workload.activeStudents
            : String(a.name).localeCompare(String(b.name)),
      );
    },
    [search, status, order],
  );

  return (
    <>
      <PageHeader
        title="Trainers"
        description="Workload and batch assignments. Assign trainers from a batch’s Trainers tab; create trainer accounts under Staff & trainers."
        actions={can('training.trainers.manage') ? <Link className={buttonClass('outline', 'sm')} href="/staff">Create trainer account</Link> : undefined}
      />
      <Toolbar>
        <Input label="Search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
        <Select
          label="Order by"
          value={order}
          onChange={(e) => setOrder(e.target.value as typeof order)}
          options={[{ value: 'name', label: 'Name' }, { value: 'batches', label: 'Most active batches' }, { value: 'students', label: 'Most active students' }]}
        />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No trainers yet', description: 'Create a trainer account under Staff & trainers.' }}>
        {(rows: Row[]) => {
          const visible = filter(rows);
          return visible.length ? (
            <DataTable<Row>
              caption="Trainers"
              rows={visible}
              rowKey={(t) => t.id}
              columns={[
                {
                  key: 'n',
                  header: 'Trainer',
                  render: (t) => (
                    <>
                      {can('users.manage') ? <Link className={s.link} href={`/users/${t.id}`}>{t.name}</Link> : <span className={s.strong}>{t.name}</span>}
                      <div className={s.small}>{t.email}</div>
                    </>
                  ),
                },
                { key: 'b', header: 'Active batches', render: (t) => <span className={s.strong}>{t.workload.activeBatches}</span> },
                { key: 'st', header: 'Active students', render: (t) => t.workload.activeStudents },
                {
                  key: 'a',
                  header: 'Assignments',
                  hideOnMobile: true,
                  render: (t) =>
                    t.trainerAssignments.length ? (
                      <ul className={s.list}>
                        {(t.trainerAssignments as Row[]).map((a) => (
                          <li key={a.batch.id} className={s.small}>
                            {can('training.batches.manage') ? <Link className={s.link} href={`/batches/${a.batch.id}`}>{a.batch.name}</Link> : a.batch.name} · {a.batch.course.title} · {enumLabel(a.role)} · <StatusBadge status={a.batch.status} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className={s.small}>Not assigned</span>
                    ),
                },
                { key: 's', header: 'Account', render: (t) => <StatusBadge status={t.status} /> },
              ]}
            />
          ) : (
            <p className={s.muted}>No trainers match these filters.</p>
          );
        }}
      </AsyncView>
    </>
  );
}
