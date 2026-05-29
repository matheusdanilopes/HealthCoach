import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? brazilToday();

  let { data: foodData, error: foodError } = await supabase
    .from('food_logs')
    .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, hydration_ml, hydration_source, hydration_confidence, created_at')
    .eq('user_id', session.user.id)
    .eq('log_date', date)
    .order('created_at');

  if (foodError) {
    // Migration not yet applied — fall back to legacy schema
    const { data: legacyFood } = await supabase
      .from('food_logs')
      .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
      .eq('user_id', session.user.id)
      .eq('log_date', date)
      .order('created_at');
    foodData = legacyFood as unknown as typeof foodData;
  }

  const [{ data: waterData }] = await Promise.all([
    supabase
      .from('water_logs')
      .select('id, amount_ml, created_at')
      .eq('user_id', session.user.id)
      .eq('log_date', date)
      .order('created_at'),
  ]);

  const waterLogs = (waterData ?? []) as { id: string; amount_ml: number; created_at: string }[];
  const totalWater = waterLogs.reduce((s, r) => s + r.amount_ml, 0);

  return NextResponse.json({ foodLogs: foodData ?? [], water: totalWater, waterLogs });
}
