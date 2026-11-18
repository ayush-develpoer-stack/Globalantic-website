'use client';

import { useState } from 'react';
import { api } from '@globalantic/api-client';
import { AsyncView, DataTable, Input, PageHeader, Pagination, Select, Toolbar, formatDateTime, useAsync, useDebounced } from '@globalantic/ui';
import { JsonDiff, actionLabel } from '@/lib/AuditHistory';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

const ENTITY_TYPES = [
  'User', 'Course', 'Batch', 'AdmissionApplication', 'Enrollment', 'Attendance', 'Assignment', 'AssignmentSubmission', 'Assessment', 'Result',
  'LearningMaterial', 'Announcement', 'Certificate', 'Payment', 'PaymentWebhookEvent', 'SupportRequest',
  'ReferralSettings', 'ReferralCode', 'ReferralRegistration', 'ReferralReward', 'FraudReview',
];

export default function AuditPage() {
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const id = useDebounced(entityId.trim());
  const state = useAsync(() => api().admin.audit({ entityType, entityId: id, page, pageSize: 25 }), `${entityType}|${id}|${page}`);
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of every sensitive change: who, when, what changed and why." />
      <Toolbar>
        <Select label="Entity type" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} placeholder="All" options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))} />
        <Input label="Entity id" placeholder="Paste a record id" value={entityId} onChange={(e) => { setEntityId(e.target.value); setPage(1); }} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No audit entries match' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Audit log"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'when', header: 'When', render: (r) => formatDateTime(r.createdAt) },
                { key: 'act', header: 'Action', render: (r) => (<><div className={s.strong}>{actionLabel(r.action)}</div><div className={s.mono}>{r.entityType} · {r.entityId}</div></>) },
                { key: 'who', header: 'Actor', hideOnMobile: true, render: (r) => (r.actor ? <><div>{r.actor.name}</div><div className={s.small}>{r.actorRole}</div></> : <span className={s.small}>{r.actorRole === 'SYSTEM' || !r.actorRole ? 'System' : r.actorRole}</span>) },
                { key: 'det', header: 'Details', render: (r) => (<>{r.reason && <div className={s.small}>Reason: {r.reason}</div>}<JsonDiff before={r.before} after={r.after} /></>) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
    </>
  );
}
