import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import MealLogClient from './MealLogClient';
import type { MealHistoryItem } from '@/types';

export default async function MealLogPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { data } = await supabase
    .from('meal_history')
    .select(
      'id, input_type, raw_text, image_url, parsed_json, total_calories, total_protein, total_carbs, total_fat, created_at'
    )
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  return <MealLogClient initialHistory={(data as MealHistoryItem[]) ?? []} />;
}
