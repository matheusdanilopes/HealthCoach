import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { subDays } from 'date-fns';
import { formatDate } from '@/lib/utils';
import HistoryClient from './HistoryClient';

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const thirtyDaysAgo = formatDate(subDays(new Date(), 30));

  const [profileRows, weightRows, foodRows] = await Promise.all([
    sql<{ target_calories: number }>`SELECT target_calories FROM users WHERE id = ${userId}`,
    sql<{ log_date: string; weight_kg: string }>`
      SELECT log_date, weight_kg FROM weight_logs
      WHERE user_id = ${userId} AND log_date >= ${thirtyDaysAgo}
      ORDER BY log_date
    `,
    sql<{ log_date: string; calories: number }>`
      SELECT log_date, calories FROM food_logs
      WHERE user_id = ${userId} AND log_date >= ${thirtyDaysAgo} AND calories > 0
    `,
  ]);

  const targetCalories = profileRows[0]?.target_calories ?? 2000;

  const weightLogs = weightRows.map((r) => ({
    date: r.log_date,
    weight: parseFloat(r.weight_kg),
  }));

  const calByDay: Record<string, number> = {};
  for (const log of foodRows) {
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
