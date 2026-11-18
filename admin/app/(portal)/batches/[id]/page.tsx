'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@globalantic/api-client';
import { DAY_NAMES, enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Stat,
  StatGrid,
  StatusBadge,
  Tabs,
  formatDate,
  formatDateTime,
  formatINR,
  percent,
  useAsync,
  useToast,
} from '@globalantic/ui';
import { downloadCsv, useConfirm, useRun } from '@/lib/admin';
import s from '@/lib/admin.module.css';
import { BatchForm } from '../BatchForm';

type Row = Record<string, any>;

/** Allowed status moves (mirrors the server's transition table). */
const ACTIONS: Record<string, { to: string; label: string; tone?: 'danger' }[]> = {
  UPCOMING: [{ to: 'OPEN', label: 'Open admissions' }, { to: 'IN_PROGRESS', label: 'Start batch' }, { to: 'CANCELLED', label: 'Cancel batch', tone: 'danger' }],
  OPEN: [{ to: 'UPCOMING', label: 'Close admissions' }, { to: 'FULL', label: 'Mark full' }, { to: 'IN_PROGRESS', label: 'Start batch' }, { to: 'CANCELLED', label: 'Cancel batch', tone: 'danger' }],
  FULL: [{ to: 'OPEN', label: 'Reopen admissions' }, { to: 'IN_PROGRESS', label: 'Start batch' }, { to: 'CANCELLED', label: 'Cancel batch', tone: 'danger' }],
  IN_PROGRESS: [{ to: 'COMPLETED', label: 'Mark completed' }, { to: 'CANCELLED', label: 'Cancel batch', tone: 'danger' }],
  COMPLETED: [],
  CANCELLED: [],
};

interface SlotDraft { key: string; dayOfWeek: string; startTime: string; endTime: string; topic: string; location: string }
let seq = 0;
const toSlot = (x?: Row): SlotDraft => ({ key: `s${(seq += 1)}`, dayOfWeek: String(x?.dayOfWeek ?? 1), startTime: x?.startTime ?? '10:00', endTime: x?.endTime ?? '12:00', topic: x?.topic ?? '', location: x?.location ?? '' });

function ScheduleEditor({ batchId, schedules, onSaved }: { batchId: string; schedules: Row[]; onSaved: () => void }) {
  const toast = useToast();
  const [slots, setSlots] = useState<SlotDraft[]>(() => schedules.map(toSlot));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => setSlots(schedules.map(toSlot)), [schedules]);
  const upd = (key: string, patch: Partial<SlotDraft>) => setSlots((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const save = async () => {
    setError(null);
    if (slots.some((x) => x.endTime <= x.startTime)) {
      setError('Each class must end after it starts.');
      return;
    }
    setPending(true);
    try {
      await api().admin.setSchedules(batchId, slots.map((x) => ({ dayOfWeek: Number(x.dayOfWeek), startTime: x.startTime, endTime: x.endTime, topic: x.topic || undefined, location: x.location || undefined })));
      toast('Schedule saved');
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="Weekly schedule (IST)" actions={<Button size="sm" variant="outline" onClick={() => setSlots((xs) => [...xs, toSlot()])}><Plus size={16} aria-hidden /> Add class</Button>}>
      <div className={s.stack}>
        {error && <Alert tone="danger">{error}</Alert>}
        {slots.length === 0 && <EmptyState title="No classes scheduled" description="Add the weekly class slots students will see in their timetable." />}
        {slots.map((x, i) => (
          <div key={x.key} className={s.scheduleRow}>
            <Select label={`Day (class ${i + 1})`} value={x.dayOfWeek} onChange={(e) => upd(x.key, { dayOfWeek: e.target.value })} options={DAY_NAMES.map((d, n) => ({ value: String(n), label: d }))} />
            <Input label="Start" type="time" value={x.startTime} onChange={(e) => upd(x.key, { startTime: e.target.value })} />
            <Input label="End" type="time" value={x.endTime} onChange={(e) => upd(x.key, { endTime: e.target.value })} />
            <Input label="Topic" value={x.topic} onChange={(e) => upd(x.key, { topic: e.target.value })} maxLength={200} />
            <Input label="Location / link label" value={x.location} onChange={(e) => upd(x.key, { location: e.target.value })} maxLength={200} />
            <Button variant="ghost" onClick={() => setSlots((xs) => xs.filter((y) => y.key !== x.key))} aria-label={`Remove class ${i + 1}`}><Trash2 size={16} aria-hidden /></Button>
          </div>
        ))}
        <div className={s.actions}><Button onClick={save} loading={pending}>Save schedule</Button></div>
      </div>
    </Card>
  );
}

function TrainersPanel({ batch, onChanged }: { batch: Row; onChanged: () => void }) {
  const run = useRun();
  const { ask, dialog } = useConfirm();
  const trainers = useAsync(() => api().admin.trainers(), 'trainers');
  const [trainerId, setTrainerId] = useState('');
  const [role, setRole] = useState<'LEAD' | 'ASSISTANT'>('LEAD');
  const active = (batch.trainers as Row[]).filter((t) => !t.removedAt);
  const assignedIds = new Set(active.map((t) => t.trainer.id));
  const options = (trainers.data ?? []).filter((t) => t.status === 'ACTIVE' && !assignedIds.has(t.id)).map((t) => ({ value: t.id, label: `${t.name} (${t.email})` }));
  return (
    <Card title="Trainers">
      <div className={s.stack}>
        {active.length === 0 ? (
          <EmptyState title="No trainer assigned" description="Assigned trainers can mark attendance, set assignments and see this batch's students." />
        ) : (
          <DataTable<Row>
            caption="Assigned trainers"
            rows={active}
            rowKey={(t) => t.trainer.id}
            columns={[
              { key: 'name', header: 'Trainer', render: (t) => (<><div className={s.strong}>{t.trainer.name}</div><div className={s.small}>{t.trainer.email}</div></>) },
              { key: 'role', header: 'Role', render: (t) => enumLabel(t.role) },
              { key: 'since', header: 'Assigned', hideOnMobile: true, render: (t) => formatDate(t.assignedAt) },
              {
                key: 'x',
                header: <span className="sr-only">Actions</span>,
                render: (t) => (
                  <Button size="sm" variant="ghost" onClick={() => ask({ title: `Remove ${t.trainer.name}?`, message: 'They will immediately lose access to this batch.', confirmLabel: 'Remove', tone: 'danger', onConfirm: async () => { await api().admin.removeTrainer(batch.id, t.trainer.id); onChanged(); }, success: 'Trainer removed' })}>
                    Remove
                  </Button>
                ),
              },
            ]}
          />
        )}
        <div className={s.formGrid}>
          <Select label="Trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} placeholder={trainers.loading ? 'Loading…' : options.length ? 'Choose a trainer' : 'No other active trainers'} options={options} />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as 'LEAD' | 'ASSISTANT')} options={[{ value: 'LEAD', label: 'Lead' }, { value: 'ASSISTANT', label: 'Assistant' }]} />
        </div>
        <div className={s.actions}>
          <Button disabled={!trainerId} onClick={async () => { const ok = await run(() => api().admin.assignTrainer(batch.id, trainerId, role), 'Trainer assigned'); if (ok) { setTrainerId(''); onChanged(); } }}>Assign trainer</Button>
          <Link href="/staff" className={s.link}>Create trainer accounts</Link>
        </div>
      </div>
      {dialog}
    </Card>
  );
}

function ReportPanel({ batchId, batchName }: { batchId: string; batchName: string }) {
  const report = useAsync(() => api().admin.batchReport(batchId), `report-${batchId}`);
  return (
    <AsyncView state={report} isEmpty={(r) => r.rows.length === 0} empty={{ title: 'No students enrolled yet' }}>
      {(r) => (
        <Card title={`Learning report · generated ${formatDateTime(r.generatedAt)}`} actions={<Button size="sm" variant="outline" onClick={() => downloadCsv(`batch-report-${batchName.replace(/\W+/g, '-')}.csv`, r.rows)}><Download size={16} aria-hidden /> Export CSV</Button>}>
          <DataTable<Row>
            caption="Batch report"
            rows={r.rows}
            rowKey={(x) => x.email}
            columns={[
              { key: 'student', header: 'Student', render: (x) => (<><div className={s.strong}>{x.student}</div><div className={s.small}>{x.email}</div></>) },
              { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
              { key: 'att', header: 'Attendance', render: (x) => (<span>{percent(x.attendancePercent)} {x.meetsAttendance ? '' : <span className={s.small}>(below {r.batch.minAttendancePercent}%)</span>}</span>) },
              { key: 'asg', header: 'Assignments', hideOnMobile: true, render: (x) => `${x.assignmentsSubmitted}/${x.assignmentsTotal} · avg ${percent(x.assignmentAveragePercent)}` },
              { key: 'ass', header: 'Assessments passed', hideOnMobile: true, render: (x) => `${x.assessmentsPassed}/${x.assessmentsTaken}` },
            ]}
          />
        </Card>
      )}
    </AsyncView>
  );
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { ask, dialog } = useConfirm();
  const [tab, setTab] = useState<'details' | 'schedule' | 'trainers' | 'students' | 'report'>('details');
  const state = useAsync(() => api().admin.batch(id), `batch-${id}`);

  return (
    <AsyncView state={state}>
      {(b) => (
        <>
          <PageHeader
            eyebrow={<Link href="/batches" className={s.link}>← Batches</Link>}
            title={b.name}
            description={<><Link className={s.link} href={`/courses/${b.course.id}`}>{b.course.title}</Link> · <StatusBadge status={b.status} /></>}
            actions={ACTIONS[b.status]?.map((a) => (
              <Button
                key={a.to}
                size="sm"
                variant={a.tone === 'danger' ? 'danger' : 'outline'}
                onClick={() =>
                  ask({
                    title: `${a.label}?`,
                    message: a.to === 'CANCELLED' ? 'All applicants and enrolled students will be notified. Refunds must be handled by finance.' : undefined,
                    confirmLabel: a.label,
                    tone: a.tone,
                    requireReason: a.to === 'CANCELLED',
                    reasonLabel: 'Cancellation reason',
                    onConfirm: async (reason) => {
                      await api().admin.setBatchStatus(id, a.to, reason || undefined);
                      state.reload();
                    },
                    success: 'Batch status updated',
                  })
                }
              >
                {a.label}
              </Button>
            ))}
          />
          <StatGrid>
            <Stat label="Seats taken" value={`${b.seatsTaken}/${b.capacity}`} hint="Enrolled + approved awaiting payment" />
            <Stat label="Payable fee" value={formatINR(b.fee.payablePaise)} hint={b.feePaise !== null ? 'Batch fee override' : 'Course fee'} />
            <Stat label="Applications" value={b._count.applications} />
            <Stat label="Apply by" value={formatDate(b.registrationDeadline)} />
          </StatGrid>
          <div className={s.spacer} />
          <Tabs
            label="Batch sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'details', label: 'Details' },
              { value: 'schedule', label: 'Schedule', count: b.schedules.length },
              { value: 'trainers', label: 'Trainers', count: b.trainers.filter((t: Row) => !t.removedAt).length },
              { value: 'students', label: 'Students', count: b.enrollments.length },
              { value: 'report', label: 'Report' },
            ]}
          />
          {tab === 'details' && (
            <div className={s.stack}>
              <Card title="Summary">
                <DescriptionList items={[{ label: 'Dates', value: `${formatDate(b.startDate)} – ${formatDate(b.endDate)}` }, { label: 'Mode', value: enumLabel(b.mode) }, { label: 'Venue', value: b.venue }]} />
              </Card>
              <BatchForm
                key={b.updatedAt}
                batch={b}
                submitLabel="Save changes"
                onSubmit={async (payload) => {
                  await api().admin.updateBatch(id, payload);
                  toast('Batch saved');
                  state.reload();
                }}
              />
            </div>
          )}
          {tab === 'schedule' && <ScheduleEditor batchId={id} schedules={b.schedules} onSaved={state.reload} />}
          {tab === 'trainers' && <TrainersPanel batch={b} onChanged={state.reload} />}
          {tab === 'students' && (
            <Card title="Enrolled students">
              {b.enrollments.length === 0 ? (
                <EmptyState title="No students enrolled yet" />
              ) : (
                <DataTable<Row>
                  caption="Enrolled students"
                  rows={b.enrollments}
                  rowKey={(e) => e.id}
                  columns={[
                    { key: 'name', header: 'Student', render: (e) => (<><Link className={s.link} href={`/students/${e.student.id}`}>{e.student.name}</Link><div className={s.small}>{e.student.email}</div></>) },
                    { key: 'phone', header: 'Phone', hideOnMobile: true, render: (e) => e.student.phone ?? '—' },
                    { key: 'since', header: 'Enrolled', hideOnMobile: true, render: (e) => formatDate(e.enrolledAt) },
                    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
                  ]}
                />
              )}
            </Card>
          )}
          {tab === 'report' && <ReportPanel batchId={id} batchName={b.name} />}
          {dialog}
        </>
      )}
    </AsyncView>
  );
}
