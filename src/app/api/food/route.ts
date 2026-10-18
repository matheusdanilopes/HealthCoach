import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto, sql, updateWhere } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { detectBeverage } from '@/lib/beverages';

const FOOD_FIELDS = 'id, food_name, meal_type, calories, protein, carbs, fat, hydration_ml, hydration_source, hydration_confidence, created_at';

function resolveHydration(
  foodName: string,
  hydrationMl: number | undefined | null,
  hydrationSource: string | undefined | null,
  hydrationConfidence: string | undefined | null,
) {
  // Client-supplied value takes priority (user may have edited in UI)
  if (typeof hydrationMl === 'number' && hydrationMl >= 0) {
    return {
      hydration_ml: Math.min(Math.round(hydrationMl), 5000),
      hydration_source: hydrationSource ?? 'meal',
      hydration_confidence: hydrationConfidence ?? 'medium',
    };
  }
  // Fall back to local heuristic detection
  const detected = detectBeverage(foodName);
  if (detected.isBeverage && detected.estimatedMl > 0) {
    return {
      hydration_ml: detected.estimatedMl,
      hydration_source: 'meal' as const,
      hydration_confidence: detected.confidence,
    };
  }
  return { hydration_ml: 0, hydration_source: null, hydration_confidence: null };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    food_name, meal_type, calories, protein, carbs, fat, log_date,
    hydration_ml, hydration_source, hydration_confidence,
  } = await req.json();
  const date = log_date ?? brazilToday();

  const hydration = resolveHydration(food_name, hydration_ml, hydration_source, hydration_confidence);

  const baseInsert = {
    user_id: session.user.id,
    food_name,
    meal_type,
    calories,
    protein: protein ?? null,
    carbs: carbs ?? null,
    fat: fat ?? null,
    log_date: date,
  };

  try {
    const [row] = await insertInto('food_logs', { ...baseInsert, ...hydration }, { returning: FOOD_FIELDS });
    return NextResponse.json({ ...row, user_id: session.user.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    id, meal_type, food_name, calories, protein, carbs, fat,
    hydration_ml, hydration_source, hydration_confidence,
  } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const hydration = resolveHydration(food_name, hydration_ml, hydration_source, hydration_confidence);

  const baseUpdate: Record<string, unknown> = {
    food_name,
    calories,
    protein: protein ?? null,
    carbs: carbs ?? null,
    fat: fat ?? null,
  };
  if (meal_type) baseUpdate.meal_type = meal_type;

  try {
    const [row] = await updateWhere(
      'food_logs',
      { ...baseUpdate, ...hydration },
      { id, user_id: session.user.id },
      { returning: FOOD_FIELDS },
    );
    if (!row) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });
    return NextResponse.json({ ...row, user_id: session.user.id });
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

  await sql`DELETE FROM food_logs WHERE id = ${id} AND user_id = ${session.user.id}`;

  return NextResponse.json({ ok: true });
}
