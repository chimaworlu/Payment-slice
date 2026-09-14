import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '../../auth';
import PlansView from '../_components/PlansView';
import styles from './page.module.css';

interface DashboardPageProps {
  searchParams: Promise<{ view?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();

  if (!session) {
    redirect('/?view=signin');
  }

  const { view } = await searchParams;
  const activeView = view === 'billing' ? 'billing' : 'plans';

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

      <main className={styles.content}>{activeView === 'billing' ? null : <PlansView />}</main>
    </div>
  );
}
