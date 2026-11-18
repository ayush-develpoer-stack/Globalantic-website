'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, DataTable, Modal, PageHeader, StatusBadge, buttonClass, formatINR, useAsync, useSession } from '@globalantic/ui';
import { ProgramFields, emptyProgram, programToApi } from '@/lib/programs';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function ProgramsPage() {
  const router = useRouter();
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(emptyProgram);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const state = useAsync(() => api().programAdmin.programs(), 'programs');

  const create = async () => {
    const body = programToApi(v);
    if ('error' in body) {
      setError(body.error);
      return;
    }
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const p = await api().programAdmin.createProgram(body.data);
      router.push(`/programs/${p.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Certificate programs"
        description="Paid, self-paced programs with lessons and a final assessment. Separate from courses, internships and intern exams. Certificates are issued only after a verified payment and successful completion."
        actions={
          <div className={s.actions}>
            <Link href="/programs/enrollments" className={buttonClass('outline', 'sm')}>Enrollments</Link>
            <Link href="/programs/report" className={buttonClass('outline', 'sm')}>Report</Link>
            {can('programs.manage') && <Button size="sm" onClick={() => setOpen(true)}>New program</Button>}
          </div>
        }
      />
      <AsyncView state={state} isEmpty={(d) => d.length === 0} empty={{ title: 'No programs yet', description: 'Create a program as a draft, add its lessons and assessment questions, then publish it.' }}>
        {(rows) => (
          <DataTable<Row>
            caption="Programs"
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/programs/${r.id}`)}
            columns={[
              { key: 't', header: 'Program', render: (r) => (<><Link href={`/programs/${r.id}`} className={s.link}>{r.title}</Link><div className={s.small}>/{r.slug}</div></>) },
              { key: 'fee', header: 'Fee', render: (r) => formatINR(r.feePaise) },
              { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'c', header: 'Lessons · questions', hideOnMobile: true, render: (r) => `${r._count.lessons} · ${r._count.questions}` },
              { key: 'e', header: 'Enrollments', hideOnMobile: true, render: (r) => r._count.enrollments },
              { key: 'cert', header: 'Certificates', hideOnMobile: true, render: (r) => r._count.certificates },
            ]}
          />
        )}
      </AsyncView>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New program (draft)"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={pending}>Create draft</Button>
          </>
        }
      >
        <div className={s.stackSm}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Card>
            <ProgramFields value={v} onChange={setV} errors={errors} />
          </Card>
        </div>
      </Modal>
    </>
  );
}
