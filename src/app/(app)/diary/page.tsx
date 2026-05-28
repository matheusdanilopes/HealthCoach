import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DiaryClient from './DiaryClient';
import type { FoodLog } from '@/types';

export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = todayISO();
  const userId = session.user.id;

  const [{ data: profileData }, { data: foodData }] = await Promise.all([
    supabase.from('users').select('target_calories').eq('id', userId).single(),
    supabase
      .from('food_logs')
      .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
      .eq('user_id', userId)
      .eq('log_date', today)
      .order('created_at'),
  ]);

  return (
    <DiaryClient
      userId={userId}
      initialLogs={(foodData as FoodLog[]) ?? []}
      initialDate={today}
      targetCalories={profileData?.target_calories ?? 2000}
    />
  );
}
