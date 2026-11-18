/**
 * Normalisation used for duplicate-account and self-referral checks.
 * Kept pure so it is unit-tested directly.
 */

/** Lower-cased, trimmed email — the value stored in users.email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);

/**
 * Canonical mailbox: strips "+tag" for every domain and dots for Gmail, so
 * a.b+x@gmail.com and ab@gmail.com are treated as the same person.
 */
export function canonicalEmail(email: string): string {
  const [rawLocal, rawDomain = ''] = normalizeEmail(email).split('@');
  let domain = rawDomain;
  let local = rawLocal.split('+')[0];
  if (DOT_INSENSITIVE.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

/**
 * Indian-first phone normalisation to digits with country code:
 * "+91 98765-43210", "098765 43210" and "9876543210" all become "919876543210".
 * Returns null when the input cannot be a valid phone number.
 */
export function normalizePhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}
