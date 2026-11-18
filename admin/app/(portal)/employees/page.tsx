'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { EMPLOYMENT_TYPES, enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Button,
  DataTable,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Toolbar,
  formatDate,
  todayIso,
  useAsync,
  useDebounced,
  useSession,
  useToast,
} from '@globalantic/ui';
import { SortHeader, enumOptions, useSort } from '@/lib/admin';
import { useEmployeeOptions } from '@/lib/hr';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  role: 'EMPLOYEE',
  department: '',
  designation: '',
  employmentType: 'FULL_TIME',
  joiningDate: todayIso(),
  managerId: '',
  workLocation: '',
};

function CreateEmployeeModal({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const toast = useToast();
  const managers = useEmployeeOptions();
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setFields({});
    try {
      const created = await api().hr.createEmployee({
        name: v.name,
        email: v.email,
        phone: v.phone || undefined,
        role: v.role,
        department: v.department,
        designation: v.designation,
        employmentType: v.employmentType,
        joiningDate: v.joiningDate,
        managerId: v.managerId || undefined,
        workLocation: v.workLocation || undefined,
      });
      if (created.inviteEmail === 'SENT') toast('Employee created — an invitation email has been sent');
      else toast('Employee created, but the invitation email was not sent. Use "Send password reset" on the user page to send it.', 'info');
      onDone(created.id);
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="New employee"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={pending}>Create & invite</Button>
        </>
      }
    >
      <p className={s.muted}>The employee receives an email link to choose their own password. The employee code is generated automatically.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <form className={s.formGrid} onSubmit={submit} noValidate>
        <Input label="Full name" required value={v.name} onChange={set('name')} error={fields.name} maxLength={120} />
        <Input label="Work email" type="email" required value={v.email} onChange={set('email')} error={fields.email} />
        <Input label="Phone" type="tel" value={v.phone} onChange={set('phone')} error={fields.phone} maxLength={20} />
        <Select
          label="Access"
          value={v.role}
          onChange={set('role')}
          options={[
            { value: 'EMPLOYEE', label: 'Employee — employee portal only' },
            { value: 'HR', label: 'HR — manages employees, leave and HR requests' },
          ]}
          error={fields.role}
        />
        <Input label="Department" required value={v.department} onChange={set('department')} error={fields.department} maxLength={80} />
        <Input label="Designation" required value={v.designation} onChange={set('designation')} error={fields.designation} maxLength={120} />
        <Select label="Employment type" value={v.employmentType} onChange={set('employmentType')} options={enumOptions(EMPLOYMENT_TYPES)} error={fields.employmentType} />
        <Input label="Joining date" type="date" required value={v.joiningDate} onChange={set('joiningDate')} error={fields.joiningDate} />
        <Select
          label="Manager"
          value={v.managerId}
          onChange={set('managerId')}
          placeholder={managers.loading ? 'Loading…' : 'No manager'}
          options={managers.options}
          error={fields.managerId}
          hint={managers.error ? 'Could not load the employee list' : undefined}
        />
        <Input label="Work location" value={v.workLocation} onChange={set('workLocation')} error={fields.workLocation} maxLength={120} />
      </form>
    </Modal>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const { can } = useSession();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().hr.employees({ search: q, department, page, pageSize: 20, sort }), `${q}|${department}|${page}|${sort ?? ''}`);
  const departments = state.data?.departments ?? [];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Employee records, attendance, leave, documents and HR requests."
        actions={can('employees.manage') ? <Button size="sm" onClick={() => setCreating(true)}>New employee</Button> : undefined}
      />
      <Toolbar>
        <Input label="Search" placeholder="Name, email, code or designation" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Department" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }} placeholder="All departments" options={departments.map((d) => ({ value: d, label: d }))} />
      </Toolbar>
      <AsyncView
        state={state}
        isEmpty={(d) => d.items.length === 0}
        empty={{ title: q || department ? 'No employees match these filters' : 'No employees yet', description: can('employees.manage') ? 'Create the first employee record to get started.' : undefined }}
      >
        {(d) => (
          <>
            <DataTable<Row>
              caption="Employees"
              rows={d.items}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/employees/${r.user.id}`)}
              columns={[
                { key: 'name', header: <SortHeader label="Employee" field="name" sort={sort} onSort={onSort} />, render: (r) => (<><Link className={s.link} href={`/employees/${r.user.id}`}>{r.user.name}</Link><div className={s.small}>{r.user.email}</div></>) },
                { key: 'code', header: <SortHeader label="Code" field="employeeCode" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => <span className={s.mono}>{r.employeeCode}</span> },
                { key: 'dept', header: <SortHeader label="Department" field="department" sort={sort} onSort={onSort} />, render: (r) => (<><div>{r.department}</div><div className={s.small}>{r.designation}</div></>) },
                { key: 'type', header: 'Type', hideOnMobile: true, render: (r) => enumLabel(r.employmentType) },
                { key: 'mgr', header: 'Manager', hideOnMobile: true, render: (r) => r.manager?.name ?? '—' },
                { key: 'join', header: <SortHeader label="Joined" field="joiningDate" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.joiningDate) },
                { key: 'st', header: 'Status', render: (r) => (r.exitDate ? <span className={s.small}>Exited {formatDate(r.exitDate)}</span> : <StatusBadge status={r.user.status} />) },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {creating && (
        <CreateEmployeeModal
          onClose={() => setCreating(false)}
          onDone={(id) => {
            setCreating(false);
            router.push(`/employees/${id}`);
          }}
        />
      )}
    </>
  );
}
