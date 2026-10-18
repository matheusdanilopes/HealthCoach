import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weight_kg } = await req.json();
  const weight = Number(weight_kg);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
    return NextResponse.json({ error: 'Peso inválido' }, { status: 400 });
  }

  // created_at is refreshed so a re-log on the same day counts as the latest
  // entry when compared against the "Pesagem" records (see lib/weight).
  const now = new Date().toISOString();
  try {
    await insertInto(
      'weight_logs',
      {
        user_id: session.user.id,
        weight_kg: weight,
        log_date: brazilToday(),
        created_at: now,
      },
      { onConflict: 'user_id,log_date' }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  await sql`UPDATE users SET current_weight = ${weight}, updated_at = ${now} WHERE id = ${session.user.id}`;

  return NextResponse.json({ ok: true });
}
