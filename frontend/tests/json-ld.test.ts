import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonLd } from '@/lib/json-ld';

test('jsonLd: CMS text cannot close the <script> tag (stored XSS) and the JSON stays identical', () => {
  const data = { '@type': 'BlogPosting', headline: 'Hello </script><script>alert(1)</script> & <b>', note: 'line sep' };
  const out = jsonLd(data);
  assert.doesNotMatch(out, /<\/script/i);
  assert.doesNotMatch(out, /[<>]/);
  assert.ok(!out.includes(' '));
  assert.deepEqual(JSON.parse(out), data);
});
