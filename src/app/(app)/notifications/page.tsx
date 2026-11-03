import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import NotificationsClient from './NotificationsClient';

export const metadata = { title: 'Notificações — HealthCoach' };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  return <NotificationsClient />;
}
