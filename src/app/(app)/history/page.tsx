import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { subDays } from 'date-fns';
import { formatDate } from '@/lib/utils';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const thirtyDaysAgo = formatDate(subDays(new Date(), 30));

  const [profileRes, weightLogsRes, foodLogsRes] = await Promise.all([
    supabase.from('profiles').select('target_calories').eq('id', user.id).single(),
    supabase
      .from('weight_logs')
      .select('date, weight')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo)
      .order('date'),
    supabase
      .from('food_logs')
      .select('created_at, calories')
      .eq('user_id', user.id)
      .gte('created_at', `${thirtyDaysAgo}T00:00:00.000Z`)
      .gt('calories', 0),
  ]);

  const targetCalories = profileRes.data?.target_calories ?? 2000;

  // Aggregate daily calories
  const calByDay: Record<string, number> = {};
  for (const log of foodLogsRes.data ?? []) {
    const day = log.created_at.split('T')[0];
    calByDay[day] = (calByDay[day] ?? 0) + log.calories;
  }

  const dailyCalData = Object.entries(calByDay)
    .map(([date, calories]) => ({ date, calories }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <HistoryClient
      weightLogs={weightLogsRes.data ?? []}
      dailyCalData={dailyCalData}
      targetCalories={targetCalories}
    />
  );
}
