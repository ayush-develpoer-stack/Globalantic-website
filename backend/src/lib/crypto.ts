import crypto from 'node:crypto';
import { env } from '../config/env';

export function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of two hex/ASCII strings (false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** URL-safe random token for one-time links (verification, password reset). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Human-friendly random code (e.g. referral codes, certificate verification codes). */
export function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Keyed, non-reversible hash of an IP / user agent. Raw values are never stored. */
export function privacyHash(value: string | undefined | null): string | null {
  if (!value) return null;
  return hmacSha256Hex(env.hashSalt, value).slice(0, 32);
}
