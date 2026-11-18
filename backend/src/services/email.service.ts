import { Resend } from 'resend';
import { env } from '../config/env';
import { prisma } from '../config/database';

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

export interface Attachment {
  filename: string;
  content: Buffer;
}

export interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: Attachment[];
}

/**
 * Test-only outbox. When NODE_ENV=test every email is captured here instead of
 * being sent, so tests can follow verification / reset links.
 */
export const testOutbox: SendArgs[] = [];

export type DeliveryResult = { status: 'SENT'; id: string | null } | { status: 'SKIPPED' } | { status: 'FAILED'; error: string };

/** Sends through Resend and reports what happened (never throws). */
export async function deliver({ to, subject, html, replyTo, attachments }: SendArgs): Promise<DeliveryResult> {
  if (env.isTest) {
    testOutbox.push({ to, subject, html, replyTo, attachments });
    return { status: 'SENT', id: `test-${testOutbox.length}` };
  }
  if (!resend) {
    // eslint-disable-next-line no-console
    console.warn(`[email] RESEND_API_KEY not set — skipping email "${subject}" to ${to}`);
    return { status: 'SKIPPED' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: env.resendFromEmail,
      to,
      subject,
      html,
      replyTo,
      ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })) } : {}),
    });
    if (error) return { status: 'FAILED', error: error.message.slice(0, 300) };
    return { status: 'SENT', id: data?.id ?? null };
  } catch (err) {
    return { status: 'FAILED', error: (err instanceof Error ? err.message : 'unknown error').slice(0, 300) };
  }
}

/**
 * Sends an email through Resend. If no API key is configured (e.g. local dev),
 * it logs and resolves without throwing, so lead capture still succeeds while
 * making the missing configuration obvious.
 */
export async function send(args: SendArgs): Promise<void> {
  const r = await deliver(args);
  if (r.status === 'FAILED') throw new Error(`Resend error: ${r.error}`);
}

/**
 * Sends and records the outcome in email_logs (money and document emails), so staff can see
 * whether a receipt or document actually went out and resend it.
 */
export async function sendLogged(meta: { kind: string; entityType?: string; entityId?: string }, args: SendArgs): Promise<DeliveryResult> {
  const r = await deliver(args);
  await prisma.emailLog
    .create({
      data: {
        kind: meta.kind,
        to: (Array.isArray(args.to) ? args.to.join(', ') : args.to).slice(0, 500),
        subject: args.subject.slice(0, 300),
        entityType: meta.entityType ?? null,
        entityId: meta.entityId ?? null,
        status: r.status,
        providerMessageId: r.status === 'SENT' ? r.id : null,
        error: r.status === 'FAILED' ? r.error : null,
        attachments: args.attachments?.map((a) => a.filename).join(', ') || null,
      },
    })
    .catch((err) => console.error('[email] could not record email log:', err instanceof Error ? err.message : err));
  if (r.status === 'FAILED') {
    console.error(`[email] "${args.subject}" failed: ${r.error}`);
    // Integration failure alert (in-app only: email is what is failing). Notification emails
    // themselves are excluded so a broken provider cannot cause an alert loop.
    if (!meta.kind.startsWith('admin_event.')) {
      const { emitAdminEvent } = await import('./admin-events.service');
      await emitAdminEvent({
        dedupeKey: `system.email_failed:${meta.kind}:${new Date().toISOString().slice(0, 13)}`,
        category: 'system',
        severity: 'important',
        title: 'Email delivery failed',
        body: `"${meta.kind}" emails are failing: ${r.error}`.slice(0, 300),
        link: '/documents/email-log',
        entityType: meta.entityType,
        entityId: meta.entityId,
        email: false,
      });
    }
  }
  return r;
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f5ff;font-family:Segoe UI,Arial,sans-serif;color:#111;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 12px 30px rgba(0,0,0,.08);">
        <h1 style="margin:0 0 8px;font-size:20px;color:#6D22E6;">Globalantic</h1>
        <h2 style="margin:0 0 16px;font-size:18px;">${esc(title)}</h2>
        ${body}
      </div>
      <p style="text-align:center;color:#888;font-size:12px;margin-top:24px;">
        © ${new Date().getFullYear()} Globalantic — IT &amp; Digital Solutions
      </p>
    </div>
  </body></html>`;
}

/** Escapes user-supplied text before it is interpolated into email HTML. */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<p style="margin:4px 0;font-size:14px;"><strong>${label}:</strong> ${esc(value)}</p>`;
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export interface LeadEmail {
  id?: string;
  reference?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  service?: string | null;
  budget?: string | null;
  timeline?: string | null;
  message: string;
  source?: string | null;
  utmSource?: string | null;
  utmCampaign?: string | null;
  duplicateOf?: string | null;
}

/** New-lead alert for the team (admin inbox + assigned salesperson). */
export async function sendContactNotification(lead: LeadEmail, to: string | string[] = env.adminEmail): Promise<void> {
  const crmLink = lead.id ? `${env.adminPortalUrl}/leads/${lead.id}` : null;
  const body = `
    <p style="font-size:14px;">A new enquiry was submitted${lead.duplicateOf ? ' (repeat enquiry from an existing contact)' : ''}.</p>
    ${row('Reference', lead.reference)}
    ${row('Name', lead.name)}
    ${row('Email', lead.email)}
    ${row('Phone', lead.phone)}
    ${row('Company', lead.company)}
    ${row('Service', lead.service)}
    ${row('Budget', lead.budget)}
    ${row('Timeline', lead.timeline)}
    ${row('Source', [lead.source, lead.utmSource, lead.utmCampaign].filter(Boolean).join(' · ') || null)}
    <p style="margin:12px 0 4px;font-size:14px;"><strong>Message:</strong></p>
    <p style="font-size:14px;white-space:pre-wrap;">${esc(lead.message)}</p>
    ${crmLink ? `<p style="margin-top:16px;"><a href="${esc(crmLink)}" style="color:#6D22E6;font-weight:600;">Open in the CRM</a></p>` : ''}`;
  await sendLogged(
    { kind: 'lead.admin_alert', entityType: 'ContactLead', entityId: lead.id },
    { to, subject: `New enquiry${lead.service ? ` (${lead.service})` : ''} from ${lead.name}`, html: layout('New enquiry', body), replyTo: lead.email },
  );
}

/** What happens next, per service (shown in the acknowledgement). Falls back to the general note only. */
const SERVICE_NEXT_STEPS: [RegExp, string][] = [
  [/web|website|e-?commerce/i, 'If you have examples of websites you like, or an existing site, reply with the links. It helps us understand the scope quickly.'],
  [/mobile|app/i, 'If you can, reply with the platforms you need (Android, iOS or both) and any apps you would like yours to resemble.'],
  [/crm|erp|software|custom/i, 'If you can, reply with the main processes the system should handle and the tools you use today.'],
  [/\bai\b|automation/i, 'If you can, reply with the task you would like to automate and an example of the data involved.'],
  [/seo|marketing|ads|social/i, 'If you can, reply with your website address and the markets or keywords you care about most.'],
  [/ui|ux|design|brand/i, 'If you can, reply with your current designs or brand material and the screens you need.'],
];

/** Acknowledgement to the enquirer: reference, what happens next, how to reach us. */
export function sendContactAcknowledgement(lead: { name: string; email: string; service?: string | null; reference?: string | null }): Promise<void> {
  const tip = SERVICE_NEXT_STEPS.find(([re]) => lead.service && re.test(lead.service))?.[1];
  const waText = `Hello Globalantic, I sent an enquiry${lead.reference ? ` (${lead.reference})` : ''}${lead.service ? ` about ${lead.service}` : ''}.`;
  const wa = env.businessWhatsapp ? `https://wa.me/${env.businessWhatsapp}?text=${encodeURIComponent(waText)}` : null;
  const body = `
    <p style="font-size:14px;">Hi ${esc(lead.name)},</p>
    <p style="font-size:14px;">Thank you for contacting Globalantic${lead.service ? ` about <strong>${esc(lead.service)}</strong>` : ''}. We have received your enquiry${lead.reference ? ` (reference <strong>${esc(lead.reference)}</strong>)` : ''}.</p>
    <p style="font-size:14px;"><strong>What happens next:</strong> a member of our team will review your requirements and reply by email or phone to arrange a consultation.</p>
    ${tip ? `<p style="font-size:14px;">${esc(tip)}</p>` : ''}
    ${wa ? `<p style="font-size:14px;">Prefer WhatsApp? <a href="${esc(wa)}" style="color:#6D22E6;font-weight:600;">Message us on WhatsApp</a>.</p>` : ''}
    <p style="font-size:14px;">Best regards,<br/>The Globalantic Team</p>`;
  return send({
    to: lead.email,
    subject: `We received your enquiry${lead.reference ? ` (${lead.reference})` : ''} — Globalantic`,
    html: layout('Thanks for your enquiry', body),
  });
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export async function sendTrainingNotification(app: {
  id?: string;
  fullName: string;
  email: string;
  phone: string;
  mode: string;
  qualification: string;
  city?: string | null;
}, to: string | string[] = env.adminEmail): Promise<void> {
  const body = `
    <p style="font-size:14px;">A new training application was submitted.</p>
    ${row('Name', app.fullName)}
    ${row('Email', app.email)}
    ${row('Phone', app.phone)}
    ${row('Mode', app.mode)}
    ${row('Qualification', app.qualification)}
    ${row('City', app.city)}`;
  await sendLogged(
    { kind: 'training.admin_alert', entityType: 'TrainingApplication', entityId: app.id },
    { to, subject: `New training application — ${app.fullName}`, html: layout('New Training Application', body), replyTo: app.email },
  );
}

export function sendTrainingAcknowledgement(app: { fullName: string; email: string }): Promise<void> {
  const body = `
    <p style="font-size:14px;">Hi ${esc(app.fullName)},</p>
    <p style="font-size:14px;">Thank you for applying to the Globalantic Full Stack Development
    Paid Internship Program. Our team will review your application and contact you soon regarding
    the next steps.</p>
    <p style="font-size:14px;">Best regards,<br/>The Globalantic Team</p>`;
  return send({
    to: app.email,
    subject: 'Application received — Globalantic Internship Program',
    html: layout('Your application was received', body),
  });
}

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------

export async function sendCareerNotification(app: {
  id?: string;
  name: string;
  email: string;
  position: string;
  phone?: string | null;
}, to: string | string[] = env.adminEmail): Promise<void> {
  const body = `
    <p style="font-size:14px;">A new career application was submitted.</p>
    ${row('Name', app.name)}
    ${row('Email', app.email)}
    ${row('Phone', app.phone)}
    ${row('Position', app.position)}`;
  await sendLogged(
    { kind: 'career.admin_alert', entityType: 'CareerApplication', entityId: app.id },
    { to, subject: `New career application — ${app.position}`, html: layout('New Career Application', body), replyTo: app.email },
  );
}

// ---------------------------------------------------------------------------
// Newsletter
// ---------------------------------------------------------------------------

export function sendNewsletterConfirmation(email: string): Promise<void> {
  const body = `
    <p style="font-size:14px;">Thanks for subscribing to the Globalantic newsletter.</p>
    <p style="font-size:14px;">You'll receive occasional updates on technology, product and
    digital growth. You can unsubscribe at any time.</p>`;
  return send({
    to: email,
    subject: 'Subscription confirmed — Globalantic',
    html: layout('You are subscribed', body),
  });
}
