import { supabase } from '@/lib/db';
import { brazilToday, brazilNDaysAgo } from '@/lib/timezone';

export type ChatIntent =
  | 'food_logging'
  | 'hydration_analysis'
  | 'nutrition_analysis'
  | 'weight_analysis'
  | 'training_analysis'
  | 'correlation_analysis'
  | 'general_coaching';

function norm(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function detectIntent(message: string): ChatIntent {
  const t = norm(message);

  // Food logging: past tense eating verbs + food mention
  const atePast = /\b(comi|tomei|almocei|jantei|lancei|bebi|registr[ao]|adicion[ao]|acabei de comer|botei|boti|coloquei|comi um|comi uma|tive)\b/.test(t);
  const hasFood = /\b(ovo|ovos|frango|arroz|feijao|pao|fruta|carne|peixe|salada|suco|cafe|leite|iogurte|banana|batata|macarrao|queijo|requeijao|proteina em po|shake|atum|maca|laranja|uva|manga|brocolis|alface|tomate|cenoura|azeite|manteiga|chocolate|biscoito|bolacha|tapioca|crepioca|sanduiche|pizza|hamburguer|whey|caseina|presunto|salame|milho|pamonha|abacate|morcela|linguica|calabresa|mortadela|peito de peru|omelete|vitamina|smoothie|granola|aveia|grao de bico|lentilha|ervilha|beterraba|abbobora)\b/.test(t);
  const hasMacro = /\bkcal\b|\bgramas\b/.test(t);
  if (atePast && (hasFood || hasMacro)) return 'food_logging';

  // Correlation: "por que" + negative progress pattern
  if (/\bpor que\b|\bporque\b/.test(t)) {
    if (/\bnao (estou|to|ta|consigo|emagrec|perdendo|baixando|caindo|progredindo|funciona)\b|\bparei de emagrecer\b|\bnao funciona\b|\bnao ta (dando resultado|funcionando)\b/.test(t)) {
      return 'correlation_analysis';
    }
  }
  if (/\b(analise completa|tudo sobre mim|visao geral|resumao|diagnostico completo|relatorio)\b/.test(t)) {
    return 'correlation_analysis';
  }

  // Weight analysis
  if (/\b(emagrecer|perder peso|emagrecimento|engordei|engordando|perdi peso|ganhei peso)\b/.test(t)) return 'weight_analysis';
  if (/\bpeso\b/.test(t) && /\b(nao cai|nao ta|como (esta|ta)|evoluindo|tendencia|historico|perdi|ganhei|variou|mudou|atual|estou)\b/.test(t)) return 'weight_analysis';
  if (/\b(gordura corporal|% de gordura|massa gorda|composicao corporal|imc|percentual de gordura|massa muscular|gordura|muscular)\b/.test(t) && /\b(como (esta|ta)|analise|historico|minha|meu)\b/.test(t)) return 'weight_analysis';

  // Hydration analysis
  if (/\bhidrat\w+\b/.test(t)) return 'hydration_analysis';
  if (/\b(ingestao de agua|consumo de agua|como (esta|ta) (minha |a )?agua|quanta agua)\b/.test(t)) return 'hydration_analysis';
  if (/\bagua\b/.test(t) && /\b(como (esta|ta)|suficiente|analise|media|historico|tendencia|bastante|pouca|consumindo|bebendo|suficiente)\b/.test(t)) return 'hydration_analysis';

  // Training analysis
  if (/\b(treinos?|exercicios?|academia|musculacao|cardio|atividade fisica|ginastica)\b/.test(t) && /\b(como (estao|ta|esta)|analise|historico|frequencia|consistencia|evolucao|quanto|estou|meus)\b/.test(t)) return 'training_analysis';

  // Nutrition analysis
  if (/\b(proteina|macros?|nutricao|deficit|superavit)\b/.test(t) && /\b(como (estou|esta|ta)|suficiente|analise|historico|media|consumindo|ingestao|meu|minha)\b/.test(t)) return 'nutrition_analysis';
  if (/\bdieta\b/.test(t) && /\b(como (esta|ta)|analise|historico|minha)\b/.test(t)) return 'nutrition_analysis';
  if (/\bcalorias?\b/.test(t) && /\b(media|historico|nos ultimos|tendencia|analise|consumindo)\b/.test(t)) return 'nutrition_analysis';

  return 'general_coaching';
}

interface FoodLogRow {
  food_name: string;
  meal_type: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  hydration_ml: number | null;
}

interface WaterLogRow {
  amount_ml: number;
  log_date: string;
}

interface WeightLogRow {
  weight_kg: number;
  log_date: string;
}

interface BodyMetricRow {
  date: string;
  weight: number | null;
  muscle_mass: number | null;
  body_fat: number | null;
}

interface WorkoutLogRow {
  calories: number;
  log_date: string;
}

interface NutritionLogRow {
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  log_date: string;
}

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Café', morning_snack: 'Lanche manhã', lunch: 'Almoço',
  afternoon_snack: 'Lanche tarde', dinner: 'Jantar', supper: 'Ceia',
  pre_workout: 'Pré-treino', post_workout: 'Pós-treino', other: 'Outro',
};

export async function buildDynamicContext(userId: string, intent: ChatIntent): Promise<string> {
  const today = brazilToday();
  const sevenDaysAgo  = brazilNDaysAgo(7, today);
  const thirtyDaysAgo = brazilNDaysAgo(30, today);

  const needsHydration = intent === 'hydration_analysis' || intent === 'correlation_analysis';
  const needsNutrition = intent === 'nutrition_analysis' || intent === 'correlation_analysis';
  const needsWeight    = intent === 'weight_analysis'    || intent === 'correlation_analysis';
  const needsTraining  = intent === 'training_analysis'  || intent === 'correlation_analysis';
  const needsMeals     = intent === 'food_logging'       || intent === 'general_coaching';

  // Phase 1: always fetch profile + today's summary
  const [{ data: profileData }, { data: todayLogsData }, { data: todayWaterData }] = await Promise.all([
    supabase
      .from('users')
      .select('full_name, current_weight, target_calories, target_protein_g, target_water_ml, tdee')
      .eq('id', userId)
      .single(),
    supabase
      .from('food_logs')
      .select('food_name, meal_type, calories, protein, carbs, fat, hydration_ml')
      .eq('user_id', userId)
      .eq('log_date', today),
    supabase
      .from('water_logs')
      .select('amount_ml')
      .eq('user_id', userId)
      .eq('log_date', today),
  ]);

  const targetCal   = profileData?.target_calories ?? 0;
  const targetProt  = Number(profileData?.target_protein_g ?? 0) ||
                      (targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0);
  const targetWater = profileData?.target_water_ml ?? 2500;
  const tdee        = profileData?.tdee ?? 0;
  const firstName   = profileData?.full_name?.split(' ')[0] ?? 'Usuário';

  let goal = 'manutenção';
  if (tdee > 0 && targetCal > 0) {
    if (targetCal < tdee * 0.93)      goal = 'emagrecimento';
    else if (targetCal > tdee * 1.03) goal = 'ganho de massa';
  }

  const allLogs    = (todayLogsData as FoodLogRow[] | null) ?? [];
  const todayFood  = allLogs.filter(l => l.calories > 0);
  const todayCal   = todayFood.reduce((s, l) => s + l.calories, 0);
  const todayProt  = Math.round(todayFood.reduce((s, l) => s + (l.protein ?? 0), 0));
  const todayCarbs = Math.round(todayFood.reduce((s, l) => s + (l.carbs ?? 0), 0));
  const todayFat   = Math.round(todayFood.reduce((s, l) => s + (l.fat ?? 0), 0));
  const workoutKcal = Math.abs(allLogs.filter(l => l.calories < 0).reduce((s, l) => s + l.calories, 0));
  const manualWater = ((todayWaterData as WaterLogRow[] | null) ?? []).reduce((s, l) => s + l.amount_ml, 0);
  // Include zero-calorie beverages (diet sodas etc.) in hydration
  const foodWater   = allLogs.filter(l => l.calories >= 0).reduce((s, l) => s + (l.hydration_ml ?? 0), 0);
  const todayWater  = manualWater + foodWater;

  const remainCal  = targetCal - todayCal + workoutKcal;
  const remainProt = Math.max(0, targetProt - todayProt);
  const waterPct   = targetWater > 0 ? Math.round((todayWater / targetWater) * 100) : 0;

  let ctx = `PERFIL: ${firstName} | Peso: ${profileData?.current_weight ?? '?'}kg | Objetivo: ${goal}
META DIÁRIA: ${targetCal}kcal | Proteína: ${targetProt}g | Água: ${targetWater}ml
HOJE: ${todayCal}kcal | ${todayProt}g prot | ${todayCarbs}g carbs | ${todayFat}g gord${workoutKcal > 0 ? ` | ${workoutKcal}kcal queimadas` : ''}
RESTANTE: ${remainCal}kcal | ${remainProt}g prot
ÁGUA HOJE: ${todayWater}ml/${targetWater}ml (${waterPct}%)`;

  // Phase 2: domain-specific fetches in parallel
  const [hydData, nutData, wgtData, trnData] = await Promise.all([
    needsHydration ? fetchHydration(userId, today, sevenDaysAgo, thirtyDaysAgo, targetWater) : null,
    needsNutrition ? fetchNutrition(userId, today, thirtyDaysAgo) : null,
    needsWeight    ? fetchWeight(userId, profileData?.current_weight, thirtyDaysAgo) : null,
    needsTraining  ? fetchTraining(userId, today, thirtyDaysAgo) : null,
  ]);

  if (hydData) ctx += `\n\nHIDRATAÇÃO (histórico):\n${hydData}`;
  if (nutData) ctx += `\n\nNUTRIÇÃO (30d):\n${nutData}`;
  if (wgtData) ctx += `\n\nPESO E COMPOSIÇÃO:\n${wgtData}`;
  if (trnData) ctx += `\n\nTREINOS (30d):\n${trnData}`;

  if (needsMeals && todayFood.length > 0) {
    const lines = todayFood
      .map(l => `  • ${MEAL_LABEL[l.meal_type ?? ''] ?? 'Refeição'}: ${l.food_name} — ${l.calories}kcal${l.protein ? ` ${Math.round(l.protein)}g prot` : ''}`)
      .join('\n');
    ctx += `\n\nREFEIÇÕES HOJE:\n${lines}`;
  }

  return ctx;
}

async function fetchHydration(
  userId: string,
  today: string,
  sevenDaysAgo: string,
  thirtyDaysAgo: string,
  targetWater: number,
): Promise<string> {
  const [{ data: w7 }, { data: w30 }] = await Promise.all([
    supabase.from('water_logs').select('amount_ml, log_date')
      .eq('user_id', userId).gte('log_date', sevenDaysAgo).lt('log_date', today),
    supabase.from('water_logs').select('amount_ml, log_date')
      .eq('user_id', userId).gte('log_date', thirtyDaysAgo).lt('log_date', today),
  ]);

  const avg7   = avgWaterByDay((w7 as WaterLogRow[] | null) ?? []);
  const avg30  = avgWaterByDay((w30 as WaterLogRow[] | null) ?? []);
  const grp30  = groupWaterByDate((w30 as WaterLogRow[] | null) ?? []);
  const dates30 = Object.keys(grp30);
  const metGoal = dates30.filter(d => grp30[d] >= targetWater).length;

  return `→ Média 7d: ${avg7}ml | Média 30d: ${avg30}ml | Meta: ${targetWater}ml
→ Meta atingida (30d): ${metGoal}/${dates30.length} dias (${dates30.length > 0 ? Math.round(metGoal / dates30.length * 100) : 0}%)`;
}

async function fetchNutrition(userId: string, today: string, thirtyDaysAgo: string): Promise<string> {
  const { data: hist } = await supabase.from('food_logs')
    .select('calories, protein, carbs, fat, log_date')
    .eq('user_id', userId)
    .gte('log_date', thirtyDaysAgo)
    .lt('log_date', today);

  const food = ((hist as NutritionLogRow[] | null) ?? []).filter(l => l.calories > 0);
  const byDate: Record<string, { cal: number; prot: number; carbs: number; fat: number }> = {};
  for (const l of food) {
    if (!byDate[l.log_date]) byDate[l.log_date] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
    byDate[l.log_date].cal   += l.calories;
    byDate[l.log_date].prot  += l.protein ?? 0;
    byDate[l.log_date].carbs += l.carbs ?? 0;
    byDate[l.log_date].fat   += l.fat ?? 0;
  }
  const dates = Object.keys(byDate);
  const vals  = Object.values(byDate);
  const n     = dates.length;

  let streak = 0;
  const cur = new Date(today + 'T12:00:00');
  cur.setDate(cur.getDate() - 1);
  while (byDate[cur.toISOString().split('T')[0]]) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }

  const avgCal   = n > 0 ? Math.round(vals.reduce((s, v) => s + v.cal,   0) / n) : 0;
  const avgProt  = n > 0 ? Math.round(vals.reduce((s, v) => s + v.prot,  0) / n) : 0;
  const avgCarbs = n > 0 ? Math.round(vals.reduce((s, v) => s + v.carbs, 0) / n) : 0;
  const avgFat   = n > 0 ? Math.round(vals.reduce((s, v) => s + v.fat,   0) / n) : 0;

  return `→ Média: ${avgCal}kcal | Proteína: ${avgProt}g | Carbs: ${avgCarbs}g | Gordura: ${avgFat}g
→ Dias registrados: ${n}/30 (${Math.round(n / 30 * 100)}%) | Streak: ${streak} dias`;
}

async function fetchWeight(
  userId: string,
  currentWeight: number | null | undefined,
  thirtyDaysAgo: string,
): Promise<string> {
  const [{ data: wLogs }, { data: bm }] = await Promise.all([
    supabase.from('weight_logs').select('weight_kg, log_date')
      .eq('user_id', userId).gte('log_date', thirtyDaysAgo).order('log_date', { ascending: true }),
    supabase.from('body_metrics').select('date, weight, muscle_mass, body_fat')
      .eq('user_id', userId).order('date', { ascending: false }).limit(2),
  ]);

  const logs   = (wLogs as WeightLogRow[] | null) ?? [];
  const latest = logs[logs.length - 1]?.weight_kg ?? currentWeight;
  const oldest = logs[0]?.weight_kg;
  const diff   = latest && oldest && String(latest) !== String(oldest)
    ? (Number(latest) - Number(oldest)).toFixed(1) : null;
  const latestBM = ((bm as BodyMetricRow[] | null) ?? [])[0];

  return `→ Peso: ${latest ?? '?'}kg${diff ? ` (${Number(diff) > 0 ? '+' : ''}${diff}kg em 30d)` : ''}
→ Gordura corporal: ${latestBM?.body_fat != null ? `${Number(latestBM.body_fat).toFixed(1)}%` : 'não medida'}
→ Massa muscular: ${latestBM?.muscle_mass != null ? `${Number(latestBM.muscle_mass).toFixed(1)}kg` : 'não medida'}`;
}

async function fetchTraining(userId: string, today: string, thirtyDaysAgo: string): Promise<string> {
  const { data: wkLogs } = await supabase.from('food_logs')
    .select('calories, log_date')
    .eq('user_id', userId)
    .lt('calories', 0)
    .gte('log_date', thirtyDaysAgo)
    .lt('log_date', today);

  const logs       = (wkLogs as WorkoutLogRow[] | null) ?? [];
  const wkDays     = new Set(logs.map(w => w.log_date)).size;
  const totalBurned = Math.abs(logs.reduce((s, w) => s + w.calories, 0));
  const avgBurned  = wkDays > 0 ? Math.round(totalBurned / wkDays) : 0;
  const lastLog    = [...logs].sort((a, b) => b.log_date.localeCompare(a.log_date))[0];
  const daysAgo    = lastLog
    ? Math.floor((Date.parse(today + 'T12:00:00') - Date.parse(lastLog.log_date + 'T12:00:00')) / 86400000)
    : null;

  return `→ Frequência: ${wkDays} dias/30 (${Math.round(wkDays / 30 * 100)}% consistência)
→ Média queimada/treino: ${avgBurned > 0 ? `${avgBurned}kcal` : 'não registrado'}
→ Último treino: ${daysAgo !== null ? (daysAgo === 0 ? 'hoje' : `${daysAgo}d atrás`) : 'não registrado'}`;
}

function avgWaterByDay(logs: WaterLogRow[]): number {
  const m: Record<string, number> = {};
  for (const l of logs) m[l.log_date] = (m[l.log_date] ?? 0) + l.amount_ml;
  const dates = Object.keys(m);
  return dates.length > 0
    ? Math.round(dates.reduce((s, d) => s + m[d], 0) / dates.length)
    : 0;
}

function groupWaterByDate(logs: WaterLogRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const l of logs) m[l.log_date] = (m[l.log_date] ?? 0) + l.amount_ml;
  return m;
}
