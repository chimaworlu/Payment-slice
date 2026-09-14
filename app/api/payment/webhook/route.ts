import { NextResponse } from 'next/server';
import type { Transaction } from '@prisma/client';
import { prisma } from '../../../../lib/db';
import { verifyWebhookSignature, verifyTransaction } from '../../../../lib/flutterwave';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const verifHash = request.headers.get('verif-hash');

  if (!verifyWebhookSignature(verifHash)) {
    return NextResponse.json({ message: 'Invalid webhook signature' }, { status: 400 });
  }

  let txRef: string | undefined;
  let transactionRecord: Transaction | null = null;

  try {
    const event = await request.json();
    txRef = event?.data?.tx_ref;
    const flutterwaveTransactionId = event?.data?.id;

    if (!txRef || !flutterwaveTransactionId) {
      console.error('[POST /api/payment/webhook] Missing tx_ref or id in webhook payload', { event });
      return NextResponse.json({ message: 'Invalid webhook payload' }, { status: 200 });
    }

    transactionRecord = await prisma.transaction.findFirst({ where: { providerRef: txRef } });

    if (!transactionRecord) {
      console.error('[POST /api/payment/webhook] No matching transaction found', { txRef });
      return NextResponse.json({ message: 'Transaction not found' }, { status: 200 });
    }

    if (transactionRecord.status === 'SUCCEEDED') {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    const verifiedTransaction = await verifyTransaction(flutterwaveTransactionId);

    if (verifiedTransaction.status !== 'successful') {
      await prisma.transaction.update({
        where: { id: transactionRecord.id },
        data: { status: 'FAILED' },
      });

      return NextResponse.json({ message: 'Transaction not successful' }, { status: 200 });
    }

    const expectedAmountMinor =
      transactionRecord.interval === 'YEARLY'
        ? Number(process.env.PRO_YEARLY_PRICE_MINOR ?? 5000000)
        : Number(process.env.PRO_MONTHLY_PRICE_MINOR ?? 500000);

    const expectedAmount = expectedAmountMinor / 100;

    if (Number(verifiedTransaction.amount) !== expectedAmount) {
      await prisma.transaction.update({
        where: { id: transactionRecord.id },
        data: { status: 'FAILED' },
      });

      console.error('[POST /api/payment/webhook] Verified amount does not match expected amount', {
        transactionId: transactionRecord.id,
        txRef,
        interval: transactionRecord.interval,
        expectedAmount,
        verifiedAmount: verifiedTransaction.amount,
      });

      return NextResponse.json({ message: 'Amount mismatch' }, { status: 200 });
    }

    const periodDays = transactionRecord.interval === 'YEARLY' ? 365 : 30;
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date(currentPeriodStart.getTime() + periodDays * MS_PER_DAY);

    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: transactionRecord.id },
        data: { status: 'SUCCEEDED' },
      }),
      prisma.subscription.upsert({
        where: { userId: transactionRecord.userId },
        create: {
          userId: transactionRecord.userId,
          plan: 'PRO',
          interval: transactionRecord.interval,
          status: 'ACTIVE',
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          providerRef: txRef,
        },
        update: {
          plan: 'PRO',
          interval: transactionRecord.interval,
          status: 'ACTIVE',
          currentPeriodStart,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          providerRef: txRef,
        },
      }),
    ]);

    return NextResponse.json({ message: 'Webhook processed' }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/payment/webhook] Failed to process webhook', { txRef, error });

    if (transactionRecord) {
      try {
        await prisma.transaction.update({
          where: { id: transactionRecord.id },
          data: { status: 'FAILED' },
        });
      } catch (updateError) {
        console.error('[POST /api/payment/webhook] Failed to mark transaction as failed', {
          transactionId: transactionRecord.id,
          error: updateError,
        });
      }
    }

    return NextResponse.json({ message: 'Webhook processing failed' }, { status: 200 });
  }
}
