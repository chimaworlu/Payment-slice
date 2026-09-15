'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from './ReturnView.module.css';

const IS_DEV = process.env.NODE_ENV === 'development';

function ReturnContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const txRef = searchParams.get('tx_ref');
  const transactionId = searchParams.get('transaction_id');

  const [simulateStatus, setSimulateStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');

  useEffect(() => {
    if (!IS_DEV || status !== 'successful' || !txRef || !transactionId) {
      return;
    }

    let cancelled = false;
    setSimulateStatus('running');

    fetch('/api/payment/webhook/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, txRef }),
    })
      .then(() => {
        if (!cancelled) setSimulateStatus('done');
      })
      .catch(() => {
        if (!cancelled) setSimulateStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [status, txRef, transactionId]);

  let message: string;
  let linkHref: string;
  let linkLabel: string;

  if (status === 'successful') {
    message = 'Payment successful. Your plan has been activated.';
    linkHref = '/dashboard?view=billing';
    linkLabel = 'Go to Billing';
  } else if (status === 'cancelled') {
    message = 'Payment was cancelled.';
    linkHref = '/dashboard?view=plans';
    linkLabel = 'Back to Plans';
  } else {
    message = 'Something went wrong with your payment.';
    linkHref = '/dashboard?view=plans';
    linkLabel = 'Back to Plans';
  }

  return (
    <div className={styles.card}>
      <p className={styles.message}>{message}</p>
      {txRef ? <p className={styles.reference}>Reference: {txRef}</p> : null}

      {IS_DEV && status === 'successful' && simulateStatus === 'running' ? (
        <p className={styles.devNotice}>Dev mode: simulating webhook...</p>
      ) : null}
      {IS_DEV && status === 'successful' && simulateStatus === 'done' ? (
        <p className={styles.devNotice}>Webhook simulated. Check your billing view.</p>
      ) : null}

      <Link href={linkHref} className={styles.link}>
        {linkLabel}
      </Link>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className={styles.card}>
      <div className={styles.spinner} role="status" aria-label="Loading" />
    </div>
  );
}

export default function ReturnView() {
  return (
    <div className={styles.wrapper}>
      <Suspense fallback={<LoadingSpinner />}>
        <ReturnContent />
      </Suspense>
    </div>
  );
}
