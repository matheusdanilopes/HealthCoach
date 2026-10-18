import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql, updateWhere } from '@/lib/db';

const FIELDS = [
  'waist','neck','hips','chest',
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

  try {
    const [data] = await updateWhere('body_measurements', payload, { id, user_id: session.user.id }, { returning: '*' });
    if (!data) return NextResponse.json({ error: 'Medida não encontrada' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    await sql`DELETE FROM body_measurements WHERE id = ${id} AND user_id = ${session.user.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
