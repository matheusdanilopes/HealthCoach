import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DashboardClient from './DashboardClient';
import type { Profile, FoodLog } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = todayISO();
  const userId = session.user.id;

  const [
    { data: profile },
    { data: foodRows },
    { data: waterRows },
    { data: weightRows },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('food_logs')
      .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
      .eq('user_id', userId)
      .eq('log_date', today)
      .order('created_at'),
    supabase.from('water_logs').select('amount_ml').eq('user_id', userId).eq('log_date', today),
    supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1),
  ]);

  const totalWater = (waterRows ?? []).reduce((sum: number, r: { amount_ml: number }) => sum + r.amount_ml, 0);
  const latestWeight = parseFloat(
    String(weightRows?.[0]?.weight_kg ?? (profile as Profile | null)?.current_weight ?? 0)
  );

  return (
    <DashboardClient
      profile={(profile as Profile & { id: string }) ?? null}
      initialFoodLogs={(foodRows as FoodLog[]) ?? []}
      initialWater={totalWater}
      latestWeight={latestWeight}
      userId={userId}
    />
  );
}
