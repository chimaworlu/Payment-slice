import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '../../../../lib/db';
import { checkoutLimiter, checkRateLimit } from '../../../../lib/rate-limit';
import { getClientIp } from '../../../../lib/get-client-ip';
import { createPayment } from '../../../../lib/flutterwave';
import { checkoutSchema } from '../../../../lib/validations/payment';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = checkoutSchema.safeParse(body);

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

  const { interval } = validation.data;

  const ip = getClientIp(request);
  const { success, retryAfter } = await checkRateLimit(checkoutLimiter, ip);

  if (!success) {
    return NextResponse.json(
      { message: `Too many attempts. Try again in ${retryAfter} seconds.`, retryAfter },
      { status: 429 }
    );
  }

  const userId = session.user.id;

  let subscription;

  try {
    subscription = await prisma.subscription.findUnique({ where: { userId } });
  } catch (error) {
    console.error('[POST /api/payment/checkout] Failed to fetch subscription', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  if (subscription && subscription.status === 'ACTIVE' && subscription.interval === interval) {
    return NextResponse.json({ message: 'You are already on this plan' }, { status: 400 });
  }

  const idempotencyKey = randomUUID();

  const amountMinor =
    interval === 'MONTHLY'
      ? Number(process.env.PRO_MONTHLY_PRICE_MINOR ?? 500000)
      : Number(process.env.PRO_YEARLY_PRICE_MINOR ?? 5000000);

  let transaction;

  try {
    transaction = await prisma.transaction.create({
      data: {
        userId,
        type: 'SUBSCRIPTION_CHARGE',
        status: 'PENDING',
        amountMinor,
        currency: 'NGN',
        interval,
        providerRef: idempotencyKey,
        description: `Subscription initiation for Qilo Pro ${interval}`,
      },
    });
  } catch (error) {
    console.error('[POST /api/payment/checkout] Failed to create transaction', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  try {
    const payment = await createPayment({
      tx_ref: idempotencyKey,
      amount: amountMinor / 100,
      currency: 'NGN',
      redirect_url: `${process.env.NEXTAUTH_URL}/dashboard?view=return`,
      customer: {
        email: session.user.email ?? '',
        name: session.user.name,
      },
      payment_options: 'card,banktransfer,ussd',
      meta: { userId, interval },
    });

    return NextResponse.json({ link: payment.link }, { status: 200 });
  } catch (error) {
    console.error('[POST /api/payment/checkout] Flutterwave payment creation failed', {
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
      console.error('[POST /api/payment/checkout] Failed to mark transaction as failed', {
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
