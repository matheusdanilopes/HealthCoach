import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { insertInto } from '@/lib/db';
import { aiErrorResponse, AIParseError, generateJSON } from '@/lib/ai';
import { buildCoachSnapshot, type CoachGoal } from '@/lib/coach-data';
import type { TrainingLocation } from '@/lib/training';
import {
  GOALS,
  LOCATIONS,
  PLAN_SYSTEM,
  activatePlan,
  buildPlanPrompt,
  getExerciseHistory,
  getTrainingProfile,
  listPlans,
  normalizePlan,
} from '@/lib/training-data';

export const maxDuration = 180;

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ plans: await listPlans(session.user.id) });
}

// Generates a weekly plan with AI and makes it the active one.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await req.json().catch(() => ({}));
    const goal = GOALS.includes(body?.goal) ? (body.goal as CoachGoal) : null;
    const location = LOCATIONS.includes(body?.location) ? (body.location as TrainingLocation) : null;
    if (!goal || !location) return NextResponse.json({ error: 'Selecione o objetivo e o local.' }, { status: 400 });
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 300) : '';

    const profile = await getTrainingProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: 'Salve seu perfil de treino antes de gerar o plano.' }, { status: 400 });
    }

    const [snapshot, history] = await Promise.all([buildCoachSnapshot(userId), getExerciseHistory(userId)]);

    let data: Record<string, unknown>;
    try {
      data = await generateJSON({
        label: 'training-plan',
        system: PLAN_SYSTEM,
        parts: [{ text: buildPlanPrompt({ snapshot, profile, history, goal, location, notes }) }],
        maxOutputTokens: 16000,
        temperature: 0.5,
        timeoutMs: 80_000,
        validate: (d) => Array.isArray(d.days) && d.days.length > 0,
      });
    } catch (err) {
      if (err instanceof AIParseError) {
        return NextResponse.json({ error: 'Não foi possível interpretar a resposta da IA. Tente novamente.' }, { status: 500 });
      }
      throw err;
    }

    const plan = normalizePlan(data, profile.sessionMinutes);
    if (plan.days.length === 0) {
      return NextResponse.json({ error: 'A IA não retornou um plano válido. Tente novamente.' }, { status: 500 });
    }

    // Saved inactive first, then activated, so a failure here never leaves
    // the user without the plan they already had.
    let row: { id: string } | undefined;
    try {
      [row] = await insertInto<{ id: string }>('workout_plans', {
        user_id: userId,
        name: plan.name,
        goal,
        location,
        days_per_week: profile.daysPerWeek,
        session_minutes: profile.sessionMinutes,
        overview: plan.overview,
        schedule: plan.schedule,
        progression: plan.progression,
        safety: JSON.stringify(plan.safety),
        days: JSON.stringify(plan.days),
        is_active: false,
      }, { returning: 'id' });
    } catch (err) {
      console.error('[training-plan] insert failed:', err instanceof Error ? err.message : err);
    }
    if (!row) {
      return NextResponse.json({ error: 'Não foi possível salvar o plano.' }, { status: 500 });
    }

    const active = await activatePlan(userId, row.id);
    return NextResponse.json({ plan: active, plans: await listPlans(userId) });
  } catch (err) {
    return aiErrorResponse(err, 'training-plan', 'Erro ao gerar o plano de treino. Tente novamente.');
  }
}
