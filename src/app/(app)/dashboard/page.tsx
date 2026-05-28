import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DashboardClient from './DashboardClient';
import type { Profile } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = todayISO();
  const userId = session.user.id;

  const [
    { data: profile },
    { data: weightRows },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1),
  ]);

  const latestWeight = parseFloat(
    String(weightRows?.[0]?.weight_kg ?? (profile as Profile | null)?.current_weight ?? 0)
  );

  return (
    <DashboardClient
      profile={(profile as Profile & { id: string }) ?? null}
      serverDate={today}
      latestWeight={latestWeight}
      userId={userId}
    />
  );
}
