'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, errorMessage } from '@globalantic/api-client';
import { SUPPORT_STATUSES } from '@globalantic/types';
import { Alert, AsyncView, Button, DataTable, Modal, PageHeader, Pagination, Select, StatusBadge, Textarea, Toolbar, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { enumOptions } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function RespondModal({ req, onClose, onDone }: { req: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(req.status === 'OPEN' ? 'IN_PROGRESS' : req.status);
  const [response, setResponse] = useState(req.response ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await api().admin.respondSupport(req.id, { status, response: response.trim() && response !== req.response ? response : undefined });
      toast('Support request updated');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={req.subject} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save</Button></>}>
      <p className={s.small}>From {req.student.name} ({req.student.email}) · {formatDateTime(req.createdAt)}</p>
      <p className={s.json}>{req.message}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={enumOptions(SUPPORT_STATUSES.filter((x) => x !== 'OPEN'))} />
      <Textarea label="Response to student" hint="The student is notified by email and in their portal." value={response} onChange={(e) => setResponse(e.target.value)} rows={5} maxLength={4000} />
    </Modal>
  );
}

export default function SupportPage() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Row | null>(null);
  const state = useAsync(() => api().admin.support({ status, page, pageSize: 20 }), `support-${status}-${page}`);
  return (
    <>
      <PageHeader title="Support requests" description="Help requests sent from the student portal." />
      <Toolbar>
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={enumOptions(SUPPORT_STATUSES)} />
      </Toolbar>
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No support requests', description: 'Nothing waiting here.' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Support requests"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={setOpen}
              columns={[
                { key: 'subj', header: 'Subject', render: (r) => (<><div className={s.strong}>{r.subject}</div><div className={s.small}>{r.message.slice(0, 90)}{r.message.length > 90 ? '…' : ''}</div></>) },
                { key: 'who', header: 'Student', hideOnMobile: true, render: (r) => <Link className={s.link} href={`/students/${r.student.id}`} onClick={(e) => e.stopPropagation()}>{r.student.name}</Link> },
                { key: 'when', header: 'Received', hideOnMobile: true, render: (r) => formatDateTime(r.createdAt) },
                { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'x', header: <span className="sr-only">Actions</span>, render: (r) => <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Respond</Button> },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {open && <RespondModal req={open} onClose={() => setOpen(null)} onDone={state.reload} />}
    </>
  );
}
