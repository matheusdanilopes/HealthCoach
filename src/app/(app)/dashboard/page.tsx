import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/utils';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = todayISO();
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd = `${today}T23:59:59.999Z`;

  const [profileRes, foodLogsRes, waterLogsRes, weightLogsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at'),
    supabase
      .from('water_logs')
      .select('amount_ml')
      .eq('user_id', user.id)
      .eq('date', today),
    supabase
      .from('weight_logs')
      .select('weight, date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(1),
  ]);

  const profile = profileRes.data;
  const foodLogs = foodLogsRes.data ?? [];
  const totalWater = (waterLogsRes.data ?? []).reduce((s, l) => s + l.amount_ml, 0);
  const latestWeight = weightLogsRes.data?.[0]?.weight ?? profile?.current_weight ?? 0;

  return (
    <DashboardClient
      profile={profile}
      initialFoodLogs={foodLogs}
      initialWater={totalWater}
      latestWeight={latestWeight}
      userId={user.id}
    />
  );
}
