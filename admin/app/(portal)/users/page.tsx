'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@globalantic/api-client';
import { ROLES, enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Badge,
  Button,
  DataTable,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Toolbar,
  buttonClass,
  formatDate,
  formatDateTime,
  useAsync,
  useDebounced,
  useSession,
} from '@globalantic/ui';
import { SortHeader, useConfirm, useSort } from '@/lib/admin';
import { ChangeRoleModal, CreateUserModal } from '@/lib/users';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

export default function UsersPage() {
  const { user: me, can } = useSession();
  const { ask, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [changing, setChanging] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { sort, toggle } = useSort();
  const onSort = (f: string) => { toggle(f); setPage(1); };
  const state = useAsync(() => api().platform.users({ search: q, role, status, page, pageSize: 25, sort }), `${q}|${role}|${status}|${page}|${sort ?? ''}`);
  const roles = useAsync(() => api().platform.roles(), 'roles-matrix');
  const assignable = (roles.data ?? []).filter((r) => r.assignable).map((r) => r.role);
  const creatable = (roles.data ?? []).filter((r) => r.creatable).map((r) => r.role);
  const superAdmin = can('admins.manage');
  // Mirrors the API rules: other admins need a Super Admin; Super Admin accounts are never changed here.
  const manageable = (r: Row) => r.id !== me.id && !r.isSuperAdmin && (r.role !== 'ADMIN' || superAdmin);
  const counts: Record<string, number> = state.data?.roleCounts ?? {};

  return (
    <>
      <PageHeader
        title="Users & roles"
        description="All accounts on the platform. Account creation, role and status changes are audited; role and status changes sign the user out."
        actions={
          <div className={s.actions}>
            <Link className={buttonClass('outline', 'sm')} href="/roles">View permission matrix</Link>
            {creatable.length > 0 && <Button size="sm" onClick={() => setCreating(true)}>Add user</Button>}
          </div>
        }
      />
      <Toolbar>
        <Input label="Search" placeholder="Name or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select label="Role" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} placeholder="All roles" options={ROLES.map((r) => ({ value: r, label: `${enumLabel(r)}${counts[r] !== undefined ? ` (${counts[r]})` : ''}` }))} />
        <Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All" options={[{ value: 'ACTIVE', label: 'Active' }, { value: 'SUSPENDED', label: 'Suspended' }]} />
      </Toolbar>
      {roles.error && <Alert tone="warning">Could not load assignable roles — role changes are unavailable. <Button size="sm" variant="ghost" onClick={roles.reload}>Retry</Button></Alert>}
      <AsyncView state={state} isEmpty={(d) => d.items.length === 0} empty={{ title: 'No users match these filters' }}>
        {(d) => (
          <>
            <DataTable<Row>
              caption="Users"
              rows={d.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'name', header: <SortHeader label="User" field="name" sort={sort} onSort={onSort} />, render: (r) => (<><Link className={s.link} href={`/users/${r.id}`}>{r.name}{r.id === me.id && ' (you)'}</Link></>) },
                { key: 'email', header: <SortHeader label="Email" field="email" sort={sort} onSort={onSort} />, render: (r) => <span className={s.small}>{r.email}</span> },
                { key: 'role', header: <SortHeader label="Role" field="role" sort={sort} onSort={onSort} />, render: (r) => (<>{enumLabel(r.role)}{r.isSuperAdmin && <> <Badge tone="primary">Super Admin</Badge></>}{r.department && <div className={s.small}>{r.department}</div>}{r.accessExpiresAt && <div className={s.small}>Temporary · until {formatDateTime(r.accessExpiresAt)}</div>}</>) },
                { key: 'login', header: <SortHeader label="Last sign-in" field="lastLoginAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => (r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Never') },
                { key: 'created', header: <SortHeader label="Created" field="createdAt" sort={sort} onSort={onSort} />, hideOnMobile: true, render: (r) => formatDate(r.createdAt) },
                { key: 'st', header: 'Status', render: (r) => (<><StatusBadge status={r.status} />{!r.emailVerifiedAt && <div className={s.small}>Email unverified</div>}</>) },
                {
                  key: 'x',
                  header: <span className="sr-only">Actions</span>,
                  render: (r) => {
                    if (!manageable(r)) return <span className={s.small}>Protected</span>;
                    return (
                      <div className={s.actions}>
                        {r.role !== 'STUDENT' && assignable.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setChanging(r)}>Change role</Button>
                        )}
                        {(r.status === 'ACTIVE' ? (
                            <Button size="sm" variant="ghost" onClick={() => ask({ title: `Suspend ${r.name}?`, message: 'Their sessions end immediately.', tone: 'danger', confirmLabel: 'Suspend', requireReason: true, onConfirm: async (reason) => { await api().platform.setStatus(r.id, 'SUSPENDED', reason); state.reload(); }, success: 'Account suspended' })}>Suspend</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => ask({ title: `Reactivate ${r.name}?`, confirmLabel: 'Reactivate', requireReason: true, onConfirm: async (reason) => { await api().platform.setStatus(r.id, 'ACTIVE', reason); state.reload(); }, success: 'Account reactivated' })}>Reactivate</Button>
                          ))}
                      </div>
                    );
                  },
                },
              ]}
            />
            <Pagination page={d.page} totalPages={d.totalPages} onChange={setPage} />
          </>
        )}
      </AsyncView>
      {creating && <CreateUserModal creatable={creatable} onClose={() => setCreating(false)} onDone={state.reload} />}
      {changing && <ChangeRoleModal user={changing} assignable={assignable} onClose={() => setChanging(null)} onDone={state.reload} />}
      {dialog}
    </>
  );
}
