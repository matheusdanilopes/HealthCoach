import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? brazilToday();

  const data = await sql`
    SELECT id, amount_ml, created_at FROM water_logs
    WHERE user_id = ${session.user.id} AND log_date = ${date}
    ORDER BY created_at ASC
  `;

  const totalMl = data.reduce((s: number, r) => s + r.amount_ml, 0);
  return NextResponse.json({ logs: data, totalMl });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount_ml, log_date, created_at } = await req.json();
  const date = log_date ?? brazilToday();

  const insertData: Record<string, unknown> = { user_id: session.user.id, amount_ml, log_date: date };
  if (created_at) insertData.created_at = created_at;

  try {
    const [data] = await insertInto('water_logs', insertData, { returning: 'id, amount_ml, created_at' });
    return NextResponse.json({ ok: true, log: data });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  try {
    await sql`DELETE FROM water_logs WHERE id = ${id} AND user_id = ${session.user.id}`;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
