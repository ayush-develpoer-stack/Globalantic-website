import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyListQuery, normalizePaging, type QueryConfig } from '@/lib/query';

interface Row {
  id: string;
  name: string;
  city: string | null;
  status: string;
  score: number;
}

const rows: Row[] = [
  { id: '1', name: 'Asha', city: 'Bhopal', status: 'NEW', score: 3 },
  { id: '2', name: 'Bilal', city: null, status: 'CLOSED', score: 10 },
  { id: '3', name: 'chitra', city: 'Indore', status: 'NEW', score: 7 },
  { id: '4', name: 'Dev', city: 'Bhopal', status: 'CONTACTED', score: 1 },
];

const config: QueryConfig<Row> = {
  searchFields: ['name', 'city'],
  sortableFields: ['name', 'city', 'score'],
  defaultSort: 'name',
  matchStatus: (r, s) => r.status === s,
};

test('search is case-insensitive across the configured fields', () => {
  assert.deepEqual(applyListQuery(rows, { search: 'BHOPAL' }, config).items.map((r) => r.id), ['1', '4']);
  assert.deepEqual(applyListQuery(rows, { search: '  chi ' }, config).items.map((r) => r.id), ['3']);
});

test('status filter applies; ALL means no filter', () => {
  assert.equal(applyListQuery(rows, { status: 'NEW' }, config).meta.total, 2);
  assert.equal(applyListQuery(rows, { status: 'ALL' }, config).meta.total, 4);
});

test('sorts by an allowed field in both directions; unknown fields fall back to the default', () => {
  assert.deepEqual(applyListQuery(rows, { sort: 'score', direction: 'desc' }, config).items.map((r) => r.score), [10, 7, 3, 1]);
  assert.deepEqual(applyListQuery(rows, { sort: 'score' }, config).items.map((r) => r.score), [1, 3, 7, 10]);
  // 'status' is not sortable -> default (name, case-insensitive)
  assert.deepEqual(applyListQuery(rows, { sort: 'status' }, config).items.map((r) => r.name), ['Asha', 'Bilal', 'chitra', 'Dev']);
});

test('empty values sort last in both directions', () => {
  assert.equal(applyListQuery(rows, { sort: 'city', direction: 'asc' }, config).items.at(-1)?.id, '2');
  assert.equal(applyListQuery(rows, { sort: 'city', direction: 'desc' }, config).items.at(-1)?.id, '2');
});

test('paginates and clamps an out-of-range page to the last page', () => {
  const many = Array.from({ length: 23 }, (_, i) => ({ ...rows[0], id: String(i), name: `n${String(i).padStart(2, '0')}` }));
  const page3 = applyListQuery(many, { page: 3, pageSize: 10 }, config);
  assert.equal(page3.items.length, 3);
  assert.deepEqual(page3.meta, { page: 3, pageSize: 10, total: 23, totalPages: 3 });
  assert.equal(applyListQuery(many, { page: 99, pageSize: 10 }, config).meta.page, 3);
});

test('empty result still reports one page', () => {
  assert.deepEqual(applyListQuery([], {}, config).meta, { page: 1, pageSize: 10, total: 0, totalPages: 1 });
});

test('page size is limited to the allowed options', () => {
  assert.equal(normalizePaging({ pageSize: 1000 }).pageSize, 10);
  assert.equal(normalizePaging({ pageSize: 25, page: -2 }).page, 1);
  assert.equal(normalizePaging({ pageSize: 25 }).pageSize, 25);
});
