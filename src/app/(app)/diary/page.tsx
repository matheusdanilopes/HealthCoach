import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import DiaryClient from './DiaryClient';

export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const serverDate = brazilToday();

  const { data: profileData } = await supabase
    .from('users')
    .select('target_calories, target_water_ml')
    .eq('id', userId)
    .single();

  return (
    <DiaryClient
      userId={userId}
      serverDate={serverDate}
      targetCalories={profileData?.target_calories ?? 2000}
      targetWater={profileData?.target_water_ml ?? 2000}
    />
  );
}
