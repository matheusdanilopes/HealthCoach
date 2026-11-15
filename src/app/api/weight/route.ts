import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto } from '@/lib/db';
import { saveWeightAndRecalculateTargets } from '@/lib/energy-targets';
import { brazilToday } from '@/lib/timezone';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { weight_kg } = await req.json();
  const weight = Number(weight_kg);
  if (!Number.isFinite(weight) || weight <= 0 || weight >= 500) {
    return NextResponse.json({ error: 'Peso inválido' }, { status: 400 });
  }

  // Same table as the "Pesagem" screen. The upsert only touches weight, so a
  // quick log on a day that already has a Pesagem keeps its body composition.
  try {
    await insertInto(
      'body_metrics',
      {
        user_id: session.user.id,
        date: brazilToday(),
        weight,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  await saveWeightAndRecalculateTargets(session.user.id, weight);

  return NextResponse.json({ ok: true });
}
