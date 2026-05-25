import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

const SELECT_FIELDS =
  'id, input_type, raw_text, image_url, parsed_json, total_calories, total_protein, total_carbs, total_fat, created_at';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('meal_history')
    .select(SELECT_FIELDS)
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { input_type, raw_text, image_url, parsed_json, total_calories, total_protein, total_carbs, total_fat } =
    body;

  const { data, error } = await supabase
    .from('meal_history')
    .insert({
      user_id: session.user.id,
      input_type,
      raw_text: raw_text ?? null,
      image_url: image_url ?? null,
      parsed_json,
      total_calories,
      total_protein: total_protein ?? null,
      total_carbs: total_carbs ?? null,
      total_fat: total_fat ?? null,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
