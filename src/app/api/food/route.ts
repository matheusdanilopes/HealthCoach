import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { food_name, meal_type, calories, protein, carbs, fat, log_date } = await req.json();
  const today = new Date().toISOString().split('T')[0];
  const date = log_date ?? today;

  const { data: row, error } = await supabase
    .from('food_logs')
    .insert({
      user_id: session.user.id,
      food_name,
      meal_type,
      calories,
      protein: protein ?? null,
      carbs: carbs ?? null,
      fat: fat ?? null,
      log_date: date,
    })
    .select('id, food_name, meal_type, calories, protein, carbs, fat, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...row, user_id: session.user.id });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await supabase
    .from('food_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  return NextResponse.json({ ok: true });
}
