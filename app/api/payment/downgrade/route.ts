import { NextResponse } from 'next/server';
import { auth } from '../../../../auth';
import { prisma } from '../../../../lib/db';
import { downgradeSchema } from '../../../../lib/validations/payment';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validation = downgradeSchema.safeParse(body);

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
    console.error('[POST /api/payment/downgrade] Failed to fetch subscription', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  if (!subscription || subscription.status !== 'ACTIVE') {
    return NextResponse.json({ message: 'No active subscription found' }, { status: 400 });
  }

  if (subscription.interval === 'MONTHLY') {
    return NextResponse.json({ message: 'You are already on the monthly plan' }, { status: 400 });
  }

  const formattedPeriodEnd = subscription.currentPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : 'the end of your current period';

  try {
    await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId,
          type: 'DOWNGRADE',
          status: 'SUCCEEDED',
          amountMinor: 0,
          interval: 'MONTHLY',
          description: `Downgrade from yearly to monthly. Change applies at period end: ${formattedPeriodEnd}`,
        },
      }),
      prisma.subscription.update({
        where: { userId },
        data: { cancelAtPeriodEnd: true, pendingInterval: 'MONTHLY' },
      }),
    ]);
  } catch (error) {
    console.error('[POST /api/payment/downgrade] Failed to process downgrade', { userId, error });
    return NextResponse.json(
      { message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { message: `Your plan will change to monthly on ${formattedPeriodEnd}` },
    { status: 200 }
  );
}
