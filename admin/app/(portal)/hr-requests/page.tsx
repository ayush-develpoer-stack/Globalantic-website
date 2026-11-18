'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { SUPPORT_STATUSES, enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea, Toolbar, formatDateTime, useAsync, useSession, useToast } from '@globalantic/ui';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function RespondModal({ req, onClose, onDone }: { req: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(req.status === 'OPEN' ? 'IN_PROGRESS' : req.status === 'IN_PROGRESS' ? 'RESOLVED' : req.status);
  const [response, setResponse] = useState(req.response ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().hr.respondRequest(req.id, { status, response: response.trim() || undefined });
      toast('Request updated');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={req.subject} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save</Button></>}>
      <p className={s.small}>{req.employee.name} · {enumLabel(req.category)} · {formatDateTime(req.createdAt)}</p>
      <p>{req.message}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }]} error={fields.status} />
      <Textarea label="Response to the employee" value={response} onChange={(e) => setResponse(e.target.value)} rows={4} maxLength={4000} error={fields.response} hint="If filled, the employee is notified by email and in their portal." />
    </Modal>
  );
}

export default function HrRequestsPage() {
  const { user } = useSession();
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<Row | null>(null);
  const state = useAsync(() => api().hr.requests({ status, page, pageSize: 20 }), `${status}|${page}`);
  return (
    <>
      <PageHeader title="HR requests" description="Questions and requests raised by employees from their portal." />
      <Toolbar>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={SUPPORT_STATUSES.map((v) => ({ value: v, label: enumLabel(v) }))} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No requests here' }}>
        {(d) => (
          <>
            <div className={s.list}>
              {d.items.map((r: Row) => (
                <article key={r.id} className={s.listItem}>
                  <div className={s.rowBetween}>
                    <span className={s.strong}>{r.subject}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className={s.small}>
                    <Link className={s.link} href={`/employees/${r.employee.id}`}>{r.employee.name}</Link> · {enumLabel(r.category)} · {formatDateTime(r.createdAt)}
                  </div>
                  <p>{r.message}</p>
                  {r.response && <p className={s.muted}>Response: {r.response}</p>}
                  {r.employee.id === user.id ? (
                    <span className={s.small}>Your own request — another HR user must respond.</span>
                  ) : (
                    <div className={s.actions}>
                      <Button size="sm" variant="outline" onClick={() => setActive(r)}>{r.status === 'OPEN' ? 'Respond' : 'Update'}</Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {active && <RespondModal req={active} onClose={() => setActive(null)} onDone={state.reload} />}
    </>
  );
}
