import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { auth } from '@/auth';
import { supabase } from '@/lib/db';
import { withGeminiRetry } from '@/lib/gemini-retry';

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

const VALID_TYPES      = ['nutrition', 'workout', 'body', 'behavior'];
const VALID_PRIORITIES = ['informativo', 'atencao', 'positivo', 'recomendacao'];
const VALID_ACTIONS    = ['log_water', 'open_diary', null];

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Café da manhã',
  lunch:     'Almoço',
  dinner:    'Jantar',
  snack:     'Lanche',
};

const DOW_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// Primary focus per day of week — rotates so the card never feels repetitive
const DOW_FOCUS: Record<number, string> = {
  1: 'PLANEJAMENTO SEMANAL: Avalie o desempenho da semana passada e oriente como começar a nova semana com foco.',
  2: 'PADRÕES DE COMPORTAMENTO: Identifique padrões em dias de semana (lanche extra à tarde, queda de proteína). Dê uma dica prática e específica.',
  3: 'QUALIDADE DE MACROS: Analise o equilíbrio proteína/carb/gordura dos dias recentes e sugira ajuste concreto para hoje.',
  4: 'TIMING DE REFEIÇÕES: Avalie o espaçamento entre refeições e oriente sobre o jantar ou próxima refeição com base no que ainda resta disponível.',
  5: 'CONSISTÊNCIA: Destaque a sequência de registros ou dê motivação empática para fechar a semana dentro da meta.',
  6: 'FIM DE SEMANA: Analise a diferença entre fins de semana e dias úteis. Oriente sobre refeição livre consciente sem culpa.',
  0: 'RECUPERAÇÃO: Oriente sobre hidratação e proteína para recuperação/preparo da semana. Seja encorajador.',
};

const FALLBACK_INSIGHT = {
  type:        'nutrition',
  priority:    'recomendacao',
  title:       'Registre sua primeira refeição',
  message:     'Comece registrando o café da manhã para receber orientações personalizadas sobre o restante do dia.',
  cta:         'Registrar refeição',
  action_type: 'open_diary',
  action_value: null as number | null,
};

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';

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

    const today = new Date().toISOString().split('T')[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Fetch all context data in parallel
    const [
      { data: profile },
      { data: todayLogs },
      { data: historyLogs },
      { data: weightLogs },
      { data: waterLogs },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, current_weight, target_calories, tdee, sex, target_water_ml')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('food_name, meal_type, calories, protein, created_at')
        .eq('user_id', userId)
        .eq('log_date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('food_logs')
        .select('calories, protein, log_date')
        .eq('user_id', userId)
        .gte('log_date', fourteenDaysAgo)
        .lt('log_date', today),
      supabase
        .from('weight_logs')
        .select('weight_kg, log_date')
        .eq('user_id', userId)
        .gte('log_date', fourteenDaysAgo)
        .order('log_date', { ascending: true }),
      supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', userId)
        .eq('log_date', today),
    ]);

    // ── Today ──────────────────────────────────────────────────────────────
    const todayFood    = (todayLogs ?? []).filter((l) => l.calories > 0);
    const todayBurned  = Math.abs((todayLogs ?? []).filter((l) => l.calories < 0)
      .reduce((s, l) => s + l.calories, 0));
    const todayCal     = todayFood.reduce((s, l) => s + l.calories, 0);
    const todayProt    = Math.round(todayFood.reduce((s, l) => s + (l.protein ?? 0), 0));
    const todayWater   = (waterLogs ?? []).reduce((s, l) => s + l.amount_ml, 0);
    const targetCal    = profile?.target_calories ?? 0;
    const targetProt   = targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0;
    const targetWater  = profile?.target_water_ml ?? 2500;
    const remainCal    = targetCal - todayCal + todayBurned;
    const remainProt   = Math.max(0, targetProt - todayProt);
    const waterRemain  = Math.max(0, targetWater - todayWater);

    // Hours since last meal
    const lastMeal = [...todayFood]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const hoursSinceLastMeal = lastMeal
      ? Math.floor((Date.now() - new Date(lastMeal.created_at).getTime()) / 3600000)
      : null;

    // Today's meal list for prompt
    const mealLines = todayFood.length === 0
      ? '  (nenhuma refeição registrada ainda hoje)'
      : todayFood.map((l) => {
          const label = MEAL_LABEL[l.meal_type ?? ''] ?? 'Refeição';
          const prot  = l.protein ? ` | ${Math.round(l.protein)}g prot` : '';
          return `  • ${label}: ${l.food_name} — ${l.calories} kcal${prot}`;
        }).join('\n');

    // ── History analysis (14 days excluding today) ─────────────────────────
    const histFood = (historyLogs ?? []).filter((l) => l.calories > 0);
    const histWork = (historyLogs ?? []).filter((l) => l.calories < 0);

    // Aggregate by date
    const byDate: Record<string, { cal: number; prot: number }> = {};
    for (const l of histFood) {
      if (!byDate[l.log_date]) byDate[l.log_date] = { cal: 0, prot: 0 };
      byDate[l.log_date].cal  += l.calories;
      byDate[l.log_date].prot += l.protein ?? 0;
    }
    const histDates = Object.keys(byDate);
    const histVals  = Object.values(byDate);

    const avgCal  = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.cal, 0) / histDates.length) : 0;
    const avgProt = histDates.length > 0
      ? Math.round(histVals.reduce((s, v) => s + v.prot, 0) / histDates.length) : 0;
    const workoutDays = new Set(histWork.map((l) => l.log_date)).size;

    // Weekend vs weekday calorie patterns
    const isWeekday = (d: string) => { const n = new Date(d + 'T12:00:00').getDay(); return n >= 1 && n <= 5; };
    const wdEntries = histDates.filter(isWeekday);
    const weEntries = histDates.filter((d) => !isWeekday(d));
    const avgWeekday = wdEntries.length > 0
      ? Math.round(wdEntries.reduce((s, d) => s + byDate[d].cal, 0) / wdEntries.length) : 0;
    const avgWeekend = weEntries.length > 0
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

    // Yesterday
    const yd = new Date(today + 'T12:00:00');
    yd.setDate(yd.getDate() - 1);
    const yesterdayCal = byDate[yd.toISOString().split('T')[0]]?.cal ?? null;

    // Weight trend
    const latestW  = weightLogs?.[weightLogs.length - 1]?.weight_kg ?? profile?.current_weight;
    const oldestW  = weightLogs?.[0]?.weight_kg ?? null;
    const weightStr = latestW
      ? `${latestW}kg${oldestW && String(oldestW) !== String(latestW)
          ? ` (${Number(latestW) > Number(oldestW) ? '+' : ''}${(Number(latestW) - Number(oldestW)).toFixed(1)}kg/14d)` : ''}`
      : 'não informado';

    const firstName = profile?.full_name?.split(' ')[0] ?? 'Usuário';
    const dow       = new Date().getDay();

    // ── Urgency overrides — take priority over day-based focus ─────────────
    let urgentNote = '';
    if (hoursSinceLastMeal !== null && hoursSinceLastMeal >= 5) {
      urgentNote = `⚠️ URGENTE: Última refeição há ${hoursSinceLastMeal}h. Sugira um lanche leve imediato com empatia.`;
    } else if (targetCal > 0 && todayCal > targetCal * 1.15) {
      urgentNote = `⚠️ EMPATIA: Meta calórica excedida hoje (${todayCal} vs ${targetCal} kcal). Tom: "Dias assim acontecem — o importante é o equilíbrio." Oriente o restante do dia sem punição.`;
    } else if (streak >= 5) {
      urgentNote = `🎉 DESTAQUE: Sequência incrível de ${streak} dias consecutivos com registro! Comemore isso e dê uma dica de manutenção.`;
    } else if (weekendSpike >= 30 && (dow === 5 || dow === 6 || dow === 0)) {
      urgentNote = `📊 PADRÃO: Fins de semana têm ${weekendSpike}% mais calorias que dias úteis. Oriente refeição livre consciente sem culpa.`;
    }

    const focusText = urgentNote || DOW_FOCUS[dow] || DOW_FOCUS[1];

    // ── Prompt ─────────────────────────────────────────────────────────────
    const contextPrompt =
`PERFIL: ${firstName} | Peso: ${weightStr} | Meta: ${targetCal} kcal/dia | Proteína: ${targetProt}g/dia | Água: ${targetWater}ml/dia

HOJE — ${today} (${DOW_NAME[dow]}):
${mealLines}
→ Consumido: ${todayCal} kcal | ${todayProt}g proteína${todayBurned > 0 ? ` | ${todayBurned} kcal queimadas` : ''}
→ Restante: ${remainCal} kcal | ${remainProt}g proteína
→ Água: ${todayWater}ml de ${targetWater}ml (faltam ${waterRemain}ml)${hoursSinceLastMeal !== null ? ` | Última refeição: há ${hoursSinceLastMeal}h` : ''}

HISTÓRICO — últimos 14 dias (${histDates.length} com registro):
→ Kcal médias: ${avgCal} kcal/dia | Proteína média: ${avgProt}g/dia
→ Dias úteis: ${avgWeekday > 0 ? `${avgWeekday} kcal` : 'sem dados'} | Fins de semana: ${avgWeekend > 0 ? `${avgWeekend} kcal` : 'sem dados'}
→ Treinos: ${workoutDays} dias | Ontem: ${yesterdayCal !== null ? `${yesterdayCal} kcal` : 'sem registro'}
→ Sequência: ${streak > 0 ? `${streak} dias consecutivos` : 'nenhum dia consecutivo'}

FOCO: ${focusText}

Retorne APENAS JSON válido (sem markdown):
{"type":"nutrition|workout|body|behavior","priority":"informativo|atencao|positivo|recomendacao","title":"máx 8 palavras","message":"1-2 frases específicas com dados reais","cta":"rótulo do botão (2-4 palavras) ou null","action_type":"log_water|open_diary|null","action_value":500}`;

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
        config: {
          systemInstruction: `Você é um health coach nutricional empático e motivador.
REGRAS:
1. Tom: sempre positivo, sem julgamentos. Exagero → "Dias assim acontecem — o importante é o equilíbrio a longo prazo."
2. Especificidade: cite alimentos, quantidades e horários reais dos dados. Nunca invente padrões não evidenciados.
3. action_type: use "log_water" (com action_value em ml, ex: 500) ao sugerir hidratação. Use "open_diary" para incentivar registrar refeições. Null caso contrário.
4. Variedade: siga o FOCO indicado, priorizando ⚠️ ou 🎉.
5. Retorne SOMENTE JSON válido, sem markdown, sem texto fora do JSON.`,
          maxOutputTokens: 280,
          temperature: 0.85,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    const raw = response.text ?? '';
    let parsed: {
      type: string; priority: string; title: string; message: string;
      cta?: string | null; action_type?: string | null; action_value?: number | null;
    };
    try { parsed = extractJSON(raw); }
    catch { parsed = FALLBACK_INSIGHT; }

    const actionType  = VALID_ACTIONS.includes(parsed.action_type ?? null)
      ? (parsed.action_type ?? null) : null;
    const actionValue = typeof parsed.action_value === 'number' ? parsed.action_value : null;

    const insightData = {
      user_id:  userId,
      type:     VALID_TYPES.includes(parsed.type)           ? parsed.type     : 'nutrition',
      priority: VALID_PRIORITIES.includes(parsed.priority)  ? parsed.priority : 'recomendacao',
      title:    String(parsed.title   ?? FALLBACK_INSIGHT.title).slice(0, 100),
      message:  String(parsed.message ?? FALLBACK_INSIGHT.message).slice(0, 300),
      cta:      parsed.cta ? String(parsed.cta).slice(0, 60) : null,
      metadata: {
        action: actionType ? { type: actionType, value: actionValue ?? (actionType === 'log_water' ? 500 : null) } : null,
        todayCal, todayProt, remainCal, remainProt,
        avgCal, avgProt, workoutDays, histDays: histDates.length, streak, weekendSpike,
      },
    };

    try {
      const { data: saved, error } = await supabase
        .from('ai_insights')
        .insert(insightData)
        .select()
        .single();
      if (!error && saved) return NextResponse.json(saved);
    } catch { /* table not yet migrated */ }

    return NextResponse.json({
      ...insightData,
      id:           crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      read_at:      null,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('AI Insights error:', msg);
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand'))
      return NextResponse.json({ error: 'O modelo de IA está com alta demanda. Tente em instantes.' }, { status: 503 });
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota'))
      return NextResponse.json({ error: 'Limite de requisições atingido. Aguarde e tente novamente.' }, { status: 429 });
    return NextResponse.json({ error: 'Erro ao gerar insight.' }, { status: 500 });
  }
}
