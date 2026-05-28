import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { todayISO } from '@/lib/utils';
import DiaryClient from './DiaryClient';

export default async function DiaryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;
  const serverDate = todayISO();

  const { data: profileData } = await supabase
    .from('users')
    .select('target_calories')
    .eq('id', userId)
    .single();

  return (
    <DiaryClient
      userId={userId}
      serverDate={serverDate}
      targetCalories={profileData?.target_calories ?? 2000}
    />
  );
}
