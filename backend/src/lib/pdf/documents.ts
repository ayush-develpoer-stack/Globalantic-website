import { BRAND, PdfDoc, drawLogo, fontFor } from './engine';
import { formatPaise, formatRate, rupeesInWords, type Totals } from '../money';

/**
 * Layouts for every generated PDF. Renderers only print what they are given: company
 * details come from the business profile (blank fields are simply omitted), parties and
 * amounts from database records. Nothing here invents a GSTIN, signature or legal term.
 */

export type DocKind = 'QUOTATION' | 'PROPOSAL' | 'AGREEMENT' | 'INVOICE' | 'RECEIPT';

export interface CompanySnapshot {
  tradeName: string;
  legalName: string;
  addressLines: string[];
  stateCode: string;
  state: string;
  email: string;
  phone: string;
  website: string;
  gstRegistered: boolean;
  gstin: string;
  pan: string;
  registrationNo: string;
  bankDetails: string;
  upiId: string;
  signatoryName: string;
  signatoryTitle: string;
  footerNote: string;
}

export interface PartySnapshot {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  addressLines?: string[];
  state?: string | null;
  stateCode?: string | null;
  gstin?: string | null;
}

export interface DocumentSnapshot {
  kind: DocKind;
  number: string | null;
  revision: number;
  title: string;
  issueDate: string | null;
  dueDate?: string | null;
  validUntil?: string | null;
  company: CompanySnapshot;
  party: PartySnapshot;
  currency: string;
  totals: Totals;
  sections: { heading: string; body: string }[];
  notes?: string | null;
  terms?: string | null;
  amountPaidPaise?: number;
  receipt?: { method?: string | null; reference?: string | null; date?: string | null; againstNumber?: string | null; purpose?: string | null } | null;
  /** Extra rows in the meta block (e.g. enrollment number, course) */
  extraMeta?: [string, string][];
  /** Receipts for student fees are not tax invoices; this line says so. */
  disclaimer?: string | null;
}

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

export function companyLines(c: CompanySnapshot): string[] {
  const contact = [c.phone, c.email, c.website].filter(Boolean).join('  ·  ');
  const addr = c.addressLines.filter(Boolean).join(', ');
  return [addr, contact].filter(Boolean);
}

export function footerLine(c: CompanySnapshot): string {
  return [c.legalName || c.tradeName, c.gstRegistered && c.gstin ? `GSTIN ${c.gstin}` : '', c.pan ? `PAN ${c.pan}` : '', c.registrationNo, c.footerNote].filter(Boolean).join('  ·  ');
}

export function labelFor(s: DocumentSnapshot): string {
  switch (s.kind) {
    case 'QUOTATION':
      return 'QUOTATION';
    case 'PROPOSAL':
      return 'PROPOSAL';
    case 'AGREEMENT':
      return 'SERVICE AGREEMENT';
    case 'RECEIPT':
      return 'PAYMENT RECEIPT';
    case 'INVOICE':
      return s.totals.gst ? 'TAX INVOICE' : 'INVOICE';
  }
}

function partyBlock(p: PartySnapshot): string {
  return [p.company && p.company !== p.name ? `${p.name}\n${p.company}` : p.name, ...(p.addressLines ?? []).filter(Boolean), p.state ? `${p.state}${p.stateCode ? ` (${p.stateCode})` : ''}` : '', p.email ?? '', p.phone ?? '', p.gstin ? `GSTIN: ${p.gstin}` : '']
    .filter(Boolean)
    .join('\n');
}

export async function renderDocumentPdf(s: DocumentSnapshot, opts: { draft?: boolean; watermark?: string } = {}): Promise<{ pdf: Buffer; pages: number; doc: PdfDoc }> {
  const number = s.number ? `${s.number}${s.revision > 1 ? `  (Rev. ${s.revision})` : ''}` : 'Draft — not issued';
  const pdf = new PdfDoc({
    title: `${labelFor(s)} ${s.number ?? 'draft'}`,
    header: { companyName: s.company.tradeName || s.company.legalName || 'Globalantic', companyLines: companyLines(s.company), label: labelFor(s), number },
    footer: footerLine(s.company),
    watermark: opts.watermark ?? (opts.draft ? 'DRAFT' : undefined),
  });
  const money = (p: number) => formatPaise(p, s.currency);
  const half = (pdf.contentWidth - 20) / 2;

  // --- Parties + meta -------------------------------------------------------------------------
  const partyLabel = s.kind === 'RECEIPT' ? 'Received from' : s.kind === 'AGREEMENT' ? 'Client' : s.kind === 'INVOICE' ? 'Bill to' : 'Prepared for';
  const top = pdf.y;
  pdf.text(partyLabel.toUpperCase(), { size: 7.5, weight: 700, color: BRAND.primary, width: half });
  pdf.text(partyBlock(s.party), { size: 9.5, width: half, lineGap: 2.5 });
  const leftEnd = pdf.y;
  pdf.y = top;
  const meta: [string, string | null | undefined][] = [
    [s.kind === 'RECEIPT' ? 'Receipt date' : 'Date', fmtDate(s.issueDate) || 'On issue'],
    ...(s.kind === 'QUOTATION' || s.kind === 'PROPOSAL' ? ([['Valid until', fmtDate(s.validUntil)]] as [string, string][]) : []),
    ...(s.kind === 'INVOICE' ? ([['Due date', fmtDate(s.dueDate)]] as [string, string][]) : []),
    ...(s.totals.gst && s.party.state ? ([['Place of supply', `${s.party.state}${s.party.stateCode ? ` (${s.party.stateCode})` : ''}`]] as [string, string][]) : []),
    ...(s.extraMeta ?? []),
  ];
  pdf.keyValues(meta, { x: pdf.left + half + 20, width: half, labelWidth: 95 });
  pdf.y = Math.max(leftEnd, pdf.y) + 12;

  const titleY = pdf.y;
  const pillW = s.kind === 'RECEIPT' ? pdf.pill('PAID', pdf.right, titleY, '#0F7A52') + 10 : 0;
  pdf.text(s.title, { size: 13, weight: 700, color: BRAND.navy, width: pdf.contentWidth - pillW });
  pdf.gap(6);

  // --- Agreement preamble (only real values) ---------------------------------------------------
  if (s.kind === 'AGREEMENT') {
    const provider = [s.company.legalName || s.company.tradeName, s.company.addressLines.filter(Boolean).join(', ')].filter(Boolean).join(', ');
    const client = [s.party.company || s.party.name, (s.party.addressLines ?? []).filter(Boolean).join(', ')].filter(Boolean).join(', ');
    pdf.text(`This Service Agreement is entered into${s.issueDate ? ` on ${fmtDate(s.issueDate)}` : ''} between ${provider} ("Service Provider") and ${client} ("Client"). It becomes binding only when signed by both parties.`, { size: 9.5, lineGap: 3 });
    pdf.gap(8);
  }

  const sectionsFirst = s.kind === 'PROPOSAL' || s.kind === 'AGREEMENT';
  const renderSections = () => {
    for (const sec of s.sections) {
      if (!sec.heading && !sec.body) continue;
      pdf.heading(sec.heading || 'Details');
      pdf.text(sec.body, { size: 9.5, lineGap: 3 });
      pdf.gap(8);
    }
  };
  if (sectionsFirst) renderSections();

  // --- Items ----------------------------------------------------------------------------------
  if (s.totals.lines.length) {
    if (sectionsFirst) pdf.heading(s.kind === 'AGREEMENT' ? 'Fees' : 'Investment');
    const gst = Boolean(s.totals.gst);
    const anyDiscount = s.totals.discountPaise > 0;
    const cols = [
      { header: '#', width: 22 },
      { header: 'Description', width: gst ? 190 : 230 },
      { header: 'Qty', width: 40, align: 'right' as const },
      { header: 'Rate', width: 70, align: 'right' as const },
      ...(anyDiscount ? [{ header: 'Discount', width: 62, align: 'right' as const }] : []),
      ...(gst ? [{ header: 'GST', width: 40, align: 'right' as const }] : []),
      { header: 'Amount', width: 76, align: 'right' as const },
    ];
    pdf.table(
      cols,
      s.totals.lines.map((l, i) => ({
        cells: [
          String(i + 1),
          l.sac ? `${l.description}\nSAC ${l.sac}` : l.description,
          String(l.quantity),
          money(l.unitPaise),
          ...(anyDiscount ? [l.discountPaise ? money(l.discountPaise) : '—'] : []),
          ...(gst ? [formatRate(l.taxRateBp)] : []),
          money(l.taxablePaise),
        ],
      })),
    );
    const rows: { label: string; value: string; strong?: boolean }[] = [{ label: 'Subtotal', value: money(s.totals.subtotalPaise) }];
    if (anyDiscount) rows.push({ label: 'Discount', value: `− ${money(s.totals.discountPaise)}` });
    if (gst) {
      rows.push({ label: 'Taxable value', value: money(s.totals.taxablePaise) });
      if (s.totals.gst?.intraState) {
        rows.push({ label: 'CGST', value: money(s.totals.cgstPaise) });
        rows.push({ label: 'SGST', value: money(s.totals.sgstPaise) });
      } else rows.push({ label: 'IGST', value: money(s.totals.igstPaise) });
    }
    rows.push({ label: s.kind === 'RECEIPT' ? 'Amount received' : 'Total', value: money(s.totals.totalPaise), strong: true });
    if (s.kind === 'INVOICE' && (s.amountPaidPaise ?? 0) > 0) {
      rows.push({ label: 'Paid', value: money(s.amountPaidPaise ?? 0) });
      rows.push({ label: 'Balance due', value: money(Math.max(0, s.totals.totalPaise - (s.amountPaidPaise ?? 0))), strong: true });
    }
    pdf.totals(rows);
    if (s.kind === 'INVOICE' || s.kind === 'RECEIPT') {
      pdf.gap(4);
      pdf.text(rupeesInWords(s.totals.totalPaise), { size: 8.5, weight: 600, color: BRAND.muted, align: 'right' });
    }
    pdf.gap(10);
  }

  // --- Receipt details ------------------------------------------------------------------------
  if (s.kind === 'RECEIPT' && s.receipt) {
    pdf.heading('Payment details');
    pdf.keyValues([
      ['Payment for', s.receipt.purpose],
      ['Against', s.receipt.againstNumber],
      ['Payment date', fmtDate(s.receipt.date)],
      ['Method', s.receipt.method],
      ['Transaction reference', s.receipt.reference],
      ['Status', 'Paid — verified'],
    ]);
    pdf.gap(8);
  }

  if (!sectionsFirst) renderSections();

  if (s.kind === 'INVOICE' && (s.company.bankDetails || s.company.upiId)) {
    pdf.heading('How to pay');
    pdf.keyValues([
      ['Bank transfer', s.company.bankDetails],
      ['UPI', s.company.upiId],
    ]);
    pdf.gap(8);
  }
  if (s.notes) {
    pdf.heading('Notes', 30);
    pdf.text(s.notes, { size: 9, lineGap: 3 });
    pdf.gap(8);
  }
  if (s.terms) {
    pdf.heading('Terms', 30);
    pdf.text(s.terms, { size: 8.8, lineGap: 3, color: BRAND.ink });
    pdf.gap(8);
  }
  if (s.disclaimer) {
    pdf.gap(2);
    pdf.text(s.disclaimer, { size: 8, color: BRAND.muted });
    pdf.gap(6);
  }

  // --- Signatures (blank lines: nothing is pre-signed) ------------------------------------------
  const companyName = s.company.legalName || s.company.tradeName || 'Globalantic';
  if (s.kind === 'AGREEMENT') {
    pdf.ensureSpace(130);
    pdf.heading('Signatures', 100);
    const y = pdf.y + 6;
    const block = (x: number, title: string, name?: string, role?: string) => {
      pdf.text(title, { x, y, width: half, size: 9, weight: 700, stay: true });
      pdf.doc.save().moveTo(x, y + 52).lineTo(x + half - 20, y + 52).lineWidth(0.7).strokeColor(BRAND.muted).stroke().restore();
      pdf.text('Signature', { x, y: y + 56, width: half, size: 7.5, color: BRAND.muted, stay: true });
      pdf.text(`Name: ${name || ''}`, { x, y: y + 72, width: half, size: 8.5, stay: true });
      pdf.text(`Title: ${role || ''}`, { x, y: y + 86, width: half, size: 8.5, stay: true });
      pdf.text('Date:', { x, y: y + 100, width: half, size: 8.5, stay: true });
    };
    block(pdf.left, `For ${companyName}`, s.company.signatoryName, s.company.signatoryTitle);
    block(pdf.left + half + 20, `For ${s.party.company || s.party.name}`);
    pdf.y = y + 118;
  } else if (s.kind !== 'RECEIPT') {
    pdf.ensureSpace(70);
    const x = pdf.right - 200;
    const y = pdf.y + 6;
    pdf.text(`For ${companyName}`, { x, y, width: 200, size: 9, weight: 700, align: 'right', stay: true });
    pdf.doc.save().moveTo(x + 40, y + 40).lineTo(pdf.right, y + 40).lineWidth(0.7).strokeColor(BRAND.muted).stroke().restore();
    pdf.text(['Authorised signatory', s.company.signatoryName, s.company.signatoryTitle].filter(Boolean).join('\n'), { x, y: y + 44, width: 200, size: 8, color: BRAND.muted, align: 'right' });
  } else {
    pdf.text('This receipt was generated electronically from a verified payment record and does not require a signature.', { size: 8, color: BRAND.muted });
  }

  const pages = pdf.pageCount;
  return { pdf: await pdf.finish(), pages, doc: pdf };
}

// --- Certificate --------------------------------------------------------------------------------

export interface CertificateSnapshot {
  certificateTitle: string;
  studentName: string;
  programTitle: string;
  scorePercent: number;
  issuedAt: string;
  certificateNumber: string;
  verificationCode: string;
  verifyUrl: string;
  company: Pick<CompanySnapshot, 'tradeName' | 'legalName' | 'signatoryName' | 'signatoryTitle' | 'website'>;
  revoked?: boolean;
}

export async function renderCertificatePdf(c: CertificateSnapshot): Promise<{ pdf: Buffer; doc: PdfDoc }> {
  const p = new PdfDoc({ title: `${c.certificateTitle} ${c.certificateNumber}`, header: null, plain: true, layout: 'landscape', watermark: c.revoked ? 'REVOKED' : undefined });
  const d = p.doc;
  const W = d.page.width;
  const H = d.page.height;
  // Frame
  d.save().rect(0, 0, W, H).fill(BRAND.white).restore();
  d.save().rect(18, 18, W - 36, H - 36).lineWidth(3).strokeColor(BRAND.primary).stroke().restore();
  d.save().rect(28, 28, W - 56, H - 56).lineWidth(0.8).strokeColor(BRAND.logo).stroke().restore();
  d.save().rect(28, 28, W - 56, 8).fill(BRAND.tint).restore();

  const name = c.company.tradeName || c.company.legalName || 'Globalantic';
  drawLogo(d, W / 2 - 26, 58, 52);
  const center = (text: string, y: number, size: number, weight: 400 | 600 | 700, color: string = BRAND.ink, width = W - 160) => {
    d.font(fontFor(text, weight)).fontSize(size).fillColor(color);
    const h = d.heightOfString(text, { width, align: 'center' });
    d.text(text, (W - width) / 2, y, { width, align: 'center' });
    p.boxes.push({ page: 1, x: (W - width) / 2, y, w: width, h, text: text.slice(0, 40) });
    return y + h;
  };
  let y = center(name, 118, 15, 700, BRAND.navy);
  y = center(c.certificateTitle.toUpperCase(), y + 14, 24, 700, BRAND.primary);
  y = center('This is to certify that', y + 16, 11, 400, BRAND.muted);
  y = center(c.studentName, y + 10, 28, 700, BRAND.navy);
  d.save().moveTo(W / 2 - 160, y + 4).lineTo(W / 2 + 160, y + 4).lineWidth(0.8).strokeColor(BRAND.line).stroke().restore();
  y = center('has successfully completed the certificate program', y + 16, 11, 400, BRAND.muted);
  y = center(c.programTitle, y + 8, 17, 700, BRAND.ink);
  y = center(`by completing all required lessons and passing the final assessment with a score of ${c.scorePercent}%.`, y + 10, 10, 400, BRAND.muted, W - 220);

  // Bottom row: details (left), signatory (right)
  const by = H - 150;
  const left = 70;
  const rows: [string, string][] = [
    ['Certificate no.', c.certificateNumber],
    ['Issued on', fmtDate(c.issuedAt)],
    ['Verification code', c.verificationCode],
  ];
  rows.forEach(([k, v], i) => {
    d.font('J600').fontSize(8).fillColor(BRAND.muted).text(k, left, by + i * 16, { width: 100, lineBreak: false });
    d.font('J700').fontSize(9).fillColor(BRAND.ink).text(v, left + 100, by + i * 16, { width: 200, lineBreak: false });
    p.boxes.push({ page: 1, x: left, y: by + i * 16, w: 300, h: 12, text: k });
  });
  d.font('J400').fontSize(8).fillColor(BRAND.muted).text(`Verify at ${c.verifyUrl}`, left, by + 52, { width: 340, lineBreak: false, ellipsis: true });
  p.boxes.push({ page: 1, x: left, y: by + 52, w: 340, h: 11, text: 'verify' });

  const rx = W - 70 - 220;
  d.save().moveTo(rx, by + 26).lineTo(rx + 220, by + 26).lineWidth(0.8).strokeColor(BRAND.muted).stroke().restore();
  const sign = [c.company.signatoryName, c.company.signatoryTitle, `For ${c.company.legalName || name}`].filter(Boolean);
  sign.forEach((line, i) => {
    d.font(fontFor(line, i === 0 ? 700 : 400)).fontSize(i === 0 ? 9.5 : 8.5).fillColor(i === 0 ? BRAND.ink : BRAND.muted).text(line, rx, by + 32 + i * 13, { width: 220, align: 'center', lineBreak: false });
  });

  d.font('J400').fontSize(7).fillColor(BRAND.muted).text('This certificate confirms completion of a Globalantic program. It is not an academic degree or a government or university accreditation.', 70, H - 62, { width: W - 140, align: 'center', lineBreak: false });
  return { pdf: await p.finish(), doc: p };
}
