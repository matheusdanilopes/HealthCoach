import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { todayISO } from '@/lib/utils';
import DiaryClient from './DiaryClient';

export default async function DiaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const today = todayISO();
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd = `${today}T23:59:59.999Z`;

  const [profileRes, foodLogsRes] = await Promise.all([
    supabase.from('profiles').select('id, target_calories').eq('id', user.id).single(),
    supabase
      .from('food_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .order('created_at'),
  ]);

  return (
    <DiaryClient
      userId={user.id}
      initialLogs={foodLogsRes.data ?? []}
      targetCalories={profileRes.data?.target_calories ?? 2000}
    />
  );
}
