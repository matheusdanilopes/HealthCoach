import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { subDays } from 'date-fns';
import { formatDate } from '@/lib/utils';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const thirtyDaysAgo = formatDate(subDays(new Date(), 30));

  const [{ data: profileData }, { data: weightData }, { data: foodData }] = await Promise.all([
    supabase.from('users').select('target_calories').eq('id', userId).single(),
    supabase
      .from('weight_logs')
      .select('log_date, weight_kg')
      .eq('user_id', userId)
      .gte('log_date', thirtyDaysAgo)
      .order('log_date'),
    supabase
      .from('food_logs')
      .select('log_date, calories')
      .eq('user_id', userId)
      .gte('log_date', thirtyDaysAgo)
      .gt('calories', 0),
  ]);

  const targetCalories = profileData?.target_calories ?? 2000;

  const weightLogs = (weightData ?? []).map((r) => ({
    date: r.log_date,
    weight: parseFloat(String(r.weight_kg)),
  }));

  const calByDay: Record<string, number> = {};
  for (const log of foodData ?? []) {
    calByDay[log.log_date] = (calByDay[log.log_date] ?? 0) + log.calories;
  }
  const dailyCalData = Object.entries(calByDay)
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <HistoryClient
      weightLogs={weightLogs}
      dailyCalData={dailyCalData}
      targetCalories={targetCalories}
    />
  );
}
