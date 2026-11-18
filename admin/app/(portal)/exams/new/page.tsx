'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, Button, Card, PageHeader, useToast } from '@globalantic/ui';
import { ExamFields, examDraft, examPayload } from '@/lib/exams';
import s from '@/lib/admin.module.css';

export default function NewExamPage() {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState(examDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setErrors({});
    try {
      const exam = await api().examAdmin.createExam(examPayload(d));
      toast('Exam created as a draft. Add questions and assignments, then publish.', 'success');
      router.push(`/exams/${exam.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setErrors(fieldErrorMap(err));
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow={<Link href="/exams" className={s.link}>← Exams</Link>} title="New exam" description="Settings first; you will add questions and candidates on the next screen." />
      <Card>
        <form onSubmit={save} noValidate className={s.stack}>
          {error && <Alert tone="danger">{error}</Alert>}
          <ExamFields d={d} set={(p) => setD({ ...d, ...p })} errors={errors} locked={false} />
          <div className={s.actions}>
            <Button type="submit" loading={pending}>Create draft</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
