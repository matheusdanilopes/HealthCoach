import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { getLatestWeight } from '@/lib/weight';
import DashboardClient from './DashboardClient';
import type { Profile, FoodLog, WaterLogEntry } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = brazilToday();
  const userId = session.user.id;

  const [
    [profile],
    lastWeight,
    waterData,
    foodData,
  ] = await Promise.all([
    sql`SELECT * FROM users WHERE id = ${userId}`,
    getLatestWeight(userId),
    sql`
      SELECT amount_ml, created_at FROM water_logs
      WHERE user_id = ${userId} AND log_date = ${today}
      ORDER BY created_at
    `,
    sql`
      SELECT id, user_id, food_name, meal_type, calories, protein, carbs, fat,
             hydration_ml, hydration_source, hydration_confidence, created_at
      FROM food_logs
      WHERE user_id = ${userId} AND log_date = ${today}
      ORDER BY created_at
    `,
  ]);

  const latestWeight = lastWeight ?? (parseFloat(String((profile as Profile | null)?.current_weight ?? 0)) || 0);

  const initialWaterLogs = waterData as WaterLogEntry[];

  return (
    <DashboardClient
      profile={(profile as Profile & { id: string }) ?? null}
      serverDate={today}
      latestWeight={latestWeight}
      userId={userId}
      initialFoodLogs={foodData as FoodLog[]}
      initialWaterLogs={initialWaterLogs}
    />
  );
}
