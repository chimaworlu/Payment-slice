import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '../../../../lib/db';

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  let subscription;

  try {
    subscription = await prisma.subscription.findUnique({ where: { userId } });
  } catch (error) {
    console.error('[POST /api/payment/cancel] Failed to fetch subscription', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  if (!subscription || subscription.status !== 'ACTIVE') {
    return NextResponse.json({ message: 'No active subscription found' }, { status: 400 });
  }

  if (subscription.cancelAtPeriodEnd) {
    return NextResponse.json(
      { message: 'Your subscription is already set to cancel' },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction([
      prisma.subscription.update({
        where: { userId },
        data: { cancelAtPeriodEnd: true, status: 'ACTIVE' },
      }),
      prisma.transaction.create({
        data: {
          userId,
          type: 'CANCELLATION',
          status: 'SUCCEEDED',
          amountMinor: 0,
          currency: 'NGN',
          interval: subscription.interval,
          providerRef: null,
          description: 'Subscription cancellation requested. Access retained until period end.',
        },
      }),
    ]);
  } catch (error) {
    console.error('[POST /api/payment/cancel] Failed to process cancellation', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  const formattedDate = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'the end of your current period';

  return NextResponse.json(
    { message: `Your subscription will end on ${formattedDate}` },
    { status: 200 }
  );
}
