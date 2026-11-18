'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { EMPLOYEE_ATTENDANCE_STATUSES, EMPLOYEE_DOCUMENT_CATEGORIES, EMPLOYMENT_TYPES, enumLabel } from '@globalantic/types';
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  Tabs,
  Textarea,
  formatDate,
  formatDateTime,
  toDateInput,
  todayIso,
  useAsync,
  useSession,
  useToast,
} from '@globalantic/ui';
import { enumOptions, useConfirm } from '@/lib/admin';
import { UPLOAD_ACCEPT, checkUpload, fileSize, useEmployeeOptions } from '@/lib/hr';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;
type Tab = 'profile' | 'attendance' | 'leave' | 'tasks' | 'requests' | 'documents';

function EditProfileModal({ emp, onClose, onDone }: { emp: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const managers = useEmployeeOptions();
  const p = emp.employeeProfile;
  const [v, setV] = useState({
    name: emp.name ?? '',
    department: p.department ?? '',
    designation: p.designation ?? '',
    employmentType: p.employmentType,
    joiningDate: toDateInput(p.joiningDate),
    exitDate: toDateInput(p.exitDate),
    managerId: p.managerId ?? '',
    workLocation: p.workLocation ?? '',
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async () => {
    if (pending) return;
    if (v.reason.trim().length < 3) {
      setFields({ reason: 'A reason is required (at least 3 characters)' });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().hr.updateEmployee(emp.id, {
        name: v.name,
        department: v.department,
        designation: v.designation,
        employmentType: v.employmentType,
        joiningDate: v.joiningDate,
        exitDate: v.exitDate || null,
        managerId: v.managerId || null,
        workLocation: v.workLocation || null,
        reason: v.reason,
      });
      toast('Employee updated');
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
    <Modal open size="lg" onClose={onClose} title="Edit employee" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save changes</Button></>}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className={s.formGrid}>
        <Input label="Full name" value={v.name} onChange={set('name')} error={fields.name} maxLength={120} />
        <Input label="Department" value={v.department} onChange={set('department')} error={fields.department} maxLength={80} />
        <Input label="Designation" value={v.designation} onChange={set('designation')} error={fields.designation} maxLength={120} />
        <Select label="Employment type" value={v.employmentType} onChange={set('employmentType')} options={enumOptions(EMPLOYMENT_TYPES)} error={fields.employmentType} />
        <Input label="Joining date" type="date" value={v.joiningDate} onChange={set('joiningDate')} error={fields.joiningDate} />
        <Input label="Exit date" type="date" value={v.exitDate} onChange={set('exitDate')} error={fields.exitDate} hint="Leave empty while employed" />
        <Select
          label="Manager"
          value={v.managerId}
          onChange={set('managerId')}
          placeholder="No manager"
          options={managers.options.filter((o) => o.value !== emp.id)}
          error={fields.managerId}
        />
        <Input label="Work location" value={v.workLocation} onChange={set('workLocation')} error={fields.workLocation} maxLength={120} />
        <Textarea containerClassName={s.span2} label="Reason for change" required value={v.reason} onChange={set('reason')} error={fields.reason} rows={2} maxLength={500} hint="Recorded in the audit log" />
      </div>
    </Modal>
  );
}

function AttendanceModal({ empId, onClose, onDone }: { empId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ date: todayIso(), status: 'PRESENT', notes: '', reason: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      await api().hr.correctAttendance(empId, { date: v.date, status: v.status, notes: v.notes || null, reason: v.reason });
      toast('Attendance corrected');
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
    <Modal open onClose={onClose} title="Correct attendance" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save correction</Button></>}>
      <p className={s.muted}>Corrections replace the day&apos;s record and are audited with the previous value.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Date" type="date" required value={v.date} max={todayIso()} onChange={(e) => setV({ ...v, date: e.target.value })} error={fields.date} />
      <Select label="Status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} options={enumOptions(EMPLOYEE_ATTENDANCE_STATUSES)} error={fields.status} />
      <Input label="Notes" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} error={fields.notes} maxLength={300} />
      <Textarea label="Reason" required value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} error={fields.reason} rows={2} maxLength={500} />
    </Modal>
  );
}

function UploadDocumentModal({ empId, onClose, onDone }: { empId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [v, setV] = useState({ title: '', category: 'OTHER', visibleToEmployee: true });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    const local: Record<string, string> = {};
    const fileErr = checkUpload(file);
    if (fileErr) local.file = fileErr;
    if (v.title.trim().length < 2) local.title = 'Enter a title';
    setFields(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const uploaded = await api().files.upload(file!, 'EMPLOYEE_DOCUMENT');
      await api().hr.addDocument(empId, { title: v.title.trim(), category: v.category, fileId: uploaded.id, visibleToEmployee: v.visibleToEmployee });
      toast('Document added');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      const f = fieldErrorMap(err);
      setFields(f.fileId ? { ...f, file: f.fileId } : f);
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add document" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Upload</Button></>}>
      <p className={s.muted}>PDF, PNG, JPEG or WEBP, up to 5 MB. Files are stored privately and can only be downloaded by HR/admins and (if visible) this employee.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="File" type="file" accept={UPLOAD_ACCEPT} required onChange={(e) => setFile(e.target.files?.[0] ?? null)} error={fields.file} />
      <Input label="Title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} error={fields.title} maxLength={160} />
      <Select label="Category" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} options={enumOptions(EMPLOYEE_DOCUMENT_CATEGORIES)} error={fields.category} />
      <Checkbox label="Visible to the employee in their portal" checked={v.visibleToEmployee} onChange={(e) => setV({ ...v, visibleToEmployee: e.target.checked })} />
    </Modal>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const manage = can('employees.manage');
  const { ask, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('profile');
  const [modal, setModal] = useState<'edit' | 'attendance' | 'document' | null>(null);
  const state = useAsync(() => api().hr.employee(id), `employee-${id}`);

  if (state.loading && !state.data) return <LoadingState />;
  if (state.error) {
    return state.status === 404 ? (
      <EmptyState title="Employee not found" description="The record does not exist or you do not have access." action={<Link className={s.link} href="/employees">Back to employees</Link>} />
    ) : (
      <ErrorState message={state.error} onRetry={state.reload} />
    );
  }
  const e = state.data;
  if (!e) return <LoadingState />;
  const p = e.employeeProfile;

  return (
    <>
      <PageHeader
        eyebrow={<Link className={s.link} href="/employees">← Employees</Link>}
        title={e.name}
        description={<>{`${p.designation} · ${p.department} · ${p.employeeCode}`} · <StatusBadge status={e.status} /></>}
        actions={
          manage ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setModal('edit')}>Edit employee</Button>
              {['EMPLOYEE', 'HR'].includes(e.role) &&
                (e.status === 'ACTIVE' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      ask({
                        title: `Deactivate ${e.name}?`,
                        message: 'They are signed out everywhere immediately and cannot sign in until reactivated.',
                        tone: 'danger',
                        confirmLabel: 'Deactivate',
                        requireReason: true,
                        onConfirm: async (reason) => {
                          await api().hr.setEmployeeStatus(e.id, 'SUSPENDED', reason);
                          state.reload();
                        },
                        success: 'Employee deactivated',
                      })
                    }
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      ask({
                        title: `Reactivate ${e.name}?`,
                        confirmLabel: 'Reactivate',
                        requireReason: true,
                        onConfirm: async (reason) => {
                          await api().hr.setEmployeeStatus(e.id, 'ACTIVE', reason);
                          state.reload();
                        },
                        success: 'Employee reactivated',
                      })
                    }
                  >
                    Reactivate
                  </Button>
                ))}
            </>
          ) : undefined
        }
      />
      <Tabs<Tab>
        label="Employee sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'profile', label: 'Profile' },
          { value: 'attendance', label: 'Attendance', count: e.attendance.length },
          { value: 'leave', label: 'Leave', count: e.leaves.length },
          { value: 'tasks', label: 'Tasks', count: e.tasks.length },
          { value: 'requests', label: 'HR requests', count: e.hrRequests.length },
          { value: 'documents', label: 'Documents', count: e.documents.length },
        ]}
      />

      {tab === 'profile' && (
        <div className={s.grid2}>
          <Card title="Employment">
            <DescriptionList
              items={[
                { label: 'Employee code', value: <span className={s.mono}>{p.employeeCode}</span> },
                { label: 'Department', value: p.department },
                { label: 'Designation', value: p.designation },
                { label: 'Employment type', value: enumLabel(p.employmentType) },
                { label: 'Joining date', value: formatDate(p.joiningDate) },
                { label: 'Exit date', value: p.exitDate ? formatDate(p.exitDate) : 'Currently employed' },
                { label: 'Manager', value: p.manager?.name ?? '—' },
                { label: 'Work location', value: p.workLocation ?? '—' },
              ]}
            />
          </Card>
          <Card title="Account & contact">
            <DescriptionList
              items={[
                { label: 'Email', value: e.email },
                { label: 'Phone', value: e.phone ?? '—' },
                { label: 'Portal access', value: enumLabel(e.role) },
                { label: 'Account status', value: <StatusBadge status={e.status} /> },
                { label: 'Last sign-in', value: e.lastLoginAt ? formatDateTime(e.lastLoginAt) : 'Never' },
                { label: 'Emergency contact', value: p.emergencyContactName ? `${p.emergencyContactName}${p.emergencyContactPhone ? ` · ${p.emergencyContactPhone}` : ''}` : '—' },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card title="Last 90 days" actions={manage ? <Button size="sm" variant="outline" onClick={() => setModal('attendance')}>Correct attendance</Button> : undefined}>
          {e.attendance.length === 0 ? (
            <EmptyState title="No attendance records" description="Check-ins from the employee portal appear here." />
          ) : (
            <DataTable<Row>
              caption="Attendance"
              rows={e.attendance}
              rowKey={(r) => r.id}
              columns={[
                { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
                { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                { key: 'in', header: 'Check-in', hideOnMobile: true, render: (r) => (r.checkInAt ? formatDateTime(r.checkInAt) : '—') },
                { key: 'out', header: 'Check-out', hideOnMobile: true, render: (r) => (r.checkOutAt ? formatDateTime(r.checkOutAt) : '—') },
                { key: 'notes', header: 'Notes', hideOnMobile: true, render: (r) => (<>{r.notes ?? '—'}{r.correctedById && <div className={s.small}>Corrected by HR</div>}</>) },
              ]}
            />
          )}
        </Card>
      )}

      {tab === 'leave' && (
        <Card title="Leave history" actions={can('leave.approve') ? <Link className={s.link} href="/leave">Open leave approvals</Link> : undefined}>
          {e.leaves.length === 0 ? (
            <EmptyState title="No leave requests" />
          ) : (
            <DataTable<Row>
              caption="Leave requests"
              rows={e.leaves}
              rowKey={(r) => r.id}
              columns={[
                { key: 'type', header: 'Type', render: (r) => enumLabel(r.type) },
                { key: 'dates', header: 'Dates', render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
                { key: 'days', header: 'Days', render: (r) => r.days },
                { key: 'reason', header: 'Reason', hideOnMobile: true, render: (r) => r.reason },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{r.reviewNote && <div className={s.small}>{r.reviewNote}</div>}</>) },
              ]}
            />
          )}
        </Card>
      )}

      {tab === 'tasks' && (
        <Card title="Assigned tasks" actions={can('projects.manage') ? <Link className={s.link} href="/projects">Manage projects</Link> : undefined}>
          {e.tasks.length === 0 ? (
            <EmptyState title="No tasks assigned" />
          ) : (
            <DataTable<Row>
              caption="Tasks"
              rows={e.tasks}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: 'Task', render: (r) => (<><div className={s.strong}>{r.title}</div><div className={s.small}>{r.project?.name ?? 'No project'}</div></>) },
                { key: 'pri', header: 'Priority', render: (r) => enumLabel(r.priority) },
                { key: 'due', header: 'Due', hideOnMobile: true, render: (r) => (r.dueDate ? formatDate(r.dueDate) : '—') },
                { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
          )}
        </Card>
      )}

      {tab === 'requests' && (
        <Card title="HR requests" actions={can('hr.requests.manage') ? <Link className={s.link} href="/hr-requests">Open HR inbox</Link> : undefined}>
          {e.hrRequests.length === 0 ? (
            <EmptyState title="No HR requests" />
          ) : (
            <div className={s.list}>
              {e.hrRequests.map((r: Row) => (
                <div key={r.id} className={s.listItem}>
                  <div className={s.rowBetween}>
                    <span className={s.strong}>{r.subject}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className={s.small}>{enumLabel(r.category)} · {formatDateTime(r.createdAt)}</div>
                  <p>{r.message}</p>
                  {r.response && <p className={s.muted}>Response: {r.response}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'documents' && (
        <Card title="Documents" actions={manage ? <Button size="sm" variant="outline" onClick={() => setModal('document')}>Add document</Button> : undefined}>
          {e.documents.length === 0 ? (
            <EmptyState title="No documents" description={manage ? 'Upload offer letters, ID proofs, payslips or policies.' : undefined} />
          ) : (
            <DataTable<Row>
              caption="Documents"
              rows={e.documents}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: 'Document', render: (r) => (<><a className={s.link} href={api().files.url(r.file.id)}>{r.title}</a><div className={s.small}>{r.file.name} · {fileSize(r.file.sizeBytes)}</div></>) },
                { key: 'cat', header: 'Category', hideOnMobile: true, render: (r) => enumLabel(r.category) },
                { key: 'vis', header: 'Visible to employee', render: (r) => (r.visibleToEmployee ? 'Yes' : 'No (internal)') },
                { key: 'date', header: 'Added', hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) =>
                    manage ? (
                      <div className={s.actions}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            ask({
                              title: r.visibleToEmployee ? 'Hide from employee?' : 'Show to employee?',
                              requireReason: true,
                              confirmLabel: r.visibleToEmployee ? 'Hide' : 'Show',
                              onConfirm: async (reason) => {
                                await api().hr.updateDocument(r.id, { visibleToEmployee: !r.visibleToEmployee, reason });
                                state.reload();
                              },
                              success: 'Visibility updated',
                            })
                          }
                        >
                          {r.visibleToEmployee ? 'Hide' : 'Show'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            ask({
                              title: `Remove “${r.title}”?`,
                              message: 'The document is removed from both portals. This is audited.',
                              tone: 'danger',
                              requireReason: true,
                              confirmLabel: 'Remove',
                              onConfirm: async (reason) => {
                                await api().hr.updateDocument(r.id, { remove: true, reason });
                                state.reload();
                              },
                              success: 'Document removed',
                            })
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ) : null,
                },
              ]}
            />
          )}
        </Card>
      )}

      {modal === 'edit' && <EditProfileModal emp={e} onClose={() => setModal(null)} onDone={state.reload} />}
      {modal === 'attendance' && <AttendanceModal empId={e.id} onClose={() => setModal(null)} onDone={state.reload} />}
      {modal === 'document' && <UploadDocumentModal empId={e.id} onClose={() => setModal(null)} onDone={state.reload} />}
      {dialog}
    </>
  );
}
