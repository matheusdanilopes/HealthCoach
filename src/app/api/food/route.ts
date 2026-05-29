import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { detectBeverage } from '@/lib/beverages';

const FOOD_FIELDS = 'id, food_name, meal_type, calories, protein, carbs, fat, hydration_ml, hydration_source, hydration_confidence, created_at';
const FOOD_FIELDS_LEGACY = 'id, food_name, meal_type, calories, protein, carbs, fat, created_at';

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

  let { data: row, error } = await supabase
    .from('food_logs')
    .insert({ ...baseInsert, ...hydration })
    .select(FOOD_FIELDS)
    .single();

  if (error) {
    // Migration not yet applied — retry without hydration columns
    ({ data: row, error } = await supabase
      .from('food_logs')
      .insert(baseInsert)
      .select(FOOD_FIELDS_LEGACY)
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...row, user_id: session.user.id });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    id, food_name, calories, protein, carbs, fat,
    hydration_ml, hydration_source, hydration_confidence,
  } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const hydration = resolveHydration(food_name, hydration_ml, hydration_source, hydration_confidence);

  const baseUpdate = {
    food_name,
    calories,
    protein: protein ?? null,
    carbs: carbs ?? null,
    fat: fat ?? null,
  };

  let { data: row, error } = await supabase
    .from('food_logs')
    .update({ ...baseUpdate, ...hydration })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select(FOOD_FIELDS)
    .single();

  if (error) {
    // Migration not yet applied — retry without hydration columns
    ({ data: row, error } = await supabase
      .from('food_logs')
      .update(baseUpdate)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select(FOOD_FIELDS_LEGACY)
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...row, user_id: session.user.id });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  await supabase
    .from('food_logs')
    .delete()
    .eq('id', id)
    .eq('user_id', session.user.id);

  return NextResponse.json({ ok: true });
}
