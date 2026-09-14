import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '../../../../lib/db';
import { createPayment } from '../../../../lib/flutterwave';
import { upgradeSchema } from '../../../../lib/validations/payment';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = upgradeSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        message: validation.error.issues[0]?.message ?? 'Invalid request.',
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  let subscription;

  try {
    subscription = await prisma.subscription.findUnique({ where: { userId } });
  } catch (error) {
    console.error('[POST /api/payment/upgrade] Failed to fetch subscription', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  if (!subscription || subscription.status !== 'ACTIVE') {
    return NextResponse.json({ message: 'No active subscription found' }, { status: 400 });
  }

  if (subscription.interval === 'YEARLY') {
    return NextResponse.json({ message: 'You are already on the yearly plan' }, { status: 400 });
  }

  const now = new Date();
  const currentPeriodEnd = subscription.currentPeriodEnd ?? now;
  const daysRemaining = Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / MS_PER_DAY);

  const monthlyPriceMinor = Number(process.env.PRO_MONTHLY_PRICE_MINOR ?? 500000);
  const yearlyPriceMinor = Number(process.env.PRO_YEARLY_PRICE_MINOR ?? 5000000);

  const dailyRateMinor = monthlyPriceMinor / 30;
  const creditMinor = Math.floor(daysRemaining * dailyRateMinor);

  let upgradeAmountMinor = yearlyPriceMinor - creditMinor;
  if (upgradeAmountMinor < 0) {
    upgradeAmountMinor = 0;
  }

  const idempotencyKey = randomUUID();

  let transaction;

  try {
    transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'UPGRADE',
        status: 'PENDING',
        amountMinor: upgradeAmountMinor,
        interval: 'YEARLY',
        providerRef: idempotencyKey,
        description: `Upgrade from monthly to yearly. Credit applied: ${creditMinor} kobo. Days remaining: ${daysRemaining}`,
      },
    });
  } catch (error) {
    console.error('[POST /api/payment/upgrade] Failed to create transaction', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  try {
    const payment = await createPayment({
      tx_ref: idempotencyKey,
      amount: upgradeAmountMinor / 100,
      currency: 'NGN',
      redirect_url: `${process.env.NEXTAUTH_URL}/dashboard?view=return`,
      customer: {
        email: session.user.email ?? '',
        name: session.user.name,
      },
      payment_options: 'card,banktransfer,ussd',
      meta: { userId, interval: 'YEARLY', type: 'UPGRADE' },
    });

    return NextResponse.json(
      {
        link: payment.link,
        upgradeAmountNaira: upgradeAmountMinor / 100,
        creditNaira: creditMinor / 100,
        daysRemaining,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[POST /api/payment/upgrade] Flutterwave payment creation failed', {
      userId,
      transactionId: transaction.id,
      error,
    });

    try {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
    } catch (updateError) {
      console.error('[POST /api/payment/upgrade] Failed to mark transaction as failed', {
        userId,
        transactionId: transaction.id,
        error: updateError,
      });
    }

    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
