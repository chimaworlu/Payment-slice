'use client';

import { useState } from 'react';
import type { Subscription } from '@prisma/client';
import styles from './PlansView.module.css';

type PlanId = 'FREE' | 'PRO_MONTHLY' | 'PRO_YEARLY';
type PaidInterval = 'MONTHLY' | 'YEARLY';

interface PlanCard {
  id: PlanId;
  name: string;
  price: string;
  description: string;
}

interface PlansViewProps {
  subscription: Subscription | null;
  monthlyPriceMinor: number;
  yearlyPriceMinor: number;
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

// Only PRO_MONTHLY/PRO_YEARLY map to a real checkout interval — there's no
// "downgrade to free" endpoint yet, so that button stays unwired for now.
const CARD_INTERVAL: Partial<Record<PlanId, PaidInterval>> = {
  PRO_MONTHLY: 'MONTHLY',
  PRO_YEARLY: 'YEARLY',
};

const GENERIC_ERROR = 'Something went wrong. Please try again.';

function formatNaira(amountMinor: number): string {
  return `${(amountMinor / 100).toLocaleString('en-NG')} Naira`;
}

function resolveCurrentPlan(subscription: Subscription | null): PlanId {
  if (!subscription || subscription.plan === 'FREE') {
    return 'FREE';
  }

  return subscription.interval === 'YEARLY' ? 'PRO_YEARLY' : 'PRO_MONTHLY';
}

export default function PlansView({ subscription, monthlyPriceMinor, yearlyPriceMinor }: PlansViewProps) {
  const [loadingPlanId, setLoadingPlanId] = useState<PlanId | null>(null);
  const [errorMessages, setErrorMessages] = useState<Partial<Record<PlanId, string>>>({});

  const currentPlan = resolveCurrentPlan(subscription);

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

  async function handleClick(cardId: PlanId) {
    const interval = CARD_INTERVAL[cardId];
    if (!interval) return;

    setErrorMessages((prev) => ({ ...prev, [cardId]: undefined }));
    setLoadingPlanId(cardId);

    try {
      const response = await fetch('/api/payment/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.link) {
        window.location.href = data.link;
        return;
      }

      if (response.status === 400 || response.status === 429) {
        setErrorMessages((prev) => ({ ...prev, [cardId]: data?.message ?? GENERIC_ERROR }));
      } else {
        setErrorMessages((prev) => ({ ...prev, [cardId]: GENERIC_ERROR }));
      }
    } catch {
      setErrorMessages((prev) => ({ ...prev, [cardId]: GENERIC_ERROR }));
    } finally {
      setLoadingPlanId((current) => (current === cardId ? null : current));
    }
  }

  return (
    <div className={styles.grid}>
      {planCards.map((card) => {
        const isCurrentPlan = card.id === currentPlan;
        const buttonLabel = isCurrentPlan ? null : UPGRADE_DOWNGRADE_LABELS[currentPlan][card.id];
        const isWired = Boolean(CARD_INTERVAL[card.id]);
        const isLoading = loadingPlanId === card.id;

        return (
          <div key={card.id} className={styles.card}>
            {isCurrentPlan ? <span className={styles.badge}>Current Plan</span> : null}

            <h2 className={styles.name}>{card.name}</h2>
            <p className={styles.price}>{card.price}</p>
            <p className={styles.description}>{card.description}</p>

            {buttonLabel ? (
              <button
                type="button"
                className={styles.button}
                disabled={isWired && loadingPlanId !== null}
                onClick={() => handleClick(card.id)}
              >
                {isLoading ? 'Please wait…' : buttonLabel}
              </button>
            ) : null}

            {errorMessages[card.id] ? <p className={styles.error}>{errorMessages[card.id]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
