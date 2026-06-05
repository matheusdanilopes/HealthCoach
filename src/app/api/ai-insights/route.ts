import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';
import { brazilToday, brazilDayOfWeek, brazilNDaysAgo } from '@/lib/timezone';

let gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  return (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractJSON(raw: string): any {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch { /**/ }
  const start = stripped.indexOf('{');
  if (start === -1) throw new Error('No JSON');
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(stripped.slice(start, i + 1));
  }
  throw new Error('No valid JSON');
}

const VALID_TYPES      = ['nutrition', 'hydration', 'workout', 'body', 'behavior', 'motivation'];
const VALID_PRIORITIES = ['informativo', 'atencao', 'positivo', 'recomendacao'];

const MEAL_LABEL: Record<string, string> = {
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

const DOW_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Daily focus rotates so the card never feels repetitive day after day
const DOW_FOCUS: Record<number, string> = {
  1: 'PLANEJAMENTO SEMANAL: Avalie a semana anterior (calorias, treinos, hidratação) e oriente como começar esta semana com foco nas metas. Correlacione treinos com ingestão proteica e hidratação.',
  2: 'MACROS E NUTRIÇÃO: Analise o equilíbrio de proteína/carbs/gordura nos últimos dias. Sugira ajuste específico e prático para hoje, considerando o objetivo do usuário.',
  3: 'HIDRATAÇÃO E ALIMENTAÇÃO: Avalie o padrão de hidratação e sua relação com o consumo alimentar (fibras, proteínas, volume de refeições). Dê dica concreta baseada nos dados reais.',
  4: 'TREINOS E RECUPERAÇÃO: Analise frequência de treinos, consumo proteico e hidratação. Correlacione: dias treinados × proteína consumida × recuperação esperada.',
  5: 'CONSISTÊNCIA E MOTIVAÇÃO: Destaque sequência de registros, tendências positivas ou dê motivação empática. Correlacione comportamento semanal com resultados.',
  6: 'COMPOSIÇÃO CORPORAL: Analise tendência de peso, gordura, músculo e medidas. Correlacione com padrão alimentar e de hidratação. Sugira ajuste com base no objetivo.',
  0: 'RECUPERAÇÃO DOMINICAL: Oriente sobre hidratação, proteína para recuperação muscular e preparação nutricional para a semana. Sugira uma refeição prática se o contexto permitir.',
};

// Varied fallbacks — rotated by recent insight types to avoid repetition
const FALLBACK_INSIGHTS = [
  {
    type:     'nutrition',
    priority: 'recomendacao' as const,
    title:    'Registre sua primeira refeição',
    message:  'Comece registrando o café da manhã para receber orientações personalizadas sobre o restante do dia. Pequenos registros diários criam um histórico poderoso para análise.',
    cta:      'Registrar refeição',
  },
  {
    type:     'hydration',
    priority: 'recomendacao' as const,
    title:    'Hidratação: comece cedo no dia',
    message:  'Manter boa hidratação desde a manhã melhora a disposição, o metabolismo e a sensação de saciedade. Tente chegar a 500ml antes do almoço.',
    cta:      null,
  },
  {
    type:     'behavior',
    priority: 'informativo' as const,
    title:    'Consistência é o maior superpoder',
    message:  'Registrar suas refeições diariamente ajuda a identificar padrões e tomar decisões mais conscientes. Cada registro conta para uma análise cada vez mais precisa.',
    cta:      null,
  },
  {
    type:     'motivation',
    priority: 'positivo' as const,
    title:    'Cada dia é uma nova oportunidade',
    message:  'O progresso real não é linear — é feito de dias bons, medianos e recomeços. O mais importante é não abandonar. Você está aqui, e isso já é muito.',
    cta:      null,
  },
];

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';
    const invalidate   = searchParams.get('invalidate') === '1';

    if (invalidate) {
      await supabase.from('ai_insights').delete().eq('user_id', userId);
      console.log(`[insights] Cache invalidated for user ${userId}`);
      return NextResponse.json({ ok: true });
    }

    // 2-hour cache — short enough to reflect meals added during the day
    if (!forceRefresh) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', userId)
        .gte('generated_at', twoHoursAgo)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();
      if (cached) return NextResponse.json(cached);
    }

    const today          = brazilToday();
    const thirtyDaysAgo  = brazilNDaysAgo(30, today);
    const ninetyDaysAgo  = brazilNDaysAgo(90, today);
    console.log(`[insights] Generating for user ${userId} | Brazil date: ${today}`);

    // Fetch all context data in parallel
    const [
      { data: profile },
      { data: todayLogs },
      { data: historyLogs },
      { data: weightLogs },
      { data: waterLogs },
      { data: waterHistory },
      { data: bodyMetrics },
      { data: bodyMeasurements },
      { data: recentInsights },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, current_weight, target_calories, target_protein_g, tdee, sex, target_water_ml')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('food_name, meal_type, calories, protein, carbs, fat, hydration_ml, created_at')
        .eq('user_id', userId)
        .eq('log_date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('food_logs')
        .select('calories, protein, carbs, fat, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .lt('log_date', today),
      supabase
        .from('weight_logs')
        .select('weight_kg, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .order('log_date', { ascending: true }),
      supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', userId)
        .eq('log_date', today),
      supabase
        .from('water_logs')
        .select('amount_ml, log_date')
        .eq('user_id', userId)
        .gte('log_date', thirtyDaysAgo)
        .lt('log_date', today),
      supabase
        .from('body_metrics')
        .select('date, weight, muscle_mass, body_fat')
        .eq('user_id', userId)
        .gte('date', ninetyDaysAgo)
        .order('date', { ascending: true }),
      supabase
        .from('body_measurements')
        .select('date, waist, neck, hips, right_arm')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(3),
      // Last 7 insights for anti-repetition analysis
      supabase
        .from('ai_insights')
        .select('type, title, generated_at')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(7),
    ]);

    // ── Today metrics ───────────────────────────────────────────────────
    const todayFood   = (todayLogs ?? []).filter((l) => l.calories > 0);
    const todayBurned = Math.abs((todayLogs ?? []).filter((l) => l.calories < 0)
      .reduce((s, l) => s + l.calories, 0));
    const todayCal    = todayFood.reduce((s, l) => s + l.calories, 0);
    const todayProt   = Math.round(todayFood.reduce((s, l) => s + (l.protein ?? 0), 0));
    const todayCarbs  = Math.round(todayFood.reduce((s, l) => s + (l.carbs ?? 0), 0));
    const todayFat    = Math.round(todayFood.reduce((s, l) => s + (l.fat ?? 0), 0));

    // Manual water logs + beverage hydration from food logs combined
    const todayWater     = (waterLogs ?? []).reduce((s, l) => s + l.amount_ml, 0);
    const todayFoodWater = todayFood.reduce((s, l) => s + ((l as { hydration_ml?: number }).hydration_ml ?? 0), 0);
    const totalTodayWater = todayWater + todayFoodWater;

    const targetCal   = profile?.target_calories ?? 0;
    const targetProt  = Number(profile?.target_protein_g ?? 0) ||
                        (targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0);
    const targetWater = profile?.target_water_ml ?? 2500;
    const remainCal   = targetCal - todayCal + todayBurned;
    const remainProt  = Math.max(0, targetProt - todayProt);
    const waterPct    = targetWater > 0 ? Math.round((totalTodayWater / targetWater) * 100) : 0;

    // Hours since last meal
    const lastMeal = [...todayFood]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const hoursSinceLastMeal = lastMeal
      ? Math.floor((Date.now() - new Date(lastMeal.created_at).getTime()) / 3600000)
      : null;

    // Meal list for prompt — include macros for richer context
    const mealLines = todayFood.length === 0
      ? '  (nenhuma refeição registrada ainda hoje)'
      : todayFood.map((l) => {
          const label = MEAL_LABEL[l.meal_type ?? ''] ?? 'Refeição';
          const prot  = l.protein  ? ` ${Math.round(l.protein)}g prot`  : '';
          const carbs = l.carbs    ? ` ${Math.round(l.carbs)}g carbs`   : '';
          const fat   = l.fat      ? ` ${Math.round(l.fat)}g gord`      : '';
          return `  • ${label}: ${l.food_name} — ${l.calories}kcal${prot}${carbs}${fat}`;
        }).join('\n');

    // ── History analysis (30 days excluding today) ──────────────────────
    const histFood = (historyLogs ?? []).filter((l) => l.calories > 0);
    const histWork = (historyLogs ?? []).filter((l) => l.calories < 0);

    const byDate: Record<string, { cal: number; prot: number; carbs: number; fat: number }> = {};
    for (const l of histFood) {
      if (!byDate[l.log_date]) byDate[l.log_date] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
      byDate[l.log_date].cal   += l.calories;
      byDate[l.log_date].prot  += l.protein ?? 0;
      byDate[l.log_date].carbs += l.carbs ?? 0;
      byDate[l.log_date].fat   += l.fat ?? 0;
    }
    const histDates = Object.keys(byDate);
    const histVals  = Object.values(byDate);

    const avgCal   = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.cal,   0) / histDates.length) : 0;
    const avgProt  = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.prot,  0) / histDates.length) : 0;
    const avgCarbs = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.carbs, 0) / histDates.length) : 0;
    const avgFat   = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.fat,   0) / histDates.length) : 0;

    const workoutDays = new Set(histWork.map((l) => l.log_date)).size;

    // Weekend vs weekday calorie pattern
    const isWeekday = (d: string) => {
      const n = new Date(d + 'T12:00:00').getDay();
      return n >= 1 && n <= 5;
    };
    const wdEntries   = histDates.filter(isWeekday);
    const weEntries   = histDates.filter((d) => !isWeekday(d));
    const avgWeekday  = wdEntries.length > 0
      ? Math.round(wdEntries.reduce((s, d) => s + byDate[d].cal, 0) / wdEntries.length) : 0;
    const avgWeekend  = weEntries.length > 0
      ? Math.round(weEntries.reduce((s, d) => s + byDate[d].cal, 0) / weEntries.length) : 0;
    const weekendSpike = avgWeekday > 0 && avgWeekend > avgWeekday
      ? Math.round(((avgWeekend - avgWeekday) / avgWeekday) * 100) : 0;

    // Consecutive-day streak (ending yesterday)
    let streak = 0;
    const cur = new Date(today + 'T12:00:00');
    cur.setDate(cur.getDate() - 1);
    while (byDate[cur.toISOString().split('T')[0]]) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    }

    // Yesterday calories
    const yd = new Date(today + 'T12:00:00');
    yd.setDate(yd.getDate() - 1);
    const yesterdayCal = byDate[yd.toISOString().split('T')[0]]?.cal ?? null;

    // Weight trend
    const latestW   = weightLogs?.[weightLogs.length - 1]?.weight_kg ?? profile?.current_weight;
    const oldestW   = weightLogs?.[0]?.weight_kg ?? null;
    const weightDiff = latestW && oldestW && String(latestW) !== String(oldestW)
      ? (Number(latestW) - Number(oldestW)).toFixed(1) : null;
    const weightStr = latestW
      ? `${latestW}kg${weightDiff ? ` (${Number(weightDiff) > 0 ? '+' : ''}${weightDiff}kg em 30d)` : ''}`
      : 'não informado';

    // Hydration trend (30 days history)
    const waterByDate: Record<string, number> = {};
    for (const w of waterHistory ?? []) {
      waterByDate[w.log_date] = (waterByDate[w.log_date] ?? 0) + w.amount_ml;
    }
    const waterDates    = Object.keys(waterByDate);
    const avgWater      = waterDates.length > 0
      ? Math.round(waterDates.reduce((s, d) => s + waterByDate[d], 0) / waterDates.length) : 0;
    const waterGoalDays = waterDates.filter((d) => waterByDate[d] >= targetWater).length;
    const waterGoalRate = waterDates.length > 0
      ? Math.round((waterGoalDays / waterDates.length) * 100) : 0;

    // ── Habit scores — based on today's data ───────────────────────────
    // Nutrition score: today's calorie progress + protein progress toward daily targets
    const calProgressPct  = targetCal  > 0 ? Math.min(100, Math.round((todayCal  / targetCal)  * 100)) : 50;
    const protProgressPct = targetProt > 0 ? Math.min(100, Math.round((todayProt / targetProt) * 100)) : 50;
    const nutritionScore  = todayFood.length === 0
      ? 0
      : Math.min(100, Math.round(calProgressPct * 0.5 + protProgressPct * 0.5));

    // Hydration score: today's total water vs daily target (already computed as waterPct)
    const hydrationScore = Math.min(100, waterPct);

    // Consistency score: streak-based (habit over time, not a single-day metric)
    const streakScore      = Math.min(60, streak * 10);
    const histFreqScore    = Math.min(40, Math.round((histDates.length / 30) * 40));
    const consistencyScore = Math.min(100, streakScore + histFreqScore);

    // Derive user goal from TDEE vs target calories
    const tdeeVal  = profile?.tdee ?? 0;
    let   userGoal = 'manutenção';
    if (tdeeVal > 0 && targetCal > 0) {
      if (targetCal < tdeeVal * 0.93)      userGoal = 'emagrecimento';
      else if (targetCal > tdeeVal * 1.03) userGoal = 'ganho de massa';
    }

    // Body composition trend (last 90 days)
    const latestMetrics = bodyMetrics?.[bodyMetrics.length - 1];
    const oldestMetrics = bodyMetrics?.[0];
    const bodyFatStr = latestMetrics?.body_fat != null
      ? `${latestMetrics.body_fat.toFixed(1)}%${
          oldestMetrics?.body_fat != null && oldestMetrics !== latestMetrics
            ? ` (${(latestMetrics.body_fat - oldestMetrics.body_fat) > 0 ? '+' : ''}${(latestMetrics.body_fat - oldestMetrics.body_fat).toFixed(1)}% em 90d)`
            : ''
        }`
      : null;
    const muscleMassStr = latestMetrics?.muscle_mass != null
      ? `${latestMetrics.muscle_mass.toFixed(1)}kg${
          oldestMetrics?.muscle_mass != null && oldestMetrics !== latestMetrics
            ? ` (${(latestMetrics.muscle_mass - oldestMetrics.muscle_mass) > 0 ? '+' : ''}${(latestMetrics.muscle_mass - oldestMetrics.muscle_mass).toFixed(1)}kg em 90d)`
            : ''
        }`
      : null;

    // Body measurements
    const latestMeasure = bodyMeasurements?.[0];
    const prevMeasure   = bodyMeasurements?.[1];
    const waistStr = latestMeasure?.waist != null
      ? `${latestMeasure.waist}cm${
          prevMeasure?.waist != null
            ? ` (${latestMeasure.waist < prevMeasure.waist ? '-' : '+'}${Math.abs(latestMeasure.waist - prevMeasure.waist).toFixed(1)}cm)`
            : ''
        }`
      : null;

    // Anti-repetition: map recent insights for context
    const recentList     = recentInsights ?? [];
    const recentTypeList = recentList.map((i) => i.type);
    const recentTypes    = [...new Set(recentTypeList)].slice(0, 4).join(', ');
    const recentTitles   = recentList.slice(0, 3).map((i) => `"${i.title}"`).join(', ');

    const firstName = profile?.full_name?.split(' ')[0] ?? 'Usuário';
    const dow       = brazilDayOfWeek();

    // ── Urgency overrides — situações reais que requerem atenção imediata ──
    // Streak é nota adicional (não substitui análise nutricional)
    let urgentNote = '';
    const streakBonus = streak >= 5
      ? ` | 🎉 BÔNUS: mencione o streak de ${streak} dias em 1 frase curta no final da message.`
      : '';

    const calExcessPct = targetCal > 0 ? Math.round((todayCal / targetCal - 1) * 100) : 0;
    const calExcess    = todayCal - targetCal;

    if (hoursSinceLastMeal !== null && hoursSinceLastMeal >= 5) {
      urgentNote = `⚠️ URGENTE: Última refeição há ${hoursSinceLastMeal}h. Cite este dado. Sugira lanche específico com calorias e proteína aproximados (ex: iogurte grego 150g ≈ 15g prot). Tom gentil.`;
    } else if (targetCal > 0 && todayCal > targetCal * 1.25) {
      urgentNote = `🚨 BRONCA FORTE — tom de treinador pessoal, direto e sem rodeios (NÃO suavize): meta estourada em +${calExcessPct}% (${todayCal}kcal vs meta ${targetCal}kcal — excesso de ${calExcess}kcal). Diga claramente que passou da conta. Explique o impacto no objetivo (${userGoal}). Dê 1 ação imediata para compensar HOJE com quantidade específica (ex: substituir jantar por refeição leve de ~400kcal, ou 30min de caminhada). Tom: firme e motivador como um personal trainer — sem floreio, mas sem crueldade.`;
    } else if (targetCal > 0 && todayCal > targetCal * 1.08) {
      urgentNote = `⚠️ PUXÃO DE ORELHA — tom direto, sem suavizar: meta excedida em +${calExcessPct}% (${todayCal}kcal vs meta ${targetCal}kcal, excesso de ${calExcess}kcal). Seja direto sobre o excesso, cite os dados, explique o impacto no objetivo, e sugira como equilibrar o restante do dia com ação concreta e específica.`;
    } else if (weekendSpike >= 30 && (dow === 5 || dow === 6 || dow === 0)) {
      urgentNote = `📊 PADRÃO: Fins de semana +${weekendSpike}% calorias (${avgWeekend}kcal vs ${avgWeekday}kcal dias úteis). Cite estes números. Oriente refeição livre consciente sem culpa.`;
    } else if (totalTodayWater < targetWater * 0.3 && todayFood.length >= 2) {
      urgentNote = `💧 HIDRATAÇÃO BAIXA: Apenas ${totalTodayWater}ml de ${targetWater}ml hoje (${waterPct}%). Cite estes valores. Dê estratégia específica com volume e horário.`;
    }

    const focusText = (urgentNote || DOW_FOCUS[dow] || DOW_FOCUS[1]) + streakBonus;

    // ── Build the context prompt ─────────────────────────────────────────
    const bodySection = (bodyFatStr || muscleMassStr || waistStr)
      ? `
COMPOSIÇÃO CORPORAL (últimos 90 dias):
→ Gordura: ${bodyFatStr ?? 'não medida'} | Músculo: ${muscleMassStr ?? 'não medido'}${waistStr ? ` | Cintura: ${waistStr}` : ''}`
      : '';

    const hydrationHistSection = avgWater > 0
      ? `→ Água média 30d: ${avgWater}ml/dia | Meta atingida: ${waterGoalDays}/${waterDates.length} dias (${waterGoalRate}%)`
      : '';

    const antiRepSection = recentList.length > 0
      ? `
INSIGHTS RECENTES — NÃO repita estes temas/tipos:
→ Últimos tipos: [${recentTypes}]
→ Últimos títulos: ${recentTitles}
→ Gere um insight de tipo DIFERENTE ou com ângulo completamente distinto dos listados acima.`
      : '';

    const goalFocus = userGoal === 'emagrecimento'
      ? '→ Priorizar déficit calórico, saciedade, fibras, proteínas'
      : userGoal === 'ganho de massa'
        ? '→ Priorizar proteínas, recuperação, hidratação, superávit controlado'
        : '→ Priorizar equilíbrio alimentar, constância';

    const waterLine = todayFoodWater > 0
      ? `→ Água hoje: ${totalTodayWater}ml/${targetWater}ml (${waterPct}%) [${todayWater}ml manual + ${todayFoodWater}ml de alimentos/bebidas]`
      : `→ Água hoje: ${totalTodayWater}ml/${targetWater}ml (${waterPct}%)`;

    const contextPrompt =
`PERFIL: ${firstName} | Peso: ${weightStr} | Meta: ${targetCal}kcal/dia | Proteína: ${targetProt}g/dia | Água: ${targetWater}ml/dia${profile?.sex ? ` | Sexo: ${profile.sex === 'male' ? 'M' : 'F'}` : ''}
OBJETIVO: ${userGoal} ${goalFocus}

HOJE — ${today} (${DOW_NAME[dow]}):
${mealLines}
→ Total: ${todayCal}kcal | ${todayProt}g prot | ${todayCarbs}g carbs | ${todayFat}g gord${todayBurned > 0 ? ` | ${todayBurned}kcal queimadas` : ''}
→ Restante: ${remainCal}kcal | ${remainProt}g prot
${waterLine}${hoursSinceLastMeal !== null ? ` | Última refeição: ${hoursSinceLastMeal}h atrás` : ''}

HISTÓRICO 30 dias (${histDates.length} dias com registro):
→ Calorias: média ${avgCal}kcal/dia | Proteína: ${avgProt}g | Carbs: ${avgCarbs}g | Gordura: ${avgFat}g
→ Dias úteis: ${avgWeekday > 0 ? `${avgWeekday}kcal` : 'sem dados'} | Fins de semana: ${avgWeekend > 0 ? `${avgWeekend}kcal` : 'sem dados'}
→ Treinos: ${workoutDays} dias em 30d | Ontem: ${yesterdayCal !== null ? `${yesterdayCal}kcal` : 'sem registro'}
→ Sequência atual: ${streak > 0 ? `${streak} dias consecutivos` : 'nenhum dia consecutivo'}
${hydrationHistSection}${bodySection}${antiRepSection}

SCORES DE HÁBITOS (hoje):
→ Nutrição: ${nutritionScore}/100 (calorias ${calProgressPct}% + proteína ${protProgressPct}% da meta diária)
→ Hidratação: ${hydrationScore}/100 (${totalTodayWater}ml de ${targetWater}ml, ${waterPct}%)
→ Consistência: ${consistencyScore}/100 (${streak} dias consecutivos, ${histDates.length}/30 dias com registro)
${nutritionScore < 65 ? `⚠️ ATENÇÃO: score de Nutrição baixo (${nutritionScore}/100) — ${calProgressPct < 65 ? `calorias abaixo (${todayCal}/${targetCal}kcal)` : ''}${protProgressPct < 65 ? `${calProgressPct < 65 ? ', ' : ''}proteína abaixo (${todayProt}/${targetProt}g)` : ''}. O insight DEVE abordar o score mais baixo com dados reais e recomendação concreta.` : ''}${hydrationScore < 65 ? `\n⚠️ ATENÇÃO: score de Hidratação baixo (${hydrationScore}/100) — apenas ${totalTodayWater}ml de ${targetWater}ml. O insight DEVE mencionar este dado e sugerir ação prática com volume.` : ''}

FOCO ATUAL: ${focusText}

Retorne APENAS JSON válido (sem markdown):
{"type":"nutrition|hydration|workout|body|behavior|motivation","priority":"informativo|atencao|positivo|recomendacao","title":"máx 8 palavras com dado real","message":"2-3 frases com MÍNIMO 2 valores numéricos reais (ex: 187g proteína, 1.800ml, 2.100kcal), causa e recomendação clara","expanded":"2-3 frases que aprofundam com dados ou correlações (ou null)","cta":"texto curto para abrir chat ou null","nextSteps":["emoji + ação com quantidade específica (ex: Beber 500ml agora)","emoji + ação com quantidade específica","emoji + ação com quantidade específica"],"mealIdea":{"title":"título","items":["item 1 com quantidade","item 2","item 3"],"protein":35}}
OBRIGATÓRIO: message deve conter números reais dos dados acima. nextSteps devem ter quantidade ou especificidade (não "beba mais água" — sim "💧 Beber 400ml agora"). mealIdea = inclua SOMENTE quando proteína ou calorias estiverem abaixo da meta e uma sugestão de refeição for pertinente.`;

    console.log(`[insights] Calling Gemini | dow=${DOW_NAME[dow]} | focus=${urgentNote ? 'urgent' : 'scheduled'} | recentTypes=${recentTypes} | scores=${nutritionScore}/${hydrationScore}/${consistencyScore}`);
    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
        config: {
          systemInstruction: `Você é um health coach nutricional empático, inteligente e motivador.
REGRAS:
1. Tom padrão: positivo, encorajador, sem julgamentos. EXCEÇÃO — quando o FOCO indicar BRONCA FORTE ou PUXÃO DE ORELHA: use tom de treinador pessoal — direto, firme, sem suavizar o excesso. Diga claramente "você passou da conta" ou "hoje não foi seu melhor dia alimentar". Foco no comportamento, nunca na pessoa. Termine SEMPRE com uma ação concreta e motivadora. Proibido: floreios, "está tudo bem", "acontece com todos".
2. DADOS OBRIGATÓRIOS: a "message" DEVE citar pelo menos 2 valores numéricos reais dos dados fornecidos (ex: "Você consumiu 187g de proteína", "sua hidratação está em 1.200ml de 2.500ml", "média de 2.100kcal nos últimos 30 dias"). PROIBIDO gerar message sem números reais.
3. Acionável: todo insight responde "o que aconteceu?" (dado real), "por que importa?" (consequência) e "o que fazer?" (ação concreta).
4. Correlações: identifique relações entre dados. Ex: "Você treinou 4x esta semana mas consumiu apenas ${avgProt}g de proteína — abaixo dos ${targetProt}g recomendados para recuperação." Ex: "Hidratação em ${waterPct}% com alto consumo de proteína pode dificultar a digestão."
5. Personalização: adapte análise e recomendações ao OBJETIVO informado. Nunca use recomendações genéricas.
6. Variedade: siga o FOCO indicado. Respeite INSIGHTS RECENTES — não repita tipos nem temas.
7. nextSteps: 2-3 ações com QUANTIDADE ESPECÍFICA (ex: "💧 Beber 500ml agora", "🥩 Adicionar 30g proteína no jantar", "📏 Registrar peso amanhã cedo"). PROIBIDO: "beba mais água", "inclua proteínas", "continue assim" — sempre com número.
8. mealIdea: inclua APENAS quando proteína ou calorias estiverem abaixo da meta E uma sugestão for pertinente. Omita nos demais casos.
9. message = 2-3 frases com dados reais. expanded = 2-3 frases que aprofundam ou correlacionam (pode ser null).
10. cta: rótulo curto para abrir o chat. Use null se não couber.
11. Retorne SOMENTE JSON válido, sem texto fora do JSON, sem markdown.`,
          maxOutputTokens: 800,
          temperature: 0.7,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    const raw = response.text ?? '';
    let parsed: {
      type: string;
      priority: string;
      title: string;
      message: string;
      expanded?: string | null;
      cta?: string | null;
      nextSteps?: unknown[];
      mealIdea?: unknown;
    };
    try {
      parsed = extractJSON(raw);
    } catch {
      // Rotate fallback based on recent types to avoid showing the same one repeatedly
      const recentTypeSet = new Set(recentTypeList);
      const fallback = FALLBACK_INSIGHTS.find((f) => !recentTypeSet.has(f.type)) ?? FALLBACK_INSIGHTS[0];
      parsed = fallback;
    }

    // Safely extract and validate nextSteps
    const nextSteps = Array.isArray(parsed.nextSteps)
      ? (parsed.nextSteps as unknown[]).map((s) => String(s).slice(0, 80)).slice(0, 3)
      : null;

    // Safely extract and validate mealIdea
    let mealIdea: { title: string; items: string[]; protein: number | null } | null = null;
    if (parsed.mealIdea && typeof parsed.mealIdea === 'object' && parsed.mealIdea !== null) {
      const m = parsed.mealIdea as Record<string, unknown>;
      mealIdea = {
        title:   String(m.title ?? '').slice(0, 80),
        items:   Array.isArray(m.items)
          ? (m.items as unknown[]).map((i) => String(i).slice(0, 60)).slice(0, 4)
          : [],
        protein: typeof m.protein === 'number' ? m.protein : null,
      };
      if (!mealIdea.items.length) mealIdea = null;
    }

    const insightData = {
      user_id:  userId,
      type:     VALID_TYPES.includes(parsed.type)          ? parsed.type     : 'nutrition',
      priority: VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : 'recomendacao',
      title:    String(parsed.title   ?? '').slice(0, 100),
      message:  String(parsed.message ?? '').slice(0, 600),
      cta:      parsed.cta ? String(parsed.cta).slice(0, 60) : null,
      metadata: {
        todayCal, todayProt, remainCal, remainProt,
        avgCal, avgProt, workoutDays, histDays: histDates.length, streak, weekendSpike,
        expanded:  parsed.expanded ? String(parsed.expanded).slice(0, 800) : null,
        scores:    { nutrition: nutritionScore, hydration: hydrationScore, consistency: consistencyScore },
        nextSteps,
        mealIdea,
      },
    };

    try {
      const { data: saved, error } = await supabase
        .from('ai_insights')
        .insert(insightData)
        .select()
        .single();
      if (!error && saved) {
        console.log(`[insights] Saved | type=${insightData.type} | priority=${insightData.priority} | scores=${nutritionScore}/${hydrationScore}/${consistencyScore}`);
        return NextResponse.json(saved);
      }
      if (error) console.error('[insights] Save error:', error.message);
    } catch (saveErr) {
      console.error('[insights] Save failed:', saveErr);
    }

    // Return unsaved insight so the UI is never empty
    return NextResponse.json({
      ...insightData,
      id:           crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      read_at:      null,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[insights] Error:', msg);
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand'))
      return NextResponse.json({ error: 'O modelo de IA está com alta demanda. Tente em instantes.' }, { status: 503 });
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota'))
      return NextResponse.json({ error: 'Limite de requisições atingido. Aguarde e tente novamente.' }, { status: 429 });
    return NextResponse.json({ error: 'Erro ao gerar insight.' }, { status: 500 });
  }
}
