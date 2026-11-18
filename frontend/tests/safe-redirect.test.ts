import { test } from 'node:test';
import assert from 'node:assert/strict';
// Shared portal login (admin, intern, employee, trainer) and the training site's login.
import { safeNext } from '../../packages/ui/src/safe-next';
import { safeInternalPath } from '../../training/lib/config';

// Browsers strip tab/CR/LF while parsing a URL, so these become "//evil.example/..." (off-site).
const attacks = ['/\t/evil.example/login', '/\n/evil.example', '/\r\n/evil.example', '//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', ''];

test('post-login redirects: off-site targets fall back, including control-character tricks', () => {
  for (const next of attacks) {
    assert.equal(safeNext(next, '/home'), '/home', JSON.stringify(next));
    assert.equal(safeInternalPath(next), null, JSON.stringify(next));
  }
});

test('post-login redirects: internal paths keep their query and hash', () => {
  for (const next of ['/', '/courses/web?tab=fees#apply', '/exams/abc']) {
    assert.equal(safeNext(next), next);
    assert.equal(safeInternalPath(next), next);
  }
});
