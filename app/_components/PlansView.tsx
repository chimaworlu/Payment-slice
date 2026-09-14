'use client';

import { useState } from 'react';
import type { Subscription } from '@prisma/client';
import styles from './PlansView.module.css';

type PlanId = 'FREE' | 'PRO_MONTHLY' | 'PRO_YEARLY';
type PaidInterval = 'MONTHLY' | 'YEARLY';
type CardAction = 'SUBSCRIBE' | 'UPGRADE' | 'DOWNGRADE' | 'DOWNGRADE_TO_FREE' | null;

type CardUiState =
  | { type: 'idle' }
  | { type: 'upgrade-preview'; link: string; upgradeAmountNaira: number; creditNaira: number; daysRemaining: number }
  | { type: 'downgrade-confirm' }
  | { type: 'downgrade-success'; message: string };

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

const BASE_LABELS: Record<PlanId, Partial<Record<PlanId, string>>> = {
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

const GENERIC_ERROR = 'Something went wrong. Please try again.';

function formatNaira(amountMinor: number): string {
  return `${(amountMinor / 100).toLocaleString('en-NG')} Naira`;
}

function formatAmount(amountNaira: number): string {
  return amountNaira.toLocaleString('en-NG');
}

function resolveCurrentPlan(subscription: Subscription | null): PlanId {
  if (!subscription || subscription.plan === 'FREE') {
    return 'FREE';
  }

  return subscription.interval === 'YEARLY' ? 'PRO_YEARLY' : 'PRO_MONTHLY';
}

function getCardAction(currentPlan: PlanId, cardId: PlanId): CardAction {
  if (currentPlan === cardId) return null;
  if (currentPlan === 'FREE') return 'SUBSCRIBE';
  if (currentPlan === 'PRO_MONTHLY' && cardId === 'PRO_YEARLY') return 'UPGRADE';
  if (currentPlan === 'PRO_YEARLY' && cardId === 'PRO_MONTHLY') return 'DOWNGRADE';
  return 'DOWNGRADE_TO_FREE';
}

const CARD_INTERVAL: Partial<Record<PlanId, PaidInterval>> = {
  PRO_MONTHLY: 'MONTHLY',
  PRO_YEARLY: 'YEARLY',
};

export default function PlansView({ subscription, monthlyPriceMinor, yearlyPriceMinor }: PlansViewProps) {
  const [loadingCardId, setLoadingCardId] = useState<PlanId | null>(null);
  const [errorMessages, setErrorMessages] = useState<Partial<Record<PlanId, string>>>({});
  const [cardStates, setCardStates] = useState<Partial<Record<PlanId, CardUiState>>>({});

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

  function setCardState(cardId: PlanId, state: CardUiState) {
    setCardStates((prev) => ({ ...prev, [cardId]: state }));
  }

  function setError(cardId: PlanId, message: string | undefined) {
    setErrorMessages((prev) => ({ ...prev, [cardId]: message }));
  }

  async function handleSubscribeClick(cardId: PlanId) {
    const interval = CARD_INTERVAL[cardId];
    if (!interval) return;

    setError(cardId, undefined);
    setLoadingCardId(cardId);

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

      setError(cardId, response.status === 400 || response.status === 429 ? data?.message ?? GENERIC_ERROR : GENERIC_ERROR);
    } catch {
      setError(cardId, GENERIC_ERROR);
    } finally {
      setLoadingCardId((current) => (current === cardId ? null : current));
    }
  }

  async function handleUpgradeClick(cardId: PlanId) {
    setError(cardId, undefined);
    setLoadingCardId(cardId);

    try {
      const response = await fetch('/api/payment/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetInterval: 'YEARLY' }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok && data?.link) {
        setCardState(cardId, {
          type: 'upgrade-preview',
          link: data.link,
          upgradeAmountNaira: data.upgradeAmountNaira,
          creditNaira: data.creditNaira,
          daysRemaining: data.daysRemaining,
        });
      } else {
        setError(cardId, response.status === 400 || response.status === 429 ? data?.message ?? GENERIC_ERROR : GENERIC_ERROR);
      }
    } catch {
      setError(cardId, GENERIC_ERROR);
    } finally {
      setLoadingCardId((current) => (current === cardId ? null : current));
    }
  }

  function handleUpgradeConfirm(cardId: PlanId) {
    const state = cardStates[cardId];
    if (state?.type === 'upgrade-preview') {
      window.location.href = state.link;
    }
  }

  function handleUpgradeCancel(cardId: PlanId) {
    setCardState(cardId, { type: 'idle' });
  }

  function handleDowngradeStart(cardId: PlanId) {
    setError(cardId, undefined);
    setCardState(cardId, { type: 'downgrade-confirm' });
  }

  function handleDowngradeCancel(cardId: PlanId) {
    setCardState(cardId, { type: 'idle' });
  }

  async function handleDowngradeConfirm(cardId: PlanId) {
    setLoadingCardId(cardId);

    try {
      const response = await fetch('/api/payment/downgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetInterval: 'MONTHLY' }),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) {
        setCardState(cardId, { type: 'downgrade-success', message: data?.message ?? '' });
      } else {
        setError(cardId, response.status === 400 || response.status === 429 ? data?.message ?? GENERIC_ERROR : GENERIC_ERROR);
        setCardState(cardId, { type: 'idle' });
      }
    } catch {
      setError(cardId, GENERIC_ERROR);
      setCardState(cardId, { type: 'idle' });
    } finally {
      setLoadingCardId((current) => (current === cardId ? null : current));
    }
  }

  return (
    <div className={styles.grid}>
      {planCards.map((card) => {
        const isCurrentPlan = card.id === currentPlan;
        const action = getCardAction(currentPlan, card.id);
        const state = cardStates[card.id] ?? { type: 'idle' };
        const isLoading = loadingCardId === card.id;
        const isAnyLoading = loadingCardId !== null;
        const baseLabel = isCurrentPlan ? null : BASE_LABELS[currentPlan][card.id];

        return (
          <div key={card.id} className={styles.card}>
            {isCurrentPlan ? <span className={styles.badge}>Current Plan</span> : null}

            <h2 className={styles.name}>{card.name}</h2>
            <p className={styles.price}>{card.price}</p>
            <p className={styles.description}>{card.description}</p>

            {action === 'SUBSCRIBE' ? (
              <button
                type="button"
                className={styles.button}
                disabled={isAnyLoading}
                onClick={() => handleSubscribeClick(card.id)}
              >
                {isLoading ? 'Please wait…' : baseLabel}
              </button>
            ) : null}

            {action === 'UPGRADE' ? (
              state.type === 'upgrade-preview' ? (
                <div className={styles.confirmBox}>
                  <p className={styles.message}>
                    You will be charged ₦{formatAmount(state.upgradeAmountNaira)} today. ₦
                    {formatAmount(state.creditNaira)} credit applied for {state.daysRemaining} remaining days on your
                    monthly plan. Proceed?
                  </p>
                  <div className={styles.confirmActions}>
                    <button type="button" className={styles.button} onClick={() => handleUpgradeConfirm(card.id)}>
                      Confirm
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => handleUpgradeCancel(card.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.button}
                  disabled={isAnyLoading}
                  onClick={() => handleUpgradeClick(card.id)}
                >
                  {isLoading ? 'Please wait…' : baseLabel}
                </button>
              )
            ) : null}

            {action === 'DOWNGRADE' ? (
              state.type === 'downgrade-success' ? (
                <p className={styles.success}>{state.message}</p>
              ) : state.type === 'downgrade-confirm' ? (
                <div className={styles.confirmBox}>
                  <p className={styles.message}>
                    Your plan will change to monthly at the end of your current period. You will not be charged now.
                    Confirm?
                  </p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.button}
                      disabled={isLoading}
                      onClick={() => handleDowngradeConfirm(card.id)}
                    >
                      {isLoading ? 'Please wait…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={isLoading}
                      onClick={() => handleDowngradeCancel(card.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.button}
                  disabled={isAnyLoading}
                  onClick={() => handleDowngradeStart(card.id)}
                >
                  {baseLabel}
                </button>
              )
            ) : null}

            {action === 'DOWNGRADE_TO_FREE' ? (
              <button type="button" className={styles.button} disabled title="Contact support to cancel your subscription">
                {baseLabel}
              </button>
            ) : null}

            {errorMessages[card.id] ? <p className={styles.error}>{errorMessages[card.id]}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
