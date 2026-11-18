/** Marketing & Sales intern exams: access, timing, integrity, scoring, evaluation, results, reports. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, applyAndApprove, payApplication, prisma, registerStudent, seedCourse, startApi, staff, useFakeGateway, type Api, type FakeGateway } from './helpers';

let api: Api;
let admin: Client;
let hr: Client;
let gateway: FakeGateway;

before(async () => {
  api = await startApi();
  gateway = useFakeGateway();
  admin = (await staff(api.base, 'ADMIN')).client;
  hr = (await staff(api.base, 'HR')).client;
});
after(() => api.close());

const A = '/api/exams/admin';
const S = '/api/exams/student';

async function question(c: Client, body: Record<string, unknown>) {
  const r = await c.post(`${A}/questions`, { track: 'MARKETING', topic: 'Digital marketing', marks: 1, ...body });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.data as { id: string; options: { id: string; text: string }[]; correctOptionIds: string[] };
}

/** A set of one question of each type (6 marks in total). */
async function questionSet(c: Client, track = 'MARKETING') {
  const single = await question(c, { track, type: 'SINGLE_CHOICE', prompt: 'What does CTR stand for?', options: [{ text: 'Click-through rate', correct: true }, { text: 'Cost to reach' }, { text: 'Customer trust ratio' }] });
  const multi = await question(c, { track, type: 'MULTI_CHOICE', prompt: 'Which are lead sources?', marks: 2, options: [{ text: 'Referrals', correct: true }, { text: 'Webinars', correct: true }, { text: 'Payroll' }] });
  const tf = await question(c, { track, type: 'TRUE_FALSE', prompt: 'SEO results are usually instant.', options: [{ text: 'True' }, { text: 'False', correct: true }] });
  const essay = await question(c, { track, type: 'DESCRIPTIVE', topic: 'Customer handling', prompt: 'How would you handle an angry customer on a call?', marks: 2, guidance: 'Listen, empathise, resolve, follow up.' });
  return { single, multi, tf, essay };
}

async function examWith(c: Client, questionIds: string[], extra: Record<string, unknown> = {}) {
  const r = await c.post(`${A}/exams`, {
    title: 'Marketing intern screening',
    instructions: 'Answer every question. The timer starts when you click Start.',
    track: 'MARKETING',
    durationMinutes: 30,
    passPercent: 50,
    maxAttempts: 1,
    resultVisibility: 'ON_RELEASE',
    ...extra,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.data.id as string;
  if (questionIds.length) assert.equal((await c.put(`${A}/exams/${id}/questions`, { questionIds })).status, 200);
  return id;
}

async function newStudent(institution?: string) {
  const s = await registerStudent(api.base);
  if (institution) await prisma.studentProfile.update({ where: { userId: s.user.id }, data: { institution } });
  return s;
}

async function assignTo(c: Client, examId: string, studentId: string) {
  const r = await c.post(`${A}/exams/${examId}/assignments`, { target: 'STUDENT', studentId });
  assert.equal(r.status, 201, JSON.stringify(r.body));
}

test('only exam staff reach the admin API; students only the student API', async () => {
  const s = await newStudent();
  const trainer = (await staff(api.base, 'TRAINER')).client;
  const finance = (await staff(api.base, 'FINANCE')).client;
  const editor = (await staff(api.base, 'EDITOR')).client;
  assert.equal((await new Client(api.base).get(`${A}/exams`)).status, 401);
  assert.equal((await new Client(api.base).get(`${S}/exams`)).status, 401);
  for (const c of [s.client, trainer, finance, editor]) {
    assert.equal((await c.get(`${A}/exams`)).status, 403);
    assert.equal((await c.post(`${A}/questions`, {})).status, 403);
  }
  for (const c of [admin, hr, trainer]) assert.equal((await c.get(`${S}/exams`)).status, 403);
  assert.equal((await admin.get(`${A}/exams`)).status, 200);
  assert.equal((await hr.get(`${A}/exams`)).status, 200);
});

test('question validation (422) and answer-key rules', async () => {
  const bad = [
    { type: 'SINGLE_CHOICE', prompt: 'Pick one please', options: [{ text: 'A', correct: true }, { text: 'B', correct: true }] },
    { type: 'MULTI_CHOICE', prompt: 'Pick some please', options: [{ text: 'A' }, { text: 'B' }] },
    { type: 'TRUE_FALSE', prompt: 'True or false?', options: [{ text: 'True', correct: true }] },
    { type: 'DESCRIPTIVE', prompt: 'Explain things', options: [{ text: 'A' }] },
    { type: 'SINGLE_CHOICE', prompt: 'Duplicates here', options: [{ text: 'Same', correct: true }, { text: 'same' }] },
  ];
  for (const b of bad) {
    const r = await hr.post(`${A}/questions`, { track: 'SALES', topic: 'Sales fundamentals', marks: 1, ...b });
    assert.equal(r.status, 422, JSON.stringify(b));
    assert.ok(r.body.errors?.some((e) => e.field === 'options'));
  }
  const q = await question(hr, { track: 'SALES', topic: 'Sales fundamentals', type: 'SINGLE_CHOICE', prompt: 'What is a qualified lead?', options: [{ text: 'Fits the ideal customer profile', correct: true }, { text: 'Anyone' }] });
  assert.equal(q.correctOptionIds.length, 1);
  assert.match(q.options[0].id, /^[a-f0-9]{10}$/);
  const topics = (await hr.get(`${A}/topics`)).body.data as { track: string; topic: string }[];
  assert.ok(topics.some((t) => t.track === 'SALES' && t.topic === 'Sales fundamentals'));
});

test('full lifecycle: assign, take, autosave, submit once, evaluate, release; keys never leak early', async () => {
  const qs = await questionSet(hr);
  const examId = await examWith(hr, [qs.single.id, qs.multi.id, qs.tf.id, qs.essay.id]);
  const s = await newStudent();
  const other = await newStudent();
  await assignTo(hr, examId, s.user.id);

  // Draft exams are invisible
  assert.equal((await s.client.get(`${S}/exams`)).body.data.length, 0);
  assert.equal((await s.client.post(`${S}/exams/${examId}/start`)).status, 404);

  const pub = await hr.post(`${A}/exams/${examId}/publish`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  const notes = await prisma.notification.findMany({ where: { userId: s.user.id, type: 'EXAM' } });
  assert.equal(notes.length, 1);

  const list = (await s.client.get(`${S}/exams`)).body.data as { id: string; state: string; canStart: boolean; questionCount: number }[];
  assert.equal(list.length, 1);
  assert.equal(list[0].state, 'OPEN');
  assert.equal(list[0].questionCount, 4);
  // Not assigned -> not visible, not startable
  assert.equal((await other.client.get(`${S}/exams`)).body.data.length, 0);
  assert.equal((await other.client.get(`${S}/exams/${examId}`)).status, 404);
  assert.equal((await other.client.post(`${S}/exams/${examId}/start`)).status, 404);

  const start = await s.client.post(`${S}/exams/${examId}/start`);
  assert.equal(start.status, 201, JSON.stringify(start.body));
  const attemptId = start.body.data.attemptId as string;
  // Starting again resumes the same attempt
  const again = await s.client.post(`${S}/exams/${examId}/start`);
  assert.equal(again.status, 200);
  assert.equal(again.body.data.attemptId, attemptId);

  const view = await s.client.get(`${S}/attempts/${attemptId}`);
  assert.equal(view.status, 200);
  const raw = JSON.stringify(view.body);
  for (const leak of ['correctOptionIds', 'correct', 'guidance', 'explanation', 'Listen, empathise']) assert.ok(!raw.includes(leak), `attempt view leaked ${leak}`);
  assert.equal(view.body.data.questions.length, 4);
  assert.ok(new Date(view.body.data.deadlineAt).getTime() - Date.now() > 29 * 60_000);

  // Someone else's attempt is 404 for them
  assert.equal((await other.client.get(`${S}/attempts/${attemptId}`)).status, 404);
  assert.equal((await other.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [] })).status, 404);

  // Validation: unknown option, two options for a single-choice question, foreign question
  assert.equal((await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: qs.single.id, selectedOptionIds: ['deadbeef00'] }] })).status, 422);
  assert.equal((await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: qs.single.id, selectedOptionIds: qs.single.options.slice(0, 2).map((o) => o.id) }] })).status, 422);
  const stray = await question(hr, { type: 'SINGLE_CHOICE', prompt: 'Not in this exam?', options: [{ text: 'Yes', correct: true }, { text: 'No' }] });
  assert.equal((await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: stray.id, selectedOptionIds: [stray.options[0].id] }] })).status, 422);

  // Autosave (single correct, multi partially wrong => 0, tf wrong) then overwrite tf with the right answer
  const save = await s.client.put(`${S}/attempts/${attemptId}/answers`, {
    answers: [
      { questionId: qs.single.id, selectedOptionIds: qs.single.correctOptionIds },
      { questionId: qs.multi.id, selectedOptionIds: [qs.multi.correctOptionIds[0]] },
      { questionId: qs.tf.id, selectedOptionIds: qs.tf.options.filter((o) => !qs.tf.correctOptionIds.includes(o.id)).map((o) => o.id) },
    ],
    focusLost: 2,
  });
  assert.equal(save.status, 200, JSON.stringify(save.body));
  // Refresh: answers come back from the server
  const reloaded = (await s.client.get(`${S}/attempts/${attemptId}`)).body.data;
  assert.deepEqual(reloaded.answers[qs.single.id].selectedOptionIds, qs.single.correctOptionIds);

  const submit = await s.client.post(`${S}/attempts/${attemptId}/submit`, {
    answers: [
      { questionId: qs.tf.id, selectedOptionIds: qs.tf.correctOptionIds },
      { questionId: qs.essay.id, text: 'I would listen first, acknowledge the problem and agree on next steps.' },
    ],
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.body));
  assert.equal(submit.body.data.status, 'SUBMITTED');
  assert.equal(submit.body.data.resultVisible, false);
  assert.ok(!('score' in submit.body.data));

  // Duplicate submission and late saves are refused
  assert.equal((await s.client.post(`${S}/attempts/${attemptId}/submit`, {})).status, 409);
  assert.equal((await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: qs.single.id, selectedOptionIds: [] }] })).status, 409);
  // Single attempt used up
  assert.equal((await s.client.post(`${S}/exams/${examId}/start`)).status, 409);

  const pending = await s.client.get(`${S}/attempts/${attemptId}/result`);
  assert.equal(pending.body.data.resultVisible, false);
  assert.equal(pending.body.data.questions.length, 0);
  assert.ok(!JSON.stringify(pending.body).includes('correctAnswer'));

  // Staff view has the key and the auto-marks
  const staffView = (await hr.get(`${A}/attempts/${attemptId}`)).body.data;
  assert.equal(staffView.focusLossCount, 2);
  const autoBy = Object.fromEntries(staffView.questions.map((q: { id: string; autoMarks: number | null }) => [q.id, q.autoMarks]));
  assert.equal(autoBy[qs.single.id], 1);
  assert.equal(autoBy[qs.multi.id], 0);
  assert.equal(autoBy[qs.tf.id], 1);
  assert.equal(autoBy[qs.essay.id], null);

  // Evaluation rules
  assert.equal((await hr.post(`${A}/attempts/${attemptId}/evaluate`, { marks: [] })).status, 422);
  assert.equal((await hr.post(`${A}/attempts/${attemptId}/evaluate`, { marks: [{ questionId: qs.essay.id, marks: 5 }] })).status, 422);
  const trainer = (await staff(api.base, 'TRAINER')).client;
  assert.equal((await trainer.post(`${A}/attempts/${attemptId}/evaluate`, { marks: [{ questionId: qs.essay.id, marks: 2 }] })).status, 403);
  const ev = await hr.post(`${A}/attempts/${attemptId}/evaluate`, { marks: [{ questionId: qs.essay.id, marks: 2, comment: 'Clear and empathetic' }], feedback: 'Good communication.' });
  assert.equal(ev.status, 200, JSON.stringify(ev.body));
  assert.equal(ev.body.data.status, 'EVALUATED');
  assert.equal(ev.body.data.score, 4); // 1 + 0 + 1 + 2 of 6
  assert.equal(ev.body.data.passed, true);

  // ON_RELEASE: still hidden until staff release results
  assert.equal((await s.client.get(`${S}/attempts/${attemptId}/result`)).body.data.resultVisible, false);
  const rel = await hr.post(`${A}/exams/${examId}/release-results`);
  assert.equal(rel.status, 200);
  assert.equal(rel.body.data.notified, 1);
  assert.equal((await hr.post(`${A}/exams/${examId}/release-results`)).status, 409);
  const result = (await s.client.get(`${S}/attempts/${attemptId}/result`)).body.data;
  assert.equal(result.resultVisible, true);
  assert.equal(result.score, 4);
  assert.equal(result.percent, 66.7);
  assert.equal(result.passed, true);
  assert.equal(result.feedback, 'Good communication.');
  assert.ok(result.questions.every((q: Record<string, unknown>) => !('correctAnswer' in q)), 'revealAnswers is off');
  assert.ok(!JSON.stringify(result).includes('Listen, empathise'));

  // Audit trail
  const actions = (await prisma.auditLog.findMany({ where: { OR: [{ entityId: examId }, { entityId: attemptId }] }, select: { action: true } })).map((a) => a.action);
  for (const a of ['exam.created', 'exam.published', 'exam.assigned', 'exam.attempt_started', 'exam.attempt_submitted', 'exam.attempt_evaluated', 'exam.results_released']) assert.ok(actions.includes(a), `missing audit ${a}`);
});

test('objective-only exam with IMMEDIATE results and revealed answers is scored on submit', async () => {
  const { single, tf } = await questionSet(hr);
  const examId = await examWith(hr, [single.id, tf.id], { resultVisibility: 'IMMEDIATE', revealAnswers: true, passPercent: 60 });
  const s = await newStudent();
  await assignTo(hr, examId, s.user.id);
  await hr.post(`${A}/exams/${examId}/publish`);
  const attemptId = (await s.client.post(`${S}/exams/${examId}/start`)).body.data.attemptId;
  const sub = await s.client.post(`${S}/attempts/${attemptId}/submit`, { answers: [{ questionId: single.id, selectedOptionIds: single.correctOptionIds }] });
  assert.equal(sub.body.data.status, 'EVALUATED');
  assert.equal(sub.body.data.score, 1);
  assert.equal(sub.body.data.passed, false); // 50% < 60%
  const r = (await s.client.get(`${S}/attempts/${attemptId}/result`)).body.data;
  const tfRow = r.questions.find((q: { prompt: string }) => q.prompt.startsWith('SEO'));
  assert.deepEqual(tfRow.correctAnswer, ['False']);
  assert.deepEqual(tfRow.yourAnswer, []);
});

test('server deadline: late saves are refused and the attempt is auto-submitted', async () => {
  const { single } = await questionSet(hr);
  const examId = await examWith(hr, [single.id], { resultVisibility: 'IMMEDIATE' });
  const s = await newStudent();
  await assignTo(hr, examId, s.user.id);
  await hr.post(`${A}/exams/${examId}/publish`);
  const attemptId = (await s.client.post(`${S}/exams/${examId}/start`)).body.data.attemptId;
  assert.equal((await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: single.id, selectedOptionIds: single.correctOptionIds }] })).status, 200);
  // Simulate the clock running out (beyond the 15 s grace)
  await prisma.examAttempt.update({ where: { id: attemptId }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
  const late = await s.client.put(`${S}/attempts/${attemptId}/answers`, { answers: [{ questionId: single.id, selectedOptionIds: [] }] });
  assert.equal(late.status, 409);
  assert.match(late.body.message, /Time is up/);
  const a = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  assert.equal(a.autoSubmitted, true);
  assert.equal(a.status, 'EVALUATED');
  assert.equal(a.score, 1, 'answers saved before the deadline count');

  // Attempts that simply expire are finalised when anyone reads them
  const s2 = await newStudent();
  const examB = await examWith(hr, [single.id], { resultVisibility: 'IMMEDIATE' });
  await assignTo(hr, examB, s2.user.id);
  await hr.post(`${A}/exams/${examB}/publish`);
  const att2 = (await s2.client.post(`${S}/exams/${examB}/start`)).body.data.attemptId;
  await prisma.examAttempt.update({ where: { id: att2 }, data: { deadlineAt: new Date(Date.now() - 60_000) } });
  const rows = (await hr.get(`${A}/exams/${examB}/attempts`)).body.data.items;
  assert.equal(rows[0].status, 'EVALUATED');
  assert.equal(rows[0].autoSubmitted, true);
});

test('schedule window, attempt limits, retakes and concurrent starts', async () => {
  const { single } = await questionSet(hr);
  const s = await newStudent();
  // Not open yet
  const future = await examWith(hr, [single.id], { opensAt: new Date(Date.now() + 86_400_000).toISOString() });
  await assignTo(hr, future, s.user.id);
  await hr.post(`${A}/exams/${future}/publish`);
  const v = (await s.client.get(`${S}/exams/${future}`)).body.data;
  assert.equal(v.state, 'UPCOMING');
  assert.equal(v.canStart, false);
  assert.equal((await s.client.post(`${S}/exams/${future}/start`)).status, 409);

  // Concurrent starts create exactly one attempt
  const examId = await examWith(hr, [single.id]);
  await assignTo(hr, examId, s.user.id);
  await hr.post(`${A}/exams/${examId}/publish`);
  const both = await Promise.all([s.client.post(`${S}/exams/${examId}/start`), s.client.post(`${S}/exams/${examId}/start`)]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 201]);
  assert.equal(both[0].body.data.attemptId, both[1].body.data.attemptId);
  assert.equal(await prisma.examAttempt.count({ where: { examId, studentId: s.user.id } }), 1);
  await s.client.post(`${S}/attempts/${both[0].body.data.attemptId}/submit`, {});
  assert.equal((await s.client.post(`${S}/exams/${examId}/start`)).status, 409);
  assert.equal((await s.client.get(`${S}/exams/${examId}`)).body.data.state, 'NO_ATTEMPTS_LEFT');

  // Retake grant allows exactly one more
  const stranger = await newStudent();
  assert.equal((await hr.post(`${A}/exams/${examId}/retakes`, { studentId: stranger.user.id, reason: 'Network issue' })).status, 422);
  assert.equal((await hr.post(`${A}/exams/${examId}/retakes`, { studentId: s.user.id, reason: 'Network issue during attempt' })).status, 201);
  const second = await s.client.post(`${S}/exams/${examId}/start`);
  assert.equal(second.status, 201);
  assert.equal((await prisma.examAttempt.findUniqueOrThrow({ where: { id: second.body.data.attemptId } })).attemptNo, 2);
});

test('published exams and used questions are locked against edits that would change scoring', async () => {
  const { single, tf } = await questionSet(hr);
  const examId = await examWith(hr, [single.id]);
  await hr.post(`${A}/exams/${examId}/publish`);
  const edit = await hr.put(`${A}/questions/${single.id}`, { track: 'MARKETING', topic: 'Digital marketing', type: 'SINGLE_CHOICE', prompt: 'Changed?', marks: 1, options: [{ text: 'A', correct: true }, { text: 'B' }] });
  assert.equal(edit.status, 409);
  assert.equal((await hr.put(`${A}/exams/${examId}/questions`, { questionIds: [tf.id] })).status, 409);
  const exam = (await hr.get(`${A}/exams/${examId}`)).body.data;
  const base = { title: exam.title, instructions: exam.instructions, track: 'MARKETING', kind: 'TEST', durationMinutes: 30, passPercent: 50, maxAttempts: 1, resultVisibility: 'ON_RELEASE', shuffleQuestions: true, shuffleOptions: true, revealAnswers: false };
  assert.equal((await hr.put(`${A}/exams/${examId}`, { ...base, durationMinutes: 45 })).status, 409);
  assert.equal((await hr.put(`${A}/exams/${examId}`, { ...base, maxAttempts: 2 })).status, 200);
  // Cross-track questions are rejected
  const salesQ = await question(hr, { track: 'SALES', topic: 'Sales fundamentals', type: 'TRUE_FALSE', prompt: 'Follow-ups matter?', options: [{ text: 'True', correct: true }, { text: 'False' }] });
  const draft = await examWith(hr, []);
  assert.equal((await hr.put(`${A}/exams/${draft}/questions`, { questionIds: [salesQ.id] })).status, 422);
  // Publishing without questions is a 422 with a clear reason
  const empty = await hr.post(`${A}/exams/${draft}/publish`);
  assert.equal(empty.status, 422);
  assert.ok(empty.body.errors?.some((e) => e.field === 'questions'));
});

test('assignment by college (case-insensitive) and by batch; random subset per attempt', async () => {
  const qs = await questionSet(hr);
  const examId = await examWith(hr, [qs.single.id, qs.multi.id, qs.tf.id, qs.essay.id], { questionsPerAttempt: 2 });
  const s = await newStudent('St. Xavier College');
  assert.equal((await hr.post(`${A}/exams/${examId}/assignments`, { target: 'INSTITUTION', institution: 'st. xavier college' })).status, 201);
  assert.equal((await hr.post(`${A}/exams/${examId}/assignments`, { target: 'INSTITUTION', institution: 'ST. XAVIER COLLEGE' })).status, 409);
  await hr.post(`${A}/exams/${examId}/publish`);
  const listed = (await s.client.get(`${S}/exams`)).body.data;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].questionCount, 2);
  const attemptId = (await s.client.post(`${S}/exams/${examId}/start`)).body.data.attemptId;
  assert.equal((await s.client.get(`${S}/attempts/${attemptId}`)).body.data.questions.length, 2);

  // Batch target: enrolled students see it
  const { batch } = await seedCourse();
  const enrolled = await registerStudent(api.base);
  const app = await applyAndApprove(enrolled.client, admin, batch.id);
  await payApplication(enrolled.client, gateway, app.id);
  const batchExam = await examWith(hr, [qs.single.id]);
  assert.equal((await hr.post(`${A}/exams/${batchExam}/assignments`, { target: 'BATCH', batchId: batch.id })).status, 201);
  await hr.post(`${A}/exams/${batchExam}/publish`);
  assert.ok((await enrolled.client.get(`${S}/exams`)).body.data.some((e: { id: string }) => e.id === batchExam));
  assert.ok(!(await s.client.get(`${S}/exams`)).body.data.some((e: { id: string }) => e.id === batchExam));
});

test('interview stage: staff record results; reports and export', async () => {
  const exam = await hr.post(`${A}/exams`, { title: 'Sales interview', instructions: 'A 20-minute call with the sales lead.', track: 'SALES', kind: 'INTERVIEW', durationMinutes: 20, passPercent: 60, maxAttempts: 1, resultVisibility: 'IMMEDIATE', interviewMaxMarks: 10 });
  assert.equal(exam.status, 201, JSON.stringify(exam.body));
  const examId = exam.body.data.id;
  const s = await newStudent();
  await assignTo(hr, examId, s.user.id);
  assert.equal((await hr.post(`${A}/exams/${examId}/publish`)).status, 200);
  assert.equal((await s.client.get(`${S}/exams/${examId}`)).body.data.state, 'INTERVIEW');
  assert.equal((await s.client.post(`${S}/exams/${examId}/start`)).status, 409);
  assert.equal((await hr.post(`${A}/exams/${examId}/interview-results`, { studentId: s.user.id, score: 11 })).status, 422);
  const rec = await hr.post(`${A}/exams/${examId}/interview-results`, { studentId: s.user.id, score: 7, feedback: 'Confident, needs product depth.' });
  assert.equal(rec.status, 201);
  assert.equal((await hr.post(`${A}/exams/${examId}/interview-results`, { studentId: s.user.id, score: 8 })).status, 409);
  const mine = (await s.client.get(`${S}/attempts`)).body.data.find((a: { exam: { id: string } }) => a.exam.id === examId);
  assert.equal(mine.percent, 70);
  assert.equal(mine.passed, true);

  const report = (await hr.get(`${A}/exams/${examId}/report`)).body.data;
  assert.equal(report.evaluated, 1);
  assert.equal(report.passed, 1);
  assert.equal(report.averagePercent, 70);
  const exp = await hr.get(`${A}/exams/${examId}/export`);
  assert.equal(exp.status, 200);
  assert.equal(exp.body.data.rows[0].result, 'PASS');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'report.exported', entityId: `exam-results:${examId}` } }));
  const perf = (await hr.get(`${A}/students/${s.user.id}/performance`)).body.data;
  assert.equal(perf.summary.passed, 1);
  assert.equal((await s.client.get(`${A}/students/${s.user.id}/performance`)).status, 403);
});

test('learning materials can be uploaded files, readable only by the batch', async () => {
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const t = await staff(api.base, 'TRAINER');
  const { batch } = await seedCourse();
  assert.equal((await admin.post(`/api/training/admin/batches/${batch.id}/trainers`, { trainerId: t.user.id })).status, 200);
  const enrolled = await registerStudent(api.base);
  const app = await applyAndApprove(enrolled.client, admin, batch.id);
  await payApplication(enrolled.client, gateway, app.id);
  const outsider = await registerStudent(api.base);

  const up = async (c: Client, purpose: string) => {
    const res = await fetch(`${api.base}/api/files?purpose=${purpose}`, { method: 'POST', headers: { Cookie: c.cookie, 'X-Forwarded-For': c.ip, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'week1.pdf' }, body: PDF });
    return { status: res.status, body: (await res.json()) as { data: { id: string } } };
  };
  assert.equal((await up(enrolled.client, 'LEARNING_MATERIAL')).status, 403);
  const file = await up(t.client, 'LEARNING_MATERIAL');
  assert.equal(file.status, 201);
  const fileId = file.body.data.id;
  assert.equal((await t.client.post(`/api/training/trainer/batches/${batch.id}/materials`, { title: 'Week 1 notes' })).status, 422);
  assert.equal((await t.client.post(`/api/training/trainer/batches/${batch.id}/materials`, { title: 'Week 1 notes', url: 'https://example.com/a', fileId })).status, 422);
  const m = await t.client.post(`/api/training/trainer/batches/${batch.id}/materials`, { title: 'Week 1 notes', type: 'LINK', fileId });
  assert.equal(m.status, 201, JSON.stringify(m.body));
  assert.equal(m.body.data.type, 'DOCUMENT');
  assert.equal(m.body.data.url, null);
  // Same file cannot be attached twice
  assert.equal((await t.client.post(`/api/training/trainer/batches/${batch.id}/materials`, { title: 'Again', fileId })).status, 422);
  const mats = (await enrolled.client.get('/api/training/student/materials')).body.data;
  assert.equal(mats[0].file.id, fileId);
  assert.equal(mats[0].file.name, 'week1.pdf');
  const dl = (c: Client) => fetch(`${api.base}/api/files/${fileId}`, { headers: { Cookie: c.cookie, 'X-Forwarded-For': c.ip } });
  assert.equal((await dl(enrolled.client)).status, 200);
  assert.equal((await dl(outsider.client)).status, 404);
  assert.equal((await dl((await staff(api.base, 'TRAINER')).client)).status, 404);
});

test('negative marking deducts for wrong answers, never for blanks, and the total never drops below zero', async () => {
  const mk = (prompt: string) =>
    question(hr, { type: 'SINGLE_CHOICE', marks: 4, prompt, options: [{ text: 'Right', correct: true }, { text: 'Wrong' }] });
  const [q1, q2, q3] = [await mk('Negative marking one?'), await mk('Negative marking two?'), await mk('Negative marking three?')];
  const examId = await examWith(hr, [q1.id, q2.id, q3.id], { resultVisibility: 'IMMEDIATE', negativeMarkPercent: 25, passPercent: 10 });
  const wrong = (q: typeof q1) => q.options.filter((o) => !q.correctOptionIds.includes(o.id)).map((o) => o.id);

  const s = await newStudent();
  await assignTo(hr, examId, s.user.id);
  assert.equal((await hr.post(`${A}/exams/${examId}/publish`)).status, 200);
  assert.equal((await s.client.get(`${S}/exams/${examId}`)).body.data.negativeMarkPercent, 25);
  const att = (await s.client.post(`${S}/exams/${examId}/start`)).body.data.attemptId;
  // right (+4), wrong (-1), blank (0) => 3 of 12
  const r = await s.client.post(`${S}/attempts/${att}/submit`, { answers: [{ questionId: q1.id, selectedOptionIds: q1.correctOptionIds }, { questionId: q2.id, selectedOptionIds: wrong(q2) }] });
  assert.equal(r.body.data.score, 3);
  assert.equal(r.body.data.percent, 25);

  // all wrong => clamped to 0, not -3
  const s2 = await newStudent();
  await assignTo(hr, examId, s2.user.id);
  const att2 = (await s2.client.post(`${S}/exams/${examId}/start`)).body.data.attemptId;
  const r2 = await s2.client.post(`${S}/attempts/${att2}/submit`, { answers: [q1, q2, q3].map((q) => ({ questionId: q.id, selectedOptionIds: wrong(q) })) });
  assert.equal(r2.body.data.score, 0);
  assert.equal(r2.body.data.passed, false);

  // negative marking is fixed once published
  const exam = (await hr.get(`${A}/exams/${examId}`)).body.data;
  const body = { title: exam.title, instructions: exam.instructions, track: 'MARKETING', kind: 'TEST', durationMinutes: 30, passPercent: 10, maxAttempts: 1, resultVisibility: 'IMMEDIATE', shuffleQuestions: true, shuffleOptions: true, revealAnswers: false, negativeMarkPercent: 0 };
  assert.equal((await hr.put(`${A}/exams/${examId}`, body)).status, 409);
});
