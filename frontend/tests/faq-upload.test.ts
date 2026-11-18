import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetMockStore, getMockStore } from '@/lib/mock/store';
import { ServiceError } from '@/lib/api/errors';
import { faqSchema, validate } from '@/lib/validation/admin';
import { faqService } from '@/services/admin/faq.service';
import { checkImageFile, uploadService } from '@/services/admin/upload.service';

beforeEach(() => resetMockStore());

async function rejection(promise: Promise<unknown>): Promise<ServiceError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ServiceError, 'expected a ServiceError');
    return err;
  }
  assert.fail('expected the call to reject');
}

test('FAQ schema mirrors the server rules', () => {
  assert.equal(validate(faqSchema, { question: 'Do you offer weekend batches?', answer: 'Yes, for most courses.', category: 'training', order: 1 }).ok, true);
  const bad = validate(faqSchema, { question: 'Q?', answer: '', category: 'Bad Category', order: -1 });
  assert.equal(bad.ok, false);
  const fields = bad.ok ? [] : bad.errors.map((e) => e.field).sort();
  assert.deepEqual(fields, ['answer', 'category', 'order', 'question']);
});

test('mock FAQ service: seeded, validated with 422 field errors, full CRUD', async () => {
  const seeded = await faqService.list();
  assert.equal(seeded.length, getMockStore().faqs.length);
  assert.ok(seeded.length > 0, 'seeded from the FAQ fixtures');

  const invalid = await rejection(faqService.create({ question: 'Hi', answer: 'No', category: 'X Y', order: 0 }));
  assert.equal(invalid.status, 422);
  assert.ok(invalid.fieldErrors.some((e) => e.field === 'category'));

  const created = await faqService.create({ question: 'Is there a placement guarantee?', answer: 'We do not promise placements.', category: 'training', order: 3 });
  assert.equal((await faqService.list()).length, seeded.length + 1);
  const updated = await faqService.update(created.id, { ...created, answer: 'No guarantee; we help with preparation.' });
  assert.equal(updated.answer, 'No guarantee; we help with preparation.');
  await faqService.remove(created.id);
  assert.equal((await rejection(faqService.remove(created.id))).status, 404);
  assert.equal((await faqService.list()).length, seeded.length);
});

test('image upload: client hints, and mock mode refuses instead of faking a URL', async () => {
  assert.equal(checkImageFile({ type: 'image/png', size: 1000 }), null);
  assert.match(checkImageFile({ type: 'image/svg+xml', size: 1000 }) ?? '', /PNG, JPEG or WEBP/);
  assert.match(checkImageFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 }) ?? '', /5 MB/);
  const err = await rejection(uploadService.uploadImage(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])])));
  assert.equal(err.status, 501);
  assert.match(err.message, /real API/);
});
