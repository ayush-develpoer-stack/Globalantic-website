import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** The supplied logo is the single source; every copy must stay byte-identical, and no text placeholder may return. */
const repo = path.resolve(process.cwd(), '..');
const hash = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, p))).digest('hex');

test('logo copies are byte-identical to frontend/public/logo.svg', () => {
  const source = hash('frontend/public/logo.svg');
  for (const copy of ['packages/ui/src/assets/logo.svg', 'frontend/app/icon.svg', 'backend/assets/logo.svg']) assert.equal(hash(copy), source, `${copy} differs from the supplied logo`);
});

test('no "G" text placeholder is used instead of the logo', () => {
  const files = [
    'packages/ui/src/session.tsx',
    'training/components/SiteHeader.tsx',
    'frontend/components/layout/Navbar.tsx',
    'frontend/components/footer/Footer.tsx',
    'frontend/app/opengraph-image.tsx',
    'training/app/opengraph-image.tsx',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(repo, f), 'utf8');
    assert.ok(!/>\s*G\s*</.test(src), `${f} still renders a "G" placeholder`);
    assert.ok(/logo\.svg|<Logo\b/.test(src), `${f} does not render the logo`);
  }
});
