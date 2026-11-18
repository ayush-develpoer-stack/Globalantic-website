/** Employee portal + HR management: self-access, confidentiality, approvals, audit. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, PASSWORD, login, prisma, startApi, staff, testOutbox, tokenFromOutbox, uniq, type Api } from './helpers';

let api: Api;
let admin: Client;
let hr: Client;
let hrUserId: string;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  const h = await staff(api.base, 'HR');
  hr = h.client;
  hrUserId = h.user.id;
});
after(() => api.close());

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Creates an employee through the HR API, accepts the emailed invite and signs in. */
async function newEmployee(extra: Record<string, unknown> = {}) {
  const email = `${uniq('emp')}@example.test`;
  const r = await hr.post('/api/hr/employees', {
    name: 'Test Employee',
    email,
    department: 'Engineering',
    designation: 'Developer',
    employmentType: 'FULL_TIME',
    joiningDate: '2026-01-05',
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  // The response reports what actually happened to the invitation (the test outbox accepts it).
  assert.equal(r.body.data.inviteEmail, 'SENT');
  assert.equal(r.body.message, 'Employee created and invitation sent');
  const token = tokenFromOutbox(email, 'reset-password');
  assert.equal((await new Client(api.base).post('/api/auth/reset-password', { token, password: PASSWORD })).status, 200);
  const client = await login(api.base, email);
  return { client, id: r.body.data.id as string, code: r.body.data.employeeProfile.employeeCode as string, email };
}

test('HR creates an employee with an invite; employee code is generated; no password is set by HR', async () => {
  const e = await newEmployee();
  assert.match(e.code, /^EMP-\d{4}-\d{6}$/);
  assert.ok(testOutbox.some((m) => m.to === e.email && /Set up your Globalantic account/.test(m.subject)));
  const me = await e.client.get('/api/employee/profile');
  assert.equal(me.status, 200);
  assert.equal(me.body.data.employeeProfile.department, 'Engineering');
});

test('portal separation and permissions', async () => {
  const e = await newEmployee();
  const student = (await staff(api.base, 'STUDENT')).client;
  const trainer = (await staff(api.base, 'TRAINER')).client;
  const finance = (await staff(api.base, 'FINANCE')).client;
  assert.equal((await new Client(api.base).get('/api/employee/dashboard')).status, 401);
  for (const c of [student, trainer, admin, hr]) assert.equal((await c.get('/api/employee/dashboard')).status, 403);
  for (const c of [e.client, student, trainer, finance]) {
    assert.equal((await c.get('/api/hr/employees')).status, 403);
    assert.equal((await c.post('/api/hr/announcements', { title: 'x x x', body: 'y y y' })).status, 403);
  }
  assert.equal((await admin.get('/api/hr/employees')).status, 200, 'ADMIN has HR permissions');
  // A user with the EMPLOYEE role but no profile gets a clear 403 (not a crash)
  const bare = (await staff(api.base, 'EMPLOYEE')).client;
  assert.equal((await bare.get('/api/employee/dashboard')).status, 403);
});

test('attendance: check-in/out once per day; history is private', async () => {
  const a = await newEmployee();
  const b = await newEmployee();
  assert.equal((await a.client.post('/api/employee/attendance/check-out')).status, 409, 'cannot check out before checking in');
  const inRes = await a.client.post('/api/employee/attendance/check-in', { status: 'WORK_FROM_HOME' });
  assert.equal(inRes.status, 201);
  assert.equal((await a.client.post('/api/employee/attendance/check-in', {})).status, 409);
  assert.equal((await a.client.post('/api/employee/attendance/check-out')).status, 200);
  assert.equal((await a.client.post('/api/employee/attendance/check-out')).status, 409);
  const hist = await a.client.get('/api/employee/attendance');
  assert.equal(hist.body.data.records.length, 1);
  assert.equal(hist.body.data.records[0].status, 'WORK_FROM_HOME');
  assert.equal((await b.client.get('/api/employee/attendance')).body.data.records.length, 0);
  // HR correction is audited
  const fix = await hr.put(`/api/hr/employees/${a.id}/attendance`, { date: today(), status: 'HALF_DAY', reason: 'Left early (approved)' });
  assert.equal(fix.status, 200);
  const log = await prisma.auditLog.findFirst({ where: { action: 'employee.attendance_corrected', entityId: fix.body.data.id } });
  assert.deepEqual((log?.before as { status: string }).status, 'WORK_FROM_HOME');
  assert.equal(log?.reason, 'Left early (approved)');
});

test('leave: validation, overlap, approval flow, no self-approval, ownership', async () => {
  const e = await newEmployee();
  const other = await newEmployee();
  assert.equal((await e.client.post('/api/employee/leave', { type: 'CASUAL', startDate: plusDays(5), endDate: plusDays(3), reason: 'Family' })).status, 422);
  const ok = await e.client.post('/api/employee/leave', { type: 'CASUAL', startDate: plusDays(3), endDate: plusDays(5), reason: 'Family event', status: 'APPROVED', days: 1 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.status, 'PENDING', 'client cannot set status');
  assert.equal(ok.body.data.days, 3, 'days computed on the server');
  assert.equal((await e.client.post('/api/employee/leave', { type: 'SICK', startDate: plusDays(5), endDate: plusDays(6), reason: 'Overlap test' })).status, 409);
  // Another employee cannot cancel it
  assert.equal((await other.client.post(`/api/employee/leave/${ok.body.data.id}/cancel`)).status, 404);
  // Employees cannot approve
  assert.equal((await e.client.post(`/api/hr/leave/${ok.body.data.id}/review`, { decision: 'APPROVE' })).status, 403);
  assert.equal((await hr.post(`/api/hr/leave/${ok.body.data.id}/review`, { decision: 'REJECT' })).status, 422, 'reason required');
  assert.equal((await hr.post(`/api/hr/leave/${ok.body.data.id}/review`, { decision: 'APPROVE' })).status, 200);
  assert.equal((await hr.post(`/api/hr/leave/${ok.body.data.id}/review`, { decision: 'APPROVE' })).status, 409, 'no double review');
  const notes = await prisma.notification.findFirst({ where: { userId: e.id, type: 'LEAVE' } });
  assert.ok(notes);
  // HR cannot approve their own leave
  const hrLeave = await prisma.leaveRequest.create({ data: { employeeId: hrUserId, type: 'CASUAL', startDate: new Date(), endDate: new Date(), days: 1, reason: 'mine' } });
  assert.equal((await hr.post(`/api/hr/leave/${hrLeave.id}/review`, { decision: 'APPROVE' })).status, 403);
});

test('projects & tasks: members only, assignee updates status only, teammates see names only', async () => {
  const a = await newEmployee();
  const b = await newEmployee();
  const outsider = await newEmployee();
  const p = await hr.post('/api/hr/projects', { code: uniq('P').slice(0, 15), name: 'Website revamp' });
  assert.equal(p.status, 201);
  const pid = p.body.data.id;
  for (const m of [a, b]) assert.equal((await hr.post(`/api/hr/projects/${pid}/members`, { userId: m.id, role: 'Developer' })).status, 200);
  assert.equal((await hr.post('/api/hr/tasks', { title: 'Not a member', assigneeId: outsider.id, projectId: pid })).status, 422);
  const t = await hr.post('/api/hr/tasks', { title: 'Build header', assigneeId: a.id, projectId: pid, priority: 'HIGH', dueDate: plusDays(2) });
  assert.equal(t.status, 201);

  const projA = await a.client.get(`/api/employee/projects/${pid}`);
  assert.equal(projA.status, 200);
  assert.equal(projA.body.data.myTasks.length, 1);
  assert.ok(!JSON.stringify(projA.body.data.members).includes('@'), 'no teammate emails');
  assert.equal((await outsider.client.get(`/api/employee/projects/${pid}`)).status, 404);

  assert.equal((await b.client.patch(`/api/employee/tasks/${t.body.data.id}/status`, { status: 'DONE' })).status, 404, 'not the assignee');
  const done = await a.client.patch(`/api/employee/tasks/${t.body.data.id}/status`, { status: 'DONE', title: 'hacked', assigneeId: b.id });
  assert.equal(done.status, 200);
  const after = await prisma.task.findUniqueOrThrow({ where: { id: t.body.data.id } });
  assert.equal(after.title, 'Build header');
  assert.equal(after.assigneeId, a.id);
  assert.ok(after.completedAt);

  // Work updates: only own tasks / member projects; date window
  assert.equal((await a.client.post('/api/employee/work-updates', { date: today(), summary: 'Finished header', taskId: t.body.data.id, projectId: pid, minutes: 120 })).status, 201);
  assert.equal((await outsider.client.post('/api/employee/work-updates', { date: today(), summary: 'Sneaky', projectId: pid })).status, 422);
  assert.equal((await a.client.post('/api/employee/work-updates', { date: plusDays(2), summary: 'Future' })).status, 422);
  assert.equal((await hr.get(`/api/hr/work-updates?projectId=${pid}`)).body.data.items.length, 1);
  assert.equal((await hr.del(`/api/hr/projects/${pid}/members/${a.id}`)).status, 200, 'done tasks do not block removal');
});

test('HR requests and company announcements', async () => {
  const e = await newEmployee();
  const other = await newEmployee();
  const r = await e.client.post('/api/employee/hr-requests', { category: 'PAYROLL', subject: 'Payslip query', message: 'My September payslip is missing.' });
  assert.equal(r.status, 201);
  assert.equal((await other.client.get('/api/employee/hr-requests')).body.data.length, 0);
  assert.equal((await hr.put(`/api/hr/requests/${r.body.data.id}`, { status: 'RESOLVED', response: 'Uploaded to your documents.' })).status, 200);
  const mine = await e.client.get('/api/employee/hr-requests');
  assert.equal(mine.body.data[0].status, 'RESOLVED');
  assert.equal(mine.body.data[0].response, 'Uploaded to your documents.');
  assert.equal((await hr.post('/api/hr/announcements', { title: 'Office closed Friday', body: 'Diwali holiday.' })).status, 201);
  const ann = await e.client.get('/api/employee/announcements');
  assert.ok(ann.body.data.some((x: { title: string }) => x.title === 'Office closed Friday'));
});

test('employee data is only exposed to HR/admin, never to other employees', async () => {
  const e = await newEmployee();
  const other = await newEmployee();
  assert.equal((await other.client.get(`/api/hr/employees/${e.id}`)).status, 403);
  const view = await hr.get(`/api/hr/employees/${e.id}`);
  assert.equal(view.status, 200);
  assert.ok(!('passwordHash' in view.body.data));
  const upd = await hr.put(`/api/hr/employees/${e.id}`, { designation: 'Senior Developer', managerId: e.id, reason: 'Promotion' });
  assert.equal(upd.status, 422, 'cannot be own manager');
  assert.equal((await hr.put(`/api/hr/employees/${e.id}`, { designation: 'Senior Developer', reason: 'Promotion' })).status, 200);
  const self = await e.client.put('/api/employee/profile', { emergencyContactName: 'Parent', designation: 'CEO' });
  assert.equal(self.status, 200);
  assert.equal(self.body.data.employeeProfile.designation, 'Senior Developer', 'job fields are HR-managed');
  assert.equal(self.body.data.employeeProfile.emergencyContactName, 'Parent');
});
