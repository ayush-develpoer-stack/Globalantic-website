import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_OPTIONS, whatsappMessage, whatsappUrl } from '@/lib/config';

test('WhatsApp links use the official business number in international format', () => {
  assert.equal(whatsappUrl(), 'https://wa.me/917697845157');
  const url = new URL(whatsappUrl(whatsappMessage('Mobile App Development')) as string);
  assert.equal(url.origin + url.pathname, 'https://wa.me/917697845157');
  assert.equal(url.searchParams.get('text'), 'Hello Globalantic, I am interested in your Mobile App Development services. I would like to discuss my project.');
});

test('default and reference messages are contextual and safely encoded', () => {
  assert.equal(whatsappMessage(), 'Hello Globalantic, I am interested in your website/software development services. I would like to discuss my project.');
  const url = whatsappUrl(whatsappMessage('UI/UX Design', 'LEAD-2026-000042')) as string;
  assert.ok(url.includes('%2F'), 'slash is encoded');
  assert.ok(decodeURIComponent(url.split('text=')[1]).includes('(enquiry LEAD-2026-000042)'));
});

test('enquiry service list covers the offered service lines', () => {
  for (const s of ['Web Development', 'Custom Software Development', 'CRM Development', 'ERP Development', 'Mobile App Development', 'AI Solutions & Automation', 'E-commerce Development', 'UI/UX Design', 'SEO', 'Digital Marketing', 'Cloud Services', 'API Integration', 'IT Support']) {
    assert.ok((SERVICE_OPTIONS as readonly string[]).includes(s), s);
  }
});

test('page titles carry the brand exactly once (layout template is bypassed)', async () => {
  const { buildMetadata } = await import('@/lib/seo');
  assert.deepEqual(buildMetadata({ title: 'Request a Quote' }).title, { absolute: 'Request a Quote | Globalantic' });
  assert.deepEqual(buildMetadata({ title: 'Web Development Services | Globalantic' }).title, { absolute: 'Web Development Services | Globalantic' });
  assert.equal(buildMetadata({ title: 'Request a Quote' }).openGraph?.title, 'Request a Quote | Globalantic');
});
