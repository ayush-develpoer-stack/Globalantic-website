/** Business documents: company profile, numbering, GST, lifecycle, PDFs, email, CRM links, permissions. */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, pdfPageCount, prisma, startApi, staff, testOutbox, uniq, type Api } from './helpers';
import { computeTotals, rupeesInWords } from '../src/lib/money';
import { renderDocumentPdf } from '../src/lib/pdf/documents';
import { layoutProblems } from '../src/lib/pdf/engine';
import { financialYear } from '../src/services/business-profile.service';

let api: Api;
let admin: Client;
let finance: Client;
let sales: Client;
let salesId: string;
let other: Client;

before(async () => {
  api = await startApi();
  admin = (await staff(api.base, 'ADMIN')).client;
  finance = (await staff(api.base, 'FINANCE')).client;
  const s = await staff(api.base, 'SALES');
  sales = s.client;
  salesId = s.user.id;
  other = (await staff(api.base, 'SALES')).client;
});
after(() => api.close());

const party = { name: 'Asha Verma', company: 'Verma Retail Pvt Ltd', email: 'asha@example.test', addressLine1: '1 Market Road', city: 'Indore', state: 'Madhya Pradesh', stateCode: '23' };
const items = [
  { description: 'E-commerce website', quantity: 1, unitPaise: 15_000_000, taxRateBp: 1800 },
  { description: 'Product photography (hours)', quantity: 2.5, unitPaise: 200_000, discountPaise: 50_000, taxRateBp: 1800 },
];

test('money: totals, GST split, words, financial year', () => {
  const t = computeTotals(items, { intraState: true });
  assert.equal(t.subtotalPaise, 15_000_000 + 500_000);
  assert.equal(t.discountPaise, 50_000);
  assert.equal(t.taxablePaise, 15_450_000);
  assert.equal(t.taxPaise, 2_781_000);
  assert.equal(t.cgstPaise + t.sgstPaise, t.taxPaise);
  assert.equal(t.igstPaise, 0);
  assert.equal(t.totalPaise, 18_231_000);
  const inter = computeTotals(items, { intraState: false });
  assert.equal(inter.igstPaise, 2_781_000);
  const odd = computeTotals([{ description: 'x', quantity: 1, unitPaise: 101, taxRateBp: 1800 }], { intraState: true });
  assert.equal(odd.cgstPaise + odd.sgstPaise, 18);
  assert.equal(computeTotals(items, null).taxPaise, 0, 'no GST unless it applies');
  assert.throws(() => computeTotals([{ description: 'x', quantity: 1.234, unitPaise: 100 }], null));
  assert.throws(() => computeTotals([{ description: 'x', quantity: 1, unitPaise: 100, discountPaise: 200 }], null));
  assert.equal(rupeesInWords(99_900), 'Rupees Nine Hundred Ninety Nine Only');
  assert.equal(rupeesInWords(12_345_678_90), 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Ninety Paise Only');
  assert.equal(financialYear(new Date('2026-10-16T10:00:00Z')), '2026-27');
  assert.equal(financialYear(new Date('2027-03-31T12:00:00Z')), '2026-27');
  assert.equal(financialYear(new Date('2027-03-31T19:00:00Z')), '2027-28', 'IST date decides the year');
});

test('A4 layout: long multi-page documents never clip or overlap; headers repeat', async () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ description: `Deliverable ${i + 1} ${'with a long description that wraps '.repeat(i % 4)}`, quantity: 1, unitPaise: 100_000 + i, taxRateBp: 1800 }));
  const company = { tradeName: 'Globalantic', legalName: '', addressLines: [], stateCode: '', state: '', email: '', phone: '', website: '', gstRegistered: false, gstin: '', pan: '', registrationNo: '', bankDetails: '', upiId: '', signatoryName: '', signatoryTitle: '', footerNote: '' };
  for (const kind of ['QUOTATION', 'AGREEMENT', 'INVOICE'] as const) {
    const r = await renderDocumentPdf({ kind, number: 'T/1', revision: 1, title: 'Layout test', issueDate: new Date().toISOString(), dueDate: new Date().toISOString(), company, party: { name: 'राम कुमार', email: 'r@example.test' }, currency: 'INR', totals: computeTotals(many, null), sections: [{ heading: 'Scope', body: 'Long scope text. '.repeat(400) }], notes: 'n', terms: 't' });
    assert.ok(r.pages >= 3, `${kind} spans pages (${r.pages})`);
    assert.deepEqual(layoutProblems(r.doc), [], `${kind} layout`);
    assert.equal(pdfPageCount(r.pdf), r.pages);
    // The navy table header row is drawn on every page that continues the table.
    const heads = r.doc.boxes.filter((b) => b.text === 'Description');
    assert.ok(heads.length >= 2, 'table header repeated after a page break');
  }
});

test('company profile: empty by default, admin-only, validated; GST needs a real GSTIN', async () => {
  const p = await admin.get('/api/documents/profile');
  assert.equal(p.status, 200);
  assert.equal(p.body.data.gstin, '');
  assert.equal(p.body.data.gstAvailable, false);
  assert.ok(p.body.data.gaps.includes('Legal name'));
  assert.equal((await finance.put('/api/documents/profile', { legalName: 'X' })).status, 403);
  assert.equal((await sales.put('/api/documents/profile', { legalName: 'X' })).status, 403);
  assert.equal((await admin.put('/api/documents/profile', { gstRegistered: true, gstin: '' })).status, 422);
  assert.equal((await admin.put('/api/documents/profile', { gstin: 'NOT-A-GSTIN' })).status, 422);
  const saved = await admin.put('/api/documents/profile', {
    legalName: 'Test Legal Entity',
    addressLine1: 'Test address',
    city: 'Bhopal',
    state: 'Madhya Pradesh',
    stateCode: '23',
    email: 'accounts@example.test',
    signatoryName: 'Test Signatory',
    signatoryTitle: 'Director',
    gstRegistered: true,
    gstin: '23ABCDE1234F1Z5',
    numbering: { QUOTATION: { prefix: 'Q', financialYear: true, padding: 4 } },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.data.gstAvailable, true);
  assert.deepEqual(saved.body.data.gaps, []);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'business_profile.updated' } }));
});

let quote: { id: string; number: string };
let leadId: string;

test('scope: a salesperson cannot link another rep\'s lead (even with a client) or copy a student into a document', async () => {
  const rep = await staff(api.base, 'SALES');
  const foreign = await prisma.contactLead.create({ data: { reference: uniq('LEAD-'), name: 'Foreign Lead', email: `${uniq('fl')}@example.test`, message: 'Owned by someone else', assignedToId: salesId, status: 'QUALIFIED' } });
  const ownClient = await prisma.businessClient.create({ data: { name: 'Rep Client', email: `${uniq('rc')}@example.test`, createdById: rep.user.id } });
  const linked = await rep.client.post('/api/documents', { type: 'QUOTATION', title: 'Probe', clientId: ownClient.id, leadId: foreign.id, items });
  assert.equal(linked.status, 404, JSON.stringify(linked.body));
  const student = await prisma.user.create({ data: { email: `${uniq('st')}@example.test`, name: 'Private Student', role: 'STUDENT', passwordHash: 'x' } });
  const copied = await rep.client.post('/api/documents', { type: 'QUOTATION', title: 'Probe', studentId: student.id, items });
  assert.equal(copied.status, 422);
  assert.equal(await prisma.businessDocument.count({ where: { title: 'Probe' } }), 0);
});

test('lead -> client -> quotation draft -> preview -> issue (numbered, frozen) -> send -> accept', async () => {
  const lead = await prisma.contactLead.create({ data: { reference: uniq('LEAD-'), name: party.name, email: party.email, company: party.company, message: 'Need an online store', assignedToId: salesId, status: 'QUALIFIED' } });
  leadId = lead.id;
  const client = await sales.post('/api/documents/clients/from-lead', { leadId });
  assert.equal(client.status, 200, JSON.stringify(client.body));
  await sales.put(`/api/documents/clients/${client.body.data.id}`, { ...party });
  const again = await sales.post('/api/documents/clients/from-lead', { leadId });
  assert.equal(again.body.data.id, client.body.data.id, 'no duplicate client per lead');

  // Sales cannot create invoices.
  assert.equal((await sales.post('/api/documents', { type: 'INVOICE', title: 'x', clientId: client.body.data.id, items })).status, 403);
  const d = await sales.post('/api/documents', { type: 'QUOTATION', title: 'Online store', clientId: client.body.data.id, items, applyGst: true, validUntil: '2026-12-31', terms: '50% advance.' });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.equal(d.body.data.number, null);
  assert.equal(d.body.data.leadId, leadId, 'lead carried from the client');
  assert.equal(d.body.data.totalPaise, 18_231_000, 'server-computed total');

  const preview = await sales.raw(`/api/documents/${d.body.data.id}/pdf`);
  assert.equal(preview.status, 200);
  assert.equal(preview.type, 'application/pdf');
  const edit = await sales.patch(`/api/documents/${d.body.data.id}`, { title: 'Online store — phase 1' });
  assert.equal(edit.status, 200);

  const issued = await sales.post(`/api/documents/${d.body.data.id}/issue`);
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  quote = issued.body.data;
  assert.match(quote.number, new RegExp(`^Q/${financialYear(new Date())}/\\d{4}$`));
  assert.equal((await sales.patch(`/api/documents/${quote.id}`, { title: 'changed' })).status, 409, 'issued documents are immutable');
  const row = await prisma.businessDocument.findUniqueOrThrow({ where: { id: quote.id } });
  assert.ok(row.snapshot && row.pdfFileId, 'snapshot + private PDF stored');
  assert.equal((row.snapshot as { company: { gstin: string } }).company.gstin, '23ABCDE1234F1Z5');
  assert.equal((row.snapshot as { totals: { cgstPaise: number } }).totals.cgstPaise, 1_390_500, 'intra-state: CGST + SGST');

  // Company details changed later do not alter the issued document.
  await admin.put('/api/documents/profile', { legalName: 'Renamed Entity' });
  const frozen = await prisma.businessDocument.findUniqueOrThrow({ where: { id: quote.id } });
  assert.equal((frozen.snapshot as { company: { legalName: string } }).company.legalName, 'Test Legal Entity');

  testOutbox.length = 0;
  const sent = await sales.post(`/api/documents/${quote.id}/send`, { message: 'Please review.' });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.data.delivery, 'SENT');
  const mail = testOutbox.find((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(party.email));
  assert.ok(mail?.attachments?.[0].filename.endsWith('.pdf'));
  assert.equal((await prisma.businessDocument.findUniqueOrThrow({ where: { id: quote.id } })).status, 'SENT');
  assert.equal((await prisma.contactLead.findUniqueOrThrow({ where: { id: leadId } })).status, 'PROPOSAL_SENT', 'lead moved forward');
  assert.ok(await prisma.emailLog.findFirst({ where: { entityType: 'BusinessDocument', entityId: quote.id, status: 'SENT' } }));

  assert.equal((await other.get(`/api/documents/${quote.id}`)).status, 404, 'other sales staff cannot see it');
  assert.equal((await finance.get(`/api/documents/${quote.id}`)).status, 200, 'finance sees all documents');
  assert.equal((await new Client(api.base).get(`/api/documents/${quote.id}`)).status, 401);

  const acc = await sales.post(`/api/documents/${quote.id}/outcome`, { outcome: 'ACCEPTED', note: 'Accepted by email' });
  assert.equal(acc.status, 200);
  assert.equal((await prisma.contactLead.findUniqueOrThrow({ where: { id: leadId } })).status, 'NEGOTIATION');
  const timeline = await prisma.leadActivity.findMany({ where: { leadId } });
  assert.ok(timeline.some((a) => /issued/.test(a.body ?? '')) && timeline.some((a) => /emailed/.test(a.body ?? '')));
});

test('revision supersedes; agreement is signed only with an uploaded signed copy', async () => {
  const draft = await sales.post('/api/documents', { type: 'QUOTATION', title: 'Revisable', party, items: items.slice(0, 1) });
  const issued = await sales.post(`/api/documents/${draft.body.data.id}/issue`);
  const rev = await sales.post(`/api/documents/${issued.body.data.id}/revise`);
  assert.equal(rev.status, 201);
  assert.equal(rev.body.data.revision, 2);
  const revIssued = await sales.post(`/api/documents/${rev.body.data.id}/issue`);
  assert.equal(revIssued.body.data.number, `${issued.body.data.number}-R2`);
  assert.equal((await prisma.businessDocument.findUniqueOrThrow({ where: { id: issued.body.data.id } })).status, 'SUPERSEDED');

  const agr = await sales.post(`/api/documents/${quote.id}/convert`, { target: 'AGREEMENT' });
  assert.equal(agr.status, 201);
  assert.equal(agr.body.data.sourceId, quote.id);
  assert.equal((await sales.post(`/api/documents/${agr.body.data.id}/issue`)).status, 422, 'needs scope sections');
  await sales.patch(`/api/documents/${agr.body.data.id}`, { sections: [{ heading: 'Scope of work', body: 'Build the store.' }, { heading: 'Timeline', body: '8 weeks.' }] });
  const agrIssued = await sales.post(`/api/documents/${agr.body.data.id}/issue`);
  assert.equal(agrIssued.status, 200, JSON.stringify(agrIssued.body));
  assert.equal(agrIssued.body.data.status, 'ISSUED', 'issued is not signed');
  assert.equal((await sales.post(`/api/documents/${agr.body.data.id}/signed`, { fileId: '00000000-0000-4000-8000-000000000000', signedOn: '2026-10-16', note: 'Signed by client' })).status, 422);

  const pdfBytes = (await sales.raw(`/api/documents/${agr.body.data.id}/pdf`)).buf;
  const up = await fetch(`${api.base}/api/files?purpose=SIGNED_DOCUMENT`, { method: 'POST', headers: { Cookie: sales.cookie, 'X-Forwarded-For': sales.ip, 'Content-Type': 'application/octet-stream', 'X-File-Name': 'signed.pdf' }, body: pdfBytes });
  const upBody = (await up.json()) as { data: { id: string } };
  assert.equal(up.status, 201, JSON.stringify(upBody));
  const signed = await sales.post(`/api/documents/${agr.body.data.id}/signed`, { fileId: upBody.data.id, signedOn: '2026-10-16', note: 'Signed by Asha Verma, scanned copy' });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(signed.body.data.status, 'SIGNED');
  assert.equal((await prisma.contactLead.findUniqueOrThrow({ where: { id: leadId } })).status, 'WON');
  assert.equal((await sales.raw(`/api/documents/${agr.body.data.id}/signed-copy`)).status, 200);
});

test('invoice: finance only, inter-state IGST, partial + full payments create receipts, void rules', async () => {
  const draft = await finance.post('/api/documents', { type: 'INVOICE', title: 'Store build', party: { ...party, state: 'Maharashtra', stateCode: '27' }, items, applyGst: true, dueDate: '2026-11-15' });
  assert.equal(draft.status, 201, JSON.stringify(draft.body));
  const inv = await finance.post(`/api/documents/${draft.body.data.id}/issue`);
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const snap = (await prisma.businessDocument.findUniqueOrThrow({ where: { id: inv.body.data.id } })).snapshot as { totals: { igstPaise: number; cgstPaise: number } };
  assert.equal(snap.totals.igstPaise, 2_781_000);
  assert.equal(snap.totals.cgstPaise, 0);

  assert.equal((await sales.post(`/api/documents/${inv.body.data.id}/payments`, { amountPaise: 100, method: 'UPI', reference: 'UTR1', paidOn: '2026-10-16' })).status, 403);
  const tooMuch = await finance.post(`/api/documents/${inv.body.data.id}/payments`, { amountPaise: 18_231_001, method: 'UPI', reference: 'UTR1', paidOn: '2026-10-16' });
  assert.equal(tooMuch.status, 422);
  const p1 = await finance.post(`/api/documents/${inv.body.data.id}/payments`, { amountPaise: 8_231_000, method: 'BANK_TRANSFER', reference: 'UTR-001', paidOn: '2026-10-16' });
  assert.equal(p1.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body.data.type, 'RECEIPT');
  assert.match(p1.body.data.number, /^RCP\//);
  assert.equal((await prisma.businessDocument.findUniqueOrThrow({ where: { id: inv.body.data.id } })).status, 'PARTIALLY_PAID');
  assert.equal((await finance.post(`/api/documents/${inv.body.data.id}/payments`, { amountPaise: 1000, method: 'UPI', reference: 'UTR-001', paidOn: '2026-10-16' })).status, 409, 'same reference twice');
  assert.equal((await finance.post(`/api/documents/${inv.body.data.id}/void`, { reason: 'Mistake' })).status, 409, 'cannot void a paid invoice');
  const p2 = await finance.post(`/api/documents/${inv.body.data.id}/payments`, { amountPaise: 10_000_000, method: 'UPI', reference: 'UTR-002', paidOn: '2026-10-16' });
  assert.equal(p2.status, 201);
  const paid = await prisma.businessDocument.findUniqueOrThrow({ where: { id: inv.body.data.id } });
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.amountPaidPaise, paid.totalPaise);
  const rpdf = await finance.raw(`/api/documents/${p2.body.data.id}/pdf`);
  assert.equal(rpdf.status, 200);

  // Voiding a receipt reopens the balance; issued numbers are never reused.
  assert.equal((await finance.post(`/api/documents/${p2.body.data.id}/void`, { reason: 'Bounced cheque' })).status, 200);
  const reopened = await prisma.businessDocument.findUniqueOrThrow({ where: { id: inv.body.data.id } });
  assert.equal(reopened.status, 'PARTIALLY_PAID');
  assert.equal(reopened.amountPaidPaise, 8_231_000);
  const voidPdf = await finance.raw(`/api/documents/${p2.body.data.id}/pdf`);
  assert.equal(voidPdf.status, 200, 'void documents stay retrievable (watermarked)');

  // GST cannot be applied once the company switches it off.
  await admin.put('/api/documents/profile', { gstRegistered: false });
  const noGst = await finance.post('/api/documents', { type: 'INVOICE', title: 'No GST', party, items, applyGst: true, dueDate: '2026-11-15' });
  assert.equal((await finance.post(`/api/documents/${noGst.body.data.id}/issue`)).status, 409);
  await finance.patch(`/api/documents/${noGst.body.data.id}`, { applyGst: false });
  const plain = await finance.post(`/api/documents/${noGst.body.data.id}/issue`);
  assert.equal(plain.status, 200);
  assert.equal(plain.body.data.taxPaise, 0);
});

test('templates are admin-managed and prefill drafts; drafts can be deleted; email log is finance-only', async () => {
  assert.equal((await sales.post('/api/documents/templates', { type: 'PROPOSAL', name: 'Std', sections: [] })).status, 403);
  const t = await admin.post('/api/documents/templates', { type: 'PROPOSAL', name: 'Website proposal', title: 'Website proposal', sections: [{ heading: 'Approach', body: 'Discovery, design, build.' }], terms: 'Valid for 30 days.' });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  const d = await sales.post('/api/documents', { type: 'PROPOSAL', title: '', templateId: t.body.data.id, party });
  assert.equal(d.status, 201);
  assert.equal(d.body.data.title, 'Website proposal');
  assert.equal((d.body.data.sections as unknown[]).length, 1);
  assert.equal(d.body.data.terms, 'Valid for 30 days.');
  assert.equal((await sales.del(`/api/documents/${d.body.data.id}`)).status, 200, 'drafts can be deleted');
  const log = await finance.get('/api/documents/email-log');
  assert.equal(log.status, 200);
  assert.equal((await sales.get('/api/documents/email-log')).status, 403);
});
