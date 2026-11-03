import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import SaudeClient from './SaudeClient';

export default async function SaudePage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  return <SaudeClient />;
}
