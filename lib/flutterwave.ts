import Flutterwave from 'flutterwave-node-v3';
import { timingSafeEqual } from 'crypto';

const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;

if (!secretKey) {
  throw new Error('FLUTTERWAVE_SECRET_KEY is not set');
}

export const flutterwave = new Flutterwave(process.env.FLUTTERWAVE_PUBLIC_KEY, secretKey);

export function verifyWebhookSignature(incomingHash: string | null | undefined): boolean {
  const webhookSecret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;

  if (!webhookSecret || !incomingHash) {
    return false;
  }

  const webhookSecretBuffer = Buffer.from(webhookSecret);
  const incomingHashBuffer = Buffer.from(incomingHash);

  if (webhookSecretBuffer.length !== incomingHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(webhookSecretBuffer, incomingHashBuffer);
}

export async function verifyTransaction(transactionId: number | string) {
  const response = await flutterwave.Transaction.verify({ id: Number(transactionId) });
  return response.data;
}

interface CreatePaymentParams {
  tx_ref: string;
  amount: number;
  currency: string;
  redirect_url: string;
  customer: {
    email: string;
    name?: string | null;
  };
  payment_options: string;
  meta?: Record<string, unknown>;
}

/**
 * flutterwave-node-v3 doesn't wrap the Standard hosted-checkout endpoint
 * (POST /v3/payments, which returns the redirect payment link) — only
 * charge-type-specific flows (card, ussd, bank transfer, etc). Calling the
 * REST API directly here keeps this the only file that talks to Flutterwave.
 */
export async function createPayment(params: CreatePaymentParams): Promise<{ link: string }> {
  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const body = await response.json();

  if (!response.ok || body.status !== 'success' || !body.data?.link) {
    throw new Error(body.message ?? 'Failed to create Flutterwave payment');
  }

  return { link: body.data.link };
}
