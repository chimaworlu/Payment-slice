import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '../../auth';
import { prisma } from '../../lib/db';
import PlansView from '../_components/PlansView';
import ReturnView from '../_components/ReturnView';
import BillingView from '../_components/BillingView';
import styles from './page.module.css';

interface DashboardPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/?view=signin');
  }

  const { view } = await searchParams;
  const activeView = view === 'billing' || view === 'return' ? view : 'plans';

  const subscription =
    activeView === 'plans' || activeView === 'billing'
      ? await prisma.subscription.findUnique({ where: { userId: session.user.id } })
      : null;

  const monthlyPriceMinor = Number(process.env.PRO_MONTHLY_PRICE_MINOR ?? 500000);
  const yearlyPriceMinor = Number(process.env.PRO_YEARLY_PRICE_MINOR ?? 5000000);

  return (
    <div className={styles.shell}>
      <nav className={styles.nav}>
        <span className={styles.navUser}>{session.user?.name}</span>

        <div className={styles.navLinks}>
          <Link
            href="/dashboard?view=plans"
            className={activeView === 'plans' ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
          >
            Plans
          </Link>
          <Link
            href="/dashboard?view=billing"
            className={activeView === 'billing' ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
          >
            Billing
          </Link>
        </div>

        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/?view=signin' });
          }}
        >
          <button type="submit" className={styles.signOutButton}>
            Sign out
          </button>
        </form>
      </nav>

      <main className={styles.content}>
        {activeView === 'return' ? <ReturnView /> : null}
        {activeView === 'billing' ? <BillingView subscription={subscription} /> : null}
        {activeView === 'plans' ? (
          <PlansView
            subscription={subscription}
            monthlyPriceMinor={monthlyPriceMinor}
            yearlyPriceMinor={yearlyPriceMinor}
          />
        ) : null}
      </main>
    </div>
  );
}
