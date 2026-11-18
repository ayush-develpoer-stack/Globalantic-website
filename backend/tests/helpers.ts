/**
 * Shared helpers for DB-backed API tests. Run through tests/run.ts, which
 * provides a fresh local database per file.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Role } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV !== 'test' || !/@127\.0\.0\.1:\d+\//.test(dbUrl)) {
  throw new Error('Refusing to run: tests must use the local embedded database (run `npm --workspace backend test`).');
}

/* eslint-disable import/first */
import { createApp } from '../src/app';
import { prisma } from '../src/config/database';
import { hashPassword } from '../src/utils/password';
import { testOutbox } from '../src/services/email.service';
import { setPaymentGatewayForTests, type GatewayPayment, type PaymentGateway } from '../src/services/payment-gateway';

export { prisma, testOutbox };

let seq = 0;
export const uniq = (p = 'u') => `${p}${Date.now().toString(36)}${(seq += 1)}${crypto.randomBytes(2).toString('hex')}`;
/** A fresh valid Indian mobile number. */
export const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

export interface Api {
  base: string;
  close(): Promise<void>;
}

/**
 * With API_COVERAGE_FILE set, appends "METHOD\troutePattern\tstatus" per request so
 * scripts/api-inventory.ts can report which registered routes the suite exercised.
 */
function withCoverage(app: express.Application): express.Application {
  const file = process.env.API_COVERAGE_FILE;
  if (!file) return app;
  const outer = express();
  outer.use((req, res, next) => {
    res.on('finish', () => {
      const route = req.route?.path as string | undefined;
      const pattern = route === undefined ? '-' : route === '/' && req.baseUrl ? req.baseUrl : `${req.baseUrl}${route}`;
      fs.appendFileSync(file, `${req.method}\t${pattern}\t${route === undefined ? req.originalUrl.split('?')[0] : res.statusCode}\n`);
    });
    next();
  });
  outer.use(app);
  return outer;
}

export async function startApi(): Promise<Api> {
  const server: Server = withCoverage(createApp()).listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await prisma.$disconnect();
    },
  };
}

export interface Res<T = any> {
  status: number;
  body: { success: boolean; message: string; data: T; errors?: { field?: string; message: string }[] };
}

/** Minimal cookie-aware client (one session per instance). */
export class Client {
  cookie = '';
  /** Each client looks like a different visitor (the app trusts one proxy hop). */
  ip = `10.${crypto.randomInt(255)}.${crypto.randomInt(255)}.${crypto.randomInt(1, 255)}`;
  constructor(readonly base: string) {}

  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        'X-Forwarded-For': this.ip,
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) {
      const pair = set.split(';')[0];
      this.cookie = pair.endsWith('=') ? '' : pair;
    }
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Res<T>['body'] };
  }

  get<T = any>(p: string) {
    return this.req<T>('GET', p);
  }
  post<T = any>(p: string, b?: unknown) {
    return this.req<T>('POST', p, b ?? {});
  }
  put<T = any>(p: string, b?: unknown) {
    return this.req<T>('PUT', p, b ?? {});
  }
  patch<T = any>(p: string, b?: unknown) {
    return this.req<T>('PATCH', p, b ?? {});
  }
  del<T = any>(p: string) {
    return this.req<T>('DELETE', p);
  }
  /** Binary download (PDFs): status, headers and bytes. */
  async raw(p: string) {
    const res = await fetch(this.base + p, { headers: { ...(this.cookie ? { Cookie: this.cookie } : {}), 'X-Forwarded-For': this.ip } });
    return { status: res.status, type: res.headers.get('content-type') ?? '', disposition: res.headers.get('content-disposition') ?? '', cache: res.headers.get('cache-control') ?? '', buf: Buffer.from(await res.arrayBuffer()) };
  }
}

/** Counts the pages of a PDF produced by PDFKit (one "/Type /Page" object per page). */
export const pdfPageCount = (buf: Buffer) => (buf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

export const PASSWORD = 'Str0ngPass!';

/** Creates a verified user directly in the DB (staff accounts are never self-registered). */
export async function createUser(role: Role, extra: { name?: string; phone?: string } = {}) {
  const email = `${uniq(role.toLowerCase())}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      name: extra.name ?? `${role} ${uniq('n')}`,
      role,
      phone: extra.phone ?? null,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
      ...(role === 'STUDENT'
        ? { studentProfile: { create: { emailCanonical: email, consentAt: new Date(), consentVersion: 'test' } } }
        : {}),
    },
  });
  return { ...user, password: PASSWORD };
}

export async function login(base: string, email: string, password = PASSWORD, ip?: string): Promise<Client> {
  const c = new Client(base);
  if (ip) c.ip = ip;
  const r = await c.post('/api/auth/login', { email, password });
  assert.equal(r.status, 200, `login failed for ${email}: ${JSON.stringify(r.body)}`);
  return c;
}

export async function staff(base: string, role: Role) {
  const u = await createUser(role);
  return { user: u, client: await login(base, u.email) };
}

/** Pulls the newest single-use token out of a captured email. */
export function tokenFromOutbox(to: string, path: 'verify-email' | 'reset-password'): string {
  const mail = [...testOutbox].reverse().find((m) => m.to === to && m.html.includes(`/${path}?token=`));
  assert.ok(mail, `no ${path} email for ${to}`);
  return decodeURIComponent(mail.html.match(new RegExp(`/${path}\\?token=([^"&\\s<]+)`))![1]);
}

/** Registers through the public API, verifies via the emailed link and signs in. */
export async function registerStudent(base: string, opts: { email?: string; phone?: string; referralCode?: string; name?: string; ip?: string } = {}) {
  const email = opts.email ?? `${uniq('student')}@example.test`;
  const ph = opts.phone ?? phone();
  const anon = new Client(base);
  if (opts.ip) anon.ip = opts.ip;
  const r = await anon.post('/api/auth/register', {
    fullName: opts.name ?? 'Test Student',
    email,
    phone: ph,
    password: PASSWORD,
    consent: true,
    ...(opts.referralCode ? { referralCode: opts.referralCode } : {}),
  });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  const token = tokenFromOutbox(email.toLowerCase(), 'verify-email');
  const v = await anon.post('/api/auth/verify-email', { token });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const client = await login(base, email, PASSWORD, anon.ip);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  return { client, user, email, phone: ph };
}

/** Seeds a published course with one OPEN batch (fees in paise). */
export async function seedCourse(opts: { feePaise?: number; discountPaise?: number; capacity?: number; batchStatus?: 'OPEN' | 'UPCOMING' | 'FULL'; deadlineDays?: number } = {}) {
  const slug = uniq('course-').toLowerCase();
  const course = await prisma.course.create({
    data: {
      slug,
      title: `Course ${slug}`,
      shortDescription: 'A test course used by automated tests.',
      description: 'Automated test course.',
      category: 'Testing',
      durationLabel: '8 weeks',
      mode: 'ONLINE',
      eligibility: 'Anyone',
      feePaise: opts.feePaise ?? 2_500_000,
      discountPaise: opts.discountPaise ?? 0,
      status: 'PUBLISHED',
      modules: { create: [{ title: 'Module 1', topics: ['Intro'], order: 0 }] },
    },
  });
  const now = Date.now();
  const batch = await prisma.batch.create({
    data: {
      courseId: course.id,
      name: `Batch ${uniq('b')}`,
      startDate: new Date(now - 10 * 86_400_000),
      endDate: new Date(now + 60 * 86_400_000),
      registrationDeadline: new Date(now + (opts.deadlineDays ?? 5) * 86_400_000),
      mode: 'ONLINE',
      capacity: opts.capacity ?? 30,
      status: opts.batchStatus ?? 'OPEN',
    },
  });
  return { course, batch };
}

/** Student applies, admin approves. Returns the APPROVED application. */
export async function applyAndApprove(student: Client, admin: Client, batchId: string, extra: Record<string, unknown> = {}) {
  const a = await student.post('/api/training/student/applications', { batchId, qualification: 'B.Tech', ...extra });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  const r = await admin.post(`/api/training/admin/applications/${a.body.data.id}/review`, { action: 'APPROVE' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return a.body.data as { id: string; payablePaise: number };
}

// ---------------------------------------------------------------------------
// Payment gateway double (network calls only — signatures use real HMAC)
// ---------------------------------------------------------------------------

export class FakeGateway implements PaymentGateway {
  readonly name = 'RAZORPAY' as const;
  orders = new Map<string, { amount: number; currency: string }>();
  payments = new Map<string, GatewayPayment>();
  configured = true;
  isConfigured() {
    return this.configured;
  }
  publicKeyId() {
    return 'rzp_test_key';
  }
  async createOrder(input: { amountPaise: number; currency: string }) {
    const id = `order_${crypto.randomBytes(7).toString('hex')}`;
    this.orders.set(id, { amount: input.amountPaise, currency: input.currency });
    return { id, amount: input.amountPaise, currency: input.currency, status: 'created' };
  }
  async fetchPayment(id: string) {
    const p = this.payments.get(id);
    if (!p) throw new Error('unknown payment');
    return p;
  }
  async fetchOrderPayments(orderId: string) {
    return [...this.payments.values()].filter((p) => p.orderId === orderId);
  }
  /** Simulates the customer paying an order at the provider. */
  pay(orderId: string, status = 'captured', amount?: number) {
    const o = this.orders.get(orderId)!;
    const id = `pay_${crypto.randomBytes(7).toString('hex')}`;
    this.payments.set(id, { id, orderId, amount: amount ?? o.amount, currency: o.currency, status, method: 'upi', errorDescription: null });
    return id;
  }
}

export function useFakeGateway(): FakeGateway {
  const g = new FakeGateway();
  setPaymentGatewayForTests(g);
  return g;
}

export const checkoutSignature = (orderId: string, paymentId: string, secret = 'rzp_test_secret') =>
  crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

export function webhookBody(event: string, payment: GatewayPayment) {
  return JSON.stringify({
    event,
    payload: { payment: { entity: { id: payment.id, order_id: payment.orderId, amount: payment.amount, currency: payment.currency, status: payment.status, method: payment.method } } },
  });
}

export async function postWebhook(base: string, raw: string, opts: { eventId?: string; secret?: string; signature?: string } = {}) {
  const signature = opts.signature ?? crypto.createHmac('sha256', opts.secret ?? 'rzp_test_webhook_secret').update(raw).digest('hex');
  const res = await fetch(`${base}/api/payments/razorpay/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature, 'X-Razorpay-Event-Id': opts.eventId ?? uniq('evt_') },
    body: raw,
  });
  return { status: res.status, body: (await res.json()) as Res['body'] };
}

/** Full happy-path payment through checkout verification. */
export async function payApplication(student: Client, gateway: FakeGateway, applicationId: string) {
  const order = await student.post('/api/training/student/payments/order', { applicationId });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const paymentId = gateway.pay(order.body.data.orderId);
  const v = await student.post('/api/training/student/payments/verify', {
    orderId: order.body.data.orderId,
    paymentId,
    signature: checkoutSignature(order.body.data.orderId, paymentId),
  });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  assert.equal(v.body.data.status, 'PAID');
  return { orderId: order.body.data.orderId as string, paymentId, recordId: v.body.data.paymentId as string };
}
