'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, DataTable, Input, Modal, PageHeader, Select, StatusBadge, formatDate, formatDateTime, useAsync, useSession, useToast } from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function CreateStaffModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: '', email: '', phone: '', role: 'TRAINER' as 'TRAINER' | 'FINANCE' | 'EDITOR' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const created = await api().admin.createStaff({ name: v.name, email: v.email, phone: v.phone || undefined, role: v.role });
      if (created.inviteEmail === 'SENT') toast('Account created — an invitation email has been sent');
      else toast('Account created, but the invitation email was not sent. Use "Send password reset" on the user page to send it.', 'info');
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
    <Modal open onClose={onClose} title="Create staff account" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Create & invite</Button></>}>
      <p className={s.muted}>The person receives an email link to choose their own password (valid 24 hours). Administrator accounts cannot be created here.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Full name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={fields.name} maxLength={120} />
      <Input label="Email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={fields.email} />
      <Input label="Phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} error={fields.phone} maxLength={20} />
      <Select
        label="Role"
        value={v.role}
        onChange={(e) => setV({ ...v, role: e.target.value as typeof v.role })}
        options={[
          { value: 'TRAINER', label: 'Trainer — trainer portal, assigned batches only' },
          { value: 'FINANCE', label: 'Finance — payments and referral rewards' },
          { value: 'EDITOR', label: 'Editor — website CMS only' },
        ]}
      />
    </Modal>
  );
}

export default function StaffPage() {
  const { user, can } = useSession();
  const { ask, dialog } = useConfirm();
  const [creating, setCreating] = useState(false);
  const staff = useAsync(() => api().admin.staff(), 'staff');
  const trainers = useAsync(() => api().admin.trainers(), 'trainers-assignments');
  const batchesByTrainer = new Map<string, Row[]>((trainers.data ?? []).map((t) => [t.id, t.trainerAssignments ?? []]));

  return (
    <>
      <PageHeader title="Staff & trainers" description="Staff accounts and their access. Trainers see only the batches assigned to them." actions={<Button size="sm" onClick={() => setCreating(true)}>New staff account</Button>} />
      <AsyncView state={staff} isEmpty={(d) => d.length === 0} empty={{ title: 'No staff accounts' }}>
        {(rows) => (
          <DataTable<Row>
            caption="Staff accounts"
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Name', render: (r) => (<><div className={s.strong}>{r.name}</div><div className={s.small}>{r.email}</div></>) },
              { key: 'role', header: 'Role', render: (r) => enumLabel(r.role) },
              {
                key: 'batches',
                header: 'Assigned batches',
                hideOnMobile: true,
                render: (r) => (r.role === 'TRAINER' ? (batchesByTrainer.get(r.id) ?? []).map((a: Row) => `${a.batch.name} (${a.batch.course.title})`).join(', ') || 'None' : '—'),
              },
              { key: 'login', header: 'Last sign-in', hideOnMobile: true, render: (r) => (r.lastLoginAt ? formatDateTime(r.lastLoginAt) : `Never · invited ${formatDate(r.createdAt)}`) },
              { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'x',
                header: <span className="sr-only">Actions</span>,
                render: (r) =>
                  r.role === 'ADMIN' || r.id === user.id || !can('training.students.manage') ? null : r.status === 'ACTIVE' ? (
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: `Suspend ${r.name}?`, message: 'Their sessions end immediately.', confirmLabel: 'Suspend', tone: 'danger', requireReason: true, onConfirm: async (reason) => { await api().admin.setUserStatus(r.id, 'SUSPENDED', reason); staff.reload(); }, success: 'Account suspended' })}>Suspend</Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => ask({ title: `Reactivate ${r.name}?`, confirmLabel: 'Reactivate', requireReason: true, onConfirm: async (reason) => { await api().admin.setUserStatus(r.id, 'ACTIVE', reason); staff.reload(); }, success: 'Account reactivated' })}>Reactivate</Button>
                  ),
              },
            ]}
          />
        )}
      </AsyncView>
      {creating && <CreateStaffModal onClose={() => setCreating(false)} onDone={() => { staff.reload(); trainers.reload(); }} />}
      {dialog}
    </>
  );
}
