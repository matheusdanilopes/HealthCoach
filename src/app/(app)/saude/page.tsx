import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SaudeClient from './SaudeClient';

export default async function SaudePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  return <SaudeClient />;
}
