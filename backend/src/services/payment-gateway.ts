import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { hmacSha256Hex, safeEqual } from '../lib/crypto';

/**
 * Payment-gateway abstraction. The live implementation talks to Razorpay's
 * REST API over HTTPS (no SDK). Secrets stay on the server: the browser only
 * ever receives the public key id and the order id.
 *
 * When RAZORPAY_* is not configured, every call fails with a 503 "payments
 * are not configured" error — there is no simulated success path.
 */

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface GatewayPayment {
  id: string;
  orderId: string | null;
  amount: number;
  currency: string;
  /** created | authorized | captured | refunded | failed */
  status: string;
  method: string | null;
  errorDescription: string | null;
}

export interface PaymentGateway {
  readonly name: 'RAZORPAY';
  isConfigured(): boolean;
  publicKeyId(): string;
  createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  fetchPayment(paymentId: string): Promise<GatewayPayment>;
  fetchOrderPayments(orderId: string): Promise<GatewayPayment[]>;
}

const API = 'https://api.razorpay.com/v1';

function notConfigured(): ApiError {
  return new ApiError(503, 'Online payments are not configured yet. Please contact the admissions team.');
}

function toPayment(p: Record<string, unknown>): GatewayPayment {
  return {
    id: String(p.id),
    orderId: (p.order_id as string) ?? null,
    amount: Number(p.amount),
    currency: String(p.currency ?? 'INR'),
    status: String(p.status),
    method: (p.method as string) ?? null,
    errorDescription: (p.error_description as string) ?? null,
  };
}

class RazorpayGateway implements PaymentGateway {
  readonly name = 'RAZORPAY' as const;

  isConfigured(): boolean {
    return Boolean(env.razorpay.keyId && env.razorpay.keySecret);
  }

  publicKeyId(): string {
    if (!this.isConfigured()) throw notConfigured();
    return env.razorpay.keyId;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    if (!this.isConfigured()) throw notConfigured();
    const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ApiError(502, 'The payment provider could not be reached. Please try again.');
    }
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) {
      // Never forward provider error bodies (they can echo request details).
      console.error(`[razorpay] ${method} ${path.split('/')[1]} failed with HTTP ${res.status}`);
      throw new ApiError(502, 'The payment provider rejected the request. Please try again later.');
    }
    return json as T;
  }

  async createOrder(input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }) {
    const o = await this.call<Record<string, unknown>>('POST', '/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
    });
    return { id: String(o.id), amount: Number(o.amount), currency: String(o.currency), status: String(o.status) };
  }

  async fetchPayment(paymentId: string) {
    return toPayment(await this.call<Record<string, unknown>>('GET', `/payments/${encodeURIComponent(paymentId)}`));
  }

  async fetchOrderPayments(orderId: string) {
    const r = await this.call<{ items?: Record<string, unknown>[] }>('GET', `/orders/${encodeURIComponent(orderId)}/payments`);
    return (r.items ?? []).map(toPayment);
  }
}

let gateway: PaymentGateway = new RazorpayGateway();

export function paymentGateway(): PaymentGateway {
  return gateway;
}

/** Test seam: replaces the network-facing gateway. Refuses to run outside NODE_ENV=test. */
export function setPaymentGatewayForTests(next: PaymentGateway | null): void {
  if (!env.isTest) throw new Error('setPaymentGatewayForTests is only available in tests');
  gateway = next ?? new RazorpayGateway();
}

/** Razorpay Checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.razorpay.keySecret) throw notConfigured();
  const expected = hmacSha256Hex(env.razorpay.keySecret, `${orderId}|${paymentId}`);
  return safeEqual(expected, signature);
}

/** Razorpay webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!env.razorpay.webhookSecret) throw notConfigured();
  if (!signature) return false;
  return safeEqual(hmacSha256Hex(env.razorpay.webhookSecret, rawBody), signature);
}
