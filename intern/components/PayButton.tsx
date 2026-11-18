'use client';

import { useState } from 'react';
import { api, errorMessage, isApiError } from '@globalantic/api-client';
import type { PaymentOrder } from '@globalantic/types';
import { Alert, Button, formatINR, useToast } from '@globalantic/ui';

/**
 * Razorpay Checkout. The order (and its amount) is created by the server from
 * the application's fee snapshot; the browser only receives the public key id
 * and order id. Success is decided by the server after verifying the
 * signature and re-fetching the payment — nothing is marked paid here.
 */

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void;
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loader: Promise<RazorpayCtor> | null = null;

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loader ??= new Promise<RazorpayCtor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Payment window failed to load.')));
    script.onerror = () => {
      loader = null;
      reject(new Error('Could not load the payment window. Check your connection and try again.'));
    };
    document.body.appendChild(script);
  });
  return loader;
}

interface PayButtonProps {
  amountPaise: number;
  onSettled: () => void;
  /** Admissions (default): the application to pay for. */
  applicationId?: string;
  /** Other payables (e.g. the certificate program) pass their own server calls. */
  createOrder?: () => Promise<PaymentOrder>;
  verify?: (input: { orderId: string; paymentId: string; signature: string }) => Promise<{ status: string }>;
  reportFailure?: (orderId: string, reason: string) => Promise<unknown>;
  successMessage?: string;
}

export function PayButton({ applicationId, amountPaise, onSettled, createOrder, verify, reportFailure, successMessage = 'Payment verified. Your enrollment is confirmed.' }: PayButtonProps) {
  const doCreate = createOrder ?? (() => api().student.createOrder(applicationId as string));
  const doVerify = verify ?? ((input: { orderId: string; paymentId: string; signature: string }) => api().student.verifyPayment(input));
  const doReport = reportFailure ?? ((orderId: string, reason: string) => api().student.reportPaymentFailure(orderId, reason));
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setPending(true);
    setError(null);
    try {
      const order = await doCreate();
      const Razorpay = await loadCheckout();
      let settled = false;
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || undefined },
        handler: async (r: RazorpayResponse) => {
          settled = true;
          try {
            const result = await doVerify({ orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            if (result.status === 'PAID') toast(successMessage, 'success');
            else if (result.status === 'PENDING') toast('Payment received and awaiting confirmation from the bank.', 'info');
            else toast('The payment was not successful. You can try again.', 'danger');
          } catch (err) {
            setError(`${errorMessage(err)} If money was deducted, it will be confirmed automatically — please do not pay twice.`);
          } finally {
            setPending(false);
            onSettled();
          }
        },
        modal: {
          ondismiss: () => {
            if (settled) return;
            setPending(false);
            void doReport(order.orderId, 'Checkout closed by the student').catch(() => {});
          },
        },
      });
      rzp.on('payment.failed', (resp) => {
        settled = true;
        setPending(false);
        setError(resp.error?.description || 'The payment failed. No amount was confirmed; you can try again.');
        void doReport(order.orderId, resp.error?.description || 'payment.failed').catch(() => {});
        onSettled();
      });
      rzp.open();
    } catch (err) {
      setPending(false);
      if (isApiError(err) && err.status === 503) setError('Online payments are not configured yet — please contact us to complete the payment.');
      else setError(errorMessage(err));
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Button onClick={pay} loading={pending}>
        Pay {formatINR(amountPaise)} now
      </Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}
