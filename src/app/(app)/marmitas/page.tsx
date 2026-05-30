import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import MarmitasClient from './MarmitasClient';

export default async function MarmitasPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return <MarmitasClient />;
}
