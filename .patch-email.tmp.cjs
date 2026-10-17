const fs = require('fs');
const ed = (f, pairs) => { let s = fs.readFileSync(f, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(f + ' missing ' + a.slice(0, 60)); s = s.replace(a, b); } fs.writeFileSync(f, s); };
ed('src/config/env.ts', [[`  employeePortalUrl: optional('EMPLOYEE_PORTAL_URL', 'http://localhost:3003').replace(/\/+$/, ''),`, `  employeePortalUrl: optional('EMPLOYEE_PORTAL_URL', 'http://localhost:3003').replace(/\/+$/, ''),
  /** Admin portal (CRM links in lead notification emails). */
  adminPortalUrl: optional('ADMIN_PORTAL_URL', 'http://localhost:3004').replace(/\/+$/, ''),
  /** Public business WhatsApp number in international digits (wa.me links in acknowledgement emails). */
  businessWhatsapp: optional('BUSINESS_WHATSAPP', '917697845157').replace(/\D/g, ''),
  /** Shared secret for the scheduled reminder job (POST /api/crm/reminders/dispatch). Unset = endpoint disabled. */
  cronSecret: optional('CRON_SECRET'),`]]);
ed('src/services/email.service.ts', [[`export function sendContactNotification(lead: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  service?: string | null;
  budget?: string | null;
  message: string;
}): Promise<void> {
  const body = \`
    <p style="font-size:14px;">A new contact enquiry was submitted.</p>
    \${row('Name', lead.name)}
    \${row('Email', lead.email)}
    \${row('Phone', lead.phone)}
    \${row('Company', lead.company)}
    \${row('Service', lead.service)}
    \${row('Budget', lead.budget)}
    <p style="margin:12px 0 4px;font-size:14px;"><strong>Message:</strong></p>
    <p style="font-size:14px;white-space:pre-wrap;">\${esc(lead.message)}</p>\`;
  return send({
    to: env.adminEmail,
    subject: \`New enquiry from \${lead.name}\`,
    html: layout('New Contact Enquiry', body),
    replyTo: lead.email,
  });
}

export function sendContactAcknowledgement(lead: { name: string; email: string }): Promise<void> {
  const body = \`
    <p style="font-size:14px;">Hi \${esc(lead.name)},</p>
    <p style="font-size:14px;">Thank you for reaching out to Globalantic. We have received your
    message and a member of our team will get back to you shortly.</p>
    <p style="font-size:14px;">Best regards,<br/>The Globalantic Team</p>\`;
  return send({
    to: lead.email,
    subject: 'We received your message — Globalantic',
    html: layout('Thanks for contacting us', body),
  });
}`, `export interface LeadEmail {
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
export function sendContactNotification(lead: LeadEmail, to: string | string[] = env.adminEmail): Promise<void> {
  const crmLink = lead.id ? \`\${env.adminPortalUrl}/leads/\${lead.id}\` : null;
  const body = \`
    <p style="font-size:14px;">A new enquiry was submitted\${lead.duplicateOf ? ' (repeat enquiry from an existing contact)' : ''}.</p>
    \${row('Reference', lead.reference)}
    \${row('Name', lead.name)}
    \${row('Email', lead.email)}
    \${row('Phone', lead.phone)}
    \${row('Company', lead.company)}
    \${row('Service', lead.service)}
    \${row('Budget', lead.budget)}
    \${row('Timeline', lead.timeline)}
    \${row('Source', [lead.source, lead.utmSource, lead.utmCampaign].filter(Boolean).join(' · ') || null)}
    <p style="margin:12px 0 4px;font-size:14px;"><strong>Message:</strong></p>
    <p style="font-size:14px;white-space:pre-wrap;">\${esc(lead.message)}</p>
    \${crmLink ? \`<p style="margin-top:16px;"><a href="\${esc(crmLink)}" style="color:#6D22E6;font-weight:600;">Open in the CRM</a></p>\` : ''}\`;
  return send({
    to,
    subject: \`New enquiry\${lead.service ? \` (\${lead.service})\` : ''} from \${lead.name}\`,
    html: layout('New enquiry', body),
    replyTo: lead.email,
  });
}

/** What happens next, per service (shown in the acknowledgement). Falls back to a general note. */
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
  const wa = env.businessWhatsapp ? \`https://wa.me/\${env.businessWhatsapp}?text=\${encodeURIComponent(\`Hello Globalantic, I sent an enquiry\${lead.reference ? \` (\${lead.reference})\` : ''}\${lead.service ? \` about \${lead.service}\` : ''}.\`)}\` : null;
  const body = \`
    <p style="font-size:14px;">Hi \${esc(lead.name)},</p>
    <p style="font-size:14px;">Thank you for contacting Globalantic\${lead.service ? \` about <strong>\${esc(lead.service)}</strong>\` : ''}. We have received your enquiry\${lead.reference ? \` (reference <strong>\${esc(lead.reference)}</strong>)\` : ''}.</p>
    <p style="font-size:14px;"><strong>What happens next:</strong> a member of our team will review your requirements and reply by email or phone to arrange a consultation.</p>
    \${tip ? \`<p style="font-size:14px;">\${esc(tip)}</p>\` : ''}
    \${wa ? \`<p style="font-size:14px;">Prefer WhatsApp? <a href="\${esc(wa)}" style="color:#6D22E6;font-weight:600;">Message us on WhatsApp</a>.</p>\` : ''}
    <p style="font-size:14px;">Best regards,<br/>The Globalantic Team</p>\`;
  return send({
    to: lead.email,
    subject: \`We received your enquiry\${lead.reference ? \` (\${lead.reference})\` : ''} — Globalantic\`,
    html: layout('Thanks for your enquiry', body),
  });
}`]]);
console.log('ok');
