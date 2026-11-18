/**
 * Renders sample PDFs (clearly marked SAMPLE data) to a folder for visual review of the layout:
 *   npx tsx scripts/pdf-samples.ts <outDir>
 * Not used by the app. Values are illustrative only and never stored.
 */
import fs from 'node:fs';
import path from 'node:path';
import { computeTotals } from '../src/lib/money';
import { renderCertificatePdf, renderDocumentPdf, type CompanySnapshot, type DocumentSnapshot } from '../src/lib/pdf/documents';
import { layoutProblems } from '../src/lib/pdf/engine';

const out = path.resolve(process.argv[2] ?? 'pdf-samples');
fs.mkdirSync(out, { recursive: true });

const company: CompanySnapshot = {
  tradeName: 'Globalantic',
  legalName: 'SAMPLE Legal Name',
  addressLines: ['SAMPLE address line', 'Bhopal, Madhya Pradesh 462001'],
  stateCode: '23',
  state: 'Madhya Pradesh',
  email: 'hello@globalantic.com',
  phone: '',
  website: 'globalantic.com',
  gstRegistered: true,
  gstin: 'SAMPLE-GSTIN',
  pan: '',
  registrationNo: '',
  bankDetails: 'SAMPLE bank details',
  upiId: '',
  signatoryName: 'SAMPLE Signatory',
  signatoryTitle: 'Director',
  footerNote: '',
};
const party = { name: 'Sample Client', company: 'Sample Client Pvt Ltd', email: 'client@example.test', addressLines: ['12 Sample Road', 'Indore'], state: 'Madhya Pradesh', stateCode: '23' };
const items = Array.from({ length: 34 }, (_, i) => ({ description: `Sample deliverable ${i + 1}${i % 5 === 0 ? ' — a longer description that wraps across more than one line to test row heights and page breaks inside the table' : ''}`, quantity: (i % 3) + 1, unitPaise: 1_250_000 + i * 10_000, discountPaise: i % 7 === 0 ? 50_000 : 0, taxRateBp: 1800, sac: '998314' }));
const long = 'Sample paragraph text. '.repeat(120);

async function main() {
  const base: Omit<DocumentSnapshot, 'kind' | 'title' | 'totals'> = { number: 'SAMPLE/2026-27/0001', revision: 1, issueDate: new Date().toISOString(), dueDate: new Date(Date.now() + 15 * 864e5).toISOString(), validUntil: new Date(Date.now() + 30 * 864e5).toISOString(), company, party, currency: 'INR', sections: [], notes: 'Sample notes.', terms: 'Sample terms line 1.\nSample terms line 2.' };
  const samples: [string, DocumentSnapshot][] = [
    ['invoice-gst-multipage', { ...base, kind: 'INVOICE', title: 'SAMPLE — Website development', totals: computeTotals(items, { intraState: true }), amountPaidPaise: 1_000_000 }],
    ['quotation', { ...base, kind: 'QUOTATION', title: 'SAMPLE — Mobile app', totals: computeTotals(items.slice(0, 4), null), sections: [{ heading: 'Scope', body: 'Sample scope.\n• Item one\n• Item two' }] }],
    ['agreement', { ...base, kind: 'AGREEMENT', title: 'SAMPLE — Service agreement', totals: computeTotals(items.slice(0, 3), { intraState: false }), sections: [{ heading: 'Scope of work', body: long }, { heading: 'Timeline', body: 'Sample timeline.' }, { heading: 'Payment terms', body: long.slice(0, 900) }] }],
    ['receipt', { ...base, kind: 'RECEIPT', title: 'Payment receipt — SAMPLE program fee', totals: computeTotals([{ description: 'SAMPLE program fee', quantity: 1, unitPaise: 99_900 }], null), party: { name: 'सैंपल छात्र (Sample Student)', email: 'student@example.test' }, receipt: { method: 'upi', reference: 'pay_SAMPLE123', date: new Date().toISOString(), purpose: 'SAMPLE program', againstNumber: 'PRG-2026-000001' }, disclaimer: 'Payment receipt — not a tax invoice.' }],
  ];
  for (const [name, snap] of samples) {
    const r = await renderDocumentPdf(snap, { draft: name === 'quotation' });
    fs.writeFileSync(path.join(out, `${name}.pdf`), r.pdf);
    console.log(name, { pages: r.pages, bytes: r.pdf.length, layoutProblems: layoutProblems(r.doc).slice(0, 5) });
  }
  const cert = await renderCertificatePdf({ certificateTitle: 'Certificate of Completion', studentName: 'Sample Student Name', programTitle: 'SAMPLE Certificate Program', scorePercent: 85, issuedAt: new Date().toISOString(), certificateNumber: 'GCP-2026-000001', verificationCode: 'SAMPLECODE12', verifyUrl: 'https://training.globalantic.com/certificates/verify?code=SAMPLECODE12', company });
  fs.writeFileSync(path.join(out, 'certificate.pdf'), cert.pdf);
  console.log('certificate', { bytes: cert.pdf.length });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
