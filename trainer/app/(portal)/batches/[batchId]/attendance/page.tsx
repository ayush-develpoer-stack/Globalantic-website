'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@globalantic/api-client';
import { ATTENDANCE_STATUSES, enumLabel, type AttendanceStatus } from '@globalantic/types';
import { Alert, Button, Card, DataTable, EmptyState, Input, formatDate, todayIso, useAsync, useToast } from '@globalantic/ui';
import { useParam } from '@/lib/params';
import { Guarded } from '@/lib/errors';
import s from '@/lib/page.module.css';

interface Row {
  enrollmentId: string;
  student: { id: string; name: string };
  status: AttendanceStatus | null;
  remarks: string | null;
  recordId: string | null;
}

type Draft = Record<string, { status: AttendanceStatus | null; remarks: string }>;

export default function AttendancePage() {
  const batchId = useParam('batchId');
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const sheet = useAsync(() => api().trainer.attendance(batchId, date) as Promise<Row[]>, `att:${batchId}:${date}`);
  const history = useAsync(() => api().trainer.attendanceHistory(batchId), `atth:${batchId}`);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet.data) return;
    setDraft(Object.fromEntries(sheet.data.map((r) => [r.enrollmentId, { status: r.status, remarks: r.remarks ?? '' }])));
    setSummary(null);
    setError(null);
  }, [sheet.data]);

  const existing = (sheet.data ?? []).some((r) => r.recordId);
  const set = (id: string, patch: Partial<Draft[string]>) => setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const markAllPresent = () => setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v, status: 'PRESENT' }])));

  const save = async () => {
    const records = Object.entries(draft)
      .filter(([, v]) => v.status)
      .map(([enrollmentId, v]) => ({ enrollmentId, status: v.status as string, ...(v.remarks.trim() ? { remarks: v.remarks.trim() } : {}) }));
    if (!records.length) {
      setError('Choose a status for at least one student.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api().trainer.markAttendance(batchId, { date, records });
      const msg = `Saved ${formatDate(r.date)}: ${r.created} new, ${r.updated} changed.`;
      setSummary(msg);
      toast(msg);
      sheet.reload();
      history.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.stack}>
      <Card
        title="Mark attendance"
        actions={
          <Button variant="outline" size="sm" onClick={markAllPresent} disabled={!sheet.data?.length}>
            Mark all present
          </Button>
        }
      >
        <div className={s.stack}>
          <div className={s.formGrid}>
            <Input label="Class date" type="date" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          {existing && (
            <Alert tone="info" title="Attendance already recorded for this date">
              You can correct it. Every change to an existing mark is recorded in the audit log with the previous value.
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {summary && <Alert tone="success">{summary}</Alert>}
          <Guarded state={sheet}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState title="No enrolled students" description="There is nobody to mark yet." />
              ) : (
                <>
                  <DataTable
                    caption={`Attendance for ${date}`}
                    rows={rows}
                    rowKey={(r) => r.enrollmentId}
                    columns={[
                      { key: 'name', header: 'Student', render: (r) => r.student.name },
                      {
                        key: 'status',
                        header: 'Status',
                        render: (r) => (
                          <fieldset className={s.radioGroup}>
                            <legend className="sr-only">Attendance for {r.student.name}</legend>
                            {ATTENDANCE_STATUSES.map((st) => (
                              <label key={st} className={s.radioOption}>
                                <input
                                  type="radio"
                                  name={`att-${r.enrollmentId}`}
                                  value={st}
                                  checked={draft[r.enrollmentId]?.status === st}
                                  onChange={() => set(r.enrollmentId, { status: st })}
                                />
                                <span>{enumLabel(st)}</span>
                              </label>
                            ))}
                          </fieldset>
                        ),
                      },
                      {
                        key: 'remarks',
                        header: 'Remarks',
                        render: (r) => (
                          <input
                            className={s.remarksInput}
                            aria-label={`Remarks for ${r.student.name}`}
                            maxLength={300}
                            value={draft[r.enrollmentId]?.remarks ?? ''}
                            onChange={(e) => set(r.enrollmentId, { remarks: e.target.value })}
                          />
                        ),
                      },
                    ]}
                  />
                  <div className={s.actions}>
                    <Button onClick={save} loading={saving}>
                      Save attendance
                    </Button>
                  </div>
                </>
              )
            }
          </Guarded>
        </div>
      </Card>

      <Card title="Attendance history">
        <Guarded state={history}>
          {(rows) =>
            rows.length === 0 ? (
              <p className={s.muted}>No attendance recorded yet.</p>
            ) : (
              <DataTable
                caption="Attendance recorded per class date"
                rows={rows}
                rowKey={(r) => r.date}
                onRowClick={(r) => setDate(r.date)}
                columns={[
                  { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                  ...ATTENDANCE_STATUSES.map((st) => ({ key: st, header: enumLabel(st), render: (r: { counts: Record<string, number> }) => r.counts[st] ?? 0 })),
                ]}
              />
            )
          }
        </Guarded>
        <p className={s.small}>Select a row to open that date.</p>
      </Card>
    </div>
  );
}
