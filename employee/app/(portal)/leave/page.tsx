'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { LEAVE_TYPES, enumLabel } from '@globalantic/types';
import { Alert, AsyncView, Button, Card, ConfirmDialog, DataTable, Input, PageHeader, Select, StatusBadge, Textarea, formatDate, useAsync, useToast } from '@globalantic/ui';
import type { LeaveRow } from '@/lib/types';
import { istDate, options } from '@/lib/util';
import s from '@/lib/page.module.css';

function LeaveForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [type, setType] = useState('CASUAL');
  const [startDate, setStart] = useState(istDate());
  const [endDate, setEnd] = useState(istDate());
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const local: Record<string, string> = {};
    if (endDate < startDate) local.endDate = 'End date must be on or after the start date';
    if (reason.trim().length < 3) local.reason = 'Please give a short reason';
    setFields(local);
    setError(null);
    if (Object.keys(local).length) return;
    setPending(true);
    try {
      const leave = (await api().employee.applyLeave({ type, startDate, endDate, reason: reason.trim() })) as LeaveRow;
      toast(`Leave requested for ${leave.days} day${leave.days === 1 ? '' : 's'}.`, 'success');
      setReason('');
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
        <Select label="Type" options={options(LEAVE_TYPES)} value={type} onChange={(e) => setType(e.target.value)} error={fields.type} required />
        <Input label="From" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} error={fields.startDate} required />
        <Input label="To" type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} error={fields.endDate} required />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} rows={3} maxLength={1000} required containerClassName={s.full} />
      </div>
      <p className={s.small}>The number of days is calculated by the system (calendar days, inclusive).</p>
      <div className={s.actions}>
        <Button type="submit" loading={pending}>
          Request leave
        </Button>
      </div>
    </form>
  );
}

export default function LeavePage() {
  const toast = useToast();
  const state = useAsync(() => api().employee.leaves() as Promise<LeaveRow[]>, 'leaves');
  const [cancelling, setCancelling] = useState<LeaveRow | null>(null);
  const today = istDate();

  return (
    <div className={s.stack}>
      <PageHeader title="Leave" description="Request leave and follow its approval. HR is notified automatically." />
      <Card title="New leave request">
        <LeaveForm onCreated={state.reload} />
      </Card>
      <Card title="My requests" padded={false}>
        <AsyncView state={state} empty={{ title: 'No leave requests yet' }} isEmpty={(d) => d.length === 0}>
          {(rows) => (
            <DataTable
              caption="Leave requests"
              rows={rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'type', header: 'Type', render: (r) => enumLabel(r.type) },
                { key: 'dates', header: 'Dates', render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
                { key: 'days', header: 'Days', render: (r) => r.days },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'note', header: 'HR note', hideOnMobile: true, render: (r) => r.reviewNote ?? '—' },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) =>
                    r.status === 'PENDING' || (r.status === 'APPROVED' && r.startDate.slice(0, 10) > today) ? (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                        Cancel
                      </Button>
                    ) : null,
                },
              ]}
            />
          )}
        </AsyncView>
      </Card>
      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this leave request?"
        message={cancelling ? `${enumLabel(cancelling.type)} leave, ${formatDate(cancelling.startDate)} – ${formatDate(cancelling.endDate)}.` : undefined}
        confirmLabel="Cancel request"
        tone="danger"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await api().employee.cancelLeave(cancelling.id);
          } catch (err) {
            throw new Error(errorMessage(err));
          }
          toast('Leave request cancelled.', 'success');
          state.reload();
        }}
      />
    </div>
  );
}
