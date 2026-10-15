import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { calculateStepsCalories } from '@/lib/calculations';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const steps = Number(body?.steps);
  if (!Number.isInteger(steps) || steps <= 0 || steps > 200_000) {
    return NextResponse.json({ error: 'Quantidade de passos inválida.' }, { status: 400 });
  }

  const [{ data: profile }, { data: bodyMetrics }] = await Promise.all([
    supabase
      .from('users')
      .select('current_weight, sex, height_cm')
      .eq('id', session.user.id)
      .single(),
    supabase
      .from('body_metrics')
      .select('weight')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const weight = bodyMetrics?.weight ?? profile?.current_weight ?? 75;
  const result = calculateStepsCalories(steps, weight, profile?.height_cm ?? null, profile?.sex ?? null);

  return NextResponse.json({ steps, weightKg: weight, ...result });
}
