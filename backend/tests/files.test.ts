/** Private file uploads: type sniffing, size, safe names, ownership, attachment rules. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { applyAndApprove, payApplication, prisma, registerStudent, seedCourse, startApi, staff, useFakeGateway, type Api, type Client } from './helpers';
import { detectFileType, safeDisplayName } from '../src/services/file.service';

let api: Api;
let admin: Client;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  useFakeGateway();
});
after(() => api.close());

async function upload(c: Client, purpose: string, body: Buffer, name = 'work.pdf', contentType = 'application/octet-stream') {
  const res = await fetch(`${api.base}/api/files?purpose=${purpose}`, {
    method: 'POST',
    headers: { Cookie: c.cookie, 'X-Forwarded-For': c.ip, 'Content-Type': contentType, 'X-File-Name': encodeURIComponent(name) },
    body,
  });
  return { status: res.status, body: (await res.json()) as { data: { id: string; name: string; mimeType: string } } };
}

async function download(c: Client | null, id: string) {
  return fetch(`${api.base}/api/files/${id}`, { headers: c ? { Cookie: c.cookie, 'X-Forwarded-For': c.ip } : {} });
}

test('type detection uses magic bytes; names are sanitised', () => {
  assert.equal(detectFileType(PDF)?.mime, 'application/pdf');
  assert.equal(detectFileType(PNG)?.mime, 'image/png');
  assert.equal(detectFileType(EXE), null);
  assert.equal(detectFileType(HTML), null);
  assert.equal(safeDisplayName(encodeURIComponent('../../etc/passwd.exe'), 'pdf'), 'passwd.pdf');
  assert.equal(safeDisplayName('re<p>ort\u0000.pdf', 'pdf'), 'report.pdf');
});

test('uploads: auth required, allow-listed types only, extension and Content-Type are not trusted', async () => {
  const s = await registerStudent(api.base);
  assert.equal((await fetch(`${api.base}/api/files?purpose=ASSIGNMENT_SUBMISSION`, { method: 'POST', body: PDF })).status, 401);
  assert.equal((await upload(s.client, 'ASSIGNMENT_SUBMISSION', EXE, 'setup.pdf', 'application/pdf')).status, 422, 'exe renamed to pdf');
  assert.equal((await upload(s.client, 'ASSIGNMENT_SUBMISSION', HTML, 'page.png', 'image/png')).status, 422);
  assert.equal((await upload(s.client, 'ASSIGNMENT_SUBMISSION', Buffer.alloc(0))).status, 422);
  assert.equal((await upload(s.client, 'ASSIGNMENT_SUBMISSION', Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]))).status, 413);
  assert.equal((await upload(s.client, 'NOT_A_PURPOSE', PDF)).status, 422);
  assert.equal((await upload(s.client, 'EMPLOYEE_DOCUMENT', PDF)).status, 403, 'students cannot upload HR documents');
  const ok = await upload(s.client, 'ASSIGNMENT_SUBMISSION', PNG, 'screenshot.pdf');
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.mimeType, 'image/png');
  assert.equal(ok.body.data.name, 'screenshot.png', 'extension follows the detected type');
  const row = await prisma.storedFile.findUniqueOrThrow({ where: { id: ok.body.data.id } });
  assert.match(row.storageKey, /^[a-f0-9]{32}$/);
});

test('assignment file: student attaches own upload; trainer of the batch can download; others cannot', async () => {
  const gw = useFakeGateway();
  const { batch } = await seedCourse();
  const t = await staff(api.base, 'TRAINER');
  const otherTrainer = (await staff(api.base, 'TRAINER')).client;
  await admin.post(`/api/training/admin/batches/${batch.id}/trainers`, { trainerId: t.user.id });
  const s = await registerStudent(api.base);
  const intruder = await registerStudent(api.base);
  const app = await applyAndApprove(s.client, admin, batch.id);
  await payApplication(s.client, gw, app.id);
  const a = await t.client.post(`/api/training/trainer/batches/${batch.id}/assignments`, { title: 'Upload report', description: 'PDF please', dueAt: new Date(Date.now() + 86_400_000).toISOString(), maxMarks: 10 });

  const up = await upload(s.client, 'ASSIGNMENT_SUBMISSION', PDF, 'report.pdf');
  const stolen = await upload(intruder.client, 'ASSIGNMENT_SUBMISSION', PDF, 'theirs.pdf');
  assert.equal((await s.client.post(`/api/training/student/assignments/${a.body.data.id}/submission`, { fileId: stolen.body.data.id })).status, 422, 'cannot attach someone else’s file');
  const sub = await s.client.post(`/api/training/student/assignments/${a.body.data.id}/submission`, { fileId: up.body.data.id });
  assert.equal(sub.status, 200, JSON.stringify(sub.body));

  const own = await download(s.client, up.body.data.id);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'application/pdf');
  assert.match(own.headers.get('content-disposition') ?? '', /^attachment;/);
  assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(Buffer.from(await own.arrayBuffer()).equals(PDF));

  assert.equal((await download(t.client, up.body.data.id)).status, 200, 'assigned trainer');
  assert.equal((await download(otherTrainer, up.body.data.id)).status, 404, 'unassigned trainer');
  assert.equal((await download(intruder.client, up.body.data.id)).status, 404, 'another student');
  assert.equal((await download(null, up.body.data.id)).status, 401);
  const subs = await t.client.get(`/api/training/trainer/assignments/${a.body.data.id}`);
  assert.equal(subs.body.data.submissions[0].file.originalName, 'report.pdf');
});

test('employee documents flow', async () => {
  const hr = (await staff(api.base, 'HR')).client;
  const e = await staff(api.base, 'EMPLOYEE');
  await prisma.employeeProfile.create({ data: { userId: e.user.id, employeeCode: `EMP-T-${Date.now()}`, department: 'Ops', designation: 'Analyst', joiningDate: new Date('2026-01-01') } });
  const other = await staff(api.base, 'EMPLOYEE');
  await prisma.employeeProfile.create({ data: { userId: other.user.id, employeeCode: `EMP-U-${Date.now()}`, department: 'Ops', designation: 'Analyst', joiningDate: new Date('2026-01-01') } });

  const visible = await upload(hr, 'EMPLOYEE_DOCUMENT', PDF, 'Offer letter.pdf');
  const hidden = await upload(hr, 'EMPLOYEE_DOCUMENT', PDF, 'Background check.pdf');
  assert.equal((await hr.post(`/api/hr/employees/${e.user.id}/documents`, { title: 'Offer letter', category: 'OFFER_LETTER', fileId: visible.body.data.id })).status, 201);
  assert.equal((await hr.post(`/api/hr/employees/${e.user.id}/documents`, { title: 'Background check', fileId: hidden.body.data.id, visibleToEmployee: false })).status, 201);
  assert.equal((await hr.post(`/api/hr/employees/${other.user.id}/documents`, { title: 'Reuse', fileId: visible.body.data.id })).status, 422, 'a file attaches once');

  const docs = await e.client.get('/api/employee/documents');
  assert.deepEqual(docs.body.data.map((d: { title: string }) => d.title), ['Offer letter']);
  assert.equal((await download(e.client, visible.body.data.id)).status, 200);
  assert.equal((await download(e.client, hidden.body.data.id)).status, 404, 'internal document');
  assert.equal((await download(other.client, visible.body.data.id)).status, 404, 'another employee');
  assert.equal((await download(admin, visible.body.data.id)).status, 200, 'admin (employees.read)');
});
