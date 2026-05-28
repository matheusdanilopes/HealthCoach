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
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    if (start === -1) throw new Error('No JSON found');
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return JSON.parse(stripped.slice(start, i + 1));
    }
    throw new Error('No valid JSON found');
  }
}

const VALID_TYPES = ['nutrition', 'workout', 'body', 'behavior'];
const VALID_PRIORITIES = ['informativo', 'atencao', 'positivo', 'recomendacao'];

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Café da manhã',
  lunch:     'Almoço',
  dinner:    'Jantar',
  snack:     'Lanche',
};

const FALLBACK_INSIGHT = {
  type:     'nutrition' as const,
  priority: 'recomendacao' as const,
  title:    'Registre sua primeira refeição',
  message:  'Comece o dia registrando o café da manhã para receber orientações personalizadas sobre o restante das refeições.',
  cta:      'Registrar refeição',
};

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    // Cache window: 2 hours — short enough to reflect today's evolving meals
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
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Fetch all needed data in parallel
    const [
      { data: profile },
      { data: todayLogs },
      { data: historyLogs },
      { data: weightLogs },
    ] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, current_weight, target_calories, tdee, sex')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('food_name, meal_type, calories, protein, carbs, fat')
        .eq('user_id', userId)
        .eq('log_date', today)
        .order('created_at', { ascending: true }),
      supabase
        .from('food_logs')
        .select('calories, protein, log_date')
        .eq('user_id', userId)
        .gte('log_date', sevenDaysAgo)
        .lt('log_date', today),
      supabase
        .from('weight_logs')
        .select('weight_kg, log_date')
        .eq('user_id', userId)
        .gte('log_date', sevenDaysAgo)
        .order('log_date', { ascending: true }),
    ]);

    // ── Today's stats ──
    const todayFood  = (todayLogs ?? []).filter((l) => l.calories > 0);
    const todayWorkouts = (todayLogs ?? []).filter((l) => l.calories < 0);
    const todayCal   = todayFood.reduce((s, l) => s + l.calories, 0);
    const todayProt  = Math.round(todayFood.reduce((s, l) => s + (l.protein ?? 0), 0));
    const todayBurned = Math.abs(todayWorkouts.reduce((s, l) => s + l.calories, 0));
    const targetCal  = profile?.target_calories ?? 0;
    const targetProt = targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0;
    const remainCal  = targetCal - todayCal + todayBurned;
    const remainProt = Math.max(0, targetProt - todayProt);

    // Format today's meal list for the prompt
    const mealLines =
      todayFood.length === 0
        ? '  (nenhuma refeição registrada ainda)'
        : todayFood
            .map((l) => {
              const label = MEAL_LABEL[l.meal_type ?? ''] ?? 'Refeição';
              const prot  = l.protein ? ` | ${Math.round(l.protein)}g prot` : '';
              return `  • ${label}: ${l.food_name} — ${l.calories} kcal${prot}`;
            })
            .join('\n');

    // ── 7-day history stats (excluding today) ──
    const histFood   = (historyLogs ?? []).filter((l) => l.calories > 0);
    const histDates  = [...new Set(histFood.map((l) => l.log_date))];
    const avgCal     = histDates.length > 0
      ? Math.round(histFood.reduce((s, l) => s + l.calories, 0) / histDates.length)
      : 0;
    const avgProt    = histDates.length > 0
      ? Math.round(histFood.reduce((s, l) => s + (l.protein ?? 0), 0) / histDates.length)
      : 0;
    const workoutDays = new Set(
      (historyLogs ?? []).filter((l) => l.calories < 0).map((l) => l.log_date)
    ).size;

    // Weight trend
    const latestW  = weightLogs?.[weightLogs.length - 1]?.weight_kg ?? profile?.current_weight;
    const oldestW  = weightLogs?.[0]?.weight_kg ?? null;
    const wTrend   = latestW
      ? `${latestW}kg${oldestW && oldestW !== latestW ? ` (${latestW > oldestW ? '+' : ''}${(Number(latestW) - Number(oldestW)).toFixed(1)}kg em 7d)` : ''}`
      : 'não informado';

    const firstName = profile?.full_name?.split(' ')[0] ?? 'Usuário';

    const contextPrompt = `PERFIL: ${firstName} | Peso: ${wTrend} | Meta: ${targetCal} kcal/dia | Proteína: ${targetProt}g/dia

HOJE:
${mealLines}
→ Consumido: ${todayCal} kcal | ${todayProt}g proteína${todayBurned > 0 ? ` | ${todayBurned} kcal queimadas` : ''}
→ Ainda disponível: ${remainCal} kcal | ${remainProt}g proteína

HISTÓRICO (6 dias anteriores, ${histDates.length}/6 com registro):
→ Kcal médias: ${avgCal} kcal/dia | Proteína média: ${avgProt}g/dia | Treinos: ${workoutDays} dias

Gere 1 orientação prática e personalizada sobre:
- O que comer nas próximas refeições para atingir a meta
- Como ajustar a alimentação do restante do dia
- Como está o progresso calórico/proteico até agora

Retorne APENAS JSON válido (sem markdown):
{"type":"nutrition|workout|body|behavior","priority":"informativo|atencao|positivo|recomendacao","title":"máx 8 palavras","message":"1-2 frases específicas e acionáveis com base nos dados","cta":"2-3 palavras ou null"}`;

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
        config: {
          systemInstruction:
            'Você é um health coach nutricional. Analise os dados reais do usuário e oriente sobre as próximas refeições de forma específica e acionável — mencione alimentos concretos quando relevante. Retorne SOMENTE JSON válido, sem markdown nem texto extra.',
          maxOutputTokens: 250,
          temperature: 0.8,
          thinkingConfig: { thinkingBudget: 0 },
        },
      })
    );

    const raw = response.text ?? '';
    let parsed: { type: string; priority: string; title: string; message: string; cta?: string | null };
    try {
      parsed = extractJSON(raw);
    } catch {
      parsed = FALLBACK_INSIGHT;
    }

    const insightData = {
      user_id:  userId,
      type:     VALID_TYPES.includes(parsed.type)       ? parsed.type     : 'nutrition',
      priority: VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : 'recomendacao',
      title:    String(parsed.title   ?? FALLBACK_INSIGHT.title).slice(0, 100),
      message:  String(parsed.message ?? FALLBACK_INSIGHT.message).slice(0, 300),
      cta:      parsed.cta ? String(parsed.cta).slice(0, 50) : null,
      metadata: { todayCal, todayProt, remainCal, remainProt, avgCal, avgProt: avgProt, workoutDays, histDays: histDates.length },
    };

    // Best-effort cache — transparent fallback if table not yet migrated
    try {
      const { data: saved, error } = await supabase
        .from('ai_insights')
        .insert(insightData)
        .select()
        .single();

      if (!error && saved) return NextResponse.json(saved);
    } catch {
      // Table may not exist yet
    }

    return NextResponse.json({
      ...insightData,
      id:           crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      read_at:      null,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('AI Insights error:', msg);
    const is503 = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
    const is429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');
    if (is503) {
      return NextResponse.json(
        { error: 'O modelo de IA está com alta demanda. Tente em instantes.' },
        { status: 503 }
      );
    }
    if (is429) {
      return NextResponse.json(
        { error: 'Limite de requisições atingido. Aguarde e tente novamente.' },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: 'Erro ao gerar insight.' }, { status: 500 });
  }
}
