import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const d = new Date();
  const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const date = searchParams.get('date') ?? localToday;

  const [{ data: foodData }, { data: waterData }] = await Promise.all([
    supabase
      .from('food_logs')
      .select('id, user_id, food_name, meal_type, calories, protein, carbs, fat, created_at')
      .eq('user_id', session.user.id)
      .eq('log_date', date)
      .order('created_at'),
    supabase
      .from('water_logs')
      .select('amount_ml')
      .eq('user_id', session.user.id)
      .eq('log_date', date),
  ]);

  const totalWater = (waterData ?? []).reduce(
    (sum: number, r: { amount_ml: number }) => sum + r.amount_ml,
    0
  );

  return NextResponse.json({ foodLogs: foodData ?? [], water: totalWater });
}
