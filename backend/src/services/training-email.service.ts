import { env } from '../config/env';
import { deliver, esc, layout, send, type DeliveryResult } from './email.service';

/**
 * Transactional emails for the training platform. Links always point at the
 * configured public URLs; tokens are single-use and only their hash is stored.
 */

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${esc(href)}" style="background:#6D22E6;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">${esc(label)}</a></p>
    <p style="font-size:12px;color:#666;word-break:break-all;">If the button does not work, open this link: ${esc(href)}</p>`;
}

function p(text: string): string {
  return `<p style="font-size:14px;line-height:1.6;">${text}</p>`;
}

export function sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
  const link = `${env.trainingUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return send({
    to,
    subject: 'Verify your email — Globalantic Training',
    html: layout(
      'Confirm your email address',
      p(`Hi ${esc(name)},`) + p('Please confirm your email to finish creating your Globalantic Training account. The link expires in 24 hours.') + button(link, 'Verify email'),
    ),
  });
}

/** Sent instead of a verification mail when someone registers with an email that already has an account. */
export function sendExistingAccountEmail(to: string): Promise<void> {
  return send({
    to,
    subject: 'Sign-in help — Globalantic Training',
    html: layout(
      'You already have an account',
      p('Someone (hopefully you) tried to create a Globalantic Training account with this email address, but an account already exists.') +
        p('You can sign in, or reset your password if you have forgotten it. If this was not you, you can ignore this email.') +
        button(`${env.trainingUrl}/forgot-password`, 'Reset password'),
    ),
  });
}

/** Sent when the phone number used for registration already belongs to another account. */
export function sendDuplicatePhoneEmail(to: string): Promise<void> {
  return send({
    to,
    subject: 'We could not create your account — Globalantic Training',
    html: layout(
      'Account not created',
      p('The phone number you entered is already linked to another Globalantic Training account, so a new account was not created.') +
        p('If that account is yours, please sign in with its email address. Otherwise contact our support team for help.'),
    ),
  });
}

/** Returns the delivery outcome so callers never report "sent" for a skipped or failed email. */
export function sendPasswordResetEmail(to: string, name: string, token: string, purpose: 'reset' | 'invite' = 'reset'): Promise<DeliveryResult> {
  const link = `${env.trainingUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const invite = purpose === 'invite';
  return deliver({
    to,
    subject: invite ? 'Set up your Globalantic account' : 'Reset your password — Globalantic',
    html: layout(
      invite ? 'Your account is ready' : 'Reset your password',
      p(`Hi ${esc(name)},`) +
        p(
          invite
            ? 'An account has been created for you. Choose a password to activate it. The link expires in 24 hours.'
            : 'We received a request to reset your password. The link expires in 1 hour. If you did not ask for this, ignore this email; your password will not change.',
        ) +
        button(link, invite ? 'Set password' : 'Reset password'),
    ),
  });
}

/** Generic notification email mirroring an in-app notification. */
export function sendNotificationEmail(to: string, title: string, body: string, link?: string | null): Promise<void> {
  return send({
    to,
    subject: `${title} — Globalantic Training`,
    html: layout(title, p(esc(body)) + (link ? button(link, 'Open portal') : '')),
  });
}
