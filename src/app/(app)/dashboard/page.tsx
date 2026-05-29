import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import DashboardClient from './DashboardClient';
import type { Profile, FoodLog, WaterLogEntry } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = brazilToday();
  const userId = session.user.id;

  const [
    { data: profile },
    { data: weightRows },
    { data: waterData },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase
      .from('weight_logs')
      .select('weight_kg')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1),
    supabase
      .from('water_logs')
      .select('amount_ml, created_at')
      .eq('user_id', userId)
      .eq('log_date', today)
      .order('created_at'),
  ]);

  let { data: foodData, error: foodError } = await supabase
    .from('food_logs')
    .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, hydration_ml, hydration_source, hydration_confidence, created_at')
    .eq('user_id', userId)
    .eq('log_date', today)
    .order('created_at');

  if (foodError) {
    // Migration not yet applied — fall back to legacy schema
    ({ data: foodData } = await supabase
      .from('food_logs')
      .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
      .eq('user_id', userId)
      .eq('log_date', today)
      .order('created_at'));
  }

  const latestWeight = parseFloat(
    String(weightRows?.[0]?.weight_kg ?? (profile as Profile | null)?.current_weight ?? 0)
  );

  const initialWaterLogs = (waterData ?? []) as WaterLogEntry[];

  return (
    <DashboardClient
      profile={(profile as Profile & { id: string }) ?? null}
      serverDate={today}
      latestWeight={latestWeight}
      userId={userId}
      initialFoodLogs={(foodData ?? []) as FoodLog[]}
      initialWaterLogs={initialWaterLogs}
    />
  );
}
