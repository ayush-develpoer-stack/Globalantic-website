import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactSchema, trainingSchema, careerSchema, loginSchema } from '@/lib/validation/forms';
import { serviceSchema, settingsSchema, statusSchemas, validate } from '@/lib/validation/admin';

const validTraining = {
  fullName: 'Test Applicant',
  phone: '5550123456',
  email: 'applicant@example.com',
  qualification: 'Graduate',
  mode: 'ONLINE',
};

test('training age matches the server rule (15–80, optional)', () => {
  assert.equal(trainingSchema.safeParse({ ...validTraining, age: '14' }).success, false);
  assert.equal(trainingSchema.safeParse({ ...validTraining, age: '15' }).success, true);
  assert.equal(trainingSchema.safeParse({ ...validTraining, age: '' }).success, true);
  assert.equal(trainingSchema.safeParse({ ...validTraining, age: '81' }).success, false);
});

test('training mode must be ONLINE or OFFLINE', () => {
  assert.equal(trainingSchema.safeParse({ ...validTraining, mode: 'HYBRID' }).success, false);
});

test('contact requires a message of at least 10 characters and a valid email', () => {
  const r = validate(contactSchema, { name: 'Al', email: 'not-an-email', message: 'short' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(r.errors.map((e) => e.field).sort(), ['email', 'message']);
});

test('career URLs must be absolute when provided', () => {
  const base = { name: 'Test', email: 'a@example.com', position: 'Developer' };
  assert.equal(careerSchema.safeParse({ ...base, resumeUrl: 'resume.pdf' }).success, false);
  assert.equal(careerSchema.safeParse({ ...base, resumeUrl: '' }).success, true);
  assert.equal(careerSchema.safeParse({ ...base, resumeUrl: 'https://example.com/cv.pdf' }).success, true);
});

test('login requires email and password', () => {
  assert.equal(loginSchema.safeParse({ email: 'a@example.com', password: '' }).success, false);
});

test('CMS slug must be lowercase-hyphenated', () => {
  const base = { title: 'T', shortDesc: 'S', overview: 'O' };
  assert.equal(serviceSchema.safeParse({ ...base, slug: 'Web Development' }).success, false);
  assert.equal(serviceSchema.safeParse({ ...base, slug: 'web--dev' }).success, false);
  assert.equal(serviceSchema.safeParse({ ...base, slug: 'web-development' }).success, true);
});

test('settings validate email and social URLs', () => {
  const base = { companyName: 'Globalantic', email: 'hello@example.com', defaultSeoTitle: 'T', ctaText: 'Go' };
  assert.equal(settingsSchema.safeParse(base).success, true);
  assert.equal(settingsSchema.safeParse({ ...base, linkedinUrl: 'linkedin.com/x' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...base, email: '' }).success, false);
});

test('status schemas only accept known statuses', () => {
  assert.equal(statusSchemas.contacts.safeParse({ status: 'CONVERTED' }).success, true);
  assert.equal(statusSchemas.contacts.safeParse({ status: 'HIRED' }).success, false);
  assert.equal(statusSchemas.careers.safeParse({ status: 'HIRED' }).success, true);
});
