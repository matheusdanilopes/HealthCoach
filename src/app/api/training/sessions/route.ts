import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { brazilToday } from '@/lib/timezone';
import { exerciseKey, type WorkoutSessionSummary } from '@/lib/training';
import { getExerciseHistory, getRecentSessions } from '@/lib/training-data';

const MAX_EXERCISES = 15;
const MAX_SETS = 10;

const intOrNull = (v: unknown, min: number, max: number) => {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// Strength-training METs (ACSM): light 3.5, moderate 5.0, vigorous 6.0.
function strengthMet(rpe: number | null): number {
  if (rpe == null) return 5.0;
  if (rpe >= 8) return 6.0;
  if (rpe <= 4) return 3.5;
  return 5.0;
}

async function latestWeight(userId: string): Promise<number> {
  const [{ data: log }, { data: user }] = await Promise.all([
    supabase.from('weight_logs').select('weight_kg').eq('user_id', userId).order('log_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('users').select('current_weight').eq('id', userId).maybeSingle(),
  ]);
  const w = Number(log?.weight_kg ?? user?.current_weight);
  return Number.isFinite(w) && w > 0 ? w : 70;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [sessions, history] = await Promise.all([
    getRecentSessions(session.user.id),
    getExerciseHistory(session.user.id),
  ]);
  return NextResponse.json({ sessions, history });
}

// Logs a finished workout: the session, one row per set, and the calorie
// burn as a diary workout entry (negative calories) like the other workouts.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const dayLabel = typeof body?.dayLabel === 'string' ? body.dayLabel.trim().slice(0, 120) : '';
  const requestedPlanId = typeof body?.planId === 'string' ? body.planId : null;
  const durationMin = intOrNull(body?.durationMin, 1, 300);
  const rpe = intOrNull(body?.rpe, 1, 10);

  const exercises = (Array.isArray(body?.exercises) ? body.exercises : [])
    .slice(0, MAX_EXERCISES)
    .map((e: Record<string, unknown>) => ({
      name: typeof e?.name === 'string' ? e.name.trim().slice(0, 80) : '',
      sets: (Array.isArray(e?.sets) ? e.sets : []).slice(0, MAX_SETS).map((s: Record<string, unknown>) => ({
        reps: intOrNull(s?.reps, 0, 200),
        seconds: intOrNull(s?.seconds, 0, 3600),
        loadKg: s?.loadKg == null || s.loadKg === '' ? null : Math.min(Math.max(Number(s.loadKg) || 0, 0), 1000),
      })).filter((s: { reps: number | null; seconds: number | null }) => s.reps != null || s.seconds != null),
    }))
    .filter((e: { name: string; sets: unknown[] }) => e.name && e.sets.length > 0) as {
      name: string;
      sets: { reps: number | null; seconds: number | null; loadKg: number | null }[];
    }[];

  if (!dayLabel || !durationMin) return NextResponse.json({ error: 'Informe a duração do treino.' }, { status: 400 });
  if (exercises.length === 0) return NextResponse.json({ error: 'Marque pelo menos uma série feita.' }, { status: 400 });

  const sessionDate = brazilToday();
  // The plan may have been deleted mid-workout; the session is kept anyway.
  const [weight, { data: planRow }] = await Promise.all([
    latestWeight(userId),
    requestedPlanId
      ? supabase.from('workout_plans').select('id').eq('id', requestedPlanId).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const planId: string | null = planRow?.id ?? null;
  const calories = Math.min(Math.round(strengthMet(rpe) * weight * (durationMin / 60)), 5000);

  const { data: foodLog, error: foodError } = await supabase
    .from('food_logs')
    .insert({
      user_id: userId,
      food_name: `🏋️ Musculação · ${durationMin}min`,
      meal_type: 'snack',
      calories: -calories,
      log_date: sessionDate,
    })
    .select('id')
    .single();
  if (foodError || !foodLog) {
    console.error('[training-session] food log insert failed:', foodError?.message);
    return NextResponse.json({ error: 'Não foi possível salvar o treino.' }, { status: 500 });
  }

  const { data: row, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: userId,
      plan_id: planId,
      day_label: dayLabel,
      session_date: sessionDate,
      duration_min: durationMin,
      rpe,
      calories,
      food_log_id: foodLog.id,
    })
    .select('id')
    .single();

  const setRows = row
    ? exercises.flatMap((e, order) =>
        e.sets.map((s, i) => ({
          session_id: row.id,
          user_id: userId,
          exercise_key: exerciseKey(e.name),
          exercise_name: e.name,
          exercise_order: order,
          set_number: i + 1,
          reps: s.reps,
          seconds: s.seconds,
          load_kg: s.loadKg,
        }))
      )
    : [];
  const setsError = row ? (await supabase.from('workout_sets').insert(setRows)).error : null;

  if (error || !row || setsError) {
    console.error('[training-session] save failed:', error?.message ?? setsError?.message);
    // Undo the partial save so a retry doesn't double-count the workout.
    if (row) await supabase.from('workout_sessions').delete().eq('id', row.id);
    await supabase.from('food_logs').delete().eq('id', foodLog.id);
    return NextResponse.json({ error: 'Não foi possível salvar o treino.' }, { status: 500 });
  }

  const summary: WorkoutSessionSummary = {
    id: row.id,
    dayLabel,
    sessionDate,
    durationMin,
    rpe,
    calories,
    exercises: exercises.map((e) => ({
      name: e.name,
      sets: e.sets.map((s, i) => ({ setNumber: i + 1, ...s })),
    })),
  };
  return NextResponse.json({ session: summary, history: await getExerciseHistory(userId) });
}
