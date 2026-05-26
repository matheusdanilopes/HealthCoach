import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';

const FIELDS = [
  'waist','abdomen','hips','chest',
  'right_arm','left_arm',
  'right_thigh','left_thigh',
  'right_calf','left_calf',
] as const;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const today = new Date().toISOString().split('T')[0];

  if (!body.date || body.date > today) {
    return NextResponse.json({ error: 'Data inválida ou futura' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    date: body.date,
    updated_at: new Date().toISOString(),
  };
  for (const f of FIELDS) {
    payload[f] = body[f] != null && body[f] !== '' ? Number(body[f]) : null;
  }

  const { data, error } = await supabase
    .from('body_measurements')
    .update(payload)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from('body_measurements')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
