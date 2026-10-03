import type { AIInsight } from '@/types';

// Deterministic analysis behind the AI insight card. Instead of handing the
// model raw totals (which it just echoes back), we detect concrete findings —
// patterns with real numbers — rank them, and let the model write about the
// most relevant one. Each finding also carries a ready-made fallback text so
// the card stays specific even when the AI fails.

type InsightType     = AIInsight['type'];
type InsightPriority = AIInsight['priority'];

export type UserGoal = 'emagrecimento' | 'ganho de massa' | 'manutenção';

export interface FoodLogRow {
  food_name:     string;
  meal_type:     string | null;
  calories:      number;
  protein:       number | null;
  carbs:         number | null;
  fat:           number | null;
  hydration_ml?: number | null;
  log_date:      string;
  created_at:    string;
}

export interface InsightInput {
  today:            string;
  hour:             number;
  now:              number;
  goal:             UserGoal;
  targetCal:        number;
  targetProt:       number;
  targetWater:      number;
  todayLogs:        FoodLogRow[];
  /** Last 30 days, today excluded. */
  historyLogs:      FoodLogRow[];
  todayManualWater: number;
  waterHistory:     { amount_ml: number; log_date: string }[];
  /** Ascending by date. */
  weights:          { date: string; kg: number }[];
  /** Ascending by date. */
  bodyMetrics:      { date: string; body_fat: number | null; muscle_mass: number | null }[];
  /** Latest first. */
  waist:            { date: string; cm: number }[];
}

export interface Finding {
  key:      string;
  type:     InsightType;
  priority: InsightPriority;
  /** 0-100 relevance used for ranking. */
  score:    number;
  /** What the data shows, with real numbers — sent to the model. */
  fact:     string;
  /** What the insight should explain/recommend and in which tone. */
  angle:    string;
  fallback: { title: string; message: string; nextSteps: string[] };
}

export const MEAL_LABEL: Record<string, string> = {
  breakfast:       'Café da manhã',
  morning_snack:   'Lanche da manhã',
  lunch:           'Almoço',
  afternoon_snack: 'Lanche da tarde',
  dinner:          'Jantar',
  supper:          'Ceia',
  pre_workout:     'Pré-treino',
  post_workout:    'Pós-treino',
  other:           'Livre / Outro',
  snack:           'Lanche',
};

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'] as const;

// Hour windows right before each main meal — a finding about that meal is
// more useful when the user can still act on it.
const MEAL_WINDOW: Record<string, [number, number]> = {
  breakfast: [5, 10],
  lunch:     [10, 13],
  dinner:    [16, 20],
};

const DOW_NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt   = (n: number) => Math.round(n).toLocaleString('pt-BR');
const fmt1  = (n: number, signed = false) =>
  `${signed && n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}`;
const pct   = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const dayIndex = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const dowOf    = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const shiftDay = (d: string, delta: number) => {
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
};

/** Share of the day's intake expected by this hour (07h → 0, 21h → 1). */
export function expectedPace(hour: number): number {
  return clamp((hour - 7) / 14, 0, 1);
}

interface DayAgg {
  cal: number; prot: number; carbs: number; fat: number;
  entries: number; burned: number; foodWater: number;
  meals: Record<string, { cal: number; prot: number }>;
}

function emptyDay(): DayAgg {
  return { cal: 0, prot: 0, carbs: 0, fat: 0, entries: 0, burned: 0, foodWater: 0, meals: {} };
}

function aggregateDays(logs: FoodLogRow[]): Record<string, DayAgg> {
  const days: Record<string, DayAgg> = {};
  for (const l of logs) {
    const d   = (days[l.log_date] ??= emptyDay());
    const cal = num(l.calories);
    if (cal < 0) { d.burned += -cal; continue; }
    d.foodWater += num(l.hydration_ml);
    if (cal === 0) continue;
    d.cal   += cal;
    d.prot  += num(l.protein);
    d.carbs += num(l.carbs);
    d.fat   += num(l.fat);
    d.entries++;
    const meal = l.meal_type || 'other';
    const m    = (d.meals[meal] ??= { cal: 0, prot: 0 });
    m.cal  += cal;
    m.prot += num(l.protein);
  }
  return days;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function normalizeFood(name: string) {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

interface FoodStat { name: string; count: number; cal: number; prot: number }

export interface InsightAnalysis {
  findings: Finding[];
  stats: {
    todayCal: number; todayProt: number; todayCarbs: number; todayFat: number;
    todayBurned: number; todayWater: number; todayFoodWater: number;
    remainCal: number; remainProt: number;
    avgCal: number; avgProt: number; completeDays: number; loggedDays: number;
    workoutDays: number; streak: number; weekendSpike: number;
    hoursSinceLastMeal: number | null;
    scores: { nutrition: number; hydration: number; consistency: number };
  };
  /** "Nome (Nx, ~kcal, g prot)" lines of the user's frequent foods. */
  commonFoods:  string[];
  /** Frequent protein-dense foods (≥15g protein per entry, ≥20% of kcal). */
  proteinFoods: string[];
  /** Today's entries formatted for the prompt. */
  todayLines:   string[];
}

export function analyzeInsightData(input: InsightInput): InsightAnalysis {
  const { today, hour, goal, targetCal, targetProt, targetWater } = input;
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);

  // ── Today ──────────────────────────────────────────────────────────────
  const todayAgg   = aggregateDays(input.todayLogs)[today] ?? emptyDay();
  const todayFood  = input.todayLogs.filter((l) => num(l.calories) > 0);
  const todayCal   = Math.round(todayAgg.cal);
  const todayProt  = Math.round(todayAgg.prot);
  const netCal     = todayCal - todayAgg.burned;
  const remainCal  = targetCal - netCal;
  const remainProt = Math.max(0, targetProt - todayProt);
  const totalWater = input.todayManualWater + todayAgg.foodWater;
  const pace       = expectedPace(hour);

  const lastMeal = [...todayFood].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const hoursSinceLastMeal = lastMeal
    ? Math.floor((input.now - new Date(lastMeal.created_at).getTime()) / 3_600_000)
    : null;

  const todayTop = [...todayFood]
    .sort((a, b) => num(b.calories) - num(a.calories))
    .slice(0, 2)
    .map((l) => `${l.food_name} (${fmt(num(l.calories))}kcal)`);

  // ── History (30 days) ──────────────────────────────────────────────────
  const days        = aggregateDays(input.historyLogs);
  const minDayCal   = targetCal > 0 ? Math.max(800, targetCal * 0.5) : 800;
  // Days with partial logging would drag every average down and produce
  // misleading "you eat too little" conclusions.
  const completeIds = Object.keys(days).filter((d) => days[d].entries >= 2 && days[d].cal >= minDayCal).sort();
  const loggedIds   = Object.keys(days).filter((d) => days[d].entries > 0).sort();
  const complete    = completeIds.map((d) => days[d]);
  const avgCal      = Math.round(avg(complete.map((d) => d.cal)));
  const avgProt     = Math.round(avg(complete.map((d) => d.prot)));
  const workoutIds  = Object.keys(days).filter((d) => days[d].burned > 0);

  let streak = 0;
  for (let d = shiftDay(today, -1); days[d]?.entries > 0; d = shiftDay(d, -1)) streak++;

  // Frequent foods
  const foodMap = new Map<string, FoodStat>();
  for (const l of input.historyLogs) {
    const cal = num(l.calories);
    if (cal <= 0 || !l.food_name) continue;
    const key = normalizeFood(l.food_name);
    const s   = foodMap.get(key) ?? { name: l.food_name.trim(), count: 0, cal: 0, prot: 0 };
    s.count++;
    s.cal  += cal;
    s.prot += num(l.protein);
    foodMap.set(key, s);
  }
  const foodStats    = [...foodMap.values()].sort((a, b) => b.count - a.count);
  const describeFood = (s: FoodStat) =>
    `${s.name} (${s.count}x, ~${fmt(s.cal / s.count)}kcal, ${Math.round(s.prot / s.count)}g prot)`;
  const commonFoods  = foodStats.filter((s) => s.count >= 2).slice(0, 8).map(describeFood);
  // Protein-dense only (≥20% of kcal from protein) — a pizza with 30g isn't a protein source
  const proteinFoods = foodStats
    .filter((s) => s.count >= 2 && s.prot / s.count >= 15 && (s.prot * 4) / s.cal >= 0.2)
    .slice(0, 5)
    .map(describeFood);

  // ── Scores (shown on the card) ─────────────────────────────────────────
  const calProgressPct  = targetCal  > 0 ? Math.min(100, pct(todayCal, targetCal))   : 50;
  const protProgressPct = targetProt > 0 ? Math.min(100, pct(todayProt, targetProt)) : 50;
  const scores = {
    nutrition:   todayFood.length === 0 ? 0 : Math.round(calProgressPct * 0.5 + protProgressPct * 0.5),
    hydration:   Math.min(100, pct(totalWater, targetWater)),
    consistency: Math.min(100, Math.min(60, streak * 10) + Math.min(40, Math.round((loggedIds.length / 30) * 40))),
  };

  // ═══ Findings about today ═════════════════════════════════════════════

  if (targetCal > 0 && netCal > targetCal * 1.08) {
    const excess    = netCal - targetCal;
    const excessPct = pct(excess, targetCal);
    const strong    = netCal > targetCal * 1.25;
    add({
      key: 'today-over', type: 'nutrition', priority: 'atencao',
      score: strong ? 95 : 86,
      fact: `Hoje: ${fmt(todayCal)}kcal consumidas${todayAgg.burned > 0 ? ` − ${fmt(todayAgg.burned)}kcal de treino` : ''} vs meta de ${fmt(targetCal)}kcal → excesso de ${fmt(excess)}kcal (+${excessPct}%). Itens mais calóricos de hoje: ${todayTop.join(', ')}. São ${hour}h.`,
      angle: strong
        ? `Tom de personal trainer: direto e firme, sem suavizar ("você passou da conta"), mas sem crueldade. Diga o impacto concreto no objetivo (${goal}) e dê 1 ação para compensar HOJE com quantidade (ex: jantar leve de ~400kcal, caminhada de 30min). Cite os itens que mais pesaram.`
        : `Tom direto, sem rodeios: cite o excesso e os itens que mais pesaram, o impacto no objetivo (${goal}) e como equilibrar o resto do dia com uma ação específica.`,
      fallback: {
        title: `Meta estourada em ${fmt(excess)}kcal hoje`,
        message: `Você está em ${fmt(netCal)}kcal líquidas para uma meta de ${fmt(targetCal)}kcal (+${excessPct}%). O que mais pesou: ${todayTop.join(' e ')}. Feche o dia com refeições leves e sem beliscos.`,
        nextSteps: hour < 20
          ? ['🥗 Jantar leve de até 400kcal (proteína magra + salada)', '🚶 Caminhada de 30min (~150kcal)', '🚫 Nada de beliscos depois do jantar']
          : ['🚫 Encerrar a alimentação por hoje', '💧 Se bater fome, 300ml de água ou chá sem açúcar', '🍳 Amanhã: café da manhã com 30g de proteína'],
      },
    });
  } else if (targetCal > 0 && hour < 19 && pace > 0 && netCal > targetCal * pace * 1.35 && netCal > targetCal * 0.6) {
    add({
      key: 'today-ahead-of-pace', type: 'nutrition', priority: 'atencao', score: 76,
      fact: `São ${hour}h e você já está em ${fmt(netCal)}kcal de ${fmt(targetCal)}kcal (${pct(netCal, targetCal)}% da meta); restam ${fmt(remainCal)}kcal para o resto do dia. Itens mais calóricos: ${todayTop.join(', ')}.`,
      angle: 'Avise com antecedência que o orçamento do dia está quase no fim e mostre como distribuir as calorias restantes nas próximas refeições, com opções concretas e quantidades.',
      fallback: {
        title: `Só ${fmt(remainCal)}kcal livres até o fim do dia`,
        message: `São ${hour}h e você já consumiu ${pct(netCal, targetCal)}% da meta (${fmt(netCal)} de ${fmt(targetCal)}kcal). Para não estourar, as próximas refeições precisam somar até ${fmt(remainCal)}kcal.`,
        nextSteps: [`🍽️ Próxima refeição com no máximo ${fmt(Math.max(200, remainCal * 0.7))}kcal`, '🥩 Priorize proteína magra e vegetais', '🚫 Evite beliscos até o jantar'],
      },
    });
  }

  if (hoursSinceLastMeal !== null && hoursSinceLastMeal >= 5 && hour >= 9 && hour <= 22) {
    add({
      key: 'meal-gap', type: 'nutrition', priority: 'atencao', score: 74,
      fact: `Última refeição registrada há ${hoursSinceLastMeal}h (${lastMeal!.food_name}). Hoje: ${fmt(todayCal)}kcal e ${todayProt}g de proteína; faltam ${remainProt}g de proteína.`,
      angle: 'Tom gentil. Explique o risco de chegar com muita fome na próxima refeição e sugira um lanche específico com kcal e proteína aproximados, de preferência com alimentos que o usuário costuma comer.',
      fallback: {
        title: `${hoursSinceLastMeal}h sem comer: hora de um lanche`,
        message: `Sua última refeição registrada foi há ${hoursSinceLastMeal}h. Ficar muito tempo sem comer aumenta a chance de exagerar depois. Um lanche com proteína agora ajuda a chegar nos ${targetProt}g do dia.`,
        nextSteps: ['🥛 Iogurte natural 170g + 1 fruta (~200kcal, 12g prot)', '🥚 Ou 2 ovos cozidos (~150kcal, 12g prot)', '📝 Registre o lanche para atualizar a análise'],
      },
    });
  }

  // After 20h there's no meal left to fix it — the end-of-day findings cover it
  if (targetProt > 0 && hour >= 14 && hour <= 20 && todayFood.length > 0 && remainProt >= 40 && todayProt < targetProt * pace * 0.6) {
    const protSuggest = proteinFoods.slice(0, 3).join('; ');
    add({
      key: 'today-protein-behind', type: 'nutrition', priority: 'recomendacao', score: hour >= 18 ? 78 : 70,
      fact: `São ${hour}h e você está com ${todayProt}g de ${targetProt}g de proteína (${pct(todayProt, targetProt)}%); faltam ${remainProt}g. Calorias: ${fmt(netCal)} de ${fmt(targetCal)}kcal.${protSuggest ? ` Fontes de proteína que o usuário já come: ${protSuggest}.` : ''}`,
      angle: `Mostre como fechar os ${remainProt}g restantes nas próximas refeições sem estourar as calorias, com porções e gramas de proteína. Prefira alimentos que o usuário já come. Explique por que importa para o objetivo (${goal}).`,
      fallback: {
        title: `Faltam ${remainProt}g de proteína hoje`,
        message: `Você está com ${todayProt}g de ${targetProt}g de proteína às ${hour}h. Concentre proteína nas próximas refeições para não terminar o dia abaixo da meta.`,
        nextSteps: [`🍗 150g de frango ou peixe no jantar (~40g prot)`, '🥛 Iogurte grego ou whey no lanche (~20g prot)', '🥚 2 ovos extras se faltar (~12g prot)'],
      },
    });
  }

  const deficitKcal = remainCal;
  const deficitPct  = targetCal > 0 && deficitKcal > 0 ? pct(deficitKcal, targetCal) : 0;
  const mealsLogged = todayAgg.entries >= 2;
  if (hour >= 20 && mealsLogged && deficitPct > (goal === 'emagrecimento' ? 38 : 25)) {
    const snack = Math.min(Math.round(deficitKcal * 0.4), 400);
    add({
      key: 'today-deficit-excess', type: 'nutrition', priority: 'atencao', score: 82,
      fact: `São ${hour}h e foram registradas só ${fmt(todayCal)}kcal de uma meta de ${fmt(targetCal)}kcal (${deficitPct}% abaixo, faltam ${fmt(deficitKcal)}kcal). Proteína: ${todayProt}g de ${targetProt}g.`,
      angle: `Tom de cuidado, não bronca. Déficit grande demais compromete músculo e aumenta a chance de compulsão amanhã. Sugira uma refeição leve específica antes de dormir com ~${snack}kcal e boa proteína. Mencione que, se algo não foi registrado, vale registrar.`,
      fallback: {
        title: `Déficit de ${deficitPct}% hoje: grande demais`,
        message: `Você fechou o dia com ${fmt(todayCal)}kcal de ${fmt(targetCal)}kcal. Um déficit desse tamanho prejudica a massa muscular e aumenta a fome amanhã. Uma refeição leve de ~${snack}kcal antes de dormir ajuda.`,
        nextSteps: [`🥛 Ceia de ~${snack}kcal com proteína (iogurte + aveia, ou omelete)`, '📝 Confira se alguma refeição ficou sem registro', '🍳 Amanhã: café da manhã reforçado'],
      },
    });
  } else if (goal !== 'ganho de massa' && mealsLogged && (
    (hour >= 20 && deficitPct >= 10 && deficitPct <= (goal === 'emagrecimento' ? 38 : 22)) ||
    (hour >= 17 && hour < 20 && deficitPct >= 15 && deficitPct <= 30)
  )) {
    const night = hour >= 20;
    add({
      key: night ? 'today-deficit-reward' : 'today-deficit-on-track', type: 'nutrition', priority: 'positivo',
      score: night ? 72 : 62,
      fact: `São ${hour}h: ${fmt(todayCal)}kcal de ${fmt(targetCal)}kcal (${deficitPct}% abaixo da meta, ${fmt(deficitKcal)}kcal de folga). Proteína: ${todayProt}g de ${targetProt}g.`,
      angle: night
        ? `Tom caloroso e orgulhoso, elogio com os números. Traduza o déficit em impacto real (7.700kcal ≈ 1kg de gordura: mantido por 7 dias, ${fmt(deficitKcal)}kcal/dia ≈ ${fmt1((deficitKcal * 7) / 7700)}kg). Se a proteína ficou abaixo, aponte isso como o ajuste para amanhã.`
        : `Tom animado. Parabenize o controle até agora com os números e oriente um jantar específico que mantenha o déficit e complete a proteína (faltam ${remainProt}g).`,
      fallback: night
        ? {
            title: `Dia fechado com ${fmt(deficitKcal)}kcal de déficit`,
            message: `Você terminou com ${fmt(todayCal)}kcal de ${fmt(targetCal)}kcal — um déficit saudável de ${deficitPct}%. Mantendo esse ritmo, são cerca de ${fmt1((deficitKcal * 7) / 7700)}kg de gordura a menos por semana.`,
            nextSteps: [remainProt > 20 ? `🥛 Se der fome, ceia com ~${Math.min(remainProt, 25)}g de proteína` : '😴 Feche a cozinha e durma bem', '🍳 Repita a estratégia de hoje amanhã', '⚖️ Registre o peso amanhã em jejum'],
          }
        : {
            title: `${fmt(deficitKcal)}kcal livres para o jantar`,
            message: `Às ${hour}h você está em ${fmt(todayCal)}kcal de ${fmt(targetCal)}kcal. Dá para jantar bem e ainda fechar o dia no déficit, priorizando os ${remainProt}g de proteína que faltam.`,
            nextSteps: [`🍽️ Jantar de até ${fmt(Math.round(deficitKcal * 0.7))}kcal`, `🥩 Inclua ~${Math.min(Math.max(remainProt, 25), 50)}g de proteína`, '🥗 Metade do prato com vegetais'],
          },
    });
  }

  if (hour >= 12 && todayFood.length >= 1 && totalWater < targetWater * pace * 0.5) {
    const waterHistDays = waterDaysMap(input, days);
    const histIds       = Object.keys(waterHistDays);
    const hitDays       = histIds.filter((d) => waterHistDays[d] >= targetWater).length;
    add({
      key: 'today-water-behind', type: 'hydration', priority: 'atencao', score: hour >= 16 ? 66 : 58,
      fact: `São ${hour}h e você bebeu ${fmt(totalWater)}ml de ${fmt(targetWater)}ml (${pct(totalWater, targetWater)}%). Pelo horário, o esperado seria ~${fmt(targetWater * pace)}ml.${histIds.length >= 5 ? ` Nos últimos 30 dias a meta foi atingida em ${hitDays} de ${histIds.length} dias com registro.` : ''}`,
      angle: 'Dê uma estratégia de volume e horário para recuperar até a noite (ex: 500ml agora + 1 copo a cada refeição), sem mandar beber tudo de uma vez.',
      fallback: {
        title: `Água em ${pct(totalWater, targetWater)}% às ${hour}h`,
        message: `Você está com ${fmt(totalWater)}ml de ${fmt(targetWater)}ml. Para fechar a meta sem exagerar à noite, distribua os ${fmt(targetWater - totalWater)}ml restantes nas próximas horas.`,
        nextSteps: ['💧 Beber 500ml agora', '🥤 1 copo (250ml) em cada refeição', '⏰ Mais 250ml a cada 1h30 até as 20h'],
      },
    });
  }

  // ═══ Findings about patterns (history) ═════════════════════════════════

  // Protein distribution across main meals
  if (completeIds.length >= 5) {
    const perMeal = MAIN_MEALS.map((meal) => {
      const vals = complete.filter((d) => d.meals[meal]).map((d) => d.meals[meal].prot);
      return { meal, days: vals.length, avg: Math.round(avg(vals)) };
    }).filter((m) => m.days >= 4);
    if (perMeal.length >= 2) {
      const weakest   = [...perMeal].sort((a, b) => a.avg - b.avg)[0];
      const strongest = [...perMeal].sort((a, b) => b.avg - a.avg)[0];
      const threshold = targetProt > 0 ? Math.max(15, targetProt * 0.15) : 20;
      if (weakest.avg < threshold && strongest.avg - weakest.avg >= 12) {
        const mealFoods = topFoodsForMeal(input.historyLogs, weakest.meal, 3);
        const [from, to] = MEAL_WINDOW[weakest.meal];
        const timely     = hour >= from && hour < to;
        const label      = MEAL_LABEL[weakest.meal];
        add({
          key: `protein-meal-${weakest.meal}`, type: 'nutrition', priority: 'recomendacao', score: timely ? 76 : 64,
          fact: `Proteína média por refeição nos dias completos (30d): ${perMeal.map((m) => `${MEAL_LABEL[m.meal]} ${m.avg}g (${m.days} dias)`).join(', ')}. Meta diária: ${targetProt}g. O ${label.toLowerCase()} costuma ter: ${mealFoods.join(', ') || 'sem padrão claro'}.`,
          angle: `Mostre o desequilíbrio (${label.toLowerCase()} fraco vs ${MEAL_LABEL[strongest.meal].toLowerCase()} forte) e por que distribuir proteína ao longo do dia ajuda (${goal === 'emagrecimento' ? 'saciedade e preservação de músculo' : goal === 'ganho de massa' ? 'síntese muscular' : 'saciedade e composição corporal'}). Sugira trocas/adições ESPECÍFICAS partindo do que ele já come nessa refeição, com gramas de proteína.`,
          fallback: {
            title: `${label} com só ${weakest.avg}g de proteína`,
            message: `Nos últimos 30 dias seu ${label.toLowerCase()} teve em média ${weakest.avg}g de proteína, contra ${strongest.avg}g no ${MEAL_LABEL[strongest.meal].toLowerCase()}. Subir essa refeição para ~25g ajuda a bater os ${targetProt}g do dia com mais saciedade.`,
            nextSteps: weakest.meal === 'breakfast'
              ? ['🥚 Adicionar 2 ovos (+12g prot)', '🥛 Trocar o leite por iogurte grego (+10g prot)', '🧀 Incluir queijo branco ou cottage 50g (+6g prot)']
              : ['🍗 Incluir 100g de frango, peixe ou carne magra (+25g prot)', '🫘 Adicionar 1 concha de feijão ou lentilha (+7g prot)', '🥚 Ou 2 ovos como complemento (+12g prot)'],
          },
        });
      }
    }
  }

  // Protein adherence
  if (targetProt > 0 && completeIds.length >= 7) {
    const hit  = complete.filter((d) => d.prot >= targetProt * 0.9).length;
    const rate = pct(hit, completeIds.length);
    if (rate < 40) {
      add({
        key: 'protein-adherence-low', type: 'nutrition', priority: 'atencao', score: goal === 'ganho de massa' ? 74 : 66,
        fact: `Meta de proteína (${targetProt}g) atingida em ${hit} de ${completeIds.length} dias completos (${rate}%). Média: ${avgProt}g/dia — ${targetProt - avgProt}g abaixo.${proteinFoods.length ? ` Fontes de proteína que o usuário já come: ${proteinFoods.slice(0, 3).join('; ')}.` : ''}`,
        angle: `Explique o que a falta crônica de ${targetProt - avgProt}g/dia significa para o objetivo (${goal}) e proponha 1-2 mudanças fixas na rotina que cubram esse buraco, com alimentos que ele já come e gramas.`,
        fallback: {
          title: `Proteína: meta batida em ${hit} de ${completeIds.length} dias`,
          message: `Sua média é ${avgProt}g de proteína por dia, ${targetProt - avgProt}g abaixo da meta de ${targetProt}g. Uma porção fixa extra de proteína por dia já fecha boa parte dessa diferença.`,
          nextSteps: ['🥛 Lanche fixo com iogurte grego ou whey (+20g prot)', '🍗 Aumentar a porção de carne do almoço em 50g (+15g prot)', '🥚 2 ovos no café da manhã (+12g prot)'],
        },
      });
    } else if (rate >= 75) {
      add({
        key: 'protein-adherence-good', type: 'nutrition', priority: 'positivo', score: 42,
        fact: `Meta de proteína (${targetProt}g) atingida em ${hit} de ${completeIds.length} dias completos (${rate}%), média de ${avgProt}g/dia.`,
        angle: `Reconheça a consistência com os números e conecte com o objetivo (${goal}). Termine com um próximo passo de refinamento que não seja "continue assim".`,
        fallback: {
          title: `Proteína em dia: ${hit} de ${completeIds.length} dias na meta`,
          message: `Você bateu a meta de ${targetProt}g de proteína em ${rate}% dos dias completos, com média de ${avgProt}g. Essa constância é o que preserva e constrói massa muscular.`,
          nextSteps: ['⚖️ Registrar o peso 2x por semana para medir o efeito', '🥩 Manter ~30g de proteína em cada refeição principal', '📏 Atualizar as medidas corporais este mês'],
        },
      });
    }
  }

  // Calorie adherence
  if (targetCal > 0 && completeIds.length >= 7) {
    const diffPct  = Math.round((avgCal / targetCal - 1) * 100);
    const overDays = complete.filter((d) => d.cal > targetCal * 1.1).length;
    if (goal !== 'ganho de massa' && diffPct >= 8) {
      const top = topCalorieFoods(foodStats, 3);
      add({
        key: 'calories-avg-over', type: 'nutrition', priority: 'atencao', score: goal === 'emagrecimento' ? 80 : 66,
        fact: `Média de ${fmt(avgCal)}kcal nos ${completeIds.length} dias completos (30d), ${diffPct}% acima da meta de ${fmt(targetCal)}kcal; ${overDays} dias passaram mais de 10% da meta. Alimentos que mais somaram calorias no mês: ${top.join('; ')}.`,
        angle: `Seja direto: com essa média, o objetivo (${goal}) não avança. Mostre de onde vêm as calorias e proponha 1-2 cortes ou trocas específicas nesses alimentos que somem ~${fmt(avgCal - targetCal)}kcal/dia.`,
        fallback: {
          title: `Média de ${fmt(avgCal)}kcal: ${diffPct}% acima da meta`,
          message: `Nos últimos 30 dias você ficou acima de ${fmt(targetCal)}kcal em ${overDays} de ${completeIds.length} dias completos. Cortar ~${fmt(avgCal - targetCal)}kcal por dia nos itens mais frequentes recoloca você no rumo.`,
          nextSteps: ['🔍 Revisar porções dos 3 itens mais calóricos do mês', '🍽️ Servir o prato uma vez, sem repetir', '🥤 Trocar bebidas açucaradas por versões zero'],
        },
      });
    } else if (goal === 'ganho de massa' && diffPct <= -10) {
      add({
        key: 'calories-avg-under', type: 'nutrition', priority: 'atencao', score: 76,
        fact: `Média de ${fmt(avgCal)}kcal nos ${completeIds.length} dias completos (30d), ${Math.abs(diffPct)}% abaixo da meta de ${fmt(targetCal)}kcal para ganho de massa.`,
        angle: `Explique que sem superávit o ganho de massa trava e sugira 2 adições calóricas práticas (com kcal) que encaixem na rotina, usando alimentos que ele já come.`,
        fallback: {
          title: `Faltam ${fmt(targetCal - avgCal)}kcal/dia para o superávit`,
          message: `Sua média é ${fmt(avgCal)}kcal, abaixo da meta de ${fmt(targetCal)}kcal. Sem superávit, o corpo não tem energia extra para construir músculo.`,
          nextSteps: ['🥜 30g de pasta de amendoim no lanche (+180kcal)', '🍌 Vitamina com banana, aveia e leite (+350kcal)', '🍚 Aumentar a porção de arroz no almoço em 100g (+130kcal)'],
        },
      });
    } else if (goal === 'emagrecimento' && diffPct >= -12 && diffPct <= 3 && overDays <= completeIds.length * 0.25) {
      add({
        key: 'calories-avg-on-track', type: 'nutrition', priority: 'positivo', score: 40,
        fact: `Média de ${fmt(avgCal)}kcal nos ${completeIds.length} dias completos (30d), meta de ${fmt(targetCal)}kcal; só ${overDays} dias acima de 10% da meta.`,
        angle: 'Reconheça a aderência com os números e sugira um refinamento concreto (ex: proteína, fibras ou registro do peso para validar o ritmo).',
        fallback: {
          title: `Calorias sob controle em ${completeIds.length - overDays} de ${completeIds.length} dias`,
          message: `Sua média de ${fmt(avgCal)}kcal está alinhada à meta de ${fmt(targetCal)}kcal. Essa regularidade é o que gera resultado no emagrecimento.`,
          nextSteps: ['⚖️ Registrar o peso 2x por semana', '🥩 Garantir 30g de proteína por refeição', '🥦 Incluir vegetais em 2 refeições'],
        },
      });
    }
  }

  // A single food responsible for a big share of calories
  if (goal !== 'ganho de massa' && complete.length >= 7) {
    const totalCal = foodStats.reduce((s, f) => s + f.cal, 0);
    const heavy = foodStats
      // Protein-dense foods (e.g. the lunch plate) aren't what to cut
      .filter((f) => f.count >= 4 && f.cal / f.count >= 150 && f.cal / totalCal >= 0.07 && (f.prot * 4) / f.cal < 0.15)
      .sort((a, b) => b.cal - a.cal)[0];
    if (heavy) {
      const share = pct(heavy.cal, totalCal);
      add({
        key: `heavy-food-${normalizeFood(heavy.name).slice(0, 30)}`, type: 'nutrition', priority: 'informativo',
        score: avgCal > targetCal * 1.05 ? 62 : 48,
        fact: `"${heavy.name}" apareceu ${heavy.count}x em 30 dias, somando ${fmt(heavy.cal)}kcal (${share}% de todas as calorias registradas; ~${fmt(heavy.cal / heavy.count)}kcal por vez, ${Math.round(heavy.prot / heavy.count)}g prot).`,
        angle: 'Mostre o peso desse alimento no mês sem demonizá-lo. Sugira uma versão/porção alternativa específica e quantas kcal por semana isso economiza.',
        fallback: {
          title: `${heavy.name}: ${share}% das suas calorias`,
          message: `Esse item apareceu ${heavy.count}x no último mês e somou ${fmt(heavy.cal)}kcal. Reduzir a porção pela metade em metade das vezes economizaria ~${fmt(heavy.cal / 4)}kcal por mês.`,
          nextSteps: ['⚖️ Pesar a porção na próxima vez', '🔄 Testar uma versão mais leve 2x por semana', '🥗 Acompanhar com salada para aumentar o volume'],
        },
      });
    }
  }

  // Weekend vs weekday
  const isWeekend  = (d: string) => [0, 6].includes(dowOf(d));
  const wdCals     = completeIds.filter((d) => !isWeekend(d)).map((d) => days[d].cal);
  const weCals     = completeIds.filter(isWeekend).map((d) => days[d].cal);
  const avgWeekday = Math.round(avg(wdCals));
  const avgWeekend = Math.round(avg(weCals));
  const weekendSpike = wdCals.length >= 4 && weCals.length >= 2 && avgWeekend > avgWeekday
    ? pct(avgWeekend - avgWeekday, avgWeekday) : 0;
  if (weekendSpike >= 20) {
    const todayDow = dowOf(today);
    const weeklyExtra = (avgWeekend - avgWeekday) * 2;
    add({
      key: 'weekend-spike', type: 'behavior', priority: 'atencao',
      score: [5, 6, 0].includes(todayDow) ? 78 : 50,
      fact: `Fins de semana: média de ${fmt(avgWeekend)}kcal vs ${fmt(avgWeekday)}kcal nos dias úteis (+${weekendSpike}%; ${weCals.length} dias de fim de semana e ${wdCals.length} dias úteis analisados). Isso soma ~${fmt(weeklyExtra)}kcal extras por semana. Hoje é ${DOW_NAME[todayDow]}.`,
      angle: `Mostre quanto do esforço da semana o fim de semana devolve (compare ${fmt(weeklyExtra)}kcal com o déficit semanal, se houver). Sugira uma estratégia específica para o fim de semana (ex: 1 refeição livre planejada em vez de 2 dias soltos), sem culpa.`,
      fallback: {
        title: `Fim de semana com +${weekendSpike}% de calorias`,
        message: `Sábado e domingo você come em média ${fmt(avgWeekend)}kcal, contra ${fmt(avgWeekday)}kcal nos dias úteis — cerca de ${fmt(weeklyExtra)}kcal extras por semana. Planejar uma única refeição livre resolve boa parte disso.`,
        nextSteps: ['📅 Escolher 1 refeição livre no fim de semana', '🍳 Manter café da manhã e almoço no padrão da semana', '🍺 Definir um limite de bebidas antes de sair'],
      },
    });
  }

  // Heaviest day of the week
  if (completeIds.length >= 15) {
    const byDow: number[][] = Array.from({ length: 7 }, () => []);
    for (const d of completeIds) byDow[dowOf(d)].push(days[d].cal);
    const ranked = byDow
      .map((cals, dow) => ({ dow, n: cals.length, avg: avg(cals) }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.avg - a.avg);
    const worst = ranked[0];
    if (worst && avgCal > 0 && worst.avg > avgCal * 1.2 && !(weekendSpike >= 20 && [0, 6].includes(worst.dow))) {
      const isToday = dowOf(today) === worst.dow;
      add({
        key: `heavy-dow-${worst.dow}`, type: 'behavior', priority: 'informativo', score: isToday ? 70 : 38,
        fact: `${DOW_NAME[worst.dow]} é o dia mais calórico: média de ${fmt(worst.avg)}kcal (${worst.n} registros) vs média geral de ${fmt(avgCal)}kcal (+${pct(worst.avg - avgCal, avgCal)}%).${isToday ? ' Hoje é esse dia.' : ''}`,
        angle: 'Aponte o padrão, levante hipóteses plausíveis (rotina, cansaço, eventos) sem afirmar, e sugira 1 preparação concreta para esse dia.',
        fallback: {
          title: `${DOW_NAME[worst.dow][0].toUpperCase()}${DOW_NAME[worst.dow].slice(1)}: seu dia mais calórico`,
          message: `Às ${DOW_NAME[worst.dow]}s você consome em média ${fmt(worst.avg)}kcal, ${pct(worst.avg - avgCal, avgCal)}% acima da sua média. Planejar as refeições desse dia com antecedência evita os excessos.`,
          nextSteps: ['📝 Deixar o almoço desse dia planejado', '🍎 Levar um lanche para evitar fome no fim da tarde', '🔍 Observar o que acontece nesse dia da semana'],
        },
      });
    }
  }

  // Weight trend vs logged intake → real energy expenditure
  const monthAgo   = shiftDay(today, -30);
  const recentW    = input.weights.filter((w) => w.date >= monthAgo && w.kg > 0);
  if (recentW.length >= 3) {
    const span = dayIndex(recentW[recentW.length - 1].date) - dayIndex(recentW[0].date);
    const windowComplete = completeIds.filter((d) => d >= recentW[0].date);
    if (span >= 14) {
      const slope     = linearSlope(recentW.map((w) => [dayIndex(w.date), w.kg]));
      const weeklyKg  = slope * 7;
      const latestKg  = recentW[recentW.length - 1].kg;
      const windowAvg = Math.round(avg(windowComplete.map((d) => days[d].cal)));
      const estTdee   = windowComplete.length >= 10 ? Math.round(windowAvg - slope * 7700) : 0;
      const tdeeOk    = estTdee >= 1200 && estTdee <= 5000;
      const trend     = `${fmt1(recentW[0].kg)}kg → ${fmt1(latestKg)}kg em ${span} dias (tendência ${weeklyKg > 0 ? '+' : ''}${weeklyKg.toFixed(2).replace('.', ',')}kg/semana)`;
      const tdeeText  = tdeeOk
        ? ` Média registrada nos ${windowComplete.length} dias completos do período: ${fmt(windowAvg)}kcal → gasto real estimado pela variação do peso: ~${fmt(estTdee)}kcal/dia (7.700kcal ≈ 1kg).`
        : '';
      const maxLoss = latestKg * 0.01;

      if (goal === 'emagrecimento' && weeklyKg > -0.1) {
        add({
          key: 'weight-stalled', type: 'body', priority: 'atencao', score: 85,
          fact: `Peso: ${trend}, apesar do objetivo de emagrecimento com meta de ${fmt(targetCal)}kcal.${tdeeText}`,
          angle: `Este é o insight mais valioso: os registros dizem déficit, mas o peso não cai. Apresente as duas hipóteses (subnotificação — óleo, molhos, beliscos, bebidas, dias não registrados — ou gasto real menor que o estimado${tdeeOk ? `, ~${fmt(estTdee)}kcal` : ''}) e uma ação concreta para testar por 7 dias. Lembre que variações de água mascaram a balança em prazos curtos.`,
          fallback: {
            title: `Peso parado: ${fmt1(weeklyKg, true)}kg/semana`,
            message: `Em ${span} dias seu peso foi de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg, mesmo com meta de déficit.${tdeeOk ? ` Pelos seus registros, seu gasto real parece ser ~${fmt(estTdee)}kcal/dia.` : ''} Vale registrar tudo, inclusive óleo e beliscos, por 7 dias para achar a diferença.`,
            nextSteps: ['📝 Registrar absolutamente tudo por 7 dias (óleo, molhos, bebidas)', '⚖️ Pesar-se 3x na semana, em jejum', tdeeOk ? `🎯 Se nada mudar, mirar ~${fmt(estTdee - 400)}kcal/dia` : '🎯 Reduzir 200kcal da meta se nada mudar em 2 semanas'],
          },
        });
      } else if (goal === 'emagrecimento' && weeklyKg < -maxLoss) {
        add({
          key: 'weight-loss-too-fast', type: 'body', priority: 'atencao', score: 72,
          fact: `Peso: ${trend} — acima de 1% do peso por semana (${fmt1(maxLoss)}kg).${tdeeText}`,
          angle: 'Explique que perda rápida demais costuma levar massa muscular junto e aumenta o efeito rebote. Sugira ajuste concreto (subir ~200kcal, priorizar proteína e treino de força).',
          fallback: {
            title: `Perdendo ${fmt1(Math.abs(weeklyKg))}kg/semana: rápido demais`,
            message: `Seu peso caiu de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg em ${span} dias. Acima de ${fmt1(maxLoss)}kg por semana, parte da perda tende a ser músculo.`,
            nextSteps: ['🍚 Somar ~200kcal por dia', `🥩 Garantir ${targetProt}g de proteína`, '🏋️ Manter treino de força 3x por semana'],
          },
        });
      } else if (goal === 'emagrecimento') {
        add({
          key: 'weight-loss-on-track', type: 'body', priority: 'positivo', score: 58,
          fact: `Peso: ${trend} — ritmo saudável (entre 0,1kg e ${fmt1(maxLoss)}kg/semana).${tdeeText}`,
          angle: 'Comemore com os números. Projete o resultado em 4 semanas no mesmo ritmo e dê 1 ação para proteger o ritmo.',
          fallback: {
            title: `${fmt1(weeklyKg, true)}kg por semana: ritmo ideal`,
            message: `Você foi de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg em ${span} dias. Nesse ritmo, são mais ${fmt1(Math.abs(weeklyKg) * 4)}kg em 4 semanas, sem sacrificar músculo.`,
            nextSteps: ['⚖️ Seguir pesando 2x por semana', `🥩 Manter ${targetProt}g de proteína por dia`, '📏 Medir a cintura no fim do mês'],
          },
        });
      } else if (goal === 'ganho de massa' && weeklyKg < 0.05) {
        add({
          key: 'weight-gain-stalled', type: 'body', priority: 'atencao', score: 80,
          fact: `Peso: ${trend}, com objetivo de ganho de massa e meta de ${fmt(targetCal)}kcal.${tdeeText}`,
          angle: `Sem ganho de peso não há ganho de massa. Explique e sugira subir ~200-300kcal/dia com alimentos que ele já come${tdeeOk ? `, mirando ~${fmt(estTdee + 300)}kcal` : ''}.`,
          fallback: {
            title: `Peso estável há ${span} dias no ganho de massa`,
            message: `Seu peso foi de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg. Para ganhar massa, o ideal é subir 0,1–0,3kg por semana; isso exige mais calorias.`,
            nextSteps: ['🥜 Adicionar um lanche de ~300kcal', '🍚 Aumentar carboidrato pós-treino', '⚖️ Reavaliar o peso em 2 semanas'],
          },
        });
      } else if (goal === 'ganho de massa' && weeklyKg > 0.5) {
        add({
          key: 'weight-gain-too-fast', type: 'body', priority: 'atencao', score: 64,
          fact: `Peso: ${trend} — acima do ritmo ideal de ganho de massa (0,1–0,3kg/semana).${tdeeText}`,
          angle: 'Explique que ganho acelerado tende a ser mais gordura do que músculo e sugira reduzir ~200kcal mantendo a proteína.',
          fallback: {
            title: `Ganhando ${fmt1(weeklyKg)}kg/semana: acima do ideal`,
            message: `Seu peso subiu de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg em ${span} dias. Acima de 0,3kg por semana, boa parte tende a ser gordura.`,
            nextSteps: ['🍽️ Reduzir ~200kcal por dia', `🥩 Manter ${targetProt}g de proteína`, '📏 Acompanhar a cintura'],
          },
        });
      } else if (goal === 'manutenção' && Math.abs(weeklyKg) > 0.3) {
        add({
          key: 'weight-drift', type: 'body', priority: 'informativo', score: 60,
          fact: `Peso: ${trend}, com objetivo de manutenção.${tdeeText}`,
          angle: 'Aponte a tendência e sugira um ajuste calórico concreto para estabilizar.',
          fallback: {
            title: `Peso ${weeklyKg > 0 ? 'subindo' : 'caindo'} ${fmt1(Math.abs(weeklyKg))}kg/semana`,
            message: `Em ${span} dias seu peso foi de ${fmt1(recentW[0].kg)}kg para ${fmt1(latestKg)}kg. Para manter, ajuste ~${weeklyKg > 0 ? '−' : '+'}200kcal por dia.`,
            nextSteps: ['⚖️ Pesar 2x por semana', `🎯 Ajustar a meta para ${fmt(targetCal + (weeklyKg > 0 ? -200 : 200))}kcal`, '📊 Reavaliar em 2 semanas'],
          },
        });
      }
    }
  }

  // Protein on workout days
  if (targetProt > 0 && workoutIds.length >= 3) {
    const wProt = workoutIds.filter((d) => completeIds.includes(d)).map((d) => days[d].prot);
    const rProt = completeIds.filter((d) => !workoutIds.includes(d)).map((d) => days[d].prot);
    if (wProt.length >= 3 && avg(wProt) < targetProt * 0.85) {
      const wAvg = Math.round(avg(wProt));
      add({
        key: 'workout-protein', type: 'workout', priority: 'recomendacao', score: 60,
        fact: `${workoutIds.length} treinos em 30 dias. Proteína média nos dias de treino: ${wAvg}g${rProt.length >= 3 ? ` (dias sem treino: ${Math.round(avg(rProt))}g)` : ''}, meta ${targetProt}g.`,
        angle: 'Conecte treino × recuperação: sem proteína suficiente nos dias de treino, o estímulo é desperdiçado. Sugira um pós-treino específico com gramas.',
        fallback: {
          title: `Dias de treino com só ${wAvg}g de proteína`,
          message: `Você treinou ${workoutIds.length}x no último mês, mas nesses dias comeu em média ${wAvg}g de proteína, abaixo dos ${targetProt}g. A recuperação muscular depende disso.`,
          nextSteps: ['🥛 Pós-treino com ~30g de proteína (whey ou iogurte + ovos)', '🍗 Jantar dos dias de treino com 150g de carne magra', '📝 Registrar o treino junto com as refeições'],
        },
      });
    }
  }

  // Hydration pattern
  const waterDays = waterDaysMap(input, days);
  const waterIds  = Object.keys(waterDays);
  if (waterIds.length >= 5 && targetWater > 0) {
    const hit      = waterIds.filter((d) => waterDays[d] >= targetWater).length;
    const rate     = pct(hit, waterIds.length);
    const avgWater = Math.round(avg(waterIds.map((d) => waterDays[d])));
    if (rate < 40) {
      add({
        key: 'water-pattern-low', type: 'hydration', priority: 'recomendacao', score: 54,
        fact: `Água: meta de ${fmt(targetWater)}ml atingida em ${hit} de ${waterIds.length} dias com registro (${rate}%); média de ${fmt(avgWater)}ml/dia (${fmt(targetWater - avgWater)}ml abaixo).`,
        angle: 'Sugira um sistema fixo (gatilhos de horário/rotina) que cubra a diferença média, com volumes. Nada de "beba mais água".',
        fallback: {
          title: `Água: meta batida em ${hit} de ${waterIds.length} dias`,
          message: `Sua média é ${fmt(avgWater)}ml por dia, ${fmt(targetWater - avgWater)}ml abaixo da meta. Amarrar a água a momentos fixos do dia resolve isso sem esforço.`,
          nextSteps: ['💧 500ml ao acordar', '🥤 1 copo (250ml) antes de cada refeição', '🍶 Garrafa de 1L na mesa de trabalho'],
        },
      });
    } else if (rate >= 80) {
      add({
        key: 'water-pattern-good', type: 'hydration', priority: 'positivo', score: 35,
        fact: `Água: meta de ${fmt(targetWater)}ml atingida em ${hit} de ${waterIds.length} dias (${rate}%), média de ${fmt(avgWater)}ml/dia.`,
        angle: 'Reconheça com os números e sugira um refinamento concreto (ex: hidratação nos dias de treino).',
        fallback: {
          title: `Hidratação em dia: ${rate}% dos dias na meta`,
          message: `Você bateu a meta de ${fmt(targetWater)}ml em ${hit} de ${waterIds.length} dias, com média de ${fmt(avgWater)}ml. Isso ajuda na saciedade e no rendimento dos treinos.`,
          nextSteps: ['🏋️ +500ml nos dias de treino', '💧 Manter a garrafa sempre por perto', '☕ Contar chás sem açúcar como hidratação'],
        },
      });
    }
  }

  // Logging consistency
  const last14   = Array.from({ length: 14 }, (_, i) => shiftDay(today, -(i + 1)));
  const missing  = last14.filter((d) => !(days[d]?.entries > 0)).length;
  if (loggedIds.length >= 3 && missing >= 4) {
    add({
      key: 'logging-gaps', type: 'behavior', priority: 'informativo', score: 52,
      fact: `${missing} dos últimos 14 dias sem nenhuma refeição registrada; ${completeIds.length} dias completos em 30 dias.`,
      angle: 'Explique que sem registro os padrões (e o progresso) ficam invisíveis e sugira um hábito mínimo e específico de registro.',
      fallback: {
        title: `${missing} dias sem registro nas últimas 2 semanas`,
        message: `Nos últimos 14 dias, ${missing} ficaram sem registro. Com dias faltando, a análise de calorias e proteína fica imprecisa e os padrões somem.`,
        nextSteps: ['⏰ Registrar logo após cada refeição', '📸 Usar foto ou voz para registrar mais rápido', '🎯 Meta: 7 dias seguidos com registro'],
      },
    });
  }

  // Breakfast frequently missing
  if (loggedIds.length >= 7) {
    const withBreakfast = loggedIds.filter((d) => days[d].meals.breakfast).length;
    const withLunch     = loggedIds.filter((d) => days[d].meals.lunch).length;
    if (withBreakfast <= loggedIds.length * 0.4 && withLunch >= loggedIds.length * 0.6) {
      add({
        key: 'breakfast-missing', type: 'behavior', priority: 'informativo', score: hour < 10 ? 64 : 44,
        fact: `Café da manhã aparece em só ${withBreakfast} de ${loggedIds.length} dias com registro (almoço: ${withLunch}).`,
        angle: 'Pergunte implicitamente se está pulando ou só não registrando. Se pula, explique o efeito na fome do resto do dia (sem impor) e sugira uma opção rápida com proteína.',
        fallback: {
          title: `Café da manhã em só ${withBreakfast} de ${loggedIds.length} dias`,
          message: `Seus registros mostram café da manhã em poucos dias. Se você está pulando essa refeição, uma opção rápida com proteína ajuda a controlar a fome no almoço.`,
          nextSteps: ['🥚 2 ovos mexidos + 1 fruta (~250kcal)', '🥛 Iogurte + aveia (~250kcal)', '📝 Se já toma café, registre para a análise ficar completa'],
        },
      });
    }
  }

  // Body composition (90 days)
  const bm = input.bodyMetrics;
  if (bm.length >= 2) {
    const first = bm[0];
    const last  = bm[bm.length - 1];
    const fatDelta = first.body_fat != null && last.body_fat != null ? num(last.body_fat) - num(first.body_fat) : null;
    const musDelta = first.muscle_mass != null && last.muscle_mass != null ? num(last.muscle_mass) - num(first.muscle_mass) : null;
    const spanDays = dayIndex(last.date) - dayIndex(first.date);
    const parts = [
      fatDelta != null ? `gordura ${fmt1(num(first.body_fat))}% → ${fmt1(num(last.body_fat))}% (${fmt1(fatDelta, true)} p.p.)` : null,
      musDelta != null ? `músculo ${fmt1(num(first.muscle_mass))}kg → ${fmt1(num(last.muscle_mass))}kg (${fmt1(musDelta, true)}kg)` : null,
    ].filter(Boolean).join(', ');
    if (spanDays >= 21 && parts) {
      const good = (fatDelta != null && fatDelta <= -1) || (musDelta != null && musDelta >= 0.5);
      const bad  = (fatDelta != null && fatDelta >= 1) || (musDelta != null && musDelta <= -0.7);
      if (good || bad) {
        add({
          key: good ? 'body-comp-good' : 'body-comp-bad', type: 'body', priority: good ? 'positivo' : 'atencao',
          score: good ? 52 : 62,
          fact: `Composição corporal em ${spanDays} dias: ${parts}.${input.waist.length >= 2 ? ` Cintura: ${fmt1(input.waist[1].cm)}cm → ${fmt1(input.waist[0].cm)}cm.` : ''} Proteína média: ${avgProt}g/dia (meta ${targetProt}g).`,
          angle: good
            ? 'Comemore mostrando que o resultado vai além da balança. Conecte com a proteína/treino e dê 1 ação para manter.'
            : 'Aponte a tendência com cuidado (bioimpedância varia com hidratação) e conecte com proteína/treino/calorias, sugerindo 1 ajuste específico.',
          fallback: good
            ? { title: 'Composição corporal melhorando', message: `Em ${spanDays} dias: ${parts}. Esse é o tipo de progresso que a balança sozinha não mostra.`, nextSteps: [`🥩 Manter ${targetProt}g de proteína`, '🏋️ Seguir com o treino de força', '📏 Nova medição em 30 dias'] }
            : { title: 'Composição corporal pede atenção', message: `Em ${spanDays} dias: ${parts}. Vale reforçar proteína e treino de força para inverter a tendência.`, nextSteps: [`🥩 Bater ${targetProt}g de proteína por dia`, '🏋️ Treino de força 3x por semana', '💧 Medir sempre hidratado e no mesmo horário'] },
        });
      }
    }
  }

  // Streak
  if (streak >= 7) {
    add({
      key: 'streak', type: 'motivation', priority: 'positivo', score: streak % 7 === 0 ? 55 : 30,
      fact: `${streak} dias seguidos com registro (até ontem). Média nos dias completos: ${fmt(avgCal)}kcal e ${avgProt}g de proteína.`,
      angle: 'Celebre a sequência com o número e mostre o que ela já permitiu enxergar nos dados. Termine com um desafio concreto para a próxima semana.',
      fallback: {
        title: `${streak} dias seguidos registrando`,
        message: `Você registrou suas refeições por ${streak} dias consecutivos. É essa constância que transforma dados em resultado.`,
        nextSteps: [`🎯 Chegar a ${streak + 7} dias seguidos`, `🥩 Bater ${targetProt}g de proteína em 5 desses dias`, '⚖️ Registrar o peso no fim da semana'],
      },
    });
  }

  // Not enough data yet — always present so there's something to say
  if (completeIds.length < 7) {
    add({
      key: 'need-data', type: 'behavior', priority: 'recomendacao', score: todayFood.length === 0 ? 34 : 12,
      fact: `Só ${completeIds.length} dias com registro completo (≥2 refeições) nos últimos 30 dias. Hoje: ${todayFood.length} refeições registradas, ${fmt(todayCal)}kcal e ${todayProt}g de proteína.`,
      angle: `Explique que com ${7 - completeIds.length} dias completos a mais já dá para identificar padrões reais (proteína por refeição, fins de semana, ritmo de peso). Se houver refeições hoje, comente algo concreto delas.`,
      fallback: {
        title: `Faltam ${7 - completeIds.length} dias completos para sua análise`,
        message: `Com 7 dias registrando todas as refeições, consigo mostrar onde sua proteína fica baixa, quais dias você come mais e se o peso está respondendo à meta.`,
        nextSteps: ['📝 Registrar todas as refeições de hoje', '⚖️ Registrar o peso em jejum amanhã', '💧 Lançar a água ao longo do dia'],
      },
    });
  }

  findings.sort((a, b) => b.score - a.score);

  const todayLines = todayFood.map((l) => {
    const label = MEAL_LABEL[l.meal_type ?? ''] ?? 'Refeição';
    return `${label}: ${l.food_name} — ${fmt(num(l.calories))}kcal, ${Math.round(num(l.protein))}g prot`;
  });

  return {
    findings,
    stats: {
      todayCal, todayProt,
      todayCarbs: Math.round(todayAgg.carbs), todayFat: Math.round(todayAgg.fat),
      todayBurned: todayAgg.burned, todayWater: totalWater, todayFoodWater: todayAgg.foodWater,
      remainCal, remainProt,
      avgCal, avgProt, completeDays: completeIds.length, loggedDays: loggedIds.length,
      workoutDays: workoutIds.length, streak, weekendSpike,
      hoursSinceLastMeal, scores,
    },
    commonFoods, proteinFoods, todayLines,
  };
}

// Manual water + beverage hydration from food logs, per day.
function waterDaysMap(input: InsightInput, days: Record<string, DayAgg>): Record<string, number> {
  const map: Record<string, number> = {};
  for (const w of input.waterHistory) map[w.log_date] = (map[w.log_date] ?? 0) + num(w.amount_ml);
  for (const [d, agg] of Object.entries(days)) {
    if (agg.foodWater > 0) map[d] = (map[d] ?? 0) + agg.foodWater;
  }
  return map;
}

function topFoodsForMeal(logs: FoodLogRow[], meal: string, n: number): string[] {
  const counts = new Map<string, { name: string; count: number; prot: number }>();
  for (const l of logs) {
    if (l.meal_type !== meal || num(l.calories) <= 0) continue;
    const key = normalizeFood(l.food_name);
    const s   = counts.get(key) ?? { name: l.food_name.trim(), count: 0, prot: 0 };
    s.count++;
    s.prot += num(l.protein);
    counts.set(key, s);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((s) => `${s.name} (${s.count}x, ${Math.round(s.prot / s.count)}g prot)`);
}

function topCalorieFoods(stats: FoodStat[], n: number): string[] {
  return [...stats]
    .sort((a, b) => b.cal - a.cal)
    .slice(0, n)
    .map((s) => `${s.name} (${s.count}x, ${fmt(s.cal)}kcal no total)`);
}

/** Least-squares slope of y over x. */
function linearSlope(points: [number, number][]): number {
  const n  = points.length;
  const mx = points.reduce((s, [x]) => s + x, 0) / n;
  const my = points.reduce((s, [, y]) => s + y, 0) / n;
  let numer = 0;
  let denom = 0;
  for (const [x, y] of points) {
    numer += (x - mx) * (y - my);
    denom += (x - mx) ** 2;
  }
  return denom === 0 ? 0 : numer / denom;
}

/**
 * Applies anti-repetition (recently used finding keys lose relevance) and a
 * small day-of-week nudge, then returns the primary finding plus up to two
 * supporting ones of a different kind.
 */
export function pickFindings(
  findings: Finding[],
  recentKeys: string[],
  dow: number,
): { primary: Finding; supporting: Finding[] } {
  const DOW_TYPE: Record<number, InsightType> = {
    0: 'workout', 1: 'behavior', 2: 'nutrition', 3: 'hydration', 4: 'workout', 5: 'motivation', 6: 'body',
  };
  const adjusted = findings.map((f) => {
    const idx = recentKeys.indexOf(f.key);
    // Today-scoped findings may legitimately repeat (the situation persists),
    // so they're penalized less than pattern findings.
    const penalty = idx === -1 ? 0 : f.key.startsWith('today-') || f.key === 'meal-gap'
      ? (idx === 0 ? 20 : 8)
      : (idx < 3 ? 45 : 20);
    return { f, s: f.score - penalty + (DOW_TYPE[dow] === f.type ? 6 : 0) };
  }).sort((a, b) => b.s - a.s);

  const primary    = adjusted[0].f;
  const supporting = adjusted.slice(1)
    .map((x) => x.f)
    .filter((f) => f.key !== primary.key)
    .sort((a, b) => Number(a.type === primary.type) - Number(b.type === primary.type))
    .slice(0, 2);
  return { primary, supporting };
}
