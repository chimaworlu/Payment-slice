import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import { prisma } from '../../lib/db';
import styles from './PlansView.module.css';

type PlanId = 'FREE' | 'PRO_MONTHLY' | 'PRO_YEARLY';

interface PlanCard {
  id: PlanId;
  name: string;
  price: string;
  description: string;
}

const UPGRADE_DOWNGRADE_LABELS: Record<PlanId, Partial<Record<PlanId, string>>> = {
  FREE: {
    PRO_MONTHLY: 'Subscribe Monthly',
    PRO_YEARLY: 'Subscribe Yearly',
  },
  PRO_MONTHLY: {
    FREE: 'Downgrade to Free',
    PRO_YEARLY: 'Upgrade to Yearly',
  },
  PRO_YEARLY: {
    FREE: 'Downgrade to Free',
    PRO_MONTHLY: 'Downgrade to Monthly',
  },
};

function formatNaira(amountMinor: number): string {
  return `${(amountMinor / 100).toLocaleString('en-NG')} Naira`;
}

function resolveCurrentPlan(
  subscription: { plan: string; interval: string | null } | null
): PlanId {
  if (!subscription || subscription.plan === 'FREE') {
    return 'FREE';
  }

  return subscription.interval === 'YEARLY' ? 'PRO_YEARLY' : 'PRO_MONTHLY';
}

export default async function PlansView() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/?view=signin');
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });

  const currentPlan = resolveCurrentPlan(subscription);

  const monthlyPriceMinor = Number(process.env.PRO_MONTHLY_PRICE_MINOR ?? 500000);
  const yearlyPriceMinor = Number(process.env.PRO_YEARLY_PRICE_MINOR ?? 5000000);

  const planCards: PlanCard[] = [
    { id: 'FREE', name: 'Free', price: formatNaira(0), description: 'Basic access' },
    {
      id: 'PRO_MONTHLY',
      name: 'Pro Monthly',
      price: `${formatNaira(monthlyPriceMinor)} per month`,
      description: 'Full access billed monthly',
    },
    {
      id: 'PRO_YEARLY',
      name: 'Pro Yearly',
      price: `${formatNaira(yearlyPriceMinor)} per year`,
      description: 'Full access billed yearly. 2 months free.',
    },
  ];

  return (
    <div className={styles.grid}>
      {planCards.map((card) => {
        const isCurrentPlan = card.id === currentPlan;
        const buttonLabel = isCurrentPlan ? null : UPGRADE_DOWNGRADE_LABELS[currentPlan][card.id];

        return (
          <div key={card.id} className={styles.card}>
            {isCurrentPlan ? <span className={styles.badge}>Current Plan</span> : null}

            <h2 className={styles.name}>{card.name}</h2>
            <p className={styles.price}>{card.price}</p>
            <p className={styles.description}>{card.description}</p>

            {buttonLabel ? (
              <button type="button" className={styles.button}>
                {buttonLabel}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
