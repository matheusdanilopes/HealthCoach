import { supabase } from '@/lib/db';
import { brazilToday, brazilNDaysAgo } from '@/lib/timezone';
import { getMealLabel } from '@/lib/utils';

// Behavioral snapshot used by the Coach screen. Everything here is computed
// from the user's own logs, without AI: the page shows it as a preview and
// the analyze route sends it to the model only when the user asks.

export type CoachGoal = 'emagrecimento' | 'ganho_muscular' | 'recomposicao';

export const COACH_GOAL_LABEL: Record<CoachGoal, string> = {
  emagrecimento:  'Perder peso (redução de gordura)',
  ganho_muscular: 'Ganhar massa muscular',
  recomposicao:   'Recomposição corporal (perder gordura e ganhar músculo)',
};

export const COACH_PERIOD_DAYS = 30;

export interface CoachSnapshot {
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  suggestedGoal: CoachGoal;
  profile: {
    firstName: string;
    sex: 'male' | 'female' | null;
    age: number | null;
    heightCm: number | null;
    activityLevel: string | null;
    tdee: number | null;
    targetCalories: number | null;
    targetProtein: number | null;
    targetWater: number;
  };
  nutrition: {
    daysLogged: number;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    daysOnTarget: number;
    daysOverTarget: number;
    daysUnderTarget: number;
    proteinHitDays: number;
    weekdayAvgCalories: number | null;
    weekendAvgCalories: number | null;
    breakfastSkipDays: number;
    caloriesByMeal: { meal: string; share: number }[];
    topFoodsByCalories: { name: string; calories: number; times: number }[];
    mostFrequentFoods: { name: string; times: number }[];
    longestGapDays: number;
    currentStreak: number;
  };
  training: {
    sessions: number;
    activeDays: number;
    perWeek: number;
    avgBurned: number;
    daysSinceLast: number | null;
    types: { name: string; times: number }[];
  };
  hydration: {
    daysLogged: number;
    avgMl: number;
    daysOnTarget: number;
  };
  body: {
    latestWeight: number | null;
    weightEntries: number;
    weightChange: number | null;
    weightChangeDays: number | null;
    weeklyRate: number | null;
    bodyFat: { first: number; last: number; firstDate: string; lastDate: string } | null;
    muscleMass: { first: number; last: number; firstDate: string; lastDate: string } | null;
    waist: { first: number; last: number; firstDate: string; lastDate: string } | null;
  };
}

interface FoodRow {
  food_name: string;
  meal_type: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  hydration_ml?: number | null;
  log_date: string;
}

const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

const dayDiff = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T12:00:00') - Date.parse(from + 'T12:00:00')) / 86_400_000);

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function inferGoal(tdee: number | null, target: number | null): CoachGoal {
  if (tdee && target) {
    if (target > tdee * 1.03) return 'ganho_muscular';
    if (target >= tdee * 0.93) return 'recomposicao';
  }
  return 'emagrecimento';
}

function firstLast<T extends { date: string }>(rows: T[], pick: (r: T) => number | null) {
  const valid = rows
    .map((r) => ({ date: r.date, value: pick(r) }))
    .filter((r): r is { date: string; value: number } => r.value != null && Number.isFinite(r.value));
  if (valid.length < 1) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  return { first: round(first.value, 1), last: round(last.value, 1), firstDate: first.date, lastDate: last.date };
}

export async function buildCoachSnapshot(userId: string): Promise<CoachSnapshot> {
  const today = brazilToday();
  // Today is still in progress, so the analysis window ends yesterday.
  const periodEnd = brazilNDaysAgo(1, today);
  const periodStart = brazilNDaysAgo(COACH_PERIOD_DAYS, today);
  const bodyStart = brazilNDaysAgo(90, today);

  const [
    { data: profile },
    { data: foodData },
    { data: waterData },
    { data: weightLogs },
    { data: metrics },
    { data: measurements },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, sex, birth_date, height_cm, activity_level, tdee, target_calories, target_protein_g, target_water_ml, current_weight')
      .eq('id', userId)
      .single(),
    supabase
      .from('food_logs')
      .select('food_name, meal_type, calories, protein, carbs, fat, hydration_ml, log_date')
      .eq('user_id', userId)
      .gte('log_date', periodStart)
      .lte('log_date', periodEnd)
      .limit(5000),
    supabase
      .from('water_logs')
      .select('amount_ml, log_date')
      .eq('user_id', userId)
      .gte('log_date', periodStart)
      .lte('log_date', periodEnd)
      .limit(5000),
    supabase
      .from('weight_logs')
      .select('weight_kg, log_date')
      .eq('user_id', userId)
      .gte('log_date', bodyStart)
      .order('log_date'),
    supabase
      .from('body_metrics')
      .select('date, weight, body_fat, muscle_mass')
      .eq('user_id', userId)
      .gte('date', bodyStart)
      .order('date'),
    supabase
      .from('body_measurements')
      .select('date, waist')
      .eq('user_id', userId)
      .gte('date', bodyStart)
      .order('date'),
  ]);

  // ── Profile ──
  const tdee = profile?.tdee != null ? Number(profile.tdee) : null;
  const targetCalories = profile?.target_calories != null ? Number(profile.target_calories) : null;
  const targetProtein = Number(profile?.target_protein_g ?? 0) ||
    (targetCalories ? Math.round((targetCalories * 0.3) / 4) : null);
  const targetWater = Number(profile?.target_water_ml ?? 0) || 2500;
  const age = profile?.birth_date
    ? Math.floor((Date.now() - Date.parse(profile.birth_date + 'T12:00:00')) / (365.25 * 86_400_000))
    : null;

  // ── Nutrition ──
  const rows = (foodData as FoodRow[] | null) ?? [];
  const meals = rows.filter((r) => r.calories > 0);
  const workouts = rows.filter((r) => r.calories < 0);

  const byDay = new Map<string, { cal: number; prot: number; carbs: number; fat: number; meals: Set<string> }>();
  for (const r of meals) {
    const d = byDay.get(r.log_date) ?? { cal: 0, prot: 0, carbs: 0, fat: 0, meals: new Set<string>() };
    d.cal += r.calories;
    d.prot += Number(r.protein ?? 0);
    d.carbs += Number(r.carbs ?? 0);
    d.fat += Number(r.fat ?? 0);
    if (r.meal_type) d.meals.add(r.meal_type);
    byDay.set(r.log_date, d);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dayValues = days.map(([, v]) => v);

  const isWeekend = (date: string) => {
    const dow = new Date(date + 'T12:00:00').getDay();
    return dow === 0 || dow === 6;
  };
  const weekdayCals = days.filter(([d]) => !isWeekend(d)).map(([, v]) => v.cal);
  const weekendCals = days.filter(([d]) => isWeekend(d)).map(([, v]) => v.cal);

  const totalMealCal = meals.reduce((s, r) => s + r.calories, 0);
  const calByMeal = new Map<string, number>();
  for (const r of meals) {
    const key = r.meal_type ?? 'other';
    calByMeal.set(key, (calByMeal.get(key) ?? 0) + r.calories);
  }

  const foods = new Map<string, { name: string; calories: number; times: number }>();
  for (const r of meals) {
    const key = normalizeName(r.food_name);
    const f = foods.get(key) ?? { name: r.food_name.trim(), calories: 0, times: 0 };
    f.calories += r.calories;
    f.times += 1;
    foods.set(key, f);
  }

  let longestGapDays = 0;
  for (let i = 1; i < days.length; i++) {
    longestGapDays = Math.max(longestGapDays, dayDiff(days[i - 1][0], days[i][0]) - 1);
  }
  let currentStreak = 0;
  for (let i = 0; i < COACH_PERIOD_DAYS; i++) {
    if (!byDay.has(brazilNDaysAgo(i + 1, today))) break;
    currentStreak++;
  }

  // ── Training ──
  const trainingDays = new Set(workouts.map((w) => w.log_date));
  const lastTraining = [...trainingDays].sort().at(-1);
  const types = new Map<string, number>();
  for (const w of workouts) {
    // Workouts are saved as "<emoji> <tipo> · <N>min"; group by type only.
    const key = w.food_name.replace(/\s*·\s*\d+\s*min\s*$/i, '').trim() || 'Treino';
    types.set(key, (types.get(key) ?? 0) + 1);
  }

  // ── Hydration (manual water + water from drinks/meals) ──
  const waterByDay = new Map<string, number>();
  for (const w of (waterData as { amount_ml: number; log_date: string }[] | null) ?? []) {
    waterByDay.set(w.log_date, (waterByDay.get(w.log_date) ?? 0) + w.amount_ml);
  }
  for (const r of rows) {
    if (r.calories >= 0 && r.hydration_ml) {
      waterByDay.set(r.log_date, (waterByDay.get(r.log_date) ?? 0) + Number(r.hydration_ml));
    }
  }
  const waterValues = [...waterByDay.values()];

  // ── Body ──
  const weightByDate = new Map<string, number>();
  for (const w of (weightLogs as { weight_kg: number; log_date: string }[] | null) ?? []) {
    weightByDate.set(w.log_date, Number(w.weight_kg));
  }
  const metricRows = (metrics as { date: string; weight: number | null; body_fat: number | null; muscle_mass: number | null }[] | null) ?? [];
  for (const m of metricRows) {
    if (m.weight != null) weightByDate.set(m.date, Number(m.weight));
  }
  const weights = [...weightByDate.entries()].sort(([a], [b]) => a.localeCompare(b));
  const firstWeight = weights[0];
  const lastWeight = weights.at(-1);
  const weightChangeDays = firstWeight && lastWeight ? dayDiff(firstWeight[0], lastWeight[0]) : null;
  const weightChange = firstWeight && lastWeight && weights.length > 1 ? round(lastWeight[1] - firstWeight[1], 1) : null;
  const weeklyRate = weightChange != null && weightChangeDays && weightChangeDays >= 7
    ? round((weightChange / weightChangeDays) * 7, 2)
    : null;

  const nutritionTarget = targetCalories ?? 0;

  return {
    periodDays: COACH_PERIOD_DAYS,
    periodStart,
    periodEnd,
    suggestedGoal: inferGoal(tdee, targetCalories),
    profile: {
      firstName: profile?.full_name?.split(' ')[0] ?? 'Usuário',
      sex: (profile?.sex as 'male' | 'female' | null) ?? null,
      age,
      heightCm: profile?.height_cm != null ? Number(profile.height_cm) : null,
      activityLevel: profile?.activity_level ?? null,
      tdee,
      targetCalories,
      targetProtein,
      targetWater,
    },
    nutrition: {
      daysLogged: days.length,
      avgCalories: Math.round(avg(dayValues.map((d) => d.cal))),
      avgProtein: Math.round(avg(dayValues.map((d) => d.prot))),
      avgCarbs: Math.round(avg(dayValues.map((d) => d.carbs))),
      avgFat: Math.round(avg(dayValues.map((d) => d.fat))),
      daysOnTarget: nutritionTarget
        ? dayValues.filter((d) => Math.abs(d.cal - nutritionTarget) <= nutritionTarget * 0.1).length
        : 0,
      daysOverTarget: nutritionTarget ? dayValues.filter((d) => d.cal > nutritionTarget * 1.1).length : 0,
      daysUnderTarget: nutritionTarget ? dayValues.filter((d) => d.cal < nutritionTarget * 0.9).length : 0,
      proteinHitDays: targetProtein ? dayValues.filter((d) => d.prot >= targetProtein * 0.9).length : 0,
      weekdayAvgCalories: weekdayCals.length ? Math.round(avg(weekdayCals)) : null,
      weekendAvgCalories: weekendCals.length ? Math.round(avg(weekendCals)) : null,
      breakfastSkipDays: dayValues.filter((d) => !d.meals.has('breakfast')).length,
      caloriesByMeal: [...calByMeal.entries()]
        .map(([meal, cal]) => ({ meal: getMealLabel(meal), share: totalMealCal ? Math.round((cal / totalMealCal) * 100) : 0 }))
        .sort((a, b) => b.share - a.share),
      topFoodsByCalories: [...foods.values()]
        .sort((a, b) => b.calories - a.calories)
        .slice(0, 8)
        .map((f) => ({ name: f.name, calories: Math.round(f.calories), times: f.times })),
      mostFrequentFoods: [...foods.values()]
        .sort((a, b) => b.times - a.times)
        .slice(0, 8)
        .map((f) => ({ name: f.name, times: f.times })),
      longestGapDays,
      currentStreak,
    },
    training: {
      sessions: workouts.length,
      activeDays: trainingDays.size,
      perWeek: round((trainingDays.size / COACH_PERIOD_DAYS) * 7, 1),
      avgBurned: workouts.length
        ? Math.round(Math.abs(workouts.reduce((s, w) => s + w.calories, 0)) / workouts.length)
        : 0,
      daysSinceLast: lastTraining ? dayDiff(lastTraining, today) : null,
      types: [...types.entries()]
        .map(([name, times]) => ({ name, times }))
        .sort((a, b) => b.times - a.times)
        .slice(0, 6),
    },
    hydration: {
      daysLogged: waterValues.length,
      avgMl: Math.round(avg(waterValues)),
      daysOnTarget: waterValues.filter((v) => v >= targetWater).length,
    },
    body: {
      latestWeight: lastWeight?.[1] ?? (profile?.current_weight != null ? Number(profile.current_weight) : null),
      weightEntries: weights.length,
      weightChange,
      weightChangeDays,
      weeklyRate,
      bodyFat: firstLast(metricRows, (r) => (r.body_fat != null ? Number(r.body_fat) : null)),
      muscleMass: firstLast(metricRows, (r) => (r.muscle_mass != null ? Number(r.muscle_mass) : null)),
      waist: firstLast(
        (measurements as { date: string; waist: number | null }[] | null) ?? [],
        (r) => (r.waist != null ? Number(r.waist) : null)
      ),
    },
  };
}

// Compact text version of the snapshot for the AI prompt.
export function snapshotToPrompt(s: CoachSnapshot, goal: CoachGoal): string {
  const p = s.profile;
  const n = s.nutrition;
  const t = s.training;
  const h = s.hydration;
  const b = s.body;
  const pct = (v: number, total: number) => (total ? `${Math.round((v / total) * 100)}%` : '0%');
  const delta = (x: { first: number; last: number; firstDate: string; lastDate: string } | null, unit: string) =>
    x
      ? x.firstDate === x.lastDate
        ? `${x.last}${unit} (${x.lastDate}, medição única)`
        : `${x.first}${unit} (${x.firstDate}) → ${x.last}${unit} (${x.lastDate})`
      : 'sem registros';

  const lines = [
    `OBJETIVO ESCOLHIDO PELO USUÁRIO: ${COACH_GOAL_LABEL[goal]}`,
    `PERÍODO ANALISADO: ${s.periodStart} a ${s.periodEnd} (${s.periodDays} dias; composição corporal: últimos 90 dias)`,
    '',
    'PERFIL:',
    `- Nome: ${p.firstName} | Sexo: ${p.sex === 'male' ? 'masculino' : p.sex === 'female' ? 'feminino' : 'não informado'} | Idade: ${p.age ?? '?'} | Altura: ${p.heightCm ?? '?'}cm`,
    `- Nível de atividade declarado: ${p.activityLevel ?? '?'} | TDEE estimado: ${p.tdee ?? '?'}kcal`,
    `- Metas: ${p.targetCalories ?? '?'}kcal | ${p.targetProtein ?? '?'}g proteína | ${p.targetWater}ml água`,
    '',
    'ALIMENTAÇÃO:',
    `- Dias com registro: ${n.daysLogged}/${s.periodDays} | Sequência atual: ${n.currentStreak} dias | Maior intervalo sem registrar: ${n.longestGapDays} dias`,
    `- Média nos dias registrados: ${n.avgCalories}kcal | ${n.avgProtein}g prot | ${n.avgCarbs}g carb | ${n.avgFat}g gord`,
    `- Calorias vs meta (±10%): dentro ${n.daysOnTarget} | acima ${n.daysOverTarget} | abaixo ${n.daysUnderTarget} dias`,
    `- Proteína ≥90% da meta: ${n.proteinHitDays}/${n.daysLogged} dias`,
    `- Média dias úteis: ${n.weekdayAvgCalories ?? '—'}kcal | fins de semana: ${n.weekendAvgCalories ?? '—'}kcal`,
    `- Dias registrados sem café da manhã: ${n.breakfastSkipDays}/${n.daysLogged}`,
    `- Distribuição de calorias por refeição: ${n.caloriesByMeal.map((m) => `${m.meal} ${m.share}%`).join(', ') || '—'}`,
    `- Alimentos que mais somaram calorias: ${n.topFoodsByCalories.map((f) => `${f.name} (${f.calories}kcal em ${f.times}x)`).join('; ') || '—'}`,
    `- Alimentos mais frequentes: ${n.mostFrequentFoods.map((f) => `${f.name} (${f.times}x)`).join('; ') || '—'}`,
    '',
    'TREINOS:',
    `- Sessões: ${t.sessions} em ${t.activeDays} dias (${t.perWeek}/semana) | Gasto médio/sessão: ${t.avgBurned}kcal`,
    `- Último treino: ${t.daysSinceLast == null ? 'nenhum registrado' : t.daysSinceLast === 0 ? 'hoje' : `há ${t.daysSinceLast} dias`}`,
    `- Tipos: ${t.types.map((x) => `${x.name} (${x.times}x)`).join('; ') || '—'}`,
    '',
    'HIDRATAÇÃO:',
    `- Dias com registro: ${h.daysLogged} | Média: ${h.avgMl}ml/dia | Meta atingida: ${h.daysOnTarget} dias (${pct(h.daysOnTarget, h.daysLogged)})`,
    '',
    'CORPO:',
    `- Peso atual: ${b.latestWeight ?? '?'}kg | Pesagens (90d): ${b.weightEntries}`,
    `- Variação de peso: ${b.weightChange != null ? `${b.weightChange > 0 ? '+' : ''}${b.weightChange}kg em ${b.weightChangeDays} dias` : 'dados insuficientes'}${b.weeklyRate != null ? ` (${b.weeklyRate > 0 ? '+' : ''}${b.weeklyRate}kg/semana)` : ''}`,
    `- Gordura corporal: ${delta(b.bodyFat, '%')}`,
    `- Massa muscular: ${delta(b.muscleMass, 'kg')}`,
    `- Cintura: ${delta(b.waist, 'cm')}`,
  ];
  return lines.join('\n');
}
