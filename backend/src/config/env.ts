import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProd = nodeEnv === 'production';

/**
 * Requires an env var, but the dev-only fallback is refused in production. This stops
 * the server from silently booting on an insecure secret or a throwaway database
 * URL when a real value was never provided.
 */
function requiredStrict(key: string, devFallback: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (isProd) {
      throw new Error(`Missing required environment variable in production: ${key}`);
    }
    return devFallback;
  }
  return value;
}

/**
 * Public URL used in links, emails and stored image paths. Production refuses to boot without it:
 * the localhost default would otherwise end up in emails sent to real people and in saved records.
 */
function siteUrl(key: string, devFallback: string): string {
  return requiredStrict(key, devFallback).replace(/\/+$/, '');
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

/**
 * SameSite policy for the session cookie. Default 'lax': correct when the API and
 * every portal share one registrable domain (api./training./admin.globalantic.com),
 * and it blocks cross-site form-POST CSRF. Use 'none' only if the API is served
 * from a different site (e.g. *.onrender.com); 'none' always forces Secure.
 */
function sameSitePolicy(): 'lax' | 'strict' | 'none' {
  const v = (process.env.COOKIE_SAMESITE ?? 'lax').trim().toLowerCase();
  if (v === 'lax' || v === 'strict' || v === 'none') return v;
  throw new Error('COOKIE_SAMESITE must be one of: lax, strict, none');
}

export const env = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: parseInt(optional('PORT', '4000'), 10),

  databaseUrl: requiredStrict('DATABASE_URL', 'postgresql://localhost:5432/globalantic'),

  jwtSecret: requiredStrict('JWT_SECRET', 'dev-insecure-secret-change-me'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '7d'),
  /** e.g. ".globalantic.com" so one login works across the portal subdomains. */
  cookieDomain: optional('COOKIE_DOMAIN') || undefined,
  cookieSameSite: sameSitePolicy(),

  resendApiKey: optional('RESEND_API_KEY'),
  resendFromEmail: optional('RESEND_FROM_EMAIL', 'Globalantic <onboarding@resend.dev>'),
  adminEmail: optional('ADMIN_EMAIL', 'hello@globalantic.com'),
  /** Business notification recipients (comma-separated). Admin settings override; falls back to ADMIN_EMAIL. */
  businessNotificationEmails: optional('BUSINESS_NOTIFICATION_EMAILS')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean),

  /** CORS allow-list (comma-separated portal origins). Required in production. */
  frontendUrl: requiredStrict('FRONTEND_URL', 'http://localhost:3000'),
  /** Public main website (links into its embedded admin for legacy training/careers lists). */
  mainSiteUrl: siteUrl('MAIN_SITE_URL', 'http://localhost:3000'),
  trainingUrl: siteUrl('TRAINING_URL', 'http://localhost:3001'),
  internPortalUrl: siteUrl('INTERN_PORTAL_URL', 'http://localhost:3002'),
  /** Public base URL of this API (used to build public image URLs), e.g. https://api.globalantic.com/api */
  publicApiUrl: siteUrl('PUBLIC_API_URL', 'http://localhost:' + (process.env.PORT || '4000') + '/api'),
  employeePortalUrl: siteUrl('EMPLOYEE_PORTAL_URL', 'http://localhost:3003'),
  /** Admin portal (CRM links in lead notification emails). */
  adminPortalUrl: siteUrl('ADMIN_PORTAL_URL', 'http://localhost:3004'),
  /** Optional: unset in production just hides the trainer sign-in link after account creation. */
  trainerPortalUrl: optional('TRAINER_PORTAL_URL', process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3005').replace(/\/+$/, ''),
  /** Public business WhatsApp number in international digits (wa.me links in acknowledgement emails). */
  businessWhatsapp: optional('BUSINESS_WHATSAPP', '917697845157').replace(/\D/g, ''),
  /** Shared secret for the scheduled reminder job (POST /api/crm/reminders/dispatch). Unset = endpoint disabled. */
  cronSecret: optional('CRON_SECRET'),
  /** Shared secret our Next.js servers send on server-side API calls (skips only the global per-IP read limit). Empty = disabled. */
  internalApiToken: (() => {
    const v = optional('INTERNAL_API_TOKEN');
    return v && v.length >= 32 ? v : '';
  })(),

  /** Keyed hash for IP addresses (referral clicks, fraud signals) — raw IPs are never stored. */
  hashSalt: requiredStrict('HASH_SALT', 'dev-insecure-hash-salt'),

  razorpay: {
    keyId: optional('RAZORPAY_KEY_ID'),
    keySecret: optional('RAZORPAY_KEY_SECRET'),
    webhookSecret: optional('RAZORPAY_WEBHOOK_SECRET'),
  },

  /**
   * Private upload directory (outside any web root). Required in production;
   * in development defaults to ~/.globalantic/uploads (outside the OneDrive folder).
   */
  uploadDir: optional('UPLOAD_DIR') || (isProd ? '' : path.join(os.homedir(), '.globalantic', 'uploads')),
  uploadMaxBytes: parseInt(optional('UPLOAD_MAX_BYTES', String(5 * 1024 * 1024)), 10),

  cloudinary: {
    cloudName: optional('CLOUDINARY_CLOUD_NAME'),
    apiKey: optional('CLOUDINARY_API_KEY'),
    apiSecret: optional('CLOUDINARY_API_SECRET'),
  },
} as const;
