import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import MarmitasClient from './MarmitasClient';

export default async function MarmitasPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const userId = session.user.id;

  const { data: profileData } = await supabase
    .from('users')
    .select('name, target_calories, protein_goal, carbs_goal, fat_goal')
    .eq('id', userId)
    .single();

  return (
    <MarmitasClient
      targetCalories={profileData?.target_calories ?? 2000}
      proteinGoal={profileData?.protein_goal ?? null}
      carbsGoal={profileData?.carbs_goal ?? null}
      fatGoal={profileData?.fat_goal ?? null}
    />
  );
}
