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
