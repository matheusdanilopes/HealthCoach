import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import NotificationsClient from './NotificationsClient';

export const metadata = { title: 'Notificações — HealthCoach' };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <NotificationsClient />;
}
