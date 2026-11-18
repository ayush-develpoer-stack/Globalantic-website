'use client';

import { useState } from 'react';
import { api, errorMessage, fieldErrorMap, type CreateUserInput, type CreatedUser } from '@globalantic/api-client';
import { EMPLOYMENT_TYPES, enumLabel } from '@globalantic/types';
import { Alert, Button, Checkbox, Input, Modal, Select, Textarea, todayIso, useToast } from '@globalantic/ui';
import { enumOptions } from './admin';
import { useEmployeeOptions } from './hr';
import s from './admin.module.css';

type Row = Record<string, any>;

/** Change a user's role (assignable roles only; the server enforces escalation guards). */
export function ChangeRoleModal({ user, assignable, onClose, onDone }: { user: Row; assignable: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [role, setRole] = useState(assignable.find((r) => r !== user.role) ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
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
      await api().platform.changeRole(user.id, role, reason.trim());
      toast(`Role changed to ${enumLabel(role)} — their sessions were signed out`);
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
    <Modal open onClose={onClose} title={`Change role: ${user.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={pending} disabled={!role}>Change role</Button></>}>
      <p className={s.muted}>Current role: <strong>{enumLabel(user.role)}</strong>. The change takes effect immediately and signs the user out everywhere. {assignable.includes('ADMIN') ? 'Choosing Administrator gives full admin portal access.' : 'Only a Super Admin can grant administrator access.'}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select label="New role" value={role} onChange={(e) => setRole(e.target.value)} options={assignable.map((r) => ({ value: r, label: enumLabel(r) }))} error={fields.role} />
      <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} error={fields.reason} hint="Recorded in the audit log" />
    </Modal>
  );
}

/** What each role is for, shown in the Add user form. */
export const ROLE_HELP: Record<string, string> = {
  ADMIN: 'Administrator — full admin portal access (Super Admin only)',
  HR: 'HR — employees, leave, HR requests and intern exams (admin portal)',
  EDITOR: 'Editor — website content drafts (admin portal)',
  FINANCE: 'Finance — payments, referrals and finance documents (admin portal)',
  SALES: 'Sales — leads and sales documents (admin portal)',
  TRAINER: 'Trainer — assigned batches and students (trainer portal)',
  EMPLOYEE: 'Employee — employee portal',
  STUDENT: 'Intern / student — intern portal',
};
const ROLE_ORDER = ['EMPLOYEE', 'STUDENT', 'TRAINER', 'HR', 'SALES', 'FINANCE', 'EDITOR', 'ADMIN'];

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  department: '',
  designation: '',
  employmentType: 'FULL_TIME',
  joiningDate: todayIso(),
  managerId: '',
  workLocation: '',
  city: '',
  institution: '',
  qualification: '',
};

/**
 * Create an account of any role the signed-in user may create (`creatable` from /platform/roles).
 * The user chooses their own password from the emailed link; if the email could not be sent,
 * the single-use link is shown once so it can be handed over another way.
 */
export function CreateUserModal({ creatable, onClose, onDone }: { creatable: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const roles = ROLE_ORDER.filter((r) => creatable.includes(r));
  const [role, setRole] = useState(roles[0] ?? '');
  const [withProfile, setWithProfile] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<CreatedUser | null>(null);
  const isStudent = role === 'STUDENT';
  const needsProfile = role === 'EMPLOYEE';
  const showProfile = !isStudent && (needsProfile || withProfile);
  const managers = useEmployeeOptions();
  // Error keys match the API's field paths (employee.department, student.city, ...).
  const errorKey = (k: keyof typeof EMPTY) =>
    ['city', 'institution', 'qualification'].includes(k) ? `student.${k}` : ['name', 'email', 'phone'].includes(k) ? k : `employee.${k}`;
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setV({ ...v, [k]: e.target.value });
    // Clear that field's error as soon as it is edited, so a corrected field no longer shows red.
    const key = errorKey(k);
    if (fields[key]) setFields(({ [key]: _removed, ...rest }) => rest);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pending) return;
    const local: Record<string, string> = {};
    if (v.name.trim().length < 2) local.name = 'Enter a name (at least 2 characters)';
    if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) local.email = 'Enter a valid email address';
    if (showProfile) {
      if (v.department.trim().length < 2) local['employee.department'] = 'Required';
      if (v.designation.trim().length < 2) local['employee.designation'] = 'Required';
      if (!v.joiningDate) local['employee.joiningDate'] = 'Required';
    }
    setFields(local);
    if (Object.keys(local).length) return;
    setPending(true);
    setError(null);
    try {
      const input: CreateUserInput = { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim() || undefined, role: role as CreateUserInput['role'] };
      if (showProfile) {
        input.employee = {
          department: v.department.trim(),
          designation: v.designation.trim(),
          employmentType: v.employmentType as NonNullable<CreateUserInput['employee']>['employmentType'],
          joiningDate: v.joiningDate,
          managerId: v.managerId || null,
          workLocation: v.workLocation.trim() || null,
        };
      }
      if (isStudent) input.student = { city: v.city.trim() || null, institution: v.institution.trim() || null, qualification: v.qualification.trim() || null };
      const r = await api().platform.createUser(input);
      onDone();
      if (r.inviteEmail === 'SENT') {
        toast(`${enumLabel(r.role)} account created — an invitation was emailed to ${r.email}`);
        onClose();
      } else {
        setCreated(r);
      }
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrorMap(err));
    } finally {
      setPending(false);
    }
  };

  if (created) {
    return (
      <Modal open onClose={onClose} title="Account created" footer={<Button onClick={onClose}>Done</Button>}>
        <Alert tone="warning" title="The invitation email was not sent">
          {created.inviteEmail === 'SKIPPED' ? 'Email is not configured on the server.' : 'Email delivery failed.'} Give this single-use link to {created.name} privately so they can
          set their password. It expires in 24 hours; after that, use “Send password reset link” on their user page.
        </Alert>
        <Input label="Set-password link" readOnly value={created.setupLink ?? ''} onFocus={(e) => e.currentTarget.select()} />
        <div className={s.actions}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!created.setupLink) return;
              navigator.clipboard?.writeText(created.setupLink).then(
                () => toast('Link copied'),
                () => toast('Copy failed — select the link and copy it manually', 'danger'),
              );
            }}
          >
            Copy link
          </Button>
        </div>
        {created.portalUrl && (
          <p className={s.small}>
            After setting a password they sign in at <span className={s.mono}>{created.portalUrl}</span>
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Add user"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={pending} disabled={!role}>Create & invite</Button>
        </>
      }
    >
      <p className={s.muted}>The new user receives an email link to choose their own password; you never see or set it. The account is recorded in the audit log.</p>
      {error && <Alert tone="danger">{error}</Alert>}
      <Select
        label="Role"
        required
        value={role}
        onChange={(e) => setRole(e.target.value)}
        options={roles.map((r) => ({ value: r, label: ROLE_HELP[r] ?? enumLabel(r) }))}
        error={fields.role}
      />
      <form className={s.formGrid} onSubmit={submit} noValidate>
        <Input label="Full name" required value={v.name} onChange={set('name')} error={fields.name} maxLength={120} autoComplete="off" />
        <Input label="Email" type="email" required value={v.email} onChange={set('email')} error={fields.email} maxLength={254} autoComplete="off" />
        <Input label="Phone" type="tel" value={v.phone} onChange={set('phone')} error={fields.phone} maxLength={20} />
        {showProfile && (
          <>
            <Input label="Department / team" required value={v.department} onChange={set('department')} error={fields['employee.department']} maxLength={80} />
            <Input label="Designation" required value={v.designation} onChange={set('designation')} error={fields['employee.designation']} maxLength={120} />
            <Select label="Employment type" value={v.employmentType} onChange={set('employmentType')} options={enumOptions(EMPLOYMENT_TYPES)} error={fields['employee.employmentType']} />
            <Input label="Joining date" type="date" required value={v.joiningDate} onChange={set('joiningDate')} error={fields['employee.joiningDate']} />
            <Select
              label="Manager"
              value={v.managerId}
              onChange={set('managerId')}
              placeholder={managers.loading ? 'Loading…' : 'No manager'}
              options={managers.options}
              error={fields['employee.managerId']}
              hint={managers.error ? 'Could not load the employee list' : undefined}
            />
            <Input label="Work location" value={v.workLocation} onChange={set('workLocation')} error={fields['employee.workLocation']} maxLength={120} />
          </>
        )}
        {isStudent && (
          <>
            <Input label="College / institution" value={v.institution} onChange={set('institution')} error={fields['student.institution']} maxLength={160} />
            <Input label="Qualification" value={v.qualification} onChange={set('qualification')} error={fields['student.qualification']} maxLength={120} />
            <Input label="City" value={v.city} onChange={set('city')} error={fields['student.city']} maxLength={80} />
          </>
        )}
      </form>
      {!isStudent && !needsProfile && (
        <Checkbox label="Also create an employee record (department / team, designation)" checked={withProfile} onChange={(e) => setWithProfile(e.target.checked)} />
      )}
    </Modal>
  );
}
