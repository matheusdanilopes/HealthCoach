import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import MarmitasClient from './MarmitasClient';

export default async function MarmitasPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  return <MarmitasClient />;
}
