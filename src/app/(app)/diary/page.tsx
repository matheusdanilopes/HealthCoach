import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { sql } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DiaryClient from './DiaryClient';
import type { FoodLog } from '@/types';

export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const today = todayISO();
  const userId = session.user.id;

  const [profileRows, foodRows] = await Promise.all([
    sql<{ target_calories: number }>`SELECT target_calories FROM users WHERE id = ${userId}`,
    sql<FoodLog>`
      SELECT id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at
      FROM food_logs WHERE user_id = ${userId} AND log_date = ${today}
      ORDER BY created_at
    `,
  ]);

  return (
    <DiaryClient
      userId={userId}
      initialLogs={foodRows}
      targetCalories={profileRows[0]?.target_calories ?? 2000}
    />
  );
}
