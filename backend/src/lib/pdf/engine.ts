import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

/**
 * Globalantic document theme on PDFKit (A4, embedded brand font, vector logo).
 *
 * - Text is never clipped: every helper measures before drawing and starts a new page when the
 *   block would cross the bottom margin; tables repeat their header row on each page.
 * - Each page gets the branded header (on page creation) and "Page X of Y" footer (at the end).
 * - Every drawn text box is recorded in `boxes`, so tests can assert nothing leaves the content
 *   area or overlaps.
 * - Names in Devanagari are rendered with Noto Sans Devanagari (which also covers Latin);
 *   everything else uses Plus Jakarta Sans (covers Latin and ₹).
 */

export const BRAND = {
  primary: '#6D22E6',
  logo: '#7B16EC',
  ink: '#14121F',
  navy: '#1B1636',
  muted: '#5B5872',
  line: '#E4E0F0',
  tint: '#F5F0FF',
  white: '#FFFFFF',
  danger: '#B42318',
};

export const A4 = { width: 595.28, height: 841.89 };
const M = { left: 48, right: 48, top: 112, bottom: 70 };
const HEADER_TOP = 36;

type Weight = 400 | 600 | 700;

const fontFile = (pkg: string, dir: string, file: string) => require.resolve(`@expo-google-fonts/${pkg}/${dir}/${file}`);
const FONTS: Record<string, string> = {
  J400: fontFile('plus-jakarta-sans', '400Regular', 'PlusJakartaSans_400Regular.ttf'),
  J600: fontFile('plus-jakarta-sans', '600SemiBold', 'PlusJakartaSans_600SemiBold.ttf'),
  J700: fontFile('plus-jakarta-sans', '700Bold', 'PlusJakartaSans_700Bold.ttf'),
  D400: fontFile('noto-sans-devanagari', '400Regular', 'NotoSansDevanagari_400Regular.ttf'),
  D600: fontFile('noto-sans-devanagari', '600SemiBold', 'NotoSansDevanagari_600SemiBold.ttf'),
  D700: fontFile('noto-sans-devanagari', '700Bold', 'NotoSansDevanagari_700Bold.ttf'),
};

const DEVANAGARI = /\p{Script=Devanagari}/u;
export const fontFor = (text: string, weight: Weight) => `${DEVANAGARI.test(text) ? 'D' : 'J'}${weight}`;

// --- Logo: the supplied logo.svg (traced vector paths) drawn natively -------------------------
interface LogoPath {
  d: string;
  fill: string;
  tx: number;
  ty: number;
}
let logoCache: { size: number; paths: LogoPath[] } | null = null;
function logo() {
  if (logoCache) return logoCache;
  const svg = fs.readFileSync(path.resolve(__dirname, '../../../assets/logo.svg'), 'utf8');
  const size = Number(svg.match(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/)?.[1] ?? 1600);
  const paths = [...svg.matchAll(/<path\b([^>]*)\/?>/g)].map((m) => {
    const attr = (n: string) => m[1].match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
    const t = attr('transform')?.match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/);
    return { d: attr('d') ?? '', fill: attr('fill') ?? BRAND.logo, tx: t ? Number(t[1]) : 0, ty: t ? Number(t[2]) : 0 };
  });
  logoCache = { size, paths };
  return logoCache;
}

export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const l = logo();
  doc.save();
  doc.translate(x, y).scale(size / l.size);
  for (const p of l.paths) {
    doc.save();
    doc.translate(p.tx, p.ty);
    doc.path(p.d).fill(p.fill);
    doc.restore();
  }
  doc.restore();
}

// --- Document ----------------------------------------------------------------------------------

export interface HeaderInfo {
  /** Company name shown next to the logo (from the business profile) */
  companyName: string;
  /** One or two short lines under the name (address / contact), only real configured values */
  companyLines: string[];
  /** e.g. "QUOTATION", "PAYMENT RECEIPT" */
  label: string;
  /** e.g. "QTN/2026-27/0001" (null for drafts) */
  number?: string | null;
}

export interface PdfOptions {
  title: string;
  header: HeaderInfo | null;
  /** Footer left text (e.g. legal name · GSTIN) */
  footer?: string;
  watermark?: string;
  layout?: 'portrait' | 'landscape';
  /** Full-bleed pages (certificate): no automatic header/footer */
  plain?: boolean;
}

export interface Box {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface TextOpts {
  size?: number;
  weight?: Weight;
  color?: string;
  width?: number;
  x?: number;
  y?: number;
  align?: 'left' | 'right' | 'center' | 'justify';
  lineGap?: number;
  /** Do not advance doc.y (for side-by-side blocks) */
  stay?: boolean;
}

export interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right' | 'center';
}

export class PdfDoc {
  readonly doc: PDFKit.PDFDocument;
  readonly boxes: Box[] = [];
  private page = 1;
  private readonly opts: PdfOptions;

  constructor(opts: PdfOptions) {
    this.opts = opts;
    this.doc = new PDFDocument({
      size: 'A4',
      layout: opts.layout ?? 'portrait',
      margins: opts.plain ? { top: 0, bottom: 0, left: 0, right: 0 } : M,
      bufferPages: true,
      autoFirstPage: false,
      info: { Title: opts.title, Author: opts.header?.companyName ?? 'Globalantic', Creator: 'Globalantic', Producer: 'Globalantic' },
    });
    for (const [name, file] of Object.entries(FONTS)) this.doc.registerFont(name, file);
    this.doc.on('pageAdded', () => {
      if (!opts.plain && opts.header) this.drawHeader(opts.header);
    });
    this.doc.addPage();
    this.page = 1;
    this.doc.on('pageAdded', () => {
      this.page += 1;
    });
  }

  get left() {
    return this.opts.plain ? 0 : M.left;
  }
  get right() {
    return this.doc.page.width - (this.opts.plain ? 0 : M.right);
  }
  get contentWidth() {
    return this.right - this.left;
  }
  get bottom() {
    return this.doc.page.height - (this.opts.plain ? 0 : M.bottom);
  }
  get y() {
    return this.doc.y;
  }
  set y(v: number) {
    this.doc.y = v;
  }

  private setFont(text: string, weight: Weight, size: number) {
    this.doc.font(fontFor(text, weight)).fontSize(size);
  }

  measure(text: string, o: TextOpts = {}): number {
    this.setFont(text, o.weight ?? 400, o.size ?? 9.5);
    return this.doc.heightOfString(text || ' ', { width: o.width ?? this.contentWidth, lineGap: o.lineGap ?? 2, align: o.align });
  }

  /** New page when `h` points do not fit above the bottom margin. */
  ensureSpace(h: number) {
    if (this.doc.y + h > this.bottom) this.doc.addPage();
  }

  /**
   * Draws text at (x, y) or the cursor. Long text flows across pages paragraph by paragraph,
   * each paragraph measured first so it never runs into the footer.
   */
  text(text: string, o: TextOpts = {}) {
    const size = o.size ?? 9.5;
    const weight = o.weight ?? 400;
    const width = o.width ?? this.right - (o.x ?? this.left);
    const x = o.x ?? this.left;
    if (o.y !== undefined) this.doc.y = o.y;
    const startY = this.doc.y;
    const paragraphs = (text || '').split(/\n/);
    for (const para of paragraphs) {
      const p = para.length ? para : ' ';
      const h = this.measure(p, { size, weight, width, lineGap: o.lineGap, align: o.align });
      if (this.doc.y + h > this.bottom) {
        if (h > this.bottom - (this.opts.plain ? 0 : M.top)) {
          this.flowLong(p, { size, weight, width, x, color: o.color, lineGap: o.lineGap, align: o.align });
          continue;
        }
        this.doc.addPage();
      }
      const y = this.doc.y;
      this.setFont(p, weight, size);
      this.doc.fillColor(o.color ?? BRAND.ink).text(p, x, y, { width, lineGap: o.lineGap ?? 2, align: o.align });
      this.boxes.push({ page: this.page, x, y, w: width, h, text: p.slice(0, 40) });
      this.doc.y = y + h;
    }
    if (o.stay) this.doc.y = startY;
    return this;
  }

  /** A paragraph taller than a whole page: split by words into page-sized chunks. */
  private flowLong(p: string, o: Required<Pick<TextOpts, 'size' | 'weight' | 'width' | 'x'>> & TextOpts) {
    const words = p.split(/(\s+)/);
    let chunk = '';
    const flush = () => {
      if (!chunk.trim()) return;
      const h = this.measure(chunk, o);
      if (this.doc.y + h > this.bottom) this.doc.addPage();
      const y = this.doc.y;
      this.setFont(chunk, o.weight, o.size);
      this.doc.fillColor(o.color ?? BRAND.ink).text(chunk, o.x, y, { width: o.width, lineGap: o.lineGap ?? 2, align: o.align });
      this.boxes.push({ page: this.page, x: o.x, y, w: o.width, h, text: chunk.slice(0, 40) });
      this.doc.y = y + h;
      chunk = '';
    };
    for (const w of words) {
      const next = chunk + w;
      if (this.doc.y + this.measure(next, o) > this.bottom && chunk.trim()) flush();
      chunk += w;
    }
    flush();
  }

  gap(h = 10) {
    this.doc.y += h;
    return this;
  }

  rule(color = BRAND.line, weight = 0.8) {
    this.ensureSpace(4);
    const y = this.doc.y;
    this.doc.save().moveTo(this.left, y).lineTo(this.right, y).lineWidth(weight).strokeColor(color).stroke().restore();
    this.doc.y = y + 4;
    return this;
  }

  /** Section heading kept together with at least `keep` points of what follows. */
  heading(text: string, keep = 60) {
    this.ensureSpace(this.measure(text, { size: 11.5, weight: 700 }) + keep);
    this.gap(4);
    this.text(text, { size: 11.5, weight: 700, color: BRAND.navy });
    const y = this.doc.y + 1;
    this.doc.save().moveTo(this.left, y).lineTo(this.left + 36, y).lineWidth(2).strokeColor(BRAND.primary).stroke().restore();
    this.doc.y = y + 7;
    return this;
  }

  /** Two-column label/value grid (only rows with a value are printed). */
  keyValues(rows: [string, string | null | undefined][], o: { x?: number; width?: number; labelWidth?: number; size?: number } = {}) {
    const x = o.x ?? this.left;
    const width = o.width ?? this.contentWidth;
    const lw = o.labelWidth ?? Math.min(130, width * 0.4);
    const size = o.size ?? 9;
    for (const [label, value] of rows) {
      if (value === null || value === undefined || value === '') continue;
      const h = Math.max(this.measure(label, { size, weight: 600, width: lw - 6 }), this.measure(value, { size, width: width - lw }));
      this.ensureSpace(h + 2);
      const y = this.doc.y;
      this.text(label, { x, y, width: lw - 6, size, weight: 600, color: BRAND.muted, stay: true });
      this.text(value, { x: x + lw, y, width: width - lw, size });
      this.doc.y = y + h + 3;
    }
    return this;
  }

  /** Table with wrapped cells, zebra rows and the header row repeated after page breaks. */
  table(columns: Column[], rows: { cells: string[]; bold?: boolean }[], o: { size?: number } = {}) {
    const size = o.size ?? 8.8;
    const pad = 5;
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = this.contentWidth / total;
    const cols = columns.map((c) => ({ ...c, width: c.width * scale }));
    const drawHead = () => {
      const h = Math.max(...cols.map((c) => this.measure(c.header, { size: size - 0.5, weight: 700, width: c.width - pad * 2 }))) + pad * 2;
      const y = this.doc.y;
      this.doc.save().rect(this.left, y, this.contentWidth, h).fill(BRAND.navy).restore();
      let x = this.left;
      for (const c of cols) {
        this.text(c.header, { x: x + pad, y: y + pad, width: c.width - pad * 2, size: size - 0.5, weight: 700, color: BRAND.white, align: c.align, stay: true });
        x += c.width;
      }
      this.doc.y = y + h;
    };
    const rowHeight = (r: { cells: string[]; bold?: boolean }) =>
      Math.max(...cols.map((c, i) => this.measure(r.cells[i] ?? '', { size, weight: r.bold ? 700 : 400, width: c.width - pad * 2 }))) + pad * 2;

    const headH = Math.max(...cols.map((c) => this.measure(c.header, { size: size - 0.5, weight: 700, width: c.width - pad * 2 }))) + pad * 2;
    this.ensureSpace(headH + (rows[0] ? rowHeight(rows[0]) : 0));
    drawHead();
    rows.forEach((r, idx) => {
      const h = rowHeight(r);
      if (this.doc.y + h > this.bottom) {
        this.doc.addPage();
        drawHead();
      }
      const y = this.doc.y;
      if (idx % 2 === 1) this.doc.save().rect(this.left, y, this.contentWidth, h).fill(BRAND.tint).restore();
      let x = this.left;
      cols.forEach((c, i) => {
        this.text(r.cells[i] ?? '', { x: x + pad, y: y + pad, width: c.width - pad * 2, size, weight: r.bold ? 700 : 400, align: c.align, stay: true });
        x += c.width;
      });
      this.doc.save().moveTo(this.left, y + h).lineTo(this.right, y + h).lineWidth(0.5).strokeColor(BRAND.line).stroke().restore();
      this.doc.y = y + h;
    });
    return this;
  }

  /** Right-aligned totals block. */
  totals(rows: { label: string; value: string; strong?: boolean }[]) {
    const w = 240;
    const x = this.right - w;
    const lineH = 16;
    this.ensureSpace(rows.length * lineH + 10);
    this.gap(6);
    for (const r of rows) {
      const y = this.doc.y;
      if (r.strong) this.doc.save().rect(x, y - 2, w, lineH + 2).fill(BRAND.tint).restore();
      this.text(r.label, { x: x + 6, y, width: w * 0.55 - 6, size: r.strong ? 10 : 9, weight: r.strong ? 700 : 600, color: r.strong ? BRAND.navy : BRAND.muted, stay: true });
      this.text(r.value, { x: x + w * 0.55, y, width: w * 0.45 - 6, size: r.strong ? 10 : 9, weight: r.strong ? 700 : 400, align: 'right', stay: true });
      this.doc.y = y + lineH;
    }
    return this;
  }

  /** Small rounded status pill (e.g. PAID). */
  pill(text: string, x: number, y: number, color = BRAND.primary) {
    const keepY = this.doc.y;
    this.setFont(text, 700, 8);
    const w = this.doc.widthOfString(text) + 14;
    this.doc.save().roundedRect(x - w, y, w, 16, 8).fill(color).restore();
    this.doc.fillColor(BRAND.white).text(text, x - w + 7, y + 4, { width: w - 14, lineBreak: false });
    this.boxes.push({ page: this.page, x: x - w, y, w, h: 16, text });
    this.doc.y = keepY;
    return w;
  }

  private drawHeader(h: HeaderInfo) {
    const d = this.doc;
    const saved = d.y;
    drawLogo(d, M.left, HEADER_TOP - 2, 34);
    this.setFont(h.companyName, 700, 13);
    d.fillColor(BRAND.navy).text(h.companyName, M.left + 42, HEADER_TOP, { width: 260, lineBreak: false });
    let ly = HEADER_TOP + 17;
    for (const line of h.companyLines.slice(0, 2)) {
      this.setFont(line, 400, 7.5);
      d.fillColor(BRAND.muted).text(line, M.left + 42, ly, { width: 280, lineBreak: false, ellipsis: true });
      ly += 10;
    }
    const rx = d.page.width - M.right - 200;
    this.setFont(h.label, 700, 14);
    d.fillColor(BRAND.primary).text(h.label, rx, HEADER_TOP, { width: 200, align: 'right', lineBreak: false });
    if (h.number) {
      this.setFont(h.number, 600, 9);
      d.fillColor(BRAND.ink).text(h.number, rx, HEADER_TOP + 19, { width: 200, align: 'right', lineBreak: false });
    }
    d.save().moveTo(M.left, M.top - 18).lineTo(d.page.width - M.right, M.top - 18).lineWidth(1.2).strokeColor(BRAND.primary).stroke().restore();
    d.y = Math.max(saved, M.top);
  }

  private drawFooters() {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      const d = this.doc;
      const bottomMargin = d.page.margins.bottom;
      d.page.margins.bottom = 0; // writing inside the margin must not trigger a new page
      if (this.opts.watermark) {
        d.save();
        d.rotate(-35, { origin: [d.page.width / 2, d.page.height / 2] });
        d.font('J700').fontSize(72).fillColor(BRAND.primary).fillOpacity(0.07);
        d.text(this.opts.watermark, 0, d.page.height / 2 - 40, { width: d.page.width, align: 'center', lineBreak: false });
        d.restore();
        d.fillOpacity(1);
      }
      if (!this.opts.plain) {
        const y = d.page.height - M.bottom + 22;
        d.save().moveTo(M.left, y - 8).lineTo(d.page.width - M.right, y - 8).lineWidth(0.6).strokeColor(BRAND.line).stroke().restore();
        const left = this.opts.footer ?? '';
        if (left) {
          this.setFont(left, 400, 7.5);
          d.fillColor(BRAND.muted).text(left, M.left, y, { width: d.page.width - M.left - M.right - 90, lineBreak: false, ellipsis: true });
        }
        const pageText = `Page ${i - range.start + 1} of ${range.count}`;
        d.font('J600').fontSize(7.5).fillColor(BRAND.muted).text(pageText, d.page.width - M.right - 90, y, { width: 90, align: 'right', lineBreak: false });
      }
      d.page.margins.bottom = bottomMargin;
    }
  }

  get pageCount() {
    return this.doc.bufferedPageRange().count;
  }

  finish(): Promise<Buffer> {
    this.drawFooters();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on('data', (c: Buffer) => chunks.push(c));
      this.doc.on('end', () => resolve(Buffer.concat(chunks)));
      this.doc.on('error', reject);
      this.doc.end();
    });
  }
}

/** Layout check used by tests: no text box outside the content area, no overlapping boxes. */
export function layoutProblems(pdf: PdfDoc, area: { top: number; bottom: number; left: number; right: number } = { top: M.top - 1, bottom: A4.height - M.bottom + 0.5, left: M.left - 0.5, right: A4.width - M.right + 0.5 }): string[] {
  const out: string[] = [];
  for (const b of pdf.boxes) {
    if (b.y < area.top || b.y + b.h > area.bottom || b.x < area.left || b.x + b.w > area.right) out.push(`outside content area on page ${b.page}: "${b.text}" (${b.x.toFixed(1)},${b.y.toFixed(1)} ${b.w.toFixed(1)}x${b.h.toFixed(1)})`);
  }
  const byPage = new Map<number, Box[]>();
  for (const b of pdf.boxes) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);
  for (const [page, boxes] of byPage) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        const overlapX = a.x < c.x + c.w - 0.5 && c.x < a.x + a.w - 0.5;
        const overlapY = a.y < c.y + c.h - 0.5 && c.y < a.y + a.h - 0.5;
        if (overlapX && overlapY) out.push(`overlap on page ${page}: "${a.text}" / "${c.text}"`);
      }
    }
  }
  return out;
}
