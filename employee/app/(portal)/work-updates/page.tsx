'use client';

import { useMemo, useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { Alert, AsyncView, Button, Card, Input, PageHeader, Select, Textarea, formatDate, useAsync, useToast } from '@globalantic/ui';
import type { ProjectRow, TaskRow, WorkUpdateRow } from '@/lib/types';
import { istDate } from '@/lib/util';
import s from '@/lib/page.module.css';

function UpdateForm({ projects, tasks, onCreated }: { projects: ProjectRow[]; tasks: TaskRow[]; onCreated: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(istDate());
  const [summary, setSummary] = useState('');
  const [minutes, setMinutes] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const minDate = istDate(7);
  const maxDate = istDate();

  const taskOptions = useMemo(
    () => tasks.filter((t) => !projectId || t.project?.id === projectId).map((t) => ({ value: t.id, label: t.title })),
    [tasks, projectId],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const local: Record<string, string> = {};
    if (date < minDate || date > maxDate) local.date = 'Choose today or one of the previous 7 days';
    if (summary.trim().length < 3) local.summary = 'Describe what you worked on';
    const mins = minutes ? Number(minutes) : undefined;
    if (mins !== undefined && (!Number.isInteger(mins) || mins < 1 || mins > 1440)) local.minutes = 'Enter whole minutes between 1 and 1440';
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      await api().employee.addWorkUpdate({ date, summary: summary.trim(), minutes: mins, projectId: projectId || undefined, taskId: taskId || undefined });
      toast('Work update saved.', 'success');
      setSummary('');
      setMinutes('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={s.stack}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Date" type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} error={fields.date} required />
        <Input label="Time spent (minutes)" type="number" inputMode="numeric" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} error={fields.minutes} />
        <Select
          label="Project (optional)"
          placeholder="No project"
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value);
            setTaskId('');
          }}
          error={fields.projectId}
        />
        <Select label="Task (optional)" placeholder="No task" options={taskOptions} value={taskId} onChange={(e) => setTaskId(e.target.value)} error={fields.taskId} />
        <Textarea label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} error={fields.summary} rows={4} maxLength={2000} required containerClassName={s.full} />
      </div>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Save update
        </Button>
      </div>
    </form>
  );
}

export default function WorkUpdatesPage() {
  const options = useAsync(
    () => Promise.all([api().employee.projects() as Promise<ProjectRow[]>, api().employee.tasks() as Promise<TaskRow[]>]),
    'work-update-options',
  );
  const list = useAsync(() => api().employee.workUpdates() as Promise<WorkUpdateRow[]>, 'work-updates');

  return (
    <div className={s.stack}>
      <PageHeader title="Work updates" description="Log what you worked on. Updates can be added for today or the previous 7 days." />
      <Card title="New update">
        <AsyncView state={options}>{([projects, tasks]) => <UpdateForm projects={projects} tasks={tasks} onCreated={list.reload} />}</AsyncView>
      </Card>
      <Card title="My recent updates">
        <AsyncView state={list} empty={{ title: 'No updates yet' }} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <ul className={s.list}>
              {rows.map((u) => (
                <li key={u.id} className={s.item}>
                  <div className={s.itemHead}>
                    <span className={s.itemTitle}>{formatDate(u.date)}</span>
                    {u.minutes !== null && <span className={s.small}>{u.minutes} min</span>}
                  </div>
                  <p className={s.body}>{u.summary}</p>
                  {(u.project || u.task) && <p className={s.small}>{[u.project?.name, u.task?.title].filter(Boolean).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          )}
        </AsyncView>
      </Card>
    </div>
  );
}
