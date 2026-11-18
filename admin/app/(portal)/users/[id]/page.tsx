'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, errorMessage, fieldErrorMap } from '@globalantic/api-client';
import { enumLabel } from '@globalantic/types';
import {
  Alert,
  AsyncView,
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  DescriptionList,
  ErrorState,
  Input,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  Textarea,
  formatDateTime,
  useAsync,
  useSession,
  useToast,
} from '@globalantic/ui';
import { useConfirm } from '@/lib/admin';
import { ChangeRoleModal } from '@/lib/users';
import s from '@/lib/admin.module.css';

type Row = Record<string, any>;

function EditUserModal({ user, onClose, onDone }: { user: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState<string>(user.name ?? '');
  const [phone, setPhone] = useState<string>(user.phone ?? '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async () => {
    if (pending) return;
    const local: Record<string, string> = {};
    if (name.trim().length < 2) local.name = 'Enter a name (at least 2 characters)';
    if (reason.trim().length < 3) local.reason = 'A reason is required (at least 3 characters)';
    setFields(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const input: { name?: string; phone?: string | null; reason: string } = { reason: reason.trim() };
      if (name.trim() !== user.name) input.name = name.trim();
      if (phone.trim() !== (user.phone ?? '')) input.phone = phone.trim() ? phone.trim() : null;
      await api().platform.updateUser(user.id, input);
      toast('User updated');
      onDone();
      onClose();
    } catch (err) {
      // 409 = phone already used by another account; 422 = field errors.
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${user.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Save changes</Button></>}>
      <p className={s.muted}>Only the name and phone can be edited here. Email, role and status have their own audited actions.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={fields.name} maxLength={120} />
      <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={fields.phone} hint="Leave empty to remove the phone number" maxLength={20} />
      <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} hint="Recorded in the audit log" maxLength={500} />
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: Row; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [revoke, setRevoke] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async () => {
    if (pending) return;
    if (reason.trim().length < 3) {
      setFields({ reason: 'A reason is required (at least 3 characters)' });
      return;
    }
    setPending(true);
    setError(null);
    setFields({});
    try {
      const r = await api().platform.sendPasswordReset(user.id, { revokeSessions: revoke, reason: reason.trim() });
      if (r.sent) toast(`A password reset link was sent to ${user.email}`);
      else toast(`The reset link was created but the email was not sent (${r.delivery === 'SKIPPED' ? 'email is not configured' : 'delivery failed'}).`, 'danger');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Send password reset link" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending}>Send link</Button></>}>
      <p className={s.muted}>
        A single-use reset link is emailed to <strong>{user.email}</strong>. You never see or set the password yourself.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Checkbox label="Also sign this user out of every device now" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
      <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} hint="Recorded in the audit log" maxLength={500} />
    </Modal>
  );
}

function GrantModal({ user, options, onClose, onDone }: { user: Row; options: { value: string; label: string }[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [permission, setPermission] = useState(options[0]?.value ?? '');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const submit = async () => {
    if (pending) return;
    const local: Record<string, string> = {};
    if (!permission) local.permission = 'Choose a permission';
    if (reason.trim().length < 3) local.reason = 'A reason is required (at least 3 characters)';
    setFields(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      await api().platform.grantPermission(user.id, permission, reason.trim());
      toast(`Granted ${permission}`);
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
    <Modal open onClose={onClose} title={`Grant a permission to ${user.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!options.length}>Grant</Button></>}>
      <p className={s.muted}>Grants add to the user’s role and apply on their next request. Access-control, money-rule and audit permissions can’t be granted individually.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {options.length ? (
        <Select label="Permission" value={permission} onChange={(e) => setPermission(e.target.value)} options={options} error={fields.permission} />
      ) : (
        <Alert tone="info">This user already has every permission that can be granted individually.</Alert>
      )}
      <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} error={fields.reason} hint="Recorded in the audit log" maxLength={500} />
    </Modal>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, can } = useSession();
  const { ask, dialog } = useConfirm();
  const manage = can('users.manage');
  const state = useAsync(() => api().platform.user(id), `platform-user-${id}`);
  const roles = useAsync(() => (manage ? api().platform.roles() : Promise.resolve([])), `roles-${manage}`);
  const catalog = useAsync(() => (manage ? api().platform.permissions() : Promise.resolve([])), `perm-catalog-${manage}`);
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [changingRole, setChangingRole] = useState(false);
  const [granting, setGranting] = useState(false);

  if (!manage) {
    return (
      <>
        <PageHeader eyebrow={<Link className={s.link} href="/users">← Users & roles</Link>} title="User details" />
        <ErrorState title="Not available" message="You need the users.manage permission to view user details." />
      </>
    );
  }

  const assignable = (roles.data ?? []).filter((r) => r.assignable).map((r) => r.role);

  return (
    <>
      <AsyncView state={state}>
        {(u: Row) => {
          const isSelf = u.id === me.id;
          // Mirrors the API: other admins need a Super Admin; Super Admin accounts are never changed here.
          const protectedAdmin = !isSelf && (u.isSuperAdmin || (u.role === 'ADMIN' && !can('admins.manage')));
          const effective: string[] = u.effectivePermissions ?? [];
          const grantOptions = (catalog.data ?? [])
            .filter((p) => p.grantable && !effective.includes(p.permission))
            .map((p) => ({ value: p.permission, label: p.permission }));
          return (
            <>
              <PageHeader
                eyebrow={<Link className={s.link} href="/users">← Users & roles</Link>}
                title={u.name}
                description={<>{u.email} · {enumLabel(u.role)}{u.isSuperAdmin && ' · Super Admin'}{u.accessExpiresAt && ` · temporary access until ${formatDateTime(u.accessExpiresAt)}`} {isSelf && '(you)'}</>}
                actions={
                  <div className={s.actions}>
                    {!protectedAdmin && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit details</Button>}
                    {!protectedAdmin && u.status === 'ACTIVE' && <Button variant="outline" size="sm" onClick={() => setResetting(true)}>Send password reset link</Button>}
                    {!isSelf && !protectedAdmin && u.role !== 'STUDENT' && assignable.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setChangingRole(true)}>Change role</Button>
                    )}
                    {!isSelf && !protectedAdmin &&
                      (u.status === 'ACTIVE' ? (
                        <Button variant="danger" size="sm" onClick={() => ask({ title: `Suspend ${u.name}?`, message: 'All their sessions end immediately.', tone: 'danger', confirmLabel: 'Suspend', requireReason: true, onConfirm: async (reason) => { await api().platform.setStatus(u.id, 'SUSPENDED', reason); state.reload(); }, success: 'Account suspended' })}>Suspend</Button>
                      ) : (
                        <Button size="sm" onClick={() => ask({ title: `Reactivate ${u.name}?`, confirmLabel: 'Reactivate', requireReason: true, onConfirm: async (reason) => { await api().platform.setStatus(u.id, 'ACTIVE', reason); state.reload(); }, success: 'Account reactivated' })}>Reactivate</Button>
                      ))}
                  </div>
                }
              />
              <div className={s.stack}>
                {protectedAdmin && (
                  <Alert tone="info">
                    {u.isSuperAdmin
                      ? 'Super Admin accounts are protected: they can’t be edited, reset or suspended here.'
                      : 'Administrator accounts can only be edited, reset or suspended by a Super Admin.'}
                  </Alert>
                )}
                <div className={s.grid2}>
                  <Card title="Profile">
                    <DescriptionList
                      items={[
                        { label: 'Status', value: <StatusBadge status={u.status} /> },
                        { label: 'Role', value: enumLabel(u.role) },
                        { label: 'Email', value: <>{u.email}{!u.emailVerifiedAt && <span className={s.small}> · unverified</span>}</> },
                        { label: 'Phone', value: u.phone ?? '—' },
                        { label: 'Last sign-in', value: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never' },
                        { label: 'Created', value: formatDateTime(u.createdAt) },
                        { label: 'Sessions (all time)', value: u._count?.sessions ?? 0 },
                        ...(u.employeeProfile ? [{ label: 'Employee', value: `${u.employeeProfile.employeeCode} · ${u.employeeProfile.designation}, ${u.employeeProfile.department}` }] : []),
                        ...(u.role === 'STUDENT' ? [{ label: 'Applications / enrollments', value: `${u._count?.applications ?? 0} / ${u._count?.enrollments ?? 0}` }] : []),
                        ...(u.role === 'TRAINER' ? [{ label: 'Batch assignments', value: u._count?.trainerAssignments ?? 0 }] : []),
                      ]}
                    />
                    {u.role === 'STUDENT' && can('training.students.read') && (
                      <p className={s.small}><Link className={s.link} href={`/students/${u.id}`}>Open student record →</Link></p>
                    )}
                    {u.employeeProfile && can('employees.read') && (
                      <p className={s.small}><Link className={s.link} href={`/employees/${u.id}`}>Open employee record →</Link></p>
                    )}
                  </Card>

                  <Card
                    title="Permissions"
                    actions={u.canReceiveGrants && !isSelf ? <Button size="sm" variant="outline" onClick={() => setGranting(true)} disabled={catalog.loading}>Grant permission</Button> : undefined}
                  >
                    <div className={s.stackSm}>
                      <div>
                        <p className={s.strong}>From role ({enumLabel(u.role)})</p>
                        {(u.rolePermissions ?? []).length ? (
                          <ul className={s.tags} aria-label="Role permissions">
                            {(u.rolePermissions as string[]).map((p) => <li key={p}><Badge>{p}</Badge></li>)}
                          </ul>
                        ) : (
                          <p className={s.muted}>None</p>
                        )}
                      </div>
                      {u.canReceiveGrants ? (
                        <div>
                          <p className={s.strong}>Individual grants</p>
                          {(u.permissionGrants ?? []).length ? (
                            <ul className={s.list} aria-label="Individual grants">
                              {(u.permissionGrants as Row[]).map((g) => (
                                <li key={g.permission} className={s.rowBetween}>
                                  <span><Badge tone="primary">{g.permission}</Badge> <span className={s.small}>since {formatDateTime(g.createdAt)}</span></span>
                                  {!isSelf && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() =>
                                        ask({
                                          title: `Revoke ${g.permission}?`,
                                          message: 'The user loses this permission on their next request.',
                                          tone: 'danger',
                                          confirmLabel: 'Revoke',
                                          requireReason: true,
                                          onConfirm: async (reason) => {
                                            await api().platform.revokePermission(u.id, g.permission, reason);
                                            state.reload();
                                          },
                                          success: 'Permission revoked',
                                        })
                                      }
                                    >
                                      Revoke
                                    </Button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className={s.muted}>No individual grants.</p>
                          )}
                        </div>
                      ) : (
                        <p className={s.small}>Individual grants are only available for Editor, Finance and HR accounts.</p>
                      )}
                      <div>
                        <p className={s.strong}>Effective permissions</p>
                        <ul className={s.tags} aria-label="Effective permissions">
                          {effective.map((p) => <li key={p}><Badge tone="success">{p}</Badge></li>)}
                        </ul>
                      </div>
                      {catalog.error && <Alert tone="warning">Could not load the permission catalogue. <Button size="sm" variant="ghost" onClick={catalog.reload}>Retry</Button></Alert>}
                    </div>
                  </Card>
                </div>

                <Card title="Recent activity">
                  {(u.recentActivity ?? []).length ? (
                    <DataTable<Row>
                      caption="Recent activity"
                      rows={u.recentActivity}
                      rowKey={(r) => r.id}
                      columns={[
                        { key: 'a', header: 'Action', render: (r) => <span className={s.mono}>{r.action}</span> },
                        { key: 'e', header: 'Entity', hideOnMobile: true, render: (r) => <span className={s.small}>{r.entityType}</span> },
                        { key: 'r', header: 'Reason', hideOnMobile: true, render: (r) => r.reason ?? '—' },
                        { key: 't', header: 'When', render: (r) => formatDateTime(r.createdAt) },
                      ]}
                    />
                  ) : (
                    <p className={s.muted}>No recorded activity.</p>
                  )}
                </Card>
              </div>

              {editing && <EditUserModal user={u} onClose={() => setEditing(false)} onDone={state.reload} />}
              {resetting && <ResetPasswordModal user={u} onClose={() => setResetting(false)} />}
              {changingRole && <ChangeRoleModal user={u} assignable={assignable} onClose={() => setChangingRole(false)} onDone={state.reload} />}
              {granting && <GrantModal user={u} options={grantOptions} onClose={() => setGranting(false)} onDone={state.reload} />}
            </>
          );
        }}
      </AsyncView>
      {dialog}
    </>
  );
}
