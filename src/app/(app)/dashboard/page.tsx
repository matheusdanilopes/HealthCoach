import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DashboardClient from './DashboardClient';
import type { Profile, FoodLog } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = todayISO();
  const userId = session.user.id;

  const [profileRows, foodRows, waterRows, weightRows] = await Promise.all([
    sql<Profile & { id: string }>`SELECT * FROM users WHERE id = ${userId}`,
    sql<FoodLog>`
      SELECT id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at
      FROM food_logs WHERE user_id = ${userId} AND log_date = ${today}
      ORDER BY created_at
    `,
    sql<{ total: string }>`
      SELECT COALESCE(SUM(amount_ml), 0) AS total FROM water_logs
      WHERE user_id = ${userId} AND log_date = ${today}
    `,
    sql<{ weight_kg: string }>`
      SELECT weight_kg FROM weight_logs WHERE user_id = ${userId}
      ORDER BY log_date DESC LIMIT 1
    `,
  ]);

  const profile = profileRows[0] ?? null;
  const totalWater = parseInt(waterRows[0]?.total ?? '0', 10);
  const latestWeight = parseFloat(weightRows[0]?.weight_kg ?? String(profile?.current_weight ?? 0));

  return (
    <DashboardClient
      profile={profile}
      initialFoodLogs={foodRows}
      initialWater={totalWater}
      latestWeight={latestWeight}
      userId={userId}
    />
  );
}
