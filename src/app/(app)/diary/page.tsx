import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import DiaryClient from './DiaryClient';

export default async function DiaryPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const serverDate = brazilToday();

  const [profileData] = await sql`SELECT target_calories, target_water_ml FROM users WHERE id = ${userId}`;

  return (
    <DiaryClient
      userId={userId}
      serverDate={serverDate}
      targetCalories={profileData?.target_calories ?? 2000}
      targetWater={profileData?.target_water_ml ?? 2000}
    />
  );
}
