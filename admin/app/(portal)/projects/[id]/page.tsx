'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { TASK_PRIORITIES, TASK_STATUSES, enumLabel } from '@globalantic/types';
import {
  Alert,
  Button,
  Card,
  DataTable,
  DescriptionList,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  formatDate,
  toDateInput,
  useAsync,
  useToast,
} from '@globalantic/ui';
import { enumOptions, useConfirm } from '@/lib/admin';
import { useEmployeeOptions } from '@/lib/hr';
import { ProjectFormModal } from '../ProjectForm';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function AddMemberModal({ projectId, existing, onClose, onDone }: { projectId: string; existing: Set<string>; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const employees = useEmployeeOptions();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    if (!userId) {
      setFields({ userId: 'Choose an employee' });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().hr.addMember(projectId, userId, role.trim() || undefined);
      toast('Member added');
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
    <Modal open onClose={onClose} title="Add member" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Add</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      {employees.error && <Alert tone="danger">Could not load employees. <Button size="sm" variant="ghost" onClick={employees.reload}>Retry</Button></Alert>}
      <Select label="Employee" required value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={employees.loading ? 'Loading…' : 'Choose an employee'} options={employees.options.filter((o) => !existing.has(o.value))} error={fields.userId} />
      <Input label="Role on the project" value={role} onChange={(e) => setRole(e.target.value)} error={fields.role} maxLength={80} hint="Optional, e.g. Developer" />
    </Modal>
  );
}

function TaskModal({ projectId, members, task, onClose, onDone }: { projectId: string; members: Row[]; task?: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const editing = Boolean(task);
  const [v, setV] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    assigneeId: task?.assigneeId ?? '',
    priority: task?.priority ?? 'MEDIUM',
    status: task?.status ?? 'TODO',
    dueDate: toDateInput(task?.dueDate),
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    if (pending) return;
    if (!v.assigneeId) {
      setFields({ assigneeId: 'Choose an assignee' });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    const body = { title: v.title, description: v.description || null, assigneeId: v.assigneeId, projectId, priority: v.priority, status: v.status, dueDate: v.dueDate || null };
    try {
      if (editing) await api().hr.updateTask(task!.id, body);
      else await api().hr.createTask(body);
      toast(editing ? 'Task updated' : 'Task created — the assignee has been notified');
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
    <Modal open size="lg" onClose={onClose} title={editing ? 'Edit task' : 'New task'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>{editing ? 'Save' : 'Create task'}</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input containerClassName={s.span2} label="Title" required value={v.title} onChange={set('title')} error={fields.title} maxLength={200} />
        <Select label="Assignee" required value={v.assigneeId} onChange={set('assigneeId')} placeholder="Choose a project member" options={members.map((m) => ({ value: m.user.id, label: m.user.name }))} error={fields.assigneeId} hint="Only project members can be assigned" />
        <Input label="Due date" type="date" value={v.dueDate} onChange={set('dueDate')} error={fields.dueDate} />
        <Select label="Priority" value={v.priority} onChange={set('priority')} options={enumOptions(TASK_PRIORITIES)} error={fields.priority} />
        <Select label="Status" value={v.status} onChange={set('status')} options={enumOptions(TASK_STATUSES)} error={fields.status} />
        <Textarea containerClassName={s.span2} label="Description" value={v.description} onChange={set('description')} error={fields.description} rows={3} maxLength={4000} />
      </div>
    </Modal>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { ask, dialog } = useConfirm();
  const [modal, setModal] = useState<'edit' | 'member' | 'task' | null>(null);
  const [editingTask, setEditingTask] = useState<Row | null>(null);
  const state = useAsync(() => api().hr.project(id), `project-${id}`);

  if (state.loading && !state.data) return <LoadingState />;
  if (state.error) {
    return state.status === 404 ? (
      <EmptyState title="Project not found" action={<Link className={s.link} href="/projects">Back to projects</Link>} />
    ) : (
      <ErrorState message={state.error} onRetry={state.reload} />
    );
  }
  const p = state.data;
  if (!p) return <LoadingState />;
  const members: Row[] = p.members ?? [];

  return (
    <>
      <PageHeader
        eyebrow={<Link className={s.link} href="/projects">← Projects</Link>}
        title={p.name}
        description={p.description ?? undefined}
        actions={<Button size="sm" variant="outline" onClick={() => setModal('edit')}>Edit project</Button>}
      />
      <div className={s.stack}>
        <Card title="Overview">
          <DescriptionList
            items={[
              { label: 'Code', value: <span className={s.mono}>{p.code}</span> },
              { label: 'Status', value: <StatusBadge status={p.status} /> },
              { label: 'Start', value: p.startDate ? formatDate(p.startDate) : '—' },
              { label: 'End', value: p.endDate ? formatDate(p.endDate) : '—' },
            ]}
          />
        </Card>

        <Card title={`Members (${members.length})`} actions={<Button size="sm" variant="outline" onClick={() => setModal('member')}>Add member</Button>}>
          {members.length === 0 ? (
            <EmptyState title="No members yet" description="Add employees before assigning tasks." />
          ) : (
            <DataTable<Row>
              caption="Project members"
              rows={members}
              rowKey={(m) => m.id}
              columns={[
                { key: 'name', header: 'Member', render: (m) => (<><Link className={s.link} href={`/employees/${m.user.id}`}>{m.user.name}</Link><div className={s.small}>{m.user.email}</div></>) },
                { key: 'role', header: 'Role', render: (m) => m.role ?? '—' },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (m) => (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        ask({
                          title: `Remove ${m.user.name} from ${p.name}?`,
                          message: 'Members with open tasks cannot be removed until those tasks are reassigned or done.',
                          tone: 'danger',
                          confirmLabel: 'Remove',
                          onConfirm: async () => {
                            await api().hr.removeMember(p.id, m.user.id);
                            state.reload();
                          },
                          success: 'Member removed',
                        })
                      }
                    >
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card
          title={`Tasks (${p.tasks.length})`}
          actions={<Button size="sm" variant="outline" disabled={!members.length} title={members.length ? undefined : 'Add a member first'} onClick={() => { setEditingTask(null); setModal('task'); }}>New task</Button>}
        >
          {p.tasks.length === 0 ? (
            <EmptyState title="No tasks yet" />
          ) : (
            <DataTable<Row>
              caption="Project tasks"
              rows={p.tasks}
              rowKey={(t) => t.id}
              columns={[
                { key: 'title', header: 'Task', render: (t) => (<><div className={s.strong}>{t.title}</div>{t.description && <div className={s.small}>{t.description}</div>}</>) },
                { key: 'who', header: 'Assignee', render: (t) => t.assignee?.name ?? '—' },
                { key: 'pri', header: 'Priority', hideOnMobile: true, render: (t) => enumLabel(t.priority) },
                { key: 'due', header: 'Due', hideOnMobile: true, render: (t) => (t.dueDate ? formatDate(t.dueDate) : '—') },
                { key: 'st', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
                { key: 'x', header: <span className="sr-only">Actions</span>, render: (t) => <Button size="sm" variant="ghost" onClick={() => { setEditingTask(t); setModal('task'); }}>Edit</Button> },
              ]}
            />
          )}
        </Card>
      </div>

      {modal === 'edit' && <ProjectFormModal project={p} onClose={() => setModal(null)} onDone={() => state.reload()} />}
      {modal === 'member' && <AddMemberModal projectId={p.id} existing={new Set(members.map((m) => m.user.id))} onClose={() => setModal(null)} onDone={state.reload} />}
      {modal === 'task' && <TaskModal projectId={p.id} members={members} task={editingTask ?? undefined} onClose={() => setModal(null)} onDone={state.reload} />}
      {dialog}
    </>
  );
}
