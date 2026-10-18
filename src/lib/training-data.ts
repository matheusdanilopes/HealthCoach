import { sql } from '@/lib/db';
import { brazilNDaysAgo } from '@/lib/timezone';
import { COACH_GOAL_LABEL, type CoachGoal, type CoachSnapshot } from '@/lib/coach-data';
import {
  EXPERIENCE_OPTS,
  HOME_EQUIPMENT_OPTS,
  LOCATION_LABEL,
  formatKg,
  formatSets,
  type ExerciseHistory,
  type LoggedSet,
  type PlanDay,
  type PlanExercise,
  type TrainingExperience,
  type TrainingLocation,
  type TrainingProfile,
  type WorkoutPlan,
  type WorkoutPlanSummary,
  type WorkoutSessionSummary,
} from '@/lib/training';

export const GOALS: CoachGoal[] = ['emagrecimento', 'ganho_muscular', 'recomposicao'];
export const LOCATIONS: TrainingLocation[] = ['casa', 'academia'];
const EXPERIENCES: TrainingExperience[] = ['iniciante', 'intermediario', 'avancado'];

const PLAN_FIELDS = 'id, name, goal, location, days_per_week, session_minutes, overview, schedule, progression, safety, days, is_active, created_at';
const PLAN_SUMMARY_FIELDS = 'id, name, goal, location, days_per_week, is_active, created_at';

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

const numOrNull = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// ── Profile ──

export function parseTrainingProfile(body: Record<string, unknown>): TrainingProfile {
  const allowed = new Set(HOME_EQUIPMENT_OPTS.map((o) => o.value));
  return {
    experience: EXPERIENCES.includes(body.experience as TrainingExperience)
      ? (body.experience as TrainingExperience)
      : 'iniciante',
    daysPerWeek: clampInt(body.daysPerWeek, 2, 6, 3),
    sessionMinutes: clampInt(body.sessionMinutes, 20, 120, 50),
    homeEquipment: Array.isArray(body.homeEquipment)
      ? [...new Set(body.homeEquipment.filter((e): e is string => typeof e === 'string' && allowed.has(e)))]
      : [],
    limitations: typeof body.limitations === 'string' ? body.limitations.trim().slice(0, 500) : '',
  };
}

export async function getTrainingProfile(userId: string): Promise<TrainingProfile | null> {
  const [data] = await sql`
    SELECT experience, days_per_week, session_minutes, home_equipment, limitations
    FROM training_profiles WHERE user_id = ${userId}
  `.catch(() => []);
  if (!data) return null;
  return {
    experience: data.experience,
    daysPerWeek: data.days_per_week,
    sessionMinutes: data.session_minutes,
    homeEquipment: data.home_equipment ?? [],
    limitations: data.limitations ?? '',
  };
}

// ── Plans ──

interface PlanRow {
  id: string;
  name: string;
  goal: CoachGoal;
  location: TrainingLocation;
  days_per_week: number;
  session_minutes: number;
  overview: string | null;
  schedule: string | null;
  progression: string | null;
  safety: string[] | null;
  days: PlanDay[] | null;
  is_active: boolean;
  created_at: string;
}

function rowToPlan(r: PlanRow): WorkoutPlan {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    location: r.location,
    daysPerWeek: r.days_per_week,
    sessionMinutes: r.session_minutes,
    overview: r.overview ?? '',
    schedule: r.schedule ?? '',
    progression: r.progression ?? '',
    safety: r.safety ?? [],
    days: r.days ?? [],
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function rowToSummary(r: Pick<PlanRow, 'id' | 'name' | 'goal' | 'location' | 'days_per_week' | 'is_active' | 'created_at'>): WorkoutPlanSummary {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal,
    location: r.location,
    daysPerWeek: r.days_per_week,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

export async function getActivePlan(userId: string): Promise<WorkoutPlan | null> {
  const [data] = await sql
    .query(`SELECT ${PLAN_FIELDS} FROM workout_plans WHERE user_id = $1 AND is_active`, [userId])
    .catch(() => []);
  return data ? rowToPlan(data as PlanRow) : null;
}

export async function listPlans(userId: string): Promise<WorkoutPlanSummary[]> {
  const data = await sql
    .query(
      `SELECT ${PLAN_SUMMARY_FIELDS} FROM workout_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    )
    .catch(() => []);
  return (data as PlanRow[]).map(rowToSummary);
}

// Makes `planId` the only active plan. The partial unique index allows one
// active plan per user, so the others are switched off first (same transaction).
export async function activatePlan(userId: string, planId: string): Promise<WorkoutPlan | null> {
  const [, rows] = await sql.transaction([
    sql`
      UPDATE workout_plans SET is_active = false
      WHERE user_id = ${userId} AND is_active AND id <> ${planId}
        AND EXISTS (SELECT 1 FROM workout_plans WHERE id = ${planId} AND user_id = ${userId})
    `,
    sql.query(
      `UPDATE workout_plans SET is_active = true WHERE id = $1 AND user_id = $2 RETURNING ${PLAN_FIELDS}`,
      [planId, userId],
    ),
  ]);
  const data = rows[0];
  return data ? rowToPlan(data as PlanRow) : null;
}

// ── Sessions and sets ──

interface SetRow {
  exercise_key: string;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  seconds: number | null;
  load_kg: number | string | null;
  session_id: string;
  created_at: string;
}

const toLoggedSet = (s: Pick<SetRow, 'set_number' | 'reps' | 'seconds' | 'load_kg'>): LoggedSet => ({
  setNumber: s.set_number,
  reps: s.reps,
  seconds: s.seconds,
  loadKg: numOrNull(s.load_kg),
});

export async function getRecentSessions(userId: string, limit = 15): Promise<WorkoutSessionSummary[]> {
  const data = await sql`
    SELECT s.id, s.day_label, s.session_date, s.duration_min, s.rpe, s.calories, s.created_at,
      COALESCE((
        SELECT json_agg(json_build_object(
          'exercise_name', w.exercise_name, 'exercise_order', w.exercise_order, 'set_number', w.set_number,
          'reps', w.reps, 'seconds', w.seconds, 'load_kg', w.load_kg
        ))
        FROM workout_sets w WHERE w.session_id = s.id
      ), '[]'::json) AS workout_sets
    FROM workout_sessions s
    WHERE s.user_id = ${userId}
    ORDER BY s.session_date DESC, s.created_at DESC
    LIMIT ${limit}
  `.catch(() => []);

  return data.map((s) => {
    const sets = ((s.workout_sets ?? []) as (Omit<SetRow, 'exercise_key' | 'session_id' | 'created_at'> & { exercise_order: number })[])
      .slice()
      .sort((a, b) => a.exercise_order - b.exercise_order || a.set_number - b.set_number);
    const exercises: { name: string; sets: LoggedSet[] }[] = [];
    for (const set of sets) {
      let ex = exercises.find((e) => e.name === set.exercise_name);
      if (!ex) exercises.push((ex = { name: set.exercise_name, sets: [] }));
      ex.sets.push(toLoggedSet(set));
    }
    return {
      id: s.id,
      dayLabel: s.day_label,
      sessionDate: s.session_date,
      durationMin: s.duration_min,
      rpe: s.rpe,
      calories: s.calories,
      exercises,
    };
  });
}

/** Last logged sets per exercise (keyed by `exerciseKey`), last 180 days. */
export async function getExerciseHistory(userId: string): Promise<Record<string, ExerciseHistory>> {
  const since = brazilNDaysAgo(180);
  const data = await sql`
    SELECT w.exercise_key, w.exercise_name, w.set_number, w.reps, w.seconds, w.load_kg,
           w.session_id, w.created_at, s.session_date
    FROM workout_sets w
    JOIN workout_sessions s ON s.id = w.session_id
    WHERE w.user_id = ${userId} AND s.session_date >= ${since}
    ORDER BY w.created_at DESC
    LIMIT 3000
  `.catch(() => []);

  const history: Record<string, ExerciseHistory & { sessionIds: Set<string>; lastSession: string }> = {};
  for (const row of data as (SetRow & { session_date: string })[]) {
    let h = history[row.exercise_key];
    if (!h) {
      h = history[row.exercise_key] = {
        name: row.exercise_name,
        lastDate: row.session_date,
        sets: [],
        bestLoadKg: null,
        sessions: 0,
        sessionIds: new Set(),
        lastSession: row.session_id,
      };
    }
    h.sessionIds.add(row.session_id);
    const load = numOrNull(row.load_kg);
    if (load != null && load > 0) h.bestLoadKg = Math.max(h.bestLoadKg ?? 0, load);
    if (row.session_id === h.lastSession) h.sets.push(toLoggedSet(row));
  }

  const result: Record<string, ExerciseHistory> = {};
  for (const [key, h] of Object.entries(history)) {
    result[key] = {
      name: h.name,
      lastDate: h.lastDate,
      sets: h.sets.sort((a, b) => a.setNumber - b.setNumber),
      bestLoadKg: h.bestLoadKg,
      sessions: h.sessionIds.size,
    };
  }
  return result;
}

// ── AI prompt ──

export const PLAN_SYSTEM = `Você é um personal trainer experiente, com formação em educação física e foco em segurança, técnica e progressão. Monte um PLANO SEMANAL de treino personalizado a partir dos dados do usuário.

PRINCÍPIOS:
- Respeite o local: academia (máquinas, barras, halteres, polias) ou casa (SOMENTE o peso corporal e os equipamentos listados; nunca peça equipamento que o usuário não tem).
- Respeite o nível: iniciante = exercícios simples e estáveis, volume baixo (10–12 séries por grupo/semana), RPE 6–7; intermediário = 12–16 séries, RPE 7–8; avançado = 14–20 séries, RPE 8–9.
- Respeite LIMITAÇÕES E LESÕES: evite exercícios que agravem a região citada e ofereça alternativas seguras. Nunca dê diagnóstico ou tratamento.
- Divisão conforme os dias por semana: 2–3 dias = corpo inteiro; 4 dias = superior/inferior; 5–6 dias = empurrar/puxar/pernas ou divisão equivalente. Crie de 2 a 4 sessões distintas (A, B, C, D) e explique no campo schedule como distribuí-las nos dias da semana, com descanso entre grupos musculares.
- Cada sessão deve caber no tempo informado (aquecimento + exercícios + descanso + desaquecimento).
- Adapte ao objetivo: perder peso = força para preservar massa magra + densidade (descansos menores, circuitos ou cardio no fim); ganhar massa = força progressiva, 6–12 repetições, descansos de 60–120s; recomposição = força consistente com volume moderado e um pouco de condicionamento.
- Use o HISTÓRICO DE CARGAS: quando um exercício do histórico continuar no plano, mantenha EXATAMENTE o mesmo nome para a progressão funcionar e oriente a carga a partir do que o usuário já fez.
- Exercícios com nomes comuns em português do Brasil (ex.: Agachamento livre, Supino reto com halteres, Remada baixa na polia, Prancha).
- Explicação de execução clara, em passos curtos e práticos, como um professor ensinando ao lado.

Responda SOMENTE com JSON válido, sem markdown, neste formato:
{
  "name": "nome curto do plano, ex.: Corpo inteiro 3x — Força e definição",
  "overview": "2 a 3 frases explicando a lógica do plano para o objetivo",
  "schedule": "como distribuir na semana, ex.: Seg A · Qua B · Sex A (alterne A/B a cada semana)",
  "progression": "regra de progressão clara, ex.: quando fizer o topo da faixa em todas as séries, aumente 1–2,5kg",
  "safety": ["cuidado importante", "..."],
  "days": [
    {
      "label": "Treino A",
      "focus": "ex.: Corpo inteiro — ênfase em pernas",
      "durationMin": 50,
      "warmup": ["5 min de bicicleta leve", "..."],
      "exercises": [
        {
          "name": "Agachamento com halteres",
          "muscles": "Quadríceps, glúteos",
          "equipment": "Halteres",
          "sets": 3,
          "reps": "8-12",
          "timed": false,
          "restSeconds": 90,
          "load": "orientação de carga, ex.: escolha uma carga em que as 2 últimas repetições sejam difíceis (RPE 7)",
          "howTo": ["passo 1", "passo 2", "passo 3"],
          "mistakes": ["erro comum"],
          "easier": "variação mais fácil",
          "harder": "variação mais difícil"
        }
      ],
      "cooldown": ["alongamento de posteriores 30s", "..."]
    }
  ]
}

REGRAS DO FORMATO:
- reps: faixa de repetições ("8-12") ou, se timed=true, faixa de segundos ("30-45") — só números e hífen.
- sets 2–5, restSeconds 30–180, 4–8 exercícios por sessão, howTo 3–5 passos, mistakes 1–2, safety 2–4, warmup e cooldown 2–3 itens.
- Textos curtos e objetivos. Nunca use aspas duplas dentro dos textos.`;

export function buildPlanPrompt(opts: {
  snapshot: CoachSnapshot;
  profile: TrainingProfile;
  history: Record<string, ExerciseHistory>;
  goal: CoachGoal;
  location: TrainingLocation;
  notes: string;
}): string {
  const { snapshot: s, profile: tp, history, goal, location, notes } = opts;
  const p = s.profile;
  const b = s.body;
  const t = s.training;
  const level = EXPERIENCE_OPTS.find((o) => o.value === tp.experience);
  const equipment = tp.homeEquipment
    .map((v) => HOME_EQUIPMENT_OPTS.find((o) => o.value === v)?.label ?? v)
    .join(', ');

  const historyLines = Object.values(history)
    .sort((a, b2) => b2.lastDate.localeCompare(a.lastDate))
    .slice(0, 25)
    .map((h) => `- ${h.name}: última vez ${h.lastDate} → ${formatSets(h.sets)}${h.bestLoadKg ? ` | melhor carga ${formatKg(h.bestLoadKg)}kg` : ''} | ${h.sessions} sessões`);

  return [
    `OBJETIVO: ${COACH_GOAL_LABEL[goal]}`,
    `LOCAL: ${LOCATION_LABEL[location]}${location === 'casa' ? ` | Equipamentos: ${equipment || 'nenhum (apenas peso corporal)'}` : ''}`,
    `NÍVEL: ${level?.label ?? tp.experience} (${level?.desc ?? ''})`,
    `DISPONIBILIDADE: ${tp.daysPerWeek} dias por semana, ${tp.sessionMinutes} minutos por sessão`,
    `LIMITAÇÕES/LESÕES: ${tp.limitations || 'nenhuma informada'}`,
    notes ? `PEDIDO DO USUÁRIO: ${notes}` : '',
    '',
    'PERFIL:',
    `- Sexo: ${p.sex === 'male' ? 'masculino' : p.sex === 'female' ? 'feminino' : 'não informado'} | Idade: ${p.age ?? '?'} | Altura: ${p.heightCm ?? '?'}cm | Peso: ${b.latestWeight ?? '?'}kg`,
    `- Gordura corporal: ${b.bodyFat ? `${b.bodyFat.last}%` : '?'} | Massa muscular: ${b.muscleMass ? `${b.muscleMass.last}kg` : '?'}`,
    `- Variação de peso recente: ${b.weeklyRate != null ? `${b.weeklyRate > 0 ? '+' : ''}${b.weeklyRate}kg/semana` : 'sem dados'}`,
    '',
    `TREINOS NOS ÚLTIMOS ${s.periodDays} DIAS: ${t.activeDays} dias ativos (${t.perWeek}/semana) | Tipos: ${t.types.map((x) => `${x.name} (${x.times}x)`).join('; ') || 'nenhum'}`,
    '',
    'HISTÓRICO DE CARGAS (exercício: repetições por série × carga):',
    historyLines.length ? historyLines.join('\n') : '- sem registros de séries ainda',
  ].filter((l) => l !== '').join('\n');
}

// ── AI response normalization ──

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function strList(v: unknown, max: number, len = 200): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, max) : [];
}

function normalizeExercise(raw: Record<string, unknown>): PlanExercise | null {
  const name = str(raw.name, 80);
  if (!name) return null;
  const rawReps = typeof raw.reps === 'number' ? String(raw.reps) : str(raw.reps, 30);
  const timed = raw.timed === true || /\d+\s*s\b|seg/i.test(rawReps);
  // Keep only the range ("8 a 12 reps" → "8-12"); the UI parses it for progression.
  const nums = rawReps.match(/\d+/g) ?? [];
  const reps = nums.length >= 2 ? `${nums[0]}-${nums[1]}` : nums[0] ?? (timed ? '30-45' : '8-12');
  return {
    name,
    muscles: str(raw.muscles, 100),
    equipment: str(raw.equipment, 60),
    sets: clampInt(raw.sets, 1, 6, 3),
    reps,
    timed,
    restSeconds: clampInt(raw.restSeconds, 15, 300, 60),
    load: str(raw.load, 250),
    howTo: strList(raw.howTo, 6),
    mistakes: strList(raw.mistakes, 3),
    easier: str(raw.easier, 150),
    harder: str(raw.harder, 150),
  };
}

function normalizeDay(raw: Record<string, unknown>, index: number, minutes: number): PlanDay | null {
  const exercises = (Array.isArray(raw.exercises) ? raw.exercises : [])
    .map((e) => (e && typeof e === 'object' ? normalizeExercise(e as Record<string, unknown>) : null))
    .filter((e): e is PlanExercise => e !== null)
    .slice(0, 10);
  if (exercises.length === 0) return null;
  return {
    label: str(raw.label, 30) || `Treino ${String.fromCharCode(65 + index)}`,
    focus: str(raw.focus, 100),
    durationMin: clampInt(raw.durationMin, 15, 150, minutes),
    warmup: strList(raw.warmup, 4),
    exercises,
    cooldown: strList(raw.cooldown, 4),
  };
}

export function normalizePlan(data: Record<string, unknown>, minutes: number) {
  const days = (Array.isArray(data.days) ? data.days : [])
    .map((d, i) => (d && typeof d === 'object' ? normalizeDay(d as Record<string, unknown>, i, minutes) : null))
    .filter((d): d is PlanDay => d !== null)
    .slice(0, 6);
  return {
    name: str(data.name, 80) || 'Plano semanal',
    overview: str(data.overview, 600),
    schedule: str(data.schedule, 300),
    progression: str(data.progression, 400),
    safety: strList(data.safety, 4, 250),
    days,
  };
}

