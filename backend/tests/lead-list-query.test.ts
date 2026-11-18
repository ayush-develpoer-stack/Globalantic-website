/**
 * Regression test: invalid admin list filters must be rejected with 400 before
 * they reach Prisma (previously `?status=NOT_A_STATUS` or a repeated `?search=`
 * caused a PrismaClientValidationError and a 500 that leaked internals in dev).
 *
 * The requests fail validation before reaching Prisma. Auth now checks a real
 * server-side session, so the admin signs in against the local test database.
 * Run with: npm --workspace backend test
 */
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, staff, type Api, type Client } from './helpers';
import {
  careerListQuerySchema,
  contactListQuerySchema,
  trainingListQuerySchema,
} from '../src/validators';

test('schema: valid filters pass and are normalised', () => {
  assert.deepEqual(contactListQuerySchema.parse({ status: 'NEW', search: '  acme ' }), { status: 'NEW', search: 'acme' });
  assert.deepEqual(trainingListQuerySchema.parse({ status: 'JOINED' }), { status: 'JOINED' });
  assert.deepEqual(careerListQuerySchema.parse({}), {});
});

test('schema: empty ?status= still means "no filter" (unchanged behaviour)', () => {
  assert.equal(contactListQuerySchema.parse({ status: '', search: '' }).status, undefined);
});

test('schema: unknown status, wrong-inbox status and arrays are rejected', () => {
  assert.equal(contactListQuerySchema.safeParse({ status: 'NOT_A_STATUS' }).success, false);
  assert.equal(contactListQuerySchema.safeParse({ status: 'HIRED' }).success, false); // career-only status
  assert.equal(contactListQuerySchema.safeParse({ search: ['a', 'b'] }).success, false);
  assert.equal(contactListQuerySchema.safeParse({ search: 'x'.repeat(201) }).success, false);
});

// ---- HTTP: the real app, middleware order included -------------------------
let api: Api;
let base = '';
let admin: Client;

before(async () => {
  api = await startApi();
  base = api.base;
  admin = (await staff(base, 'ADMIN')).client;
});

after(() => api.close());

for (const path of [
  '/api/admin/contacts?status=NOT_A_STATUS',
  '/api/admin/training?status=NOT_A_STATUS',
  '/api/admin/careers?status=NOT_A_STATUS',
  '/api/admin/contacts?search=a&search=b',
]) {
  test(`GET ${path} → 422 with field errors, no internals`, async () => {
    const res = await admin.get(path);
    const body = res.body as unknown as { success: boolean; message: string; errors: { field: string }[] };
    assert.equal(res.status, 422);
    assert.equal(body.success, false);
    assert.equal(body.message, 'Validation failed');
    assert.ok(body.errors.length > 0 && body.errors.every((e) => e.field === 'status' || e.field === 'search'));
    assert.doesNotMatch(JSON.stringify(body), /prisma|invocation|node_modules|\.ts:/i);
  });
}

test('auth still runs before validation (no token → 401, not 400)', async () => {
  const res = await fetch(`${base}/api/admin/contacts?status=NOT_A_STATUS`);
  assert.equal(res.status, 401);
});
