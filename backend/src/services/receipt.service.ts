import { prisma } from '../config/database';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { audit, type Actor } from '../lib/audit';
import { computeTotals, formatPaise } from '../lib/money';
import { renderDocumentPdf, type DocumentSnapshot } from '../lib/pdf/documents';
import { companySnapshot, getProfile } from './business-profile.service';
import { esc, layout, sendLogged, type DeliveryResult } from './email.service';
import { businessRecipients, shouldEmail } from './admin-events.service';
import { readStored, storageConfigured, storeGenerated } from './file.service';

/**
 * Payment receipts for student fees (course / internship admissions and the certificate program).
 * The receipt is the existing Invoice row, created inside the verified-payment transaction; this
 * module renders it as a PDF, stores it privately and emails it — always AFTER the payment commit,
 * so a PDF or email failure can never undo or duplicate a payment. Everything is re-runnable.
 */

const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

async function loadInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      student: { select: { id: true, name: true, email: true, phone: true } },
      payment: { select: { id: true, provider: true, providerPaymentId: true, offlineReference: true, method: true, verifiedAt: true, status: true } },
      application: { select: { applicationNumber: true, course: { select: { title: true } }, batch: { select: { name: true } } } },
      programEnrollment: { select: { enrollmentNumber: true, program: { select: { title: true } } } },
    },
  });
  if (!inv) throw ApiError.notFound('Receipt not found');
  return inv;
}
type LoadedInvoice = Awaited<ReturnType<typeof loadInvoice>>;

export function receiptPurpose(inv: Pick<LoadedInvoice, 'application' | 'programEnrollment'>) {
  if (inv.programEnrollment) return { title: inv.programEnrollment.program.title, against: inv.programEnrollment.enrollmentNumber, kind: 'program' as const };
  if (inv.application) return { title: `${inv.application.course.title} — ${inv.application.batch.name}`, against: inv.application.applicationNumber, kind: 'course' as const };
  return { title: 'Fee payment', against: null, kind: 'course' as const };
}

/** Line items stored on the receipt, as printable lines whose total equals the amount received. */
function receiptLines(inv: LoadedInvoice) {
  const raw = (Array.isArray(inv.lineItems) ? inv.lineItems : []) as { description?: string; amountPaise?: number }[];
  const positive = raw.filter((l) => typeof l.amountPaise === 'number' && l.amountPaise > 0);
  const discount = -raw.filter((l) => typeof l.amountPaise === 'number' && l.amountPaise < 0).reduce((s, l) => s + (l.amountPaise as number), 0);
  const lines = positive.map((l, i) => ({ description: String(l.description ?? 'Fee'), quantity: 1, unitPaise: l.amountPaise as number, discountPaise: i === 0 ? Math.min(discount, l.amountPaise as number) : 0 }));
  const totals = lines.length ? computeTotals(lines, null) : null;
  // The receipt must state exactly the verified amount; fall back to a single line if stored items disagree.
  if (!totals || totals.totalPaise !== inv.amountPaise) return computeTotals([{ description: `${receiptPurpose(inv).title} (fee)`, quantity: 1, unitPaise: inv.amountPaise }], null);
  return totals;
}

export async function receiptSnapshot(invoiceId: string): Promise<DocumentSnapshot> {
  const inv = await loadInvoice(invoiceId);
  const profile = await getProfile();
  const purpose = receiptPurpose(inv);
  const p = inv.payment;
  return {
    kind: 'RECEIPT',
    number: inv.invoiceNumber,
    revision: 1,
    title: `Payment receipt — ${purpose.title}`,
    issueDate: inv.issuedAt.toISOString(),
    company: companySnapshot(profile),
    party: { name: inv.student.name, email: inv.student.email, phone: inv.student.phone ? `+${inv.student.phone}` : null },
    currency: inv.currency,
    totals: receiptLines(inv),
    sections: [],
    receipt: {
      purpose: purpose.title,
      againstNumber: purpose.against,
      date: (p.verifiedAt ?? inv.issuedAt).toISOString(),
      method: p.provider === 'OFFLINE' ? `Offline (${(p.method ?? '').replace('_', ' ').toLowerCase()})` : p.method ? `Online — ${p.method}` : 'Online',
      reference: p.providerPaymentId ?? p.offlineReference ?? null,
    },
    disclaimer: inv.status === 'REFUNDED' ? 'This payment has since been refunded.' : 'This is a receipt for fees paid. It is not a tax invoice.',
  };
}

/** The receipt PDF: the stored copy when there is one, otherwise rendered (and stored if storage is configured). */
export async function receiptPdf(invoiceId: string): Promise<{ pdf: Buffer; filename: string }> {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, invoiceNumber: true, pdfFileId: true, studentId: true, status: true } });
  if (!inv) throw ApiError.notFound('Receipt not found');
  const filename = `Receipt-${inv.invoiceNumber}.pdf`;
  if (inv.pdfFileId && inv.status === 'PAID') {
    const stored = await readStored(inv.pdfFileId);
    if (stored) return { pdf: stored.data, filename };
  }
  const { pdf } = await renderDocumentPdf(await receiptSnapshot(invoiceId));
  // Refunded receipts are re-rendered with the refund note; the original stored copy is kept.
  if (storageConfigured() && !inv.pdfFileId && inv.status === 'PAID') {
    try {
      const file = await storeGenerated(prisma, inv.studentId, pdf, filename);
      await prisma.invoice.updateMany({ where: { id: inv.id, pdfFileId: null }, data: { pdfFileId: file.id } });
    } catch (err) {
      console.error('[receipt] could not store PDF:', err instanceof Error ? err.message : err);
    }
  }
  return { pdf, filename };
}

/** Student confirmation with the receipt attached. Only called for verified payments. */
export async function sendPaymentConfirmation(invoiceId: string): Promise<DeliveryResult> {
  const inv = await loadInvoice(invoiceId);
  if (inv.payment.status !== 'PAID') throw ApiError.conflict('Only verified payments get a confirmation');
  const purpose = receiptPurpose(inv);
  const { pdf, filename } = await receiptPdf(invoiceId);
  const portal = purpose.kind === 'program' ? `${env.internPortalUrl}/program` : `${env.internPortalUrl}/enrollments`;
  const next =
    purpose.kind === 'program'
      ? 'Your program access is now active. Sign in to your student portal to start the lessons. Complete every required lesson and pass the final assessment to receive your certificate.'
      : 'Your enrollment is confirmed. Sign in to your student portal to see your batch, timetable and learning materials.';
  const row = (k: string, v: string | null | undefined) => (v ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;">${esc(k)}</td><td style="padding:6px 0 6px 12px;font-size:13px;font-weight:600;">${esc(v)}</td></tr>` : '');
  const html = layout(
    'Payment received — thank you',
    `<p style="font-size:14px;line-height:1.6;">Hello ${esc(inv.student.name)}, we have received and verified your payment.</p>
     <table style="border-collapse:collapse;margin:12px 0;">
       ${row(purpose.kind === 'program' ? 'Program' : 'Course', purpose.title)}
       ${row(purpose.kind === 'program' ? 'Enrollment no.' : 'Application no.', purpose.against)}
       ${row('Amount paid', formatPaise(inv.amountPaise, inv.currency))}
       ${row('Transaction reference', inv.payment.providerPaymentId ?? inv.payment.offlineReference)}
       ${row('Payment date', fmtDate(inv.payment.verifiedAt ?? inv.issuedAt))}
       ${row('Receipt no.', inv.invoiceNumber)}
     </table>
     <p style="font-size:14px;line-height:1.6;"><strong>Next steps:</strong> ${esc(next)}</p>
     <p><a href="${esc(portal)}" style="display:inline-block;background:#6D22E6;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600;">Open your portal</a></p>
     <p style="font-size:12px;color:#777;">Your receipt is attached as a PDF and is also available in your portal.</p>`,
  );
  return sendLogged({ kind: 'payment.confirmation', entityType: 'Invoice', entityId: inv.id }, { to: inv.student.email, subject: `Payment received — ${purpose.title} (${inv.invoiceNumber})`, html, attachments: [{ filename, content: pdf }] });
}

/** Team alert for a verified payment (business notification recipients, logged; obeys notification settings). */
export async function sendPaymentAlert(invoiceId: string): Promise<DeliveryResult> {
  if (!(await shouldEmail('payment', 'important'))) return { status: 'SKIPPED' };
  const to = await businessRecipients();
  if (!to.length) return { status: 'SKIPPED' };
  const inv = await loadInvoice(invoiceId);
  const purpose = receiptPurpose(inv);
  const html = layout(
    'Payment verified',
    `<p style="font-size:14px;">${esc(inv.student.name)} (${esc(inv.student.email)}) paid <strong>${esc(formatPaise(inv.amountPaise, inv.currency))}</strong> for ${esc(purpose.title)}.</p>
     <p style="font-size:13px;color:#555;">Receipt ${esc(inv.invoiceNumber)} · ${esc(inv.payment.providerPaymentId ?? inv.payment.offlineReference ?? '')}</p>
     <p><a href="${esc(`${env.adminPortalUrl}/payments/${inv.payment.id}`)}" style="color:#6D22E6;font-weight:600;">Open in admin</a></p>`,
  );
  return sendLogged({ kind: 'payment.admin_alert', entityType: 'Invoice', entityId: inv.id }, { to, subject: `Payment verified: ${formatPaise(inv.amountPaise, inv.currency)} — ${purpose.title}`, html });
}

/** After-commit job for a newly verified payment: receipt PDF + student email + team alert. */
export async function afterPaymentVerified(invoiceId: string): Promise<void> {
  await receiptPdf(invoiceId).catch((err) => console.error('[receipt] PDF generation failed:', err instanceof Error ? err.message : err));
  await sendPaymentConfirmation(invoiceId);
  await sendPaymentAlert(invoiceId);
}

/** Staff: send the confirmation + receipt again (e.g. after a delivery failure). */
export async function resendReceipt(actor: Actor, paymentId: string) {
  const inv = await prisma.invoice.findUnique({ where: { paymentId } });
  if (!inv) throw ApiError.notFound('This payment has no receipt');
  const r = await sendPaymentConfirmation(inv.id);
  await audit(prisma, actor, { action: 'receipt.resent', entityType: 'Invoice', entityId: inv.id, after: { status: r.status } });
  return { status: r.status, error: r.status === 'FAILED' ? r.error : undefined };
}

export async function emailLogFor(entityType: string, entityId: string) {
  return prisma.emailLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, to: true, subject: true, status: true, error: true, attachments: true, createdAt: true } });
}
