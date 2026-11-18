'use client';

import { api } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { AsyncView, Badge, Card, DataTable, PageHeader, formatDate, useAsync } from '@globalantic/ui';
import s from '@/components/page.module.css';
import { usePageTitle } from '@/components/usePageTitle';

export default function ResultsPage() {
  usePageTitle('Results');
  const results = useAsync(() => api().student.results(), 'results');
  const assessments = useAsync(() => api().student.assessments(), 'assessments');
  return (
    <div className={s.stack}>
      <PageHeader title="Results" description="Marks for assessments whose results have been published by your trainers." />
      <Card title="Published results">
        <AsyncView state={results} isEmpty={(d) => d.length === 0} empty={{ title: 'No results yet', description: 'Results appear here once your trainer publishes them.' }}>
          {(rows) => (
            <DataTable
              caption="Published results"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'a', header: 'Assessment', render: (r) => <span className={s.strong}>{r.assessment.title}</span> },
                { key: 'c', header: 'Course', hideOnMobile: true, render: (r) => `${r.assessment.batch.course.title} · ${r.assessment.batch.name}` },
                { key: 't', header: 'Type', hideOnMobile: true, render: (r) => enumLabel(r.assessment.type) },
                { key: 'm', header: 'Marks', render: (r) => `${r.marks}/${r.assessment.maxMarks}` },
                { key: 'p', header: 'Result', render: (r) => <Badge tone={r.passed ? 'success' : 'danger'}>{r.passed ? 'Passed' : 'Not passed'}</Badge> },
                { key: 'r', header: 'Remarks', hideOnMobile: true, render: (r) => r.remarks ?? '—' },
              ]}
            />
          )}
        </AsyncView>
      </Card>
      <Card title="Assessments">
        <AsyncView state={assessments} isEmpty={(d) => d.length === 0} empty={{ title: 'No assessments scheduled' }}>
          {(rows) => (
            <DataTable
              caption="Assessments"
              rows={rows}
              rowKey={(r) => String(r.id)}
              columns={[
                { key: 'a', header: 'Assessment', render: (r) => r.title },
                { key: 't', header: 'Type', render: (r) => enumLabel(r.type) },
                { key: 'b', header: 'Batch', hideOnMobile: true, render: (r) => r.batch?.name ?? '—' },
                { key: 'd', header: 'Date', render: (r) => formatDate(r.heldOn) },
                { key: 'm', header: 'Pass / max', hideOnMobile: true, render: (r) => `${r.passMarks}/${r.maxMarks}` },
                { key: 'p', header: 'Results', render: (r) => (r.resultsPublished ? <Badge tone="success">Published</Badge> : <Badge>Pending</Badge>) },
              ]}
            />
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
