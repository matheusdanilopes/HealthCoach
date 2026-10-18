import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql, updateWhere } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { calculateStepsCalories } from '@/lib/calculations';

// Prefix that identifies a day's steps entry in food_logs (one per day).
const STEPS_PREFIX = '👣 Passos';

function parseSteps(value: unknown): number | null {
  const steps = Number(value);
  return Number.isInteger(steps) && steps > 0 && steps <= 200_000 ? steps : null;
}

async function computeForUser(userId: string, steps: number) {
  const [[profile], [bodyMetrics]] = await Promise.all([
    sql`SELECT current_weight, sex, height_cm FROM users WHERE id = ${userId}`,
    sql`SELECT weight FROM body_metrics WHERE user_id = ${userId} ORDER BY date DESC LIMIT 1`,
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

  let existing;
  try {
    existing = await sql`
      SELECT id FROM food_logs
      WHERE user_id = ${userId} AND log_date = ${date} AND food_name LIKE ${`${STEPS_PREFIX}%`}
      ORDER BY created_at ASC
    `;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  const [keep, ...extras] = existing;

  let row;
  try {
    [row] = keep
      ? await updateWhere('food_logs', fields, { id: keep.id, user_id: userId }, { returning: '*' })
      : await insertInto('food_logs', { ...fields, user_id: userId, log_date: date }, { returning: '*' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  // Clean up duplicates left by entries saved before the one-per-day rule.
  const removedIds = extras.map((e) => e.id as string);
  if (removedIds.length) {
    await sql`DELETE FROM food_logs WHERE id = ANY(${removedIds}::uuid[]) AND user_id = ${userId}`;
  }

  return NextResponse.json({ log: row, removedIds, replaced: Boolean(keep) });
}
