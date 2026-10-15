import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { calculateStepsCalories } from '@/lib/calculations';

// Prefix that identifies a day's steps entry in food_logs (one per day).
const STEPS_PREFIX = '👣 Passos';

function parseSteps(value: unknown): number | null {
  const steps = Number(value);
  return Number.isInteger(steps) && steps > 0 && steps <= 200_000 ? steps : null;
}

async function computeForUser(userId: string, steps: number) {
  const [{ data: profile }, { data: bodyMetrics }] = await Promise.all([
    supabase
      .from('users')
      .select('current_weight, sex, height_cm')
      .eq('id', userId)
      .single(),
    supabase
      .from('body_metrics')
      .select('weight')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const weight = bodyMetrics?.weight ?? profile?.current_weight ?? 75;
  const result = calculateStepsCalories(steps, weight, profile?.height_cm ?? null, profile?.sex ?? null);
  return { steps, weightKg: weight, ...result };
}

// Preview: calculate the kcal for a step count without saving.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const steps = parseSteps(body?.steps);
  if (!steps) return NextResponse.json({ error: 'Quantidade de passos inválida.' }, { status: 400 });

  return NextResponse.json(await computeForUser(session.user.id, steps));
}

// Save: the day's steps entry replaces any earlier one for the same date.
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const steps = parseSteps(body?.steps);
  if (!steps) return NextResponse.json({ error: 'Quantidade de passos inválida.' }, { status: 400 });
  const date = typeof body?.log_date === 'string' ? body.log_date : brazilToday();

  const { calories } = await computeForUser(userId, steps);
  if (calories <= 0) return NextResponse.json({ error: 'Passos insuficientes para gerar gasto.' }, { status: 400 });

  const fields = {
    food_name: `${STEPS_PREFIX} · ${steps.toLocaleString('pt-BR')}`,
    meal_type: 'snack',
    calories: -calories,
  };

  const { data: existing, error: findError } = await supabase
    .from('food_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('log_date', date)
    .like('food_name', `${STEPS_PREFIX}%`)
    .order('created_at', { ascending: true });
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });

  const [keep, ...extras] = existing ?? [];

  const { data: row, error } = keep
    ? await supabase
        .from('food_logs')
        .update(fields)
        .eq('id', keep.id)
        .eq('user_id', userId)
        .select('*')
        .single()
    : await supabase
        .from('food_logs')
        .insert({ ...fields, user_id: userId, log_date: date })
        .select('*')
        .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clean up duplicates left by entries saved before the one-per-day rule.
  const removedIds = extras.map((e) => e.id as string);
  if (removedIds.length) {
    await supabase.from('food_logs').delete().in('id', removedIds).eq('user_id', userId);
  }

  return NextResponse.json({ log: row, removedIds, replaced: Boolean(keep) });
}
