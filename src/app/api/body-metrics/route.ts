import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('body_metrics')
    .select('*')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { date, weight, muscle_mass, body_fat, visceral_fat } = body;

  const today = new Date().toISOString().split('T')[0];
  if (!date || date > today) {
    return NextResponse.json({ error: 'Data inválida ou futura' }, { status: 400 });
  }
  if (!weight || weight <= 0 || weight >= 500) {
    return NextResponse.json({ error: 'Peso inválido' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('body_metrics')
    .upsert(
      {
        user_id: session.user.id,
        date,
        weight,
        muscle_mass: muscle_mass ?? null,
        body_fat: body_fat ?? null,
        visceral_fat: visceral_fat ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: latest } = await supabase
    .from('body_metrics')
    .select('date')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (latest?.date === date) {
    await supabase
      .from('users')
      .update({ current_weight: weight, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);
  }

  return NextResponse.json(data);
}
