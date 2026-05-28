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

const FALLBACK_INSIGHT = {
  type: 'behavior' as const,
  priority: 'informativo' as const,
  title: 'Registre suas refeições hoje',
  message: 'Manter registros diários ajuda a identificar padrões e acelerar seus resultados.',
  cta: null,
};

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === '1';

    // Return cached insight if fresh (6-hour window) and not forcing refresh
    if (!forceRefresh) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const { data: cached } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('user_id', userId)
        .gte('generated_at', sixHoursAgo)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) return NextResponse.json(cached);
    }

    // Gather last 7 days of context in parallel
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const [{ data: profile }, { data: foodLogs }, { data: weightLogs }] = await Promise.all([
      supabase
        .from('users')
        .select('full_name, current_weight, target_calories, tdee, sex')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('calories, protein, carbs, fat, log_date')
        .eq('user_id', userId)
        .gte('log_date', sevenDaysAgo),
      supabase
        .from('weight_logs')
        .select('weight_kg, log_date')
        .eq('user_id', userId)
        .gte('log_date', sevenDaysAgo)
        .order('log_date', { ascending: true }),
    ]);

    // Compute aggregates for context
    const positiveLogs = (foodLogs ?? []).filter((l) => l.calories > 0);
    const workoutLogs = (foodLogs ?? []).filter((l) => l.calories < 0);
    const logDates = [...new Set(positiveLogs.map((l) => l.log_date))];
    const workoutDays = new Set(workoutLogs.map((l) => l.log_date)).size;

    const avgCal =
      logDates.length > 0
        ? Math.round(positiveLogs.reduce((s, l) => s + l.calories, 0) / logDates.length)
        : 0;
    const avgProtein =
      logDates.length > 0
        ? Math.round(positiveLogs.reduce((s, l) => s + (l.protein ?? 0), 0) / logDates.length)
        : 0;

    const targetCal = profile?.target_calories ?? 0;
    const targetProtein = targetCal > 0 ? Math.round((targetCal * 0.3) / 4) : 0;
    const firstName = profile?.full_name?.split(' ')[0] ?? 'Usuário';
    const currentWeight =
      weightLogs && weightLogs.length > 0
        ? weightLogs[weightLogs.length - 1].weight_kg
        : (profile?.current_weight ?? null);
    const oldestWeight = weightLogs?.[0]?.weight_kg ?? null;
    const weightChange =
      currentWeight && oldestWeight && currentWeight !== oldestWeight
        ? ` (${currentWeight > oldestWeight ? '+' : ''}${(currentWeight - oldestWeight).toFixed(1)}kg em 7d)`
        : '';
    const weightStr = currentWeight ? `${currentWeight}kg${weightChange}` : 'não informado';
    const calAdherence =
      targetCal > 0 && avgCal > 0 ? `${Math.round((avgCal / targetCal) * 100)}%` : 'sem dados';

    const contextPrompt = `Usuário: ${firstName}, peso ${weightStr}, meta ${targetCal} kcal/dia
Últimos 7 dias (${logDates.length}/7 com registro):
- Kcal médias: ${avgCal} kcal (${calAdherence} da meta)
- Proteína média: ${avgProtein}g/dia (meta: ${targetProtein}g/dia)
- Treinos: ${workoutDays}/7 dias

Retorne APENAS JSON válido (sem markdown):
{"type":"nutrition|workout|body|behavior","priority":"informativo|atencao|positivo|recomendacao","title":"máx 8 palavras","message":"1 frase curta e acionável","cta":"2-3 palavras ou null}`;

    const response = await withGeminiRetry(() =>
      getGemini().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: contextPrompt }] }],
        config: {
          systemInstruction:
            'Você é um health coach. Analise os dados e gere 1 insight personalizado. Retorne SOMENTE JSON válido, sem markdown, sem texto extra.',
          maxOutputTokens: 200,
          temperature: 0.85,
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
      user_id: userId,
      type: VALID_TYPES.includes(parsed.type) ? parsed.type : 'behavior',
      priority: VALID_PRIORITIES.includes(parsed.priority) ? parsed.priority : 'informativo',
      title: String(parsed.title ?? FALLBACK_INSIGHT.title).slice(0, 100),
      message: String(parsed.message ?? FALLBACK_INSIGHT.message).slice(0, 250),
      cta: parsed.cta ? String(parsed.cta).slice(0, 50) : null,
      metadata: { logDays: logDates.length, avgCal, avgProtein, workoutDays },
    };

    // Best-effort cache to DB; return inline if table not yet migrated
    try {
      const { data: saved, error } = await supabase
        .from('ai_insights')
        .insert(insightData)
        .select()
        .single();

      if (!error && saved) return NextResponse.json(saved);
    } catch {
      // Table may not exist yet — fall through
    }

    return NextResponse.json({
      ...insightData,
      id: crypto.randomUUID(),
      generated_at: new Date().toISOString(),
      read_at: null,
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
