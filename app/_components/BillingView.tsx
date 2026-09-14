'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Subscription } from '@prisma/client';
import styles from './BillingView.module.css';

interface BillingViewProps {
  subscription: Subscription | null;
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function planLabel(subscription: Subscription | null): string {
  if (!subscription || subscription.plan === 'FREE') {
    return 'FREE';
  }

  return subscription.interval === 'YEARLY' ? 'PRO YEARLY' : 'PRO MONTHLY';
}

function badgeClassName(status: string): string {
  if (status === 'ACTIVE') return `${styles.badge} ${styles.badgeActive}`;
  if (status === 'CANCELED') return `${styles.badge} ${styles.badgeCanceled}`;
  if (status === 'PAST_DUE') return `${styles.badge} ${styles.badgePastDue}`;
  return `${styles.badge} ${styles.badgeNeutral}`;
}

export default function BillingView({ subscription: initialSubscription }: BillingViewProps) {
  const [subscription, setSubscription] = useState(initialSubscription);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFree = !subscription || subscription.plan === 'FREE';

  async function handleConfirmCancel() {
    setErrorMessage(null);
    setIsCancelling(true);

    try {
      const response = await fetch('/api/payment/cancel', { method: 'POST' });
      const data = await response.json().catch(() => null);

      if (response.ok) {
        setSubscription((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
        setIsConfirming(false);
        return;
      }

      setErrorMessage(data?.message ?? GENERIC_ERROR);
    } catch {
      setErrorMessage(GENERIC_ERROR);
    } finally {
      setIsCancelling(false);
    }
  }

  if (isFree) {
    return (
      <div className={styles.card}>
        <h2 className={styles.plan}>Current plan: {planLabel(subscription)}</h2>
        <p className={styles.message}>You are on the free plan.</p>
        <Link href="/dashboard?view=plans" className={styles.link}>
          View plans
        </Link>
      </div>
    );
  }

  const currentPeriodEnd = subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : null;
  const isProMonthly = subscription.plan === 'PRO' && subscription.interval === 'MONTHLY';

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.plan}>Current plan: {planLabel(subscription)}</h2>
        <span className={badgeClassName(subscription.status)}>{subscription.status}</span>
      </div>

      {subscription.status === 'ACTIVE' && !subscription.cancelAtPeriodEnd && currentPeriodEnd ? (
        <>
          <p className={styles.message}>Renews on {currentPeriodEnd}</p>

          {isProMonthly ? (
            <Link href="/dashboard?view=plans" className={styles.link}>
              Upgrade to Yearly and save
            </Link>
          ) : null}

          {isConfirming ? (
            <div className={styles.confirmBox}>
              <p className={styles.message}>
                Are you sure you want to cancel? You will keep access until {currentPeriodEnd}.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={isCancelling}
                  onClick={handleConfirmCancel}
                >
                  {isCancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  disabled={isCancelling}
                  onClick={() => setIsConfirming(false)}
                >
                  Go Back
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.button} onClick={() => setIsConfirming(true)}>
              Cancel
            </button>
          )}

          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </>
      ) : null}

      {subscription.status === 'ACTIVE' && subscription.cancelAtPeriodEnd && currentPeriodEnd ? (
        subscription.pendingInterval === 'MONTHLY' ? (
          <p className={styles.message}>Your plan will change to monthly on {currentPeriodEnd}</p>
        ) : (
          <p className={styles.message}>
            Your plan will end on {currentPeriodEnd}. You will not be charged again.
          </p>
        )
      ) : null}

      {subscription.status === 'CANCELED' && currentPeriodEnd ? (
        <p className={styles.message}>Your plan ended on {currentPeriodEnd}.</p>
      ) : null}
    </div>
  );
}
