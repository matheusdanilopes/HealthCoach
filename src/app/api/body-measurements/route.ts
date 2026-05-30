import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

const FIELDS = [
  'waist','neck','hips','chest',
  'right_arm','left_arm',
  'right_thigh','left_thigh',
  'right_calf','left_calf',
] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('body_measurements')
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
  const today = new Date().toISOString().split('T')[0];

  if (!body.date || body.date > today) {
    return NextResponse.json({ error: 'Data inválida ou futura' }, { status: 400 });
  }

  const hasAtLeastOne = FIELDS.some((f) => body[f] != null && body[f] !== '');
  if (!hasAtLeastOne) {
    return NextResponse.json({ error: 'Informe ao menos uma medida' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    user_id: session.user.id,
    date: body.date,
    updated_at: new Date().toISOString(),
  };
  for (const f of FIELDS) {
    payload[f] = body[f] != null && body[f] !== '' ? Number(body[f]) : null;
  }

  const { data, error } = await supabase
    .from('body_measurements')
    .upsert(payload, { onConflict: 'user_id,date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
