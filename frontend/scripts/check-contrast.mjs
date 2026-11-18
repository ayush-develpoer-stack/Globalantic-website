#!/usr/bin/env node
/**
 * WCAG 2.1 contrast check for the theme tokens in app/globals.css.
 *
 * Parses the `:root` (light) and `[data-theme='dark']` blocks, resolves
 * `var(--x)` aliases, and verifies the foreground/background pairs the UI
 * actually uses. Exits non-zero if any pair is below its minimum ratio
 * (4.5:1 for text, 3:1 for UI boundaries such as input borders and focus rings).
 *
 * Usage: npm --workspace frontend run check:contrast
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'app', 'globals.css'), 'utf8');

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Selector not found: ${selector}`);
  const end = css.indexOf('\n}', start);
  const vars = {};
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

const light = block(':root');
const dark = { ...light, ...block("[data-theme='dark']") };

function resolve(theme, name, depth = 0) {
  const value = theme[name];
  if (value === undefined) throw new Error(`Unknown token --${name}`);
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias && depth < 10) return resolve(theme, alias[1], depth + 1);
  return value;
}

function rgb(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!hex) throw new Error(`Not a hex colour: ${value}`);
  let h = hex[1];
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function luminance(value) {
  const [r, g, b] = rgb(value).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground token, background token, minimum ratio] */
const PAIRS = [
  ['foreground', 'background', 4.5],
  ['card-foreground', 'card', 4.5],
  ['popover-foreground', 'popover', 4.5],
  ['text-secondary', 'card', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary-foreground', 'primary-gradient-end', 4.5],
  ['primary-foreground', 'primary-hover', 4.5],
  ['primary-text', 'background', 4.5],
  ['primary-text', 'card', 4.5],
  ['primary-text', 'muted', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['secondary-foreground', 'secondary', 4.5],
  ['success', 'card', 4.5],
  ['warning', 'card', 4.5],
  ['destructive', 'card', 4.5],
  ['info', 'card', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['sidebar-foreground', 'sidebar', 4.5],
  ['sidebar-foreground', 'sidebar-accent', 4.5],
  ['inverse-foreground', 'inverse', 4.5],
  ['inverse-muted', 'inverse', 4.5],
  ['inverse-subtle', 'inverse', 4.5],
  ['input', 'card', 3],
  ['ring', 'background', 3],
  ['ring', 'card', 3],
];

let failures = 0;
for (const [label, theme] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(`\n${label.toUpperCase()} THEME`);
  for (const [fg, bg, min] of PAIRS) {
    const r = ratio(resolve(theme, fg), resolve(theme, bg));
    const ok = r >= min;
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  --${fg} on --${bg}  (min ${min}:1)`);
  }
}

console.log(failures ? `\n${failures} contrast check(s) failed.` : '\nAll contrast checks passed.');
process.exit(failures ? 1 : 0);
