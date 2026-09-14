'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import styles from './ReturnView.module.css';

function ReturnContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const txRef = searchParams.get('tx_ref');

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
