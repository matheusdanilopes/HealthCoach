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
    .select('target_calories, target_protein_g, target_carbs_g, target_fat_g')
    .eq('id', userId)
    .single();

  return (
    <MarmitasClient
      targetCalories={profileData?.target_calories ?? 2000}
      proteinGoal={profileData?.target_protein_g ?? null}
      carbsGoal={profileData?.target_carbs_g ?? null}
      fatGoal={profileData?.target_fat_g ?? null}
    />
  );
}
