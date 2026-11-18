'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { Button, Card, DataTable, EmptyState, Modal, StatusBadge, formatDateTime, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import { AssignmentForm } from '@/lib/AssignmentForm';
import s from '@/lib/page.module.css';

interface AssignmentRow {
  id: string;
  title: string;
  dueAt: string;
  maxMarks: number;
  status: string;
  _count: { submissions: number };
}

export default function AssignmentsPage() {
  const batchId = useParam('batchId');
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const state = useAsync(() => api().trainer.assignments(batchId) as Promise<AssignmentRow[]>, `asg:${batchId}`);

  return (
    <Card title="Assignments" actions={<Button size="sm" onClick={() => setOpen(true)}>New assignment</Button>}>
      <Guarded state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No assignments yet" description="Create the first assignment for this batch." />
          ) : (
            <DataTable
              caption="Assignments in this batch"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: 'Title', render: (r) => <Link className={s.link} href={`/assignments/${r.id}`}>{r.title}</Link> },
                { key: 'due', header: 'Due', render: (r) => formatDateTime(r.dueAt) },
                { key: 'marks', header: 'Max marks', render: (r) => r.maxMarks, hideOnMobile: true },
                { key: 'subs', header: 'Submissions', render: (r) => r._count.submissions },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          )
        }
      </Guarded>
      <Modal open={open} onClose={() => setOpen(false)} title="New assignment" size="lg">
        <AssignmentForm
          submitLabel="Create assignment"
          onCancel={() => setOpen(false)}
          onSubmit={async (payload) => {
            await api().trainer.createAssignment(batchId, payload);
            setOpen(false);
            toast('Assignment created. Enrolled students have been notified.');
            state.reload();
          }}
        />
      </Modal>
    </Card>
  );
}
