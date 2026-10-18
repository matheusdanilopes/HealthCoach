import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await sql`SELECT * FROM body_metrics WHERE user_id = ${session.user.id} ORDER BY date DESC`;
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
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

  let data;
  try {
    [data] = await insertInto(
      'body_metrics',
      {
        user_id: session.user.id,
        date,
        weight,
        muscle_mass: muscle_mass ?? null,
        body_fat: body_fat ?? null,
        visceral_fat: visceral_fat ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date', returning: '*' }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const [latest] = await sql`
    SELECT date FROM body_metrics WHERE user_id = ${session.user.id} ORDER BY date DESC LIMIT 1
  `;

  if (latest?.date === date) {
    await sql`
      UPDATE users SET current_weight = ${weight}, updated_at = ${new Date().toISOString()}
      WHERE id = ${session.user.id}
    `;
  }

  return NextResponse.json(data);
}
