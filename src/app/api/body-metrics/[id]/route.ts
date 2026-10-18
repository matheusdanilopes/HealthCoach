import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { sql } from '@/lib/db';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { date, weight, muscle_mass, body_fat, visceral_fat } = body;

  const today = new Date().toISOString().split('T')[0];
  if (!date || date > today) {
    return NextResponse.json({ error: 'Data inválida ou futura' }, { status: 400 });
  }
  if (!weight || weight <= 0 || weight >= 500) {
    return NextResponse.json({ error: 'Peso inválido' }, { status: 400 });
  }

  try {
    const [data] = await sql`
      UPDATE body_metrics SET
        date = ${date},
        weight = ${weight},
        muscle_mass = ${muscle_mass ?? null},
        body_fat = ${body_fat ?? null},
        visceral_fat = ${visceral_fat ?? null},
        updated_at = ${new Date().toISOString()}
      WHERE id = ${id} AND user_id = ${session.user.id}
      RETURNING *
    `;
    if (!data) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
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
    await sql`DELETE FROM body_metrics WHERE id = ${id} AND user_id = ${session.user.id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
